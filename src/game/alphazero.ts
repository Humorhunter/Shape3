import { cellTotal, cloneBoard, countSquares, determineOutcome, emptyBoard, place, resolveBattle } from './engine'
import { decideByScore } from './state'
import { localKey, N_CELLS } from './rl'
import { aiPlan, type AiMove } from './ai'
import type { Board, UnitType, PlayerIndex } from './types'

const UNIT_TYPES: UnitType[] = ['circle', 'triangle', 'square']

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
  cPuct = 3
  nPlayout = 200
  lrPolicy = 0.02

  policyLogits(key: string): number[] {
    return this.policy.get(key) ?? [0, 0, 0]
  }

  toJSON(): Record<string, number[]> {
    const policy: Record<string, number[]> = {}
    for (const [k, v] of this.policy) policy[k] = v.map((x) => Math.round(x * 1000) / 1000)
    return policy
  }

  static fromJSON(json: unknown): AZAgent {
    const a = new AZAgent()
    if (json && typeof json === 'object') {
      for (const [k, v] of Object.entries(json as Record<string, number[]>)) {
        if (Array.isArray(v)) a.policy.set(k, [...v])
      }
    }
    return a
  }

  clone(): AZAgent {
    const a = new AZAgent()
    for (const [k, v] of this.policy) a.policy.set(k, [...v])
    return a
  }

  qSize(): number {
    return this.policy.size
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

function greedyMoves(agent: AZAgent, self: Board, opp: Board, budget: number, maxPerCell: number): AiMove[] {
  let s = cloneBoard(self)
  const moves: AiMove[] = []
  let b = budget
  while (b > 0) {
    const legal = legalActions(s, maxPerCell)
    if (legal.length === 0) break
    let bestA = legal[0]
    let bestQ = -Infinity
    for (const a of legal) {
      const cell = Math.floor(a / 3)
      const unit = a % 3
      const q = agent.policyLogits(localKey(s, opp, cell, b))[unit]
      if (q > bestQ) {
        bestQ = q
        bestA = a
      }
    }
    moves.push({ index: Math.floor(bestA / 3), unit: UNIT_TYPES[bestA % 3] })
    s = applyAction(s, bestA, maxPerCell)
    b -= 1
  }
  return moves
}

// Rollout a full game from (self, opp) both fully placed. Returns +1 (self wins) / -1 / 0.
function rolloutOutcome(agent: AZAgent, selfBoard: Board, oppBoard: Board, maxPerCell: number): number {
  let s = cloneBoard(selfBoard)
  let o = cloneBoard(oppBoard)
  for (let battle = 0; battle < 20; battle += 1) {
    const r = resolveBattle(s, o)
    const ns = r.p0
    const no = r.p1
    const out = determineOutcome(ns, no)
    if (out !== 'ongoing') return out === 'p0' ? 1 : out === 'p1' ? -1 : 0
    const s2 = applyMoves(ns, greedyMoves(agent, ns, no, countSquares(ns), maxPerCell), maxPerCell)
    const o2 = applyMoves(no, greedyMoves(agent, no, s2, countSquares(no), maxPerCell), maxPerCell)
    s = s2
    o = o2
  }
  const out = decideByScore(s, o)
  return out === 'p0' ? 1 : out === 'p1' ? -1 : 0
}

interface MctsNode {
  self: Board
  budget: number
  P: number[]
  N: number[]
  W: number[]
  Q: number[]
  children: Map<number, MctsNode>
}

function newMctsNode(self: Board, budget: number, P: number[]): MctsNode {
  return { self, budget, P, N: new Array(27).fill(0), W: new Array(27).fill(0), Q: new Array(27).fill(0), children: new Map() }
}

export function azMctsSearch(
  agent: AZAgent,
  self: Board,
  oppPublic: Board,
  budget: number,
  maxPerCell: number,
): { probs: number[] } {
  const oppBudget = countSquares(oppPublic)
  const oppFull = applyMoves(oppPublic, aiPlan(oppPublic, self, oppBudget, maxPerCell, 'place'), maxPerCell)

  const root = newMctsNode(cloneBoard(self), budget, priorProbs(agent, self, oppFull, budget, maxPerCell))

  for (let i = 0; i < agent.nPlayout; i += 1) {
    let node = root
    const path: { node: MctsNode; action: number }[] = []
    while (node.budget > 0 && node.children.size > 0) {
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
      if (!node.children.has(bestA)) {
        const childSelf = applyAction(node.self, bestA, maxPerCell)
        const child = newMctsNode(childSelf, node.budget - 1, priorProbs(agent, childSelf, oppFull, node.budget - 1, maxPerCell))
        node.children.set(bestA, child)
      }
      const child = node.children.get(bestA) as MctsNode
      path.push({ node, action: bestA })
      node = child
    }
    // rollout from the current partial placement: finish it greedily, then play out the game.
    const v = rolloutOutcome(agent, node.self, oppFull, maxPerCell)
    for (const edge of path) {
      edge.node.N[edge.action] += 1
      edge.node.W[edge.action] += v
      edge.node.Q[edge.action] = edge.node.W[edge.action] / edge.node.N[edge.action]
    }
  }

  const sum = root.N.reduce((a, b) => a + b, 0) || 1
  return { probs: root.N.map((n) => n / sum) }
}

function sampleAction(probs: number[], legal: number[], temp: number): number {
  if (temp === 0) {
    let bestA = legal[0]
    let bestP = -1
    for (const a of legal) {
      if (probs[a] > bestP) {
        bestP = probs[a]
        bestA = a
      }
    }
    return bestA
  }
  const weights = legal.map((a) => Math.pow(probs[a] + 1e-9, 1 / temp))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < legal.length; i += 1) {
    r -= weights[i]
    if (r <= 0) return legal[i]
  }
  return legal[legal.length - 1]
}

function samplePlacement(self: Board, budget: number, maxPerCell: number, probs: number[], temp: number): AiMove[] {
  let s = cloneBoard(self)
  const moves: AiMove[] = []
  let b = budget
  while (b > 0) {
    const legal = legalActions(s, maxPerCell)
    if (legal.length === 0) break
    const a = sampleAction(probs, legal, temp)
    moves.push({ index: Math.floor(a / 3), unit: UNIT_TYPES[a % 3] })
    s = applyAction(s, a, maxPerCell)
    b -= 1
  }
  return moves
}

export function azPlan(agent: AZAgent, self: Board, oppPublic: Board, budget: number, maxPerCell: number): AiMove[] {
  const { probs } = azMctsSearch(agent, self, oppPublic, budget, maxPerCell)
  return samplePlacement(self, budget, maxPerCell, probs, 0)
}

interface PolicySample {
  key: string
  target: number[]
}

export function azSelfPlay(agent: AZAgent, maxPerCell: number): PolicySample[] {
  let boards: [Board, Board] = [emptyBoard(), emptyBoard()]
  let settled: [Board, Board] = [emptyBoard(), emptyBoard()]
  const policySamples: PolicySample[] = []

  const playPhase = (ai: PlayerIndex, budget: number, temp: number): void => {
    const self = boards[ai]
    const oppPublic = settled[1 - ai]
    const { probs } = azMctsSearch(agent, self, oppPublic, budget, maxPerCell)
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
    boards[ai] = applyMoves(self, samplePlacement(self, budget, maxPerCell, probs, temp), maxPerCell)
  }

  playPhase(0, 9, 1)
  playPhase(1, 9, 1)

  for (let battle = 0; battle < 30; battle += 1) {
    const r = resolveBattle(boards[0], boards[1])
    boards = [r.p0, r.p1]
    settled = [cloneBoard(r.p0), cloneBoard(r.p1)]
    if (determineOutcome(boards[0], boards[1]) !== 'ongoing') break
    playPhase(0, countSquares(boards[0]), 1)
    playPhase(1, countSquares(boards[1]), 1)
  }

  return policySamples
}

export function azTrainStep(agent: AZAgent, samples: PolicySample[]): number {
  let loss = 0
  for (const s of samples) {
    const logits = agent.policyLogits(s.key)
    const probs = softmax(logits)
    const newLogits = logits.slice()
    for (let u = 0; u < 3; u += 1) {
      newLogits[u] += agent.lrPolicy * (s.target[u] - probs[u])
    }
    agent.policy.set(s.key, newLogits)
    const idx = s.target.indexOf(Math.max(...s.target))
    loss += -Math.log(Math.max(1e-9, probs[idx]))
  }
  return loss / (samples.length || 1)
}

export function azTrain(agent: AZAgent, episodes: number, onEpisode?: (e: number) => void): void {
  for (let e = 1; e <= episodes; e += 1) {
    const samples = azSelfPlay(agent, 9)
    azTrainStep(agent, samples)
    if (onEpisode) onEpisode(e)
  }
}
