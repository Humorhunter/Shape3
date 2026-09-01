import { describe, expect, it } from 'vitest'
import { aiPlan } from '../src/game/ai'
import { BOARD_SIZE } from '../src/game/constants'
import type { Board } from '../src/game/types'

function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => ({ circle: 0, triangle: 0, square: 0 }))
}

describe('aiPlan 初始布阵', () => {
  it('返回 9 个不同格子的均衡布阵', () => {
    const moves = aiPlan([emptyBoard(), emptyBoard()], 1, 9, 9, 'setup')
    expect(moves).toHaveLength(9)
    const indices = new Set(moves.map((m) => m.index))
    expect(indices.size).toBe(9)
    const circle = moves.filter((m) => m.unit === 'circle').length
    const triangle = moves.filter((m) => m.unit === 'triangle').length
    const square = moves.filter((m) => m.unit === 'square').length
    expect(circle).toBe(3)
    expect(triangle).toBe(3)
    expect(square).toBe(3)
  })
})

describe('aiPlan 放置阶段', () => {
  it('预算为 0 时不行动', () => {
    const moves = aiPlan([emptyBoard(), emptyBoard()], 1, 0, 9, 'place')
    expect(moves).toHaveLength(0)
  })

  it('敌方为空时优先生产（方形）', () => {
    const moves = aiPlan([emptyBoard(), emptyBoard()], 1, 4, 3, 'place')
    expect(moves).toHaveLength(4)
    expect(moves.every((m) => m.unit === 'square')).toBe(true)
  })

  it('敌方同格有三角时先放圆形防守', () => {
    const self = emptyBoard()
    const opp = emptyBoard()
    opp[0].triangle = 2
    const moves = aiPlan([self, opp], 0, 2, 9, 'place')
    expect(moves[0]).toEqual({ index: 0, unit: 'circle' })
    expect(moves).toHaveLength(2)
    expect(moves[1].unit).toBe('square')
  })
})
