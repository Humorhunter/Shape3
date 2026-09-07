import { describe, expect, it } from 'vitest'
import { emptyBoard } from '../src/game/engine'
import { AZAgent, azPlan, azTrain } from '../src/game/alphazero'

describe('AlphaZero 智能体', () => {
  it('azPlan 尊重预算且落子合法', () => {
    const a = new AZAgent()
    a.nPlayout = 10
    const moves = azPlan(a, emptyBoard(), emptyBoard(), 9, 9)
    expect(moves).toHaveLength(9)
    for (const m of moves) {
      expect(m.index).toBeGreaterThanOrEqual(0)
      expect(m.index).toBeLessThan(9)
      expect(['circle', 'triangle', 'square']).toContain(m.unit)
    }
  })

  it('训练后策略表非空', () => {
    const a = new AZAgent()
    a.nPlayout = 10
    azTrain(a, 2)
    expect(a.qSize()).toBeGreaterThan(0)
  })

  it('策略可序列化并恢复', () => {
    const a = new AZAgent()
    a.nPlayout = 10
    azTrain(a, 2)
    const json = a.toJSON()
    const restored = AZAgent.fromJSON(json)
    expect(restored.toJSON()).toEqual(json)
  })
})
