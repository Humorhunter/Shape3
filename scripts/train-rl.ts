import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { eloFromScore, evaluatePair, RlAgent, trainSelfPlay, type TrainEpisode } from '../src/game/rl'

interface Args {
  episodes: number
  warmup: number
  input?: string
  output: string
  alpha: number
  epsilon: number
  logEvery: number
  evalEvery: number
  evalGames: number
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
    episodes: Number(args.episodes ?? args.e ?? 5000),
    warmup: Number(args.warmup ?? 200),
    input: args.input ?? args.i,
    output: resolve(args.output ?? args.o ?? 'public/rl-policy.json'),
    alpha: Number(args.alpha ?? 0.01),
    epsilon: Number(args.epsilon ?? 0.2),
    logEvery: Number(args['log-every'] ?? 200),
    evalEvery: Number(args['eval-every'] ?? 500),
    evalGames: Number(args['eval-games'] ?? 200),
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

  console.log(`训练参数：episodes=${args.episodes} warmup=${args.warmup} alpha=${args.alpha} epsilon=${args.epsilon}`)
  console.log(`训练方式：自博弈（RL vs RL，类 AlphaZero），以 Elo 衡量相对冻结基准的进步`)

  const t0 = Date.now()

  agent.alpha = args.alpha
  agent.epsilon = args.epsilon
  if (args.warmup > 0) {
    trainSelfPlay(agent, args.warmup)
    console.log(`预热完成：${args.warmup} 局自博弈`)
  }
  const baseline = agent.clone()
  console.log(`冻结基准策略（Q表 ${baseline.qSize()}），开始主训练`)

  agent.alpha = args.alpha
  agent.epsilon = args.epsilon
  trainSelfPlay(agent, args.episodes, (info: TrainEpisode) => {
    if (info.episode % args.logEvery === 0 || info.episode === args.episodes) {
      console.log(
        `episode ${String(info.episode).padStart(6)} | ` +
          `avg|TD error|=${info.meanLoss.toFixed(4)} | Q表=${info.qSize}`,
      )
    }
    if (info.episode % args.evalEvery === 0 || info.episode === args.episodes) {
      const { wins, draws, losses } = evaluatePair(agent, baseline, args.evalGames)
      const total = wins + draws + losses
      const elo = eloFromScore(wins + draws * 0.5, total)
      const wr = ((wins / total) * 100).toFixed(1)
      console.log(`  └─ Elo vs 基准=${elo}（胜率 ${wr}% / 负率 ${((losses / total) * 100).toFixed(1)}% / 平局 ${draws}）`)
    }
  })

  const { wins, draws, losses } = evaluatePair(agent, baseline, args.evalGames)
  const total = wins + draws + losses
  const finalElo = eloFromScore(wins + draws * 0.5, total)

  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, JSON.stringify(agent.toJSON()))

  const secs = ((Date.now() - t0) / 1000).toFixed(2)
  console.log(`最终 Elo vs 基准 = ${finalElo}（W/L/D = ${wins}/${losses}/${draws}）`)
  console.log(`训练+评估用时 ${secs}s，参数已保存到 ${args.output}`)
}

main()
