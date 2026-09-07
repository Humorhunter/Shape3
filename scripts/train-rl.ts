import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { evaluate, RlAgent, trainSelfPlay, type TrainEpisode } from '../src/game/rl'

interface Args {
  episodes: number
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
    input: args.input ?? args.i,
    output: resolve(args.output ?? args.o ?? 'public/rl-policy.json'),
    alpha: Number(args.alpha ?? 0.1),
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

function fmtWinRate(wins: number, total: number): string {
  return `${((wins / total) * 100).toFixed(1).padStart(5)}%`
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const agent = loadAgent(args.input)
  agent.alpha = args.alpha
  agent.epsilon = args.epsilon

  console.log(`训练参数：episodes=${args.episodes} alpha=${args.alpha} epsilon=${args.epsilon} 初始Q表大小=${agent.q.size}`)
  console.log(`训练方式：自博弈（RL vs RL），每 ${args.evalEvery} 局用启发式 AI 评估一次胜率`)

  const t0 = Date.now()

  trainSelfPlay(agent, args.episodes, (info: TrainEpisode) => {
    if (info.episode % args.logEvery === 0 || info.episode === args.episodes) {
      console.log(
        `episode ${String(info.episode).padStart(6)} | ` +
          `avg|TD error|=${info.meanLoss.toFixed(4)} | Q表=${info.qSize}`,
      )
    }
    if (info.episode % args.evalEvery === 0 || info.episode === args.episodes) {
      const { wins, losses, draws } = evaluate(agent, args.evalGames)
      const total = wins + losses + draws
      console.log(
        `  └─ 评估(vs 启发式, ${total} 局)：胜率=${fmtWinRate(wins, total)} 负率=${fmtWinRate(losses, total)} ` +
          `平局=${draws}`,
      )
    }
  })

  const { wins, losses, draws } = evaluate(agent, args.evalGames)
  const total = wins + losses + draws
  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, JSON.stringify(agent.toJSON()))

  const secs = ((Date.now() - t0) / 1000).toFixed(2)
  console.log(
    `最终评估(vs 启发式, ${total} 局)：W/L/D = ${wins}/${losses}/${draws} 胜率=${fmtWinRate(wins, total)}`,
  )
  console.log(`训练+评估用时 ${secs}s，参数已保存到 ${args.output}`)
}

main()
