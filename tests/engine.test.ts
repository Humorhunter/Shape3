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
  removeUnit,
  resolveBattle,
} from '../src/game/engine'
import { BOARD_SIZE } from '../src/game/constants'
import type { Board, Cell } from '../src/game/types'

function cell(circle = 0, triangle = 0, square = 0): Cell {
  return { circle, triangle, square }
}

function board(...cells: Cell[]): Board {
  const b = cells.slice()
  while (b.length < BOARD_SIZE) b.push(cell())
  return b
}

describe('emptyBoard / cloneBoard', () => {
  it('创建 9 格空阵地', () => {
    const b = emptyBoard()
    expect(b).toHaveLength(BOARD_SIZE)
    expect(b.every((c) => c.circle === 0 && c.triangle === 0 && c.square === 0)).toBe(true)
  })

  it('cloneBoard 返回独立副本', () => {
    const b = board(cell(1, 0, 1))
    const c = cloneBoard(b)
    c[0].circle = 0
    expect(b[0].circle).toBe(1)
  })
})

describe('place / canPlace / removeUnit', () => {
  it('放置单位到格内', () => {
    const b = emptyBoard()
    const next = place(b, 2, 'triangle', 9)
    expect(next[2].triangle).toBe(1)
    expect(b[2].triangle).toBe(0)
  })

  it('越界抛错', () => {
    expect(() => place(emptyBoard(), 9, 'square', 9)).toThrow()
    expect(() => place(emptyBoard(), -1, 'square', 9)).toThrow()
  })

  it('达到每格上限后不能再放', () => {
    const b = board(cell(5, 2, 2))
    expect(canPlace(b, 0, 9)).toBe(false)
    expect(() => place(b, 0, 'square', 9)).toThrow()
  })

  it('未达上限可以放', () => {
    const b = board(cell(5, 2, 1))
    expect(canPlace(b, 0, 9)).toBe(true)
    expect(place(b, 0, 'square', 9)[0].square).toBe(2)
  })

  it('removeUnit 减少一个单位', () => {
    const b = board(cell(2, 1, 1))
    const next = removeUnit(b, 0, 'circle')
    expect(next[0].circle).toBe(1)
    expect(removeUnit(b, 0, 'triangle')[0].triangle).toBe(0)
  })
})

describe('countUnits / countSquares / countTotal', () => {
  const b = board(cell(1, 1, 2), cell(0, 1, 0))
  it('统计各单位数量', () => {
    expect(countUnits(b)).toEqual({ circle: 1, square: 2, triangle: 2 })
  })
  it('正方形数 = 生产预算', () => {
    expect(countSquares(b)).toBe(2)
  })
  it('总图形数', () => {
    expect(countTotal(b)).toBe(5)
  })
})

describe('resolveBattle', () => {
  it('三角形摧毁敌方圆形优先，再摧毁方形', () => {
    const p0 = board(cell(0, 3, 0))
    const p1 = board(cell(2, 0, 2))
    const { p1: next1, report } = resolveBattle(p0, p1)
    expect(report[0]).toEqual({ triangles: 3, circlesDestroyed: 2, squaresDestroyed: 1 })
    expect(next1[0]).toEqual(cell(0, 0, 1))
  })

  it('正方形可被摧毁', () => {
    const p0 = board(cell(0, 2, 0))
    const p1 = board(cell(1, 0, 2))
    const { p1: next1, report } = resolveBattle(p0, p1)
    expect(report[0]).toEqual({ triangles: 2, circlesDestroyed: 1, squaresDestroyed: 1 })
    expect(next1[0]).toEqual(cell(0, 0, 1))
  })

  it('三角形一律阵亡，不参与防守', () => {
    const p0 = board(cell(0, 1, 0))
    const p1 = board(cell(1, 2, 1))
    const { p0: next0, p1: next1 } = resolveBattle(p0, p1)
    expect(next0[0].triangle).toBe(0)
    expect(next1[0].circle).toBe(0)
    expect(next1[0].triangle).toBe(0)
    expect(next1[0].square).toBe(1)
  })

  it('多余三角形同样毁灭', () => {
    const p0 = board(cell(0, 3, 0))
    const p1 = board(cell(1, 0, 0))
    const { p1: next1, report } = resolveBattle(p0, p1)
    expect(report[0]).toEqual({ triangles: 3, circlesDestroyed: 1, squaresDestroyed: 0 })
    expect(isEliminated(next1)).toBe(true)
  })

  it('同时结算互不影响', () => {
    const p0 = board(cell(2, 1, 0))
    const p1 = board(cell(0, 2, 1))
    const result = resolveBattle(p0, p1)
    expect(result.report[0]).toEqual({ triangles: 1, circlesDestroyed: 0, squaresDestroyed: 1 })
    expect(result.report[1]).toEqual({ triangles: 2, circlesDestroyed: 2, squaresDestroyed: 0 })
  })
})

describe('胜负判定', () => {
  it('一方归零判负', () => {
    const p0 = board(cell(0, 0, 1))
    const p1 = emptyBoard()
    expect(isEliminated(p1)).toBe(true)
    expect(determineOutcome(p0, p1)).toBe('p0')
  })

  it('双方归零平局', () => {
    expect(determineOutcome(emptyBoard(), emptyBoard())).toBe('draw')
  })

  it('均未归零则进行中', () => {
    expect(determineOutcome(board(cell(0, 0, 1)), board(cell(1)))).toBe('ongoing')
  })
})
