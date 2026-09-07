import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { AZAgent, azTrainStep, azSelfPlay } from '../src/game/alphazero'

interface Args {
  episodes: number
  playout: number
  cPuct: number
  lrPolicy: number
  input?: string
  output: string
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
    episodes: Number(args.episodes ?? args.e ?? 500),
    playout: Number(args.playout ?? 100),
    cPuct: Number(args['c-puct'] ?? 3),
    lrPolicy: Number(args['lr-policy'] ?? 0.02),
    input: args.input ?? args.i,
    output: resolve(args.output ?? args.o ?? 'public/az-policy.json'),
    logEvery: Number(args['log-every'] ?? 20),
  }
}

function loadAgent(path?: string): AZAgent {
  if (!path) return new AZAgent()
  try {
    return AZAgent.fromJSON(JSON.parse(readFileSync(resolve(path), 'utf-8')))
  } catch {
    console.warn(`无法读取输入策略 ${path}，从零开始训练`)
    return new AZAgent()
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const agent = loadAgent(args.input)
  agent.nPlayout = args.playout
  agent.cPuct = args.cPuct
  agent.lrPolicy = args.lrPolicy

  console.log(`AlphaZero 训练：episodes=${args.episodes} playout=${args.playout} c_puct=${args.cPuct} lr=${args.lrPolicy}`)
  console.log(`训练方式：MCTS(PUCT) 自博弈 + 策略迭代（policy ← 访问频次）`)

  const t0 = Date.now()
  let totalLoss = 0
  let samples = 0
  for (let e = 1; e <= args.episodes; e += 1) {
    const data = azSelfPlay(agent, 9)
    const loss = azTrainStep(agent, data)
    totalLoss += loss
    samples += 1
    if (e % args.logEvery === 0 || e === args.episodes) {
      const avgLoss = totalLoss / samples
      console.log(
        `episode ${String(e).padStart(5)} | ` +
          `policy loss=${avgLoss.toFixed(4)} | 策略表大小=${agent.qSize()} | ` +
          `用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      )
    }
  }

  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, JSON.stringify(agent.toJSON()))
  console.log(`训练完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，策略已保存到 ${args.output}`)
}

main()
