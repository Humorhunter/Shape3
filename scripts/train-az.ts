import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { AZAgent, azTrain, type BatchResult } from '../src/game/alphazero'

interface Args {
  episodes: number
  playout: number
  cPuct: number
  lrPolicy: number
  lrValue: number
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
    lrValue: Number(args['lr-value'] ?? 0.05),
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
  agent.lrValue = args.lrValue

  console.log(
    `AlphaZero 训练：episodes=${args.episodes} playout=${args.playout} c_puct=${args.cPuct} ` +
      `lr_policy=${args.lrPolicy} lr_value=${args.lrValue}`,
  )
  console.log(`训练方式：MCTS(PUCT) 自博弈 + 策略迭代 + 价值函数（回放缓冲 + mini-batch）`)

  const t0 = Date.now()
  let lastLoss: BatchResult = { policyLoss: 0, valueLoss: 0 }

  azTrain(agent, args.episodes, (e, loss) => {
    lastLoss = loss
    if (e % args.logEvery === 0 || e === args.episodes) {
      console.log(
        `episode ${String(e).padStart(5)} | ` +
          `policy loss=${loss.policyLoss.toFixed(4)} | value loss=${loss.valueLoss.toFixed(4)} | ` +
          `表大小=${agent.qSize()} | 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      )
    }
  })

  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, JSON.stringify(agent.toJSON()))
  console.log(
    `训练完成：最终 policy loss=${lastLoss.policyLoss.toFixed(4)} value loss=${lastLoss.valueLoss.toFixed(4)}，` +
      `用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，策略已保存到 ${args.output}`,
  )
}

main()
