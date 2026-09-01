import { describe, expect, it } from 'vitest'
import { BOARD_SIZE } from '../src/game/constants'
import {
  canCommit,
  commit,
  continueBattle,
  continueHandover,
  createGame,
  decideByScore,
  placeUnit,
} from '../src/game/state'
import type { GameState, GameMode } from '../src/game/state'
import type { Board, UnitType } from '../src/game/types'

function setupGame(mode: GameMode, maxRounds = 10, maxPerCell = 9): GameState {
  return createGame(mode, maxRounds, maxPerCell)
}

function placeComposition(state: GameState, units: UnitType[]): GameState {
  let next = state
  for (const unit of units) {
    next = placeUnit(next, 0, unit)
  }
  return next
}

const nine: UnitType[] = [
  'circle',
  'circle',
  'circle',
  'square',
  'square',
  'square',
  'triangle',
  'triangle',
  'triangle',
]

describe('初始状态', () => {
  it('createGame 进入 setup，玩家0 预算9', () => {
    const s = setupGame('elimination')
    expect(s.phase).toBe('setup')
    expect(s.currentPlayer).toBe(0)
    expect(s.budget).toBe(9)
    expect(s.maxPerCell).toBe(9)
  })
})

describe('布阵与放置', () => {
  it('placeUnit 放置并扣减预算', () => {
    let s = setupGame('elimination')
    s = placeUnit(s, 0, 'square')
    expect(s.boards[0][0].square).toBe(1)
    expect(s.budget).toBe(8)
  })

  it('同一格可叠加多个单位', () => {
    let s = setupGame('elimination')
    s = placeUnit(s, 0, 'circle')
    s = placeUnit(s, 0, 'circle')
    expect(s.boards[0][0].circle).toBe(2)
    expect(s.budget).toBe(7)
  })

  it('达到每格上限后无法继续放置', () => {
    let s = setupGame('elimination', 10, 2)
    s = placeUnit(s, 0, 'circle')
    s = placeUnit(s, 0, 'triangle')
    const before = s.budget
    s = placeUnit(s, 0, 'square')
    expect(s.budget).toBe(before)
    expect(s.boards[0][0].square).toBe(0)
  })

  it('setup 未放满 9 个不能提交', () => {
    let s = setupGame('elimination')
    s = placeComposition(s, nine.slice(0, 5))
    expect(canCommit(s)).toBe(false)
  })

  it('setup 放满 9 个可提交', () => {
    let s = setupGame('elimination')
    s = placeComposition(s, nine)
    expect(canCommit(s)).toBe(true)
  })
})

describe('setup 换手流程', () => {
  it('P0 布阵→换手→P1 布阵→直接进入战斗', () => {
    let s = setupGame('elimination')
    s = placeComposition(s, nine)
    s = commit(s)
    expect(s.turn).toBe('handover')
    expect(s.handoverTo).toBe('setupP1')

    s = continueHandover(s)
    expect(s.currentPlayer).toBe(1)
    expect(s.budget).toBe(BOARD_SIZE)

    s = placeComposition(s, nine)
    s = commit(s)
    expect(s.phase).toBe('battle')
    expect(s.report).not.toBeNull()
  })
})

describe('回合战斗流程', () => {
  it('布阵后直接战斗，战毕进入下一回合放置', () => {
    let s = setupGame('elimination')
    s = placeComposition(s, nine)
    s = commit(s)
    s = continueHandover(s)
    s = placeComposition(s, nine)
    s = commit(s)
    expect(s.phase).toBe('battle')
    expect(s.report).not.toBeNull()
    expect(countTriangles(s.boards[0])).toBe(0)

    s = continueBattle(s)
    expect(s.phase).toBe('place')
    expect(s.handoverTo).toBe('placeP0')
    expect(s.round).toBe(2)

    s = continueHandover(s)
    expect(s.currentPlayer).toBe(0)
    expect(s.budget).toBe(3)

    s = commit(s)
    expect(s.handoverTo).toBe('placeP1')
    s = continueHandover(s)
    expect(s.currentPlayer).toBe(1)
    expect(s.budget).toBe(3)

    s = commit(s)
    expect(s.phase).toBe('battle')
  })

  it('战毕若无人归零则进入下一回合', () => {
    let s = setupGame('elimination')
    s = placeComposition(s, nine)
    s = commit(s)
    s = continueHandover(s)
    s = placeComposition(s, nine)
    s = commit(s)
    expect(s.phase).toBe('battle')

    s = continueBattle(s)
    expect(s.phase).toBe('place')
    expect(s.round).toBe(2)
    expect(s.handoverTo).toBe('placeP0')
  })
})

describe('胜负判定', () => {
  it('一方归零判负', () => {
    const p0: Board = [{ circle: 0, triangle: 0, square: 1 }, ...emptyCells()]
    const p1: Board = emptyCells()
    let s = setupGame('elimination')
    s = { ...s, phase: 'battle', boards: [p0, p1] }
    s = continueBattle(s)
    expect(s.phase).toBe('gameover')
    expect(s.outcome).toBe('p0')
  })

  it('双方归零平局', () => {
    let s = setupGame('elimination')
    s = { ...s, phase: 'battle', boards: [emptyCells(), emptyCells()] }
    s = continueBattle(s)
    expect(s.outcome).toBe('draw')
  })
})

describe('固定回合模式', () => {
  it('回合数达到上限按正方形数计分', () => {
    const p0: Board = [{ circle: 1, triangle: 0, square: 2 }, ...emptyCells()]
    const p1: Board = [{ circle: 2, triangle: 0, square: 1 }, ...emptyCells()]
    let s = setupGame('rounds', 3)
    s = { ...s, phase: 'battle', round: 3, boards: [p0, p1] }
    s = continueBattle(s)
    expect(s.phase).toBe('gameover')
    expect(s.outcome).toBe('p0')
  })

  it('正方形数相同则比总图形数', () => {
    const p0: Board = [{ circle: 2, triangle: 0, square: 1 }, ...emptyCells()]
    const p1: Board = [{ circle: 1, triangle: 0, square: 1 }, ...emptyCells()]
    expect(decideByScore(p0, p1)).toBe('p0')
  })

  it('正方形与总数都相同则平局', () => {
    const p0: Board = [{ circle: 1, triangle: 0, square: 1 }, ...emptyCells()]
    const p1: Board = [{ circle: 1, triangle: 0, square: 1 }, ...emptyCells()]
    expect(decideByScore(p0, p1)).toBe('draw')
  })
})

function emptyCells(): Board {
  return Array.from({ length: BOARD_SIZE }, () => ({ circle: 0, triangle: 0, square: 0 }))
}

function countTriangles(board: Board): number {
  return board.reduce((sum, c) => sum + c.triangle, 0)
}
