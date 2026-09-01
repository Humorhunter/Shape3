import { BOARD_SIZE } from './constants'
import type {
  AttackResult,
  BattleReport,
  Board,
  Cell,
  Outcome,
  Strike,
  UnitCount,
  UnitType,
} from './types'

export function emptyCell(): Cell {
  return { circle: 0, triangle: 0, square: 0 }
}

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => emptyCell())
}

export function cloneCell(cell: Cell): Cell {
  return { ...cell }
}

export function cloneBoard(board: Board): Board {
  return board.map(cloneCell)
}

export function isInBounds(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE
}

export function cellTotal(cell: Cell): number {
  return cell.circle + cell.triangle + cell.square
}

export function canPlace(board: Board, index: number, maxPerCell: number): boolean {
  return isInBounds(index) && cellTotal(board[index]) < maxPerCell
}

export function place(board: Board, index: number, unit: UnitType, maxPerCell: number): Board {
  if (!isInBounds(index)) {
    throw new RangeError(`放置位置越界: ${index}`)
  }
  if (cellTotal(board[index]) >= maxPerCell) {
    throw new Error(`位置 ${index} 已满（上限 ${maxPerCell}）`)
  }
  const next = cloneBoard(board)
  next[index][unit] += 1
  return next
}

export function removeUnit(board: Board, index: number, unit: UnitType): Board {
  if (!isInBounds(index)) {
    throw new RangeError(`移除位置越界: ${index}`)
  }
  const next = cloneBoard(board)
  next[index][unit] = Math.max(0, next[index][unit] - 1)
  return next
}

export function countUnits(board: Board): UnitCount {
  const count: UnitCount = { circle: 0, triangle: 0, square: 0 }
  for (const cell of board) {
    count.circle += cell.circle
    count.triangle += cell.triangle
    count.square += cell.square
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
  return board.every((cell) => cellTotal(cell) === 0)
}

export function planStrikes(attacker: Board, defender: Board): Strike[] {
  const strikes: Strike[] = []
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    let remaining = attacker[i].triangle
    for (let k = 0; k < defender[i].circle && remaining > 0; k += 1) {
      strikes.push({ targetIndex: i, unit: 'circle' })
      remaining -= 1
    }
    for (let k = 0; k < defender[i].square && remaining > 0; k += 1) {
      strikes.push({ targetIndex: i, unit: 'square' })
      remaining -= 1
    }
  }
  return strikes
}

export function resolveBattle(p0: Board, p1: Board): {
  p0: Board
  p1: Board
  report: BattleReport
} {
  const t0 = countUnits(p0).triangle
  const t1 = countUnits(p1).triangle

  const strikes0 = planStrikes(p0, p1)
  const strikes1 = planStrikes(p1, p0)

  const next0 = cloneBoard(p0)
  const next1 = cloneBoard(p1)

  let circles0 = 0
  let squares0 = 0
  let circles1 = 0
  let squares1 = 0

  for (const strike of strikes0) {
    next1[strike.targetIndex][strike.unit] -= 1
    if (strike.unit === 'circle') circles0 += 1
    else squares0 += 1
  }
  for (const strike of strikes1) {
    next0[strike.targetIndex][strike.unit] -= 1
    if (strike.unit === 'circle') circles1 += 1
    else squares1 += 1
  }

  for (const cell of next0) cell.triangle = 0
  for (const cell of next1) cell.triangle = 0

  const result0: AttackResult = { triangles: t0, circlesDestroyed: circles0, squaresDestroyed: squares0 }
  const result1: AttackResult = { triangles: t1, circlesDestroyed: circles1, squaresDestroyed: squares1 }

  return { p0: next0, p1: next1, report: [result0, result1] }
}

export function determineOutcome(p0: Board, p1: Board): Outcome {
  const e0 = isEliminated(p0)
  const e1 = isEliminated(p1)
  if (e0 && e1) return 'draw'
  if (e0) return 'p1'
  if (e1) return 'p0'
  return 'ongoing'
}
