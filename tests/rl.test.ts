import { describe, expect, it } from 'vitest'
import { emptyBoard } from '../src/game/engine'
import { planRlMoves, rlStateKey, simulateEpisode, trainSelfPlay, RlAgent } from '../src/game/rl'

describe('RL 智能体', () => {
  it('rlStateKey 生成稳定字符串', () => {
    const key = rlStateKey([emptyBoard(), emptyBoard()], 1, 5)
    expect(typeof key).toBe('string')
    expect(key).toContain(',')
  })

  it('planRlMoves 尊重预算（空棋盘默认生产）', () => {
    const agent = new RlAgent()
    const { moves } = planRlMoves(agent, [emptyBoard(), emptyBoard()], 1, 3, 9, false)
    expect(moves).toHaveLength(3)
    expect(moves.every((m) => m.unit === 'square')).toBe(true)
  })

  it('simulateEpisode 返回合法结果', () => {
    const agent = new RlAgent()
    const outcome = simulateEpisode(agent, false)
    expect(['p0', 'p1', 'draw']).toContain(outcome)
  })

  it('自博弈训练后 Q 表非空', () => {
    const agent = new RlAgent()
    trainSelfPlay(agent, 50)
    expect(agent.q.size).toBeGreaterThan(0)
  })
})
