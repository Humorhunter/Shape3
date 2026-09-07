import { describe, expect, it } from 'vitest'
import { emptyBoard } from '../src/game/engine'
import { evaluate, planRlMoves, playGame, trainSelfPlay, RlAgent } from '../src/game/rl'

describe('RL 智能体', () => {
  it('planRlMoves 尊重预算', () => {
    const agent = new RlAgent()
    const { moves } = planRlMoves(agent, [emptyBoard(), emptyBoard()], 1, 3, 9, false)
    expect(moves).toHaveLength(3)
    for (const m of moves) {
      expect(m.index).toBeGreaterThanOrEqual(0)
      expect(m.index).toBeLessThan(9)
      expect(['circle', 'triangle', 'square']).toContain(m.unit)
    }
  })

  it('playGame 返回合法结果', () => {
    const agent = new RlAgent()
    const outcome = playGame({ p0Agent: null, p1Agent: agent, p0Explore: false, p1Explore: false })
    expect(['p0', 'p1', 'draw']).toContain(outcome)
  })

  it('自博弈训练后产生非零权重', () => {
    const agent = new RlAgent()
    trainSelfPlay(agent, 50)
    expect(agent.qSize()).toBeGreaterThan(0)
    expect(agent.countUpdates).toBeGreaterThan(0)
  })

  it('evaluate 统计局数正确', () => {
    const agent = new RlAgent()
    const { wins, losses, draws } = evaluate(agent, 20)
    expect(wins + losses + draws).toBe(20)
  })

  it('权重可序列化并恢复', () => {
    const agent = new RlAgent()
    trainSelfPlay(agent, 10)
    const json = agent.toJSON()
    const restored = RlAgent.fromJSON(json)
    expect(restored.toJSON()).toEqual(json)
    expect(restored.qSize()).toBe(agent.qSize())
  })
})
