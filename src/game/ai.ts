import { BOARD_SIZE } from './constants'
import { cellTotal } from './engine'
import type { Board, PlayerIndex, UnitType } from './types'

export interface AiMove {
  index: number
  unit: UnitType
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function setupPlan(budget: number): AiMove[] {
  const types: UnitType[] = [
    'circle',
    'circle',
    'circle',
    'triangle',
    'triangle',
    'triangle',
    'square',
    'square',
    'square',
  ]
  const shuffled = shuffle(types)
  const moves: AiMove[] = []
  const count = Math.min(budget, shuffled.length, BOARD_SIZE)
  for (let i = 0; i < count; i += 1) {
    moves.push({ index: i, unit: shuffled[i] })
  }
  return moves
}

function pickMove(self: Board, opp: Board, maxPerCell: number): AiMove | null {
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (opp[i].triangle > 0 && self[i].circle === 0 && cellTotal(self[i]) < maxPerCell) {
      return { index: i, unit: 'circle' }
    }
  }
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (opp[i].circle + opp[i].square > 0 && self[i].triangle === 0 && cellTotal(self[i]) < maxPerCell) {
      return { index: i, unit: 'triangle' }
    }
  }
  let best = -1
  let bestThreat = Number.POSITIVE_INFINITY
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (cellTotal(self[i]) < maxPerCell) {
      const threat = opp[i].triangle
      if (threat < bestThreat) {
        bestThreat = threat
        best = i
      }
    }
  }
  if (best >= 0) return { index: best, unit: 'square' }
  return null
}

export function aiPlan(
  boards: [Board, Board],
  ai: PlayerIndex,
  budget: number,
  maxPerCell: number,
  phase: 'setup' | 'place',
): AiMove[] {
  if (phase === 'setup') {
    return setupPlan(budget)
  }
  const self = boards[ai].map((c) => ({ ...c }))
  const opp = boards[1 - ai]
  const moves: AiMove[] = []
  let remaining = budget
  while (remaining > 0) {
    const move = pickMove(self, opp, maxPerCell)
    if (!move) break
    moves.push(move)
    self[move.index][move.unit] += 1
    remaining -= 1
  }
  return moves
}
