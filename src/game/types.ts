export type UnitType = 'circle' | 'triangle' | 'square'
export type Cell = UnitType | null
export type Board = Cell[]
export type PlayerIndex = 0 | 1

export interface UnitCount {
  circle: number
  triangle: number
  square: number
}

export interface AttackResult {
  triangles: number
  circlesDestroyed: number
  squaresDestroyed: number
}

export type BattleReport = [AttackResult, AttackResult]

export type Outcome = 'ongoing' | 'p0' | 'p1' | 'draw'
