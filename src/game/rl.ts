import { cellTotal, cloneBoard, countSquares, determineOutcome, emptyBoard, place, resolveBattle } from './engine'
import { decideByScore } from './state'
import { aiPlan, type AiMove } from './ai'
import type { Board, Outcome, PlayerIndex, UnitType } from './types'

export const N_CELLS = 9

const UNIT_TYPES: UnitType[] = ['circle', 'triangle', 'square']

function bucket(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n === 2) return 2
  if (n === 3) return 3
  return 4
}

export function localKey(boards: [Board, Board], ai: PlayerIndex, cell: number, budget: number): string {
  const s = boards[ai][cell]
  const o = boards[1 - ai][cell]
  return [
    bucket(s.circle),
    bucket(s.triangle),
    bucket(s.square),
    bucket(o.circle),
    bucket(o.triangle),
    bucket(o.square),
    bucket(budget),
  ].join(',')
}

export interface Step {
  key: string
  unit: number
}

export class RlAgent {
  q = new Map<string, number[]>()
  alpha = 0.05
  gamma = 0.9
  epsilon = 0.2
  sumLoss = 0
  countUpdates = 0

  values(key: string): number[] {
    let v = this.q.get(key)
    if (!v) {
      v = [0, 0, 0]
      this.q.set(key, v)
    }
    return v
  }

  chooseLocal(
    boards: [Board, Board],
    ai: PlayerIndex,
    budget: number,
    maxPerCell: number,
    explore: boolean,
  ): { cell: number; unit: number; key: string } | null {
    const self = boards[ai]
    const legalCells: number[] = []
    for (let cell = 0; cell < N_CELLS; cell += 1) {
      if (cellTotal(self[cell]) < maxPerCell) legalCells.push(cell)
    }
    if (legalCells.length === 0 || budget <= 0) return null

    if (explore && Math.random() < this.epsilon) {
      const cell = legalCells[Math.floor(Math.random() * legalCells.length)]
      const unit = Math.floor(Math.random() * UNIT_TYPES.length)
      return { cell, unit, key: localKey(boards, ai, cell, budget) }
    }

    let best: { cell: number; unit: number; key: string; q: number } | null = null
    for (const cell of legalCells) {
      const key = localKey(boards, ai, cell, budget)
      const v = this.values(key)
      for (let unit = 0; unit < UNIT_TYPES.length; unit += 1) {
        if (!best || v[unit] > best.q) {
          best = { cell, unit, key, q: v[unit] }
        }
      }
    }
    return best
  }

  toJSON(): Record<string, number[]> {
    const obj: Record<string, number[]> = {}
    for (const [k, v] of this.q) {
      obj[k] = v.map((x) => Math.round(x * 1000) / 1000)
    }
    return obj
  }

  static fromJSON(json: unknown): RlAgent {
    const agent = new RlAgent()
    if (json && typeof json === 'object') {
      for (const [k, v] of Object.entries(json as Record<string, number[]>)) {
        if (Array.isArray(v)) agent.q.set(k, [...v])
      }
    }
    return agent
  }

  qSize(): number {
    return this.q.size
  }

  clone(): RlAgent {
    const a = new RlAgent()
    for (const [k, v] of this.q) a.q.set(k, [...v])
    return a
  }
}

function qValue(agent: RlAgent, key: string, unit: number): number {
  return agent.values(key)[unit]
}

function sarsaUpdate(agent: RlAgent, key: string, unit: number, target: number): number {
  const v = agent.values(key)
  const td = target - v[unit]
  v[unit] += agent.alpha * td
  agent.sumLoss += Math.abs(td)
  agent.countUpdates += 1
  return Math.abs(td)
}

export function planRlMoves(
  agent: RlAgent,
  boards: [Board, Board],
  ai: PlayerIndex,
  budget: number,
  maxPerCell: number,
  explore: boolean,
): { moves: AiMove[]; steps: Step[] } {
  const self = boards[ai].map((c) => ({ ...c }))
  const curBoards: [Board, Board] = ai === 0 ? [self, boards[1]] : [boards[0], self]
  const moves: AiMove[] = []
  const steps: Step[] = []
  let b = budget
  while (b > 0) {
    const choice = agent.chooseLocal(curBoards, ai, b, maxPerCell, explore)
    if (!choice) break
    self[choice.cell][UNIT_TYPES[choice.unit]] += 1
    moves.push({ index: choice.cell, unit: UNIT_TYPES[choice.unit] })
    steps.push({ key: choice.key, unit: choice.unit })
    b -= 1
  }
  return { moves, steps }
}

function runPhase(
  agent: RlAgent | null,
  boards: [Board, Board],
  ai: PlayerIndex,
  budget: number,
  maxPerCell: number,
  explore: boolean,
  phase: 'setup' | 'place',
): { boards: [Board, Board]; steps: Step[] } {
  if (!agent) {
    const moves = aiPlan(boards, ai, budget, maxPerCell, phase)
    let next = boards[ai]
    for (const m of moves) next = place(next, m.index, m.unit, maxPerCell)
    const nb: [Board, Board] = ai === 0 ? [next, boards[1]] : [boards[0], next]
    return { boards: nb, steps: [] }
  }
  const { moves, steps } = planRlMoves(agent, boards, ai, budget, maxPerCell, explore)
  let next = boards[ai]
  for (const m of moves) next = place(next, m.index, m.unit, maxPerCell)
  const nb: [Board, Board] = ai === 0 ? [next, boards[1]] : [boards[0], next]
  return { boards: nb, steps }
}

function terminalRewardFor(outcome: Outcome, p: PlayerIndex): number {
  if (outcome === 'p0') return p === 0 ? 10 : -10
  if (outcome === 'p1') return p === 1 ? 10 : -10
  return -2
}

function battleRewardFor(prev: [Board, Board], next: [Board, Board], p: PlayerIndex): number {
  const before = countSquares(prev[p]) - countSquares(prev[1 - p])
  const after = countSquares(next[p]) - countSquares(next[1 - p])
  const d = after - before
  return Math.max(-1, Math.min(1, d * 0.1))
}

function processChain(agent: RlAgent | null, chain: Step[], reward: number, nextStep: Step | null): void {
  if (!agent || chain.length === 0) return
  for (let i = 0; i < chain.length; i += 1) {
    const step = chain[i]
    let target: number
    if (i < chain.length - 1) {
      target = agent.gamma * qValue(agent, chain[i + 1].key, chain[i + 1].unit)
    } else {
      target = reward + (nextStep ? agent.gamma * qValue(agent, nextStep.key, nextStep.unit) : 0)
    }
    sarsaUpdate(agent, step.key, step.unit, target)
  }
}

export function playGame(config: {
  p0Agent: RlAgent | null
  p1Agent: RlAgent | null
  p0Explore: boolean
  p1Explore: boolean
  maxBattles?: number
  maxPerCell?: number
}): Outcome {
  const maxBattles = config.maxBattles ?? 20
  const maxPerCell = config.maxPerCell ?? 9

  let boards: [Board, Board] = [emptyBoard(), emptyBoard()]

  const setup0 = runPhase(config.p0Agent, boards, 0, 9, maxPerCell, config.p0Explore, 'setup')
  boards = setup0.boards
  const setup1 = runPhase(config.p1Agent, boards, 1, 9, maxPerCell, config.p1Explore, 'setup')
  boards = setup1.boards
  let chain0 = setup0.steps
  let chain1 = setup1.steps

  for (let battle = 0; battle < maxBattles; battle += 1) {
    const prev = [cloneBoard(boards[0]), cloneBoard(boards[1])] as [Board, Board]
    const resolved = resolveBattle(boards[0], boards[1])
    const resolvedBoards = [resolved.p0, resolved.p1] as [Board, Board]
    const outcome = determineOutcome(resolvedBoards[0], resolvedBoards[1])
    const terminal = outcome !== 'ongoing'

    const reward0 = battleRewardFor(prev, resolvedBoards, 0) + (terminal ? terminalRewardFor(outcome, 0) : 0)
    const reward1 = battleRewardFor(prev, resolvedBoards, 1) + (terminal ? terminalRewardFor(outcome, 1) : 0)

    boards = resolvedBoards
    if (terminal) {
      processChain(config.p0Agent, chain0, reward0, null)
      processChain(config.p1Agent, chain1, reward1, null)
      return outcome
    }

    const budget0 = countSquares(boards[0])
    const phase0 = runPhase(config.p0Agent, boards, 0, budget0, maxPerCell, config.p0Explore, 'place')
    processChain(config.p0Agent, chain0, reward0, phase0.steps[0] ?? null)
    boards = phase0.boards
    chain0 = phase0.steps

    const budget1 = countSquares(boards[1])
    const phase1 = runPhase(config.p1Agent, boards, 1, budget1, maxPerCell, config.p1Explore, 'place')
    processChain(config.p1Agent, chain1, reward1, phase1.steps[0] ?? null)
    boards = phase1.boards
    chain1 = phase1.steps
  }

  const outcome = decideByScore(boards[0], boards[1])
  processChain(config.p0Agent, chain0, terminalRewardFor(outcome, 0), null)
  processChain(config.p1Agent, chain1, terminalRewardFor(outcome, 1), null)
  return outcome
}

export interface TrainEpisode {
  episode: number
  meanLoss: number
  qSize: number
}

export function trainSelfPlay(
  agent: RlAgent,
  episodes: number,
  onEpisode?: (info: TrainEpisode) => void,
): void {
  const initEpsilon = agent.epsilon
  const initAlpha = agent.alpha
  for (let e = 1; e <= episodes; e += 1) {
    const progress = e / episodes
    agent.epsilon = Math.max(0.05, initEpsilon * (1 - progress))
    agent.alpha = Math.max(0.005, initAlpha * (1 - progress * 0.5))

    const prevUpdates = agent.countUpdates
    const prevLoss = agent.sumLoss
    playGame({ p0Agent: agent, p1Agent: agent, p0Explore: true, p1Explore: true })
    if (onEpisode) {
      const du = agent.countUpdates - prevUpdates
      const dl = agent.sumLoss - prevLoss
      onEpisode({
        episode: e,
        meanLoss: du > 0 ? dl / du : 0,
        qSize: agent.qSize(),
      })
    }
  }
  agent.epsilon = 0
}

export function evaluate(agent: RlAgent, games: number): { wins: number; losses: number; draws: number } {
  let wins = 0
  let losses = 0
  let draws = 0
  for (let g = 0; g < games; g += 1) {
    const outcome = playGame({ p0Agent: null, p1Agent: agent, p0Explore: false, p1Explore: false })
    if (outcome === 'p1') wins += 1
    else if (outcome === 'p0') losses += 1
    else draws += 1
  }
  return { wins, losses, draws }
}

export function evaluatePair(
  a: RlAgent,
  b: RlAgent,
  games: number,
): { wins: number; draws: number; losses: number } {
  let wins = 0
  let draws = 0
  let losses = 0
  for (let g = 0; g < games; g += 1) {
    const aIsP0 = g % 2 === 0
    const outcome = aIsP0
      ? playGame({ p0Agent: a, p1Agent: b, p0Explore: false, p1Explore: false })
      : playGame({ p0Agent: b, p1Agent: a, p0Explore: false, p1Explore: false })
    const aWon = aIsP0 ? outcome === 'p0' : outcome === 'p1'
    if (aWon) wins += 1
    else if (outcome === 'draw') draws += 1
    else losses += 1
  }
  return { wins, draws, losses }
}

export function eloFromScore(score: number, total: number): number {
  if (total <= 0) return 0
  const p = Math.max(0.005, Math.min(0.995, score / total))
  return Math.round(400 * Math.log10(p / (1 - p)))
}

export function rlPlan(
  agent: RlAgent,
  boards: [Board, Board],
  ai: PlayerIndex,
  budget: number,
  maxPerCell: number,
  _phase?: 'setup' | 'place',
): AiMove[] {
  return planRlMoves(agent, boards, ai, budget, maxPerCell, false).moves
}
