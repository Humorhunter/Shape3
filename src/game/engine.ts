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

export function planStrikes(defender: Board, triangles: number): Strike[] {
  const strikes: Strike[] = []
  let remaining = triangles

  for (let i = 0; i < defender.length && remaining > 0; i += 1) {
    const cell = defender[i]
    for (let k = 0; k < cell.circle && remaining > 0; k += 1) {
      strikes.push({ targetIndex: i, unit: 'circle' })
      remaining -= 1
    }
  }
  for (let i = 0; i < defender.length && remaining > 0; i += 1) {
    const cell = defender[i]
    for (let k = 0; k < cell.square && remaining > 0; k += 1) {
      strikes.push({ targetIndex: i, unit: 'square' })
      remaining -= 1
    }
  }

  return strikes
}

function attack(board: Board, triangles: number): {
  board: Board
  circlesDestroyed: number
  squaresDestroyed: number
} {
  const strikes = planStrikes(board, triangles)
  const next = cloneBoard(board)
  let circlesDestroyed = 0
  let squaresDestroyed = 0

  for (const strike of strikes) {
    next[strike.targetIndex][strike.unit] -= 1
    if (strike.unit === 'circle') circlesDestroyed += 1
    else squaresDestroyed += 1
  }

  return { board: next, circlesDestroyed, squaresDestroyed }
}

function removeTriangles(board: Board): Board {
  const next = cloneBoard(board)
  for (const cell of next) {
    cell.triangle = 0
  }
  return next
}

export function resolveBattle(p0: Board, p1: Board): {
  p0: Board
  p1: Board
  report: BattleReport
} {
  const t0 = countUnits(p0).triangle
  const t1 = countUnits(p1).triangle

  const attack0 = attack(p1, t0)
  const attack1 = attack(p0, t1)

  const result0: AttackResult = {
    triangles: t0,
    circlesDestroyed: attack0.circlesDestroyed,
    squaresDestroyed: attack0.squaresDestroyed,
  }
  const result1: AttackResult = {
    triangles: t1,
    circlesDestroyed: attack1.circlesDestroyed,
    squaresDestroyed: attack1.squaresDestroyed,
  }

  return {
    p0: removeTriangles(attack1.board),
    p1: removeTriangles(attack0.board),
    report: [result0, result1],
  }
}

export function determineOutcome(p0: Board, p1: Board): Outcome {
  const e0 = isEliminated(p0)
  const e1 = isEliminated(p1)
  if (e0 && e1) return 'draw'
  if (e0) return 'p1'
  if (e1) return 'p0'
  return 'ongoing'
}
