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

  update(key: string, action: number, reward: number): void {
    const v = this.values(key)
    v[action] += this.alpha * (reward - v[action])
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

function terminalReward(outcome: Outcome): number {
  if (outcome === 'p1') return 5
  if (outcome === 'p0') return -5
  return 0
}

function battleReward(prev: [Board, Board], next: [Board, Board]): number {
  const before = countSquares(prev[1]) - countSquares(prev[0])
  const after = countSquares(next[1]) - countSquares(next[0])
  return (after - before) * 0.5
}

export function simulateEpisode(
  agent: RlAgent,
  explore: boolean,
  maxBattles = 20,
  maxPerCell = 9,
): Outcome {
  let boards: [Board, Board] = [emptyBoard(), emptyBoard()]
  let pending: RlLogEntry[] = []

  boards = [applyMoves(boards[0], aiPlan(boards, 0, 9, maxPerCell, 'setup'), maxPerCell), boards[1]]
  boards = [boards[0], applyMoves(boards[1], aiPlan(boards, 1, 9, maxPerCell, 'setup'), maxPerCell)]

  for (let battle = 0; battle < maxBattles; battle += 1) {
    const prev = [cloneBoard(boards[0]), cloneBoard(boards[1])] as [Board, Board]
    const resolved = resolveBattle(boards[0], boards[1])
    const resolvedBoards = [resolved.p0, resolved.p1] as [Board, Board]
    const outcome = determineOutcome(resolvedBoards[0], resolvedBoards[1])

    if (explore && pending.length > 0) {
      let reward = battleReward(prev, resolvedBoards)
      if (outcome !== 'ongoing') reward += terminalReward(outcome)
      for (const t of pending) agent.update(t.key, t.action, reward)
      pending = []
    }

    boards = resolvedBoards
    if (outcome !== 'ongoing') return outcome

    const budget0 = countSquares(boards[0])
    const moves0 = aiPlan(boards, 0, budget0, maxPerCell, 'place')
    boards = [applyMoves(boards[0], moves0, maxPerCell), boards[1]]

    const budget1 = countSquares(boards[1])
    const planned = planRlMoves(agent, boards, 1, budget1, maxPerCell, explore)
    boards = [boards[0], applyMoves(boards[1], planned.moves, maxPerCell)]
    pending = planned.log
  }

  const outcome = decideByScore(boards[0], boards[1])
  if (explore && pending.length > 0) {
    for (const t of pending) agent.update(t.key, t.action, terminalReward(outcome))
  }
  return outcome
}

export function trainSelfPlay(agent: RlAgent, episodes: number): void {
  for (let e = 0; e < episodes; e += 1) {
    simulateEpisode(agent, true)
  }
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
