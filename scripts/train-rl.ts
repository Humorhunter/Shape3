import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { RlAgent, trainSelfPlay, type TrainEpisode } from '../src/game/rl'

interface Args {
  episodes: number
  input?: string
  output: string
  alpha: number
  epsilon: number
  logEvery: number
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i += 1
      } else {
        args[key] = 'true'
      }
    }
  }
  return {
    episodes: Number(args.episodes ?? args.e ?? 2000),
    input: args.input ?? args.i,
    output: resolve(args.output ?? args.o ?? 'public/rl-policy.json'),
    alpha: Number(args.alpha ?? 0.1),
    epsilon: Number(args.epsilon ?? 0.2),
    logEvery: Number(args['log-every'] ?? 100),
  }
}

function loadAgent(path?: string): RlAgent {
  if (!path) return new RlAgent()
  try {
    const raw = readFileSync(resolve(path), 'utf-8')
    return RlAgent.fromJSON(JSON.parse(raw))
  } catch {
    console.warn(`无法读取输入策略 ${path}，从零开始训练`)
    return new RlAgent()
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const agent = loadAgent(args.input)
  agent.alpha = args.alpha
  agent.epsilon = args.epsilon

  console.log(
    `训练参数：episodes=${args.episodes} alpha=${args.alpha} epsilon=${args.epsilon} ` +
      `初始Q表大小=${agent.q.size}`,
  )
  console.log(`RL 为玩家1，对战启发式AI（玩家0）`)

  const t0 = Date.now()
  const rolling: Array<'win' | 'loss' | 'draw'> = []
  let wins = 0
  let losses = 0
  let draws = 0

  const result = trainSelfPlay(agent, args.episodes, (info: TrainEpisode) => {
    if (info.outcome === 'p1') wins += 1
    else if (info.outcome === 'p0') losses += 1
    else draws += 1
    rolling.push(info.outcome === 'p1' ? 'win' : info.outcome === 'p0' ? 'loss' : 'draw')
    if (rolling.length > 100) rolling.shift()

    if (info.episode % args.logEvery === 0 || info.episode === args.episodes) {
      const rollingWin = rolling.filter((x) => x === 'win').length / rolling.length
      const cumWin = wins / info.episode
      console.log(
        `episode ${String(info.episode).padStart(6)} | ` +
          `胜率(近100)=${(rollingWin * 100).toFixed(1).padStart(5)}% | ` +
          `累计胜率=${(cumWin * 100).toFixed(1).padStart(5)}% | ` +
          `avg|TD error|=${info.meanLoss.toFixed(4)} | ` +
          `Q表=${info.qSize}`,
      )
    }
  })

  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, JSON.stringify(agent.toJSON()))
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(
    `训练完成：${args.episodes} 局 W/L/D = ${result.wins}/${result.losses}/${result.draws}，` +
      `用时 ${secs}s`,
  )
  console.log(`参数已保存到 ${args.output}`)
}

main()
