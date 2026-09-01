import { BOARD_SIZE } from './constants'
import type {
  AttackResult,
  BattleReport,
  Board,
  Cell,
  Outcome,
  PlayerIndex,
  UnitCount,
  UnitType,
} from './types'

export function emptyBoard(): Board {
  return Array<Cell>(BOARD_SIZE).fill(null)
}

export function cloneBoard(board: Board): Board {
  return board.slice()
}

export function isInBounds(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE
}

export function canPlace(board: Board, index: number): boolean {
  return isInBounds(index) && board[index] === null
}

export function place(board: Board, index: number, unit: UnitType): Board {
  if (!isInBounds(index)) {
    throw new RangeError(`放置位置越界: ${index}`)
  }
  if (board[index] !== null) {
    throw new Error(`位置 ${index} 已被占用`)
  }
  const next = cloneBoard(board)
  next[index] = unit
  return next
}

export function countUnits(board: Board): UnitCount {
  const count: UnitCount = { circle: 0, triangle: 0, square: 0 }
  for (const cell of board) {
    if (cell !== null) {
      count[cell] += 1
    }
  }
  return count
}

export function countSquares(board: Board): number {
  return countUnits(board).square
}

export function countTotal(board: Board): number {
  const c = countUnits(board)
  return c.circle + c.triangle + c.square
}

export function isEliminated(board: Board): boolean {
  return board.every((cell) => cell === null)
}

function resolveAttack(attackerTriangles: number, defender: Board): {
  board: Board
  result: AttackResult
} {
  const next = cloneBoard(defender)
  let circlesDestroyed = 0
  let squaresDestroyed = 0
  let remaining = attackerTriangles

  for (let i = 0; i < next.length && remaining > 0; i += 1) {
    if (next[i] === 'circle') {
      next[i] = null
      circlesDestroyed += 1
      remaining -= 1
    }
  }

  for (let i = 0; i < next.length && remaining > 0; i += 1) {
    if (next[i] === 'square') {
      next[i] = null
      squaresDestroyed += 1
      remaining -= 1
    }
  }

  return {
    board: next,
    result: {
      triangles: attackerTriangles,
      circlesDestroyed,
      squaresDestroyed,
    },
  }
}

export function resolveBattle(p0: Board, p1: Board): {
  p0: Board
  p1: Board
  report: BattleReport
} {
  const t0 = countUnits(p0).triangle
  const t1 = countUnits(p1).triangle

  const attack0 = resolveAttack(t0, p1)
  const attack1 = resolveAttack(t1, p0)

  const result0: AttackResult = attack1.result
  const result1: AttackResult = attack0.result

  const next0 = removeTriangles(attack1.board)
  const next1 = removeTriangles(attack0.board)

  return {
    p0: next0,
    p1: next1,
    report: [result0, result1],
  }
}

function removeTriangles(board: Board): Board {
  const next = cloneBoard(board)
  for (let i = 0; i < next.length; i += 1) {
    if (next[i] === 'triangle') {
      next[i] = null
    }
  }
  return next
}

export function determineOutcome(p0: Board, p1: Board): Outcome {
  const e0 = isEliminated(p0)
  const e1 = isEliminated(p1)
  if (e0 && e1) return 'draw'
  if (e0) return 'p1'
  if (e1) return 'p0'
  return 'ongoing'
}

export function placementBudget(board: Board): number {
  return countSquares(board)
}

export function currentPlayerBoards(
  boards: [Board, Board],
  player: PlayerIndex,
): { self: Board; opponent: Board } {
  return player === 0
    ? { self: boards[0], opponent: boards[1] }
    : { self: boards[1], opponent: boards[0] }
}
