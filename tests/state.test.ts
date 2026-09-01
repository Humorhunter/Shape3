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

function setupGame(mode: GameMode, maxRounds = 10): GameState {
  return createGame(mode, maxRounds)
}

function placeComposition(state: GameState, units: UnitType[]): GameState {
  let next = state
  for (const unit of units) {
    const idx = next.boards[next.currentPlayer].indexOf(null)
    next = placeUnit(next, idx, unit)
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
  })
})

describe('布阵与放置', () => {
  it('placeUnit 放置并扣减预算', () => {
    let s = setupGame('elimination')
    s = placeUnit(s, 0, 'square')
    expect(s.boards[0][0]).toBe('square')
    expect(s.budget).toBe(8)
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
  it('P0 布阵→换手→P1 布阵→换手→进入第1回合放置', () => {
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
    expect(s.handoverTo).toBe('placeP0')

    s = continueHandover(s)
    expect(s.phase).toBe('place')
    expect(s.round).toBe(1)
    expect(s.currentPlayer).toBe(0)
    expect(s.budget).toBe(3)
  })
})

describe('回合战斗流程', () => {
  it('双方确认后进入 battle，并解析战果', () => {
    let s = setupGame('elimination')
    s = placeComposition(s, nine)
    s = commit(s)
    s = continueHandover(s)
    s = placeComposition(s, nine)
    s = commit(s)
    s = continueHandover(s)

    s = commit(s)
    expect(s.handoverTo).toBe('placeP1')
    s = continueHandover(s)
    expect(s.currentPlayer).toBe(1)
    expect(s.budget).toBe(3)

    s = commit(s)
    expect(s.phase).toBe('battle')
    expect(s.report).not.toBeNull()
    expect(s.boards[0].filter((c) => c === 'triangle')).toHaveLength(0)
  })

  it('战毕若无人归零则进入下一回合', () => {
    let s = setupGame('elimination')
    s = placeComposition(s, nine)
    s = commit(s)
    s = continueHandover(s)
    s = placeComposition(s, nine)
    s = commit(s)
    s = continueHandover(s)
    s = commit(s)
    s = continueHandover(s)
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
    const p0: Board = ['square', null, null, null, null, null, null, null, null]
    const p1: Board = [null, null, null, null, null, null, null, null, null]
    let s = setupGame('elimination')
    s = { ...s, phase: 'battle', boards: [p0, p1] }
    s = continueBattle(s)
    expect(s.phase).toBe('gameover')
    expect(s.outcome).toBe('p0')
  })

  it('双方归零平局', () => {
    let s = setupGame('elimination')
    s = {
      ...s,
      phase: 'battle',
      boards: [
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
      ],
    }
    s = continueBattle(s)
    expect(s.outcome).toBe('draw')
  })
})

describe('固定回合模式', () => {
  it('回合数达到上限按正方形数计分', () => {
    const p0: Board = ['square', 'square', 'circle', null, null, null, null, null, null]
    const p1: Board = ['square', 'circle', 'circle', null, null, null, null, null, null]
    let s = setupGame('rounds', 3)
    s = { ...s, phase: 'battle', round: 3, boards: [p0, p1] }
    s = continueBattle(s)
    expect(s.phase).toBe('gameover')
    expect(s.outcome).toBe('p0')
  })

  it('正方形数相同则比总图形数', () => {
    const p0: Board = ['square', 'circle', 'circle', null, null, null, null, null, null]
    const p1: Board = ['square', 'circle', null, null, null, null, null, null, null]
    expect(decideByScore(p0, p1)).toBe('p0')
  })

  it('正方形与总数都相同则平局', () => {
    const p0: Board = ['square', 'circle', null, null, null, null, null, null, null]
    const p1: Board = ['square', 'circle', null, null, null, null, null, null, null]
    expect(decideByScore(p0, p1)).toBe('draw')
  })
})
