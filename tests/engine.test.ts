import { describe, expect, it } from 'vitest'
import {
  canPlace,
  cloneBoard,
  countSquares,
  countTotal,
  countUnits,
  determineOutcome,
  emptyBoard,
  isEliminated,
  place,
  placementBudget,
  resolveBattle,
} from '../src/game/engine'
import { BOARD_SIZE } from '../src/game/constants'
import type { Board } from '../src/game/types'

function board(cells: (string | null)[]): Board {
  return cells as Board
}

describe('emptyBoard / cloneBoard', () => {
  it('创建 9 格空阵地', () => {
    const b = emptyBoard()
    expect(b).toHaveLength(BOARD_SIZE)
    expect(b.every((c) => c === null)).toBe(true)
  })

  it('cloneBoard 返回独立副本', () => {
    const b = board(['circle', null, 'square'])
    const c = cloneBoard(b)
    c[0] = null
    expect(b[0]).toBe('circle')
  })
})

describe('place / canPlace', () => {
  it('放置到空位', () => {
    const b = emptyBoard()
    const next = place(b, 2, 'triangle')
    expect(next[2]).toBe('triangle')
    expect(b[2]).toBeNull()
  })

  it('越界抛错', () => {
    expect(() => place(emptyBoard(), 9, 'square')).toThrow()
    expect(() => place(emptyBoard(), -1, 'square')).toThrow()
  })

  it('占用位抛错', () => {
    const b = board(['circle'])
    expect(() => place(b, 0, 'square')).toThrow()
    expect(canPlace(b, 0)).toBe(false)
  })
})

describe('countUnits / countSquares / countTotal', () => {
  const b = board(['circle', 'square', 'square', 'triangle', null])
  it('统计各单位数量', () => {
    expect(countUnits(b)).toEqual({ circle: 1, square: 2, triangle: 1 })
  })
  it('正方形数 = 生产预算', () => {
    expect(countSquares(b)).toBe(2)
    expect(placementBudget(b)).toBe(2)
  })
  it('总图形数', () => {
    expect(countTotal(b)).toBe(4)
  })
})

describe('resolveBattle', () => {
  it('三角形摧毁敌方圆形优先', () => {
    const p0 = board(['triangle', 'triangle', 'triangle', null, null, null, null, null, null])
    const p1 = board(['circle', 'circle', 'square', 'square', null, null, null, null, null])
    const { p1: next1, report } = resolveBattle(p0, p1)
    expect(report[1]).toEqual({ triangles: 3, circlesDestroyed: 2, squaresDestroyed: 1 })
    expect(next1).toEqual(board([null, null, null, 'square', null, null, null, null, null]))
  })

  it('正方形可被摧毁', () => {
    const p0 = board(['triangle', 'triangle', null, null, null, null, null, null, null])
    const p1 = board(['circle', 'square', 'square', null, null, null, null, null, null])
    const { p1: next1, report } = resolveBattle(p0, p1)
    expect(report[1]).toEqual({ triangles: 2, circlesDestroyed: 1, squaresDestroyed: 1 })
    expect(next1[0]).toBeNull()
    expect(next1[1]).toBeNull()
    expect(next1[2]).toBe('square')
  })

  it('三角形一律阵亡，不参与防守', () => {
    const p0 = board(['triangle', null, null, null, null, null, null, null, null])
    const p1 = board(['triangle', 'triangle', 'circle', 'square', null, null, null, null, null])
    const { p0: next0, p1: next1 } = resolveBattle(p0, p1)
    expect(next0.every((c) => c !== 'triangle')).toBe(true)
    expect(next1[0]).toBeNull()
    expect(next1[1]).toBeNull()
    expect(next1[2]).toBeNull()
    expect(next1[3]).toBe('square')
  })

  it('多余三角形同样毁灭', () => {
    const p0 = board(['triangle', 'triangle', 'triangle', null, null, null, null, null, null])
    const p1 = board(['circle', null, null, null, null, null, null, null, null])
    const { p1: next1, report } = resolveBattle(p0, p1)
    expect(report[1]).toEqual({ triangles: 3, circlesDestroyed: 1, squaresDestroyed: 0 })
    expect(next1.every((c) => c === null)).toBe(true)
  })

  it('同时结算互不影响', () => {
    const p0 = board(['triangle', 'circle', 'circle', null, null, null, null, null, null])
    const p1 = board(['triangle', 'triangle', 'square', null, null, null, null, null, null])
    const result = resolveBattle(p0, p1)
    expect(result.report[0]).toEqual({ triangles: 2, circlesDestroyed: 2, squaresDestroyed: 0 })
    expect(result.report[1]).toEqual({ triangles: 1, circlesDestroyed: 0, squaresDestroyed: 1 })
  })
})

describe('胜负判定', () => {
  it('一方归零判负', () => {
    const p0 = board(['square', null, null, null, null, null, null, null, null])
    const p1 = emptyBoard()
    expect(isEliminated(p1)).toBe(true)
    expect(determineOutcome(p0, p1)).toBe('p0')
  })

  it('双方归零平局', () => {
    expect(determineOutcome(emptyBoard(), emptyBoard())).toBe('draw')
  })

  it('均未归零则进行中', () => {
    const p0 = board(['square'])
    const p1 = board(['circle'])
    expect(determineOutcome(p0, p1)).toBe('ongoing')
  })
})
