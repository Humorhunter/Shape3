import { BOARD_SIZE } from './constants'
import { cellTotal } from './engine'
import type { Board, UnitType } from './types'

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

export function bestCellFor(
  self: Board,
  opp: Board,
  maxPerCell: number,
  unit: UnitType,
): number | null {
  if (unit === 'circle') {
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      if (opp[i].triangle > 0 && self[i].circle === 0 && cellTotal(self[i]) < maxPerCell) {
        return i
      }
    }
    return null
  }
  if (unit === 'triangle') {
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      if (opp[i].circle + opp[i].square > 0 && self[i].triangle === 0 && cellTotal(self[i]) < maxPerCell) {
        return i
      }
    }
    return null
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
  return best >= 0 ? best : null
}

function pickMove(self: Board, opp: Board, maxPerCell: number): AiMove | null {
  const circle = bestCellFor(self, opp, maxPerCell, 'circle')
  if (circle !== null) return { index: circle, unit: 'circle' }
  const triangle = bestCellFor(self, opp, maxPerCell, 'triangle')
  if (triangle !== null) return { index: triangle, unit: 'triangle' }
  const square = bestCellFor(self, opp, maxPerCell, 'square')
  if (square !== null) return { index: square, unit: 'square' }
  return null
}

export function aiPlan(
  self: Board,
  opp: Board,
  budget: number,
  maxPerCell: number,
  phase: 'setup' | 'place',
): AiMove[] {
  if (phase === 'setup') {
    return setupPlan(budget)
  }
  const s = self.map((c) => ({ ...c }))
  const moves: AiMove[] = []
  let remaining = budget
  while (remaining > 0) {
    const move = pickMove(s, opp, maxPerCell)
    if (!move) break
    moves.push(move)
    s[move.index][move.unit] += 1
    remaining -= 1
  }
  return moves
}
