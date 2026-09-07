import { cellTotal, cloneBoard, countSquares, countUnits, determineOutcome, emptyBoard, place, resolveBattle } from './engine'
import { decideByScore } from './state'
import { localKey, N_CELLS } from './rl'
import { aiPlan, type AiMove } from './ai'
import type { Board, UnitType, Outcome, PlayerIndex } from './types'

const UNIT_TYPES: UnitType[] = ['circle', 'triangle', 'square']

function bucket(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n === 2) return 2
  return 3
}

function valueKey(self: Board, opp: Board): string {
  const s = countUnits(self)
  const o = countUnits(opp)
  return [
    bucket(s.circle),
    bucket(s.triangle),
    bucket(s.square),
    bucket(o.circle),
    bucket(o.triangle),
    bucket(o.square),
  ].join(',')
}

function legalActions(self: Board, maxPerCell: number): number[] {
  const out: number[] = []
  for (let cell = 0; cell < N_CELLS; cell += 1) {
    if (cellTotal(self[cell]) < maxPerCell) out.push(cell * 3, cell * 3 + 1, cell * 3 + 2)
  }
  return out
}

function applyAction(self: Board, action: number, maxPerCell: number): Board {
  const cell = Math.floor(action / 3)
  const unit = UNIT_TYPES[action % 3]
  return place(self, cell, unit, maxPerCell)
}

function applyMoves(board: Board, moves: AiMove[], maxPerCell: number): Board {
  let b = board
  for (const m of moves) b = place(b, m.index, m.unit, maxPerCell)
  return b
}

export class AZAgent {
  policy = new Map<string, number[]>()
  value = new Map<string, number>()
  cPuct = 3
  nPlayout = 200
  lrPolicy = 0.02
  lrValue = 0.05

  policyLogits(key: string): number[] {
    return this.policy.get(key) ?? [0, 0, 0]
  }

  valueOf(key: string): number {
    return this.value.get(key) ?? 0
  }

  toJSON(): { policy: Record<string, number[]>; value: Record<string, number> } {
    const policy: Record<string, number[]> = {}
    for (const [k, v] of this.policy) policy[k] = v.map((x) => Math.round(x * 1000) / 1000)
    const value: Record<string, number> = {}
    for (const [k, v] of this.value) value[k] = Math.round(v * 1000) / 1000
    return { policy, value }
  }

  static fromJSON(json: unknown): AZAgent {
    const a = new AZAgent()
    if (json && typeof json === 'object') {
      const j = json as { policy?: Record<string, number[]>; value?: Record<string, number> }
      if (j.policy) for (const [k, v] of Object.entries(j.policy)) a.policy.set(k, [...v])
      if (j.value) for (const [k, v] of Object.entries(j.value)) a.value.set(k, v)
    }
    return a
  }

  clone(): AZAgent {
    const a = new AZAgent()
    for (const [k, v] of this.policy) a.policy.set(k, [...v])
    for (const [k, v] of this.value) a.value.set(k, v)
    return a
  }

  qSize(): number {
    return this.policy.size + this.value.size
  }
}

function softmax(logits: number[]): number[] {
  const m = Math.max(...logits)
  const exps = logits.map((x) => Math.exp(x - m))
  const s = exps.reduce((a, b) => a + b, 0) || 1
  return exps.map((e) => e / s)
}

function priorProbs(agent: AZAgent, self: Board, opp: Board, budget: number, maxPerCell: number): number[] {
  const legal = legalActions(self, maxPerCell)
  const logits = new Array<number>(27).fill(-Infinity)
  for (const a of legal) {
    const cell = Math.floor(a / 3)
    const unit = a % 3
    logits[a] = agent.policyLogits(localKey(self, opp, cell, budget))[unit]
  }
  const m = Math.max(...logits)
  const probs = new Array<number>(27).fill(0)
  let sum = 0
  for (const a of legal) {
    probs[a] = Math.exp(logits[a] - m)
    sum += probs[a]
  }
  for (const a of legal) probs[a] /= sum || 1
  return probs
}

function evaluateLeaf(
  agent: AZAgent,
  selfPartial: Board,
  selfBudget: number,
  oppFull: Board,
  maxPerCell: number,
): number {
  let s = cloneBoard(selfPartial)
  let b = selfBudget
  while (b > 0) {
    const legal = legalActions(s, maxPerCell)
    if (legal.length === 0) break
    let bestA = legal[0]
    let bestQ = -Infinity
    for (const a of legal) {
      const cell = Math.floor(a / 3)
      const unit = a % 3
      const q = agent.policyLogits(localKey(s, oppFull, cell, b))[unit]
      if (q > bestQ) {
        bestQ = q
        bestA = a
      }
    }
    s = applyAction(s, bestA, maxPerCell)
    b -= 1
  }
  const r = resolveBattle(s, oppFull)
  return agent.valueOf(valueKey(r.p0, r.p1))
}

interface MctsNode {
  self: Board
  budget: number
  P: number[]
  N: number[]
  W: number[]
  Q: number[]
  children: Map<number, MctsNode>
  untried: number[]
}

function newMctsNode(self: Board, budget: number, P: number[], untried: number[]): MctsNode {
  return {
    self,
    budget,
    P,
    N: new Array(27).fill(0),
    W: new Array(27).fill(0),
    Q: new Array(27).fill(0),
    children: new Map(),
    untried,
  }
}

export function azMctsSearch(
  agent: AZAgent,
  self: Board,
  oppPublic: Board,
  budget: number,
  maxPerCell: number,
): { probs: number[]; root: MctsNode; oppFull: Board } {
  const oppBudget = countSquares(oppPublic)
  const oppFull = applyMoves(oppPublic, aiPlan(oppPublic, self, oppBudget, maxPerCell, 'place'), maxPerCell)

  const root = newMctsNode(
    cloneBoard(self),
    budget,
    priorProbs(agent, self, oppFull, budget, maxPerCell),
    legalActions(self, maxPerCell),
  )

  for (let i = 0; i < agent.nPlayout; i += 1) {
    let node = root
    const path: { node: MctsNode; action: number }[] = []

    while (node.budget > 0 && node.untried.length === 0 && node.children.size > 0) {
      const legal = legalActions(node.self, maxPerCell)
      const sumN = node.N.reduce((a, b) => a + b, 0)
      let bestA = -1
      let bestU = -Infinity
      for (const a of legal) {
        const u = node.Q[a] + agent.cPuct * node.P[a] * Math.sqrt(sumN) / (1 + node.N[a])
        if (u > bestU) {
          bestU = u
          bestA = a
        }
      }
      if (bestA < 0) break
      const child = node.children.get(bestA) as MctsNode
      path.push({ node, action: bestA })
      node = child
    }

    if (node.budget > 0 && node.untried.length > 0) {
      const action = node.untried.pop() as number
      const childSelf = applyAction(node.self, action, maxPerCell)
      const child = newMctsNode(
        childSelf,
        node.budget - 1,
        priorProbs(agent, childSelf, oppFull, node.budget - 1, maxPerCell),
        legalActions(childSelf, maxPerCell),
      )
      node.children.set(action, child)
      path.push({ node, action })
      node = child
    }

    const v = evaluateLeaf(agent, node.self, node.budget, oppFull, maxPerCell)
    for (const edge of path) {
      edge.node.N[edge.action] += 1
      edge.node.W[edge.action] += v
      edge.node.Q[edge.action] = edge.node.W[edge.action] / edge.node.N[edge.action]
    }
  }

  const sum = root.N.reduce((a, b) => a + b, 0) || 1
  return { probs: root.N.map((n) => n / sum), root, oppFull }
}

function greedyAction(agent: AZAgent, self: Board, opp: Board, budget: number, maxPerCell: number): number {
  const legal = legalActions(self, maxPerCell)
  let bestA = legal[0]
  let bestQ = -Infinity
  for (const a of legal) {
    const cell = Math.floor(a / 3)
    const unit = a % 3
    const q = agent.policyLogits(localKey(self, opp, cell, budget))[unit]
    if (q > bestQ) {
      bestQ = q
      bestA = a
    }
  }
  return bestA
}

function pickByN(legal: number[], N: number[], temp: number): number {
  if (temp === 0) {
    let bestA = legal[0]
    let bestN = -1
    for (const a of legal) {
      if (N[a] > bestN) {
        bestN = N[a]
        bestA = a
      }
    }
    return bestA
  }
  const weights = legal.map((a) => Math.pow(N[a] + 1e-9, 1 / temp))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let r = Math.random() * total
  for (let i = 0; i < legal.length; i += 1) {
    r -= weights[i]
    if (r <= 0) return legal[i]
  }
  return legal[legal.length - 1]
}

// 沿着 MCTS 树逐层下探，每层用该节点的访问频次选动作（而不是复用根节点分布），
// 树耗尽后用策略贪心补完剩余布阵。
function extractPlacement(
  agent: AZAgent,
  root: MctsNode,
  oppFull: Board,
  maxPerCell: number,
  temp: number,
): AiMove[] {
  const moves: AiMove[] = []
  let node: MctsNode = root
  while (node.budget > 0 && node.children.size > 0) {
    const legal = legalActions(node.self, maxPerCell)
    if (legal.reduce((s, a) => s + node.N[a], 0) === 0) break
    const a = pickByN(legal, node.N, temp)
    moves.push({ index: Math.floor(a / 3), unit: UNIT_TYPES[a % 3] })
    const child = node.children.get(a)
    if (!child) break
    node = child
  }
  let s = cloneBoard(node.self)
  let b = node.budget
  while (b > 0) {
    if (legalActions(s, maxPerCell).length === 0) break
    const a = greedyAction(agent, s, oppFull, b, maxPerCell)
    moves.push({ index: Math.floor(a / 3), unit: UNIT_TYPES[a % 3] })
    s = applyAction(s, a, maxPerCell)
    b -= 1
  }
  return moves
}

export function azPlan(agent: AZAgent, self: Board, oppPublic: Board, budget: number, maxPerCell: number): AiMove[] {
  const { root, oppFull } = azMctsSearch(agent, self, oppPublic, budget, maxPerCell)
  return extractPlacement(agent, root, oppFull, maxPerCell, 0)
}

export interface PolicySample {
  key: string
  target: number[]
}

export interface ValueSample {
  key: string
  z: number
}

export interface SelfPlayData {
  outcome: Outcome
  policySamples: PolicySample[]
  valueSamples: ValueSample[]
}

export function azSelfPlay(agent: AZAgent, maxPerCell: number): SelfPlayData {
  let boards: [Board, Board] = [emptyBoard(), emptyBoard()]
  let settled: [Board, Board] = [emptyBoard(), emptyBoard()]
  const policySamples: PolicySample[] = []
  const valueSamples: ValueSample[] = []
  let outcome: Outcome = 'ongoing'

  const playPhase = (ai: PlayerIndex, budget: number, temp: number): void => {
    const self = boards[ai]
    const oppPublic = settled[1 - ai]
    const { probs, root, oppFull } = azMctsSearch(agent, self, oppPublic, budget, maxPerCell)
    const seen = new Set<string>()
    for (const a of legalActions(self, maxPerCell)) {
      const cell = Math.floor(a / 3)
      const key = localKey(self, oppPublic, cell, budget)
      if (seen.has(key)) continue
      seen.add(key)
      const t = [probs[cell * 3], probs[cell * 3 + 1], probs[cell * 3 + 2]]
      const s = t[0] + t[1] + t[2] || 1
      policySamples.push({ key, target: [t[0] / s, t[1] / s, t[2] / s] })
    }
    boards[ai] = applyMoves(self, extractPlacement(agent, root, oppFull, maxPerCell, temp), maxPerCell)
  }

  const recordValue = (): void => {
    valueSamples.push({ key: valueKey(boards[0], boards[1]), z: 0 })
    valueSamples.push({ key: valueKey(boards[1], boards[0]), z: 0 })
  }

  playPhase(0, 9, 1)
  playPhase(1, 9, 1)

  for (let battle = 0; battle < 30; battle += 1) {
    const r = resolveBattle(boards[0], boards[1])
    boards = [r.p0, r.p1]
    settled = [cloneBoard(r.p0), cloneBoard(r.p1)]
    recordValue()
    const o = determineOutcome(boards[0], boards[1])
    if (o !== 'ongoing') {
      outcome = o
      break
    }
    playPhase(0, countSquares(boards[0]), 1)
    playPhase(1, countSquares(boards[1]), 1)
  }
  if (outcome === 'ongoing') outcome = decideByScore(boards[0], boards[1])

  // Assign z. valueSamples alternate p0, p1 per recordValue call.
  valueSamples.forEach((s, i) => {
    const player = i % 2 === 0 ? 0 : 1
    s.z = outcome === 'draw' ? 0 : outcome === `p${player}` ? 1 : -1
  })

  return { outcome, policySamples, valueSamples }
}

export interface BatchResult {
  policyLoss: number
  valueLoss: number
}

export function azTrainStep(agent: AZAgent, data: SelfPlayData[]): BatchResult {
  let policyLoss = 0
  let valueLoss = 0
  let pCount = 0
  let vCount = 0

  for (const d of data) {
    for (const s of d.policySamples) {
      const logits = agent.policyLogits(s.key)
      const probs = softmax(logits)
      const newLogits = logits.slice()
      for (let u = 0; u < 3; u += 1) {
        newLogits[u] += agent.lrPolicy * (s.target[u] - probs[u])
      }
      agent.policy.set(s.key, newLogits)
      const idx = s.target.indexOf(Math.max(...s.target))
      policyLoss += -Math.log(Math.max(1e-9, probs[idx]))
      pCount += 1
    }
    for (const s of d.valueSamples) {
      const old = agent.valueOf(s.key)
      const delta = s.z - old
      agent.value.set(s.key, old + agent.lrValue * delta)
      valueLoss += delta * delta
      vCount += 1
    }
  }

  return {
    policyLoss: policyLoss / (pCount || 1),
    valueLoss: valueLoss / (vCount || 1),
  }
}

export class ReplayBuffer {
  private data: SelfPlayData[] = []
  private capacity: number

  constructor(capacity = 10000) {
    this.capacity = capacity
  }

  push(d: SelfPlayData): void {
    this.data.push(d)
    if (this.data.length > this.capacity) this.data.shift()
  }

  sample(batchSize: number): SelfPlayData[] {
    const out: SelfPlayData[] = []
    const n = Math.min(batchSize, this.data.length)
    const idx = new Set<number>()
    while (idx.size < n) idx.add(Math.floor(Math.random() * this.data.length))
    for (const i of idx) out.push(this.data[i])
    return out
  }

  size(): number {
    return this.data.length
  }
}

export function azTrain(
  agent: AZAgent,
  episodes: number,
  onEpisode?: (e: number, loss: BatchResult) => void,
): void {
  const buffer = new ReplayBuffer(10000)
  for (let e = 1; e <= episodes; e += 1) {
    const data = azSelfPlay(agent, 9)
    buffer.push(data)
    const batch = buffer.sample(64)
    const loss = azTrainStep(agent, batch)
    if (onEpisode) onEpisode(e, loss)
  }
}
