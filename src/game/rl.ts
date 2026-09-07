import { cloneBoard, countSquares, countUnits, determineOutcome, emptyBoard, place, resolveBattle } from './engine'
import { decideByScore } from './state'
import { aiPlan, bestCellFor, type AiMove } from './ai'
import type { Board, Outcome, PlayerIndex, UnitType } from './types'

export const RL_ACTIONS: UnitType[] = ['circle', 'triangle', 'square']

export type RlLogEntry = { key: string; action: number }

function bucket(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n === 2) return 2
  return 3
}

export function rlStateKey(boards: [Board, Board], ai: PlayerIndex, budget: number): string {
  const s = countUnits(boards[ai])
  const o = countUnits(boards[1 - ai])
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

export class RlAgent {
  q = new Map<string, number[]>()
  alpha = 0.1
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

  choose(key: string, explore: boolean): number {
    const v = this.values(key)
    if (explore && Math.random() < this.epsilon) {
      return Math.floor(Math.random() * RL_ACTIONS.length)
    }
    let best = 0
    for (let i = 1; i < v.length; i += 1) {
      if (v[i] > v[best]) best = i
    }
    return best
  }

  update(key: string, action: number, reward: number): number {
    const v = this.values(key)
    const td = reward - v[action]
    v[action] += this.alpha * td
    this.sumLoss += Math.abs(td)
    this.countUpdates += 1
    return Math.abs(td)
  }

  toJSON(): Record<string, number[]> {
    const obj: Record<string, number[]> = {}
    for (const [k, v] of this.q) {
      obj[k] = [...v]
    }
    return obj
  }

  static fromJSON(json: Record<string, number[]>): RlAgent {
    const agent = new RlAgent()
    for (const [k, v] of Object.entries(json)) {
      if (Array.isArray(v)) agent.q.set(k, [...v])
    }
    return agent
  }
}

export function planRlMoves(
  agent: RlAgent,
  boards: [Board, Board],
  ai: PlayerIndex,
  budget: number,
  maxPerCell: number,
  explore: boolean,
): { moves: AiMove[]; log: RlLogEntry[] } {
  const self = boards[ai].map((c) => ({ ...c }))
  const opp = boards[1 - ai]
  const moves: AiMove[] = []
  const log: RlLogEntry[] = []
  let remaining = budget
  while (remaining > 0) {
    const key = rlStateKey([self, opp], ai, remaining)
    const action = agent.choose(key, explore)
    let unit = RL_ACTIONS[action]
    let cell = bestCellFor(self, opp, maxPerCell, unit)
    if (cell === null) {
      unit = 'square'
      cell = bestCellFor(self, opp, maxPerCell, 'square')
      if (cell === null) break
    }
    self[cell][unit] += 1
    moves.push({ index: cell, unit })
    log.push({ key, action })
    remaining -= 1
  }
  return { moves, log }
}

function applyMoves(board: Board, moves: AiMove[], maxPerCell: number): Board {
  let next = board
  for (const m of moves) {
    next = place(next, m.index, m.unit, maxPerCell)
  }
  return next
}

function terminalRewardFor(outcome: Outcome, p: PlayerIndex): number {
  if (outcome === 'p0') return p === 0 ? 5 : -5
  if (outcome === 'p1') return p === 1 ? 5 : -5
  return 0
}

function battleRewardFor(prev: [Board, Board], next: [Board, Board], p: PlayerIndex): number {
  const mine = p
  const before = countSquares(prev[mine]) - countSquares(prev[1 - mine])
  const after = countSquares(next[mine]) - countSquares(next[1 - mine])
  return (after - before) * 0.5
}

interface PlanResult {
  moves: AiMove[]
  log: RlLogEntry[]
}

function planFor(
  agent: RlAgent | null,
  boards: [Board, Board],
  ai: PlayerIndex,
  budget: number,
  maxPerCell: number,
  phase: 'setup' | 'place',
  explore: boolean,
): PlanResult {
  if (phase === 'setup') {
    return { moves: aiPlan(boards, ai, budget, maxPerCell, 'setup'), log: [] }
  }
  if (agent) return planRlMoves(agent, boards, ai, budget, maxPerCell, explore)
  return { moves: aiPlan(boards, ai, budget, maxPerCell, 'place'), log: [] }
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
  boards = [applyMoves(boards[0], aiPlan(boards, 0, 9, maxPerCell, 'setup'), maxPerCell), boards[1]]
  boards = [boards[0], applyMoves(boards[1], aiPlan(boards, 1, 9, maxPerCell, 'setup'), maxPerCell)]

  let pending0: RlLogEntry[] = []
  let pending1: RlLogEntry[] = []

  for (let battle = 0; battle < maxBattles; battle += 1) {
    const prev = [cloneBoard(boards[0]), cloneBoard(boards[1])] as [Board, Board]
    const resolved = resolveBattle(boards[0], boards[1])
    const resolvedBoards = [resolved.p0, resolved.p1] as [Board, Board]
    const outcome = determineOutcome(resolvedBoards[0], resolvedBoards[1])

    if (config.p0Agent && pending0.length > 0) {
      let reward = battleRewardFor(prev, resolvedBoards, 0)
      if (outcome !== 'ongoing') reward += terminalRewardFor(outcome, 0)
      for (const t of pending0) config.p0Agent.update(t.key, t.action, reward)
      pending0 = []
    }
    if (config.p1Agent && pending1.length > 0) {
      let reward = battleRewardFor(prev, resolvedBoards, 1)
      if (outcome !== 'ongoing') reward += terminalRewardFor(outcome, 1)
      for (const t of pending1) config.p1Agent.update(t.key, t.action, reward)
      pending1 = []
    }

    boards = resolvedBoards
    if (outcome !== 'ongoing') return outcome

    const plan0 = planFor(config.p0Agent, boards, 0, countSquares(boards[0]), maxPerCell, 'place', config.p0Explore)
    boards = [applyMoves(boards[0], plan0.moves, maxPerCell), boards[1]]
    pending0 = plan0.log

    const plan1 = planFor(config.p1Agent, boards, 1, countSquares(boards[1]), maxPerCell, 'place', config.p1Explore)
    boards = [boards[0], applyMoves(boards[1], plan1.moves, maxPerCell)]
    pending1 = plan1.log
  }

  const outcome = decideByScore(boards[0], boards[1])
  if (config.p0Agent && pending0.length > 0) {
    for (const t of pending0) config.p0Agent.update(t.key, t.action, terminalRewardFor(outcome, 0))
  }
  if (config.p1Agent && pending1.length > 0) {
    for (const t of pending1) config.p1Agent.update(t.key, t.action, terminalRewardFor(outcome, 1))
  }
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
  for (let e = 1; e <= episodes; e += 1) {
    const prevUpdates = agent.countUpdates
    const prevLoss = agent.sumLoss
    playGame({ p0Agent: agent, p1Agent: agent, p0Explore: true, p1Explore: true })
    if (onEpisode) {
      const du = agent.countUpdates - prevUpdates
      const dl = agent.sumLoss - prevLoss
      onEpisode({
        episode: e,
        meanLoss: du > 0 ? dl / du : 0,
        qSize: agent.q.size,
      })
    }
  }
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

export function rlPlan(
  agent: RlAgent,
  boards: [Board, Board],
  ai: PlayerIndex,
  budget: number,
  maxPerCell: number,
  phase: 'setup' | 'place',
): AiMove[] {
  if (phase === 'setup') {
    return aiPlan(boards, ai, budget, maxPerCell, 'setup')
  }
  return planRlMoves(agent, boards, ai, budget, maxPerCell, false).moves
}
