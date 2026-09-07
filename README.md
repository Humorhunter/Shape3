# Shape3 · 三形阵

一款双人热座（本地对战）的抽象策略游戏。双方各持一个 3×3 的阵地，用三种图形排兵布阵，隐藏信息，回合制对抗。

## 规则

三种图形各有分工：

| 图形 | 作用 |
| --- | --- |
| 圆 (Circle) | 防御：被进攻时优先消耗，保护生产；未被摧毁则跨回合保留 |
| 三角 (Triangle) | 进攻：每回合必发射、寿命一轮，攻击**对应格子**的敌方圆形（优先，1 三角 1 圆）与方形（**1 三角 2 方**）；对应格无可摧毁目标则自毁 |
| 方 (Square) | 生产：结算后剩余方形数 = 下一回合可放置的图形数 |

流程：

1. **初始布阵**：双方各自秘密放置 9 个图形（任意组合），互不可见。
2. **放置**：每回合可放置数量 = 上一回合结算后的方形数；每个格子可堆叠多个兵力（每格上限可配置，默认 9）。
3. **进攻**：双方同时结算；每个格子的三角攻击**对方同一位置**的格子（先圆形 1:1、再方形 1:2），三角自身必毁；若对应格无可摧毁目标则自毁。
4. **结算**：统计方形数，作为下一回合生产；一方**生产力（方形）归零**即判负。

胜负：

- **歼灭模式（默认）**：一方生产力（方形数）归零判负，可平局。
- **固定回合模式（可选）**：打满 N 回合后，先比方形数，再比总图形数。

对战模式：

- **双人热座**：两人共用一台设备，换手遮挡屏。
- **单人 vs 机器人**：对方由简易 AI 接管（优先防守被攻击格、其次进攻有生力量、否则生产）。
- **单人 vs 强化学习机器人**：SARSA 自博弈训练的对手（类 AlphaZero，启发式仅用于评估）。

## 技术栈

- TypeScript + Vite + Canvas
- Vitest（规则引擎单元测试）

## 本地运行

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 类型检查 + 构建到 dist/
npm run test     # 运行单元测试
npm run preview  # 预览构建产物
```

## 训练强化学习 AI（命令行）

RL 采用**自博弈训练**（RL vs RL，类 AlphaZero），算法为 **SARSA（表格化，on-policy TD，γ=0.9）**，状态是「每个格子的己方/对方三种兵力数量（分桶）+ 预算」的局部表征，动作为「格子 × 兵种」共 27 个，初始布阵同样由 RL 学习。策略保存在 `public/rl-policy.json`，游戏开局自动加载，无需重新构建。

```bash
# 从零自博弈训练 5000 局，保存到默认路径
npm run train:rl -- --episodes 5000

# 在已有策略基础上继续训练
npm run train:rl -- --input public/rl-policy.json --episodes 3000

# 常用参数
npm run train:rl -- \
  --episodes 5000 \      # 自博弈主训练局数
  --warmup 200 \         # 预热局数，结束后冻结一个基准策略
  --input public/rl-policy.json \  # 可选：继续训练的基础策略
  --output public/rl-policy.json \ # 保存路径
  --alpha 0.01 \         # 学习率
  --epsilon 0.2 \        # 探索率
  --log-every 200 \      # 每 N 局打印一次 loss
  --eval-every 500 \     # 每 N 局评估一次 Elo
  --eval-games 200       # 每次 Elo 评估的对局数
```

训练反馈用类 AlphaZero 的 **Elo**：预热后冻结一个基准快照，训练过程中每 `--eval-every` 局让当前策略与之对弈并计算 Elo（不再用启发式胜率，因为它已饱和）。同时打印平均 `|TD error|`（价值收敛）与 Q 表大小。示例：

```
episode   2000 | avg|TD error|=0.1296 | Q表=12950
  └─ Elo vs 基准=564（胜率 95.5% / 负率 3.0% / 平局 3）
```

训练完成后覆盖 `public/rl-policy.json`，刷新页面即可用新策略对战。

## 训练 AlphaZero 智能体（命令行）

类 AlphaZero 的 **PUCT MCTS 自博弈 + 策略迭代 + 价值函数**（对照经典训练管线）：MCTS 用「策略网络（先验）+ 价值函数（叶子评估，替代 rollout）」搜索，自博弈收集 `(状态, 访问频次分布, 胜负)` 存入回放缓冲，mini-batch 训练——策略做交叉熵、价值做 MSE。策略保存在 `public/az-policy.json`。

```bash
npm run train:az -- --episodes 500 --playout 100 --c-puct 3 --lr-policy 0.02 --lr-value 0.05
```

训练时打印 `policy loss`（交叉熵）与 `value loss`（MSE）作为学习进程反馈。

## 目录结构

```
src/
├─ game/
│  ├─ types.ts      类型定义
│  ├─ constants.ts  常量
│  ├─ engine.ts     纯函数规则引擎
│  ├─ ai.ts         简易 AI 决策
│  ├─ rl.ts         强化学习智能体（SARSA）
│  ├─ alphazero.ts  AlphaZero 智能体（PUCT MCTS + 策略迭代）
│  └─ state.ts      回合状态机
├─ ui/
│  ├─ render.ts     Canvas 绘制
│  └─ board.ts      棋盘视图与命中检测
├─ styles.css
└─ main.ts          入口与游戏编排
scripts/
├─ train-rl.ts      SARSA 训练命令行入口
└─ train-az.ts      AlphaZero 训练命令行入口
public/
├─ rl-policy.json   SARSA 策略参数（线上自动加载）
└─ az-policy.json   AlphaZero 策略参数
tests/
├─ engine.test.ts   规则引擎测试
├─ ai.test.ts       AI 决策测试
├─ rl.test.ts       强化学习测试
├─ alphazero.test.ts AlphaZero 测试
└─ state.test.ts    状态机测试
```

平衡分析见 `平衡分析.md`。

## 后续可扩展

- 在线联机
- AI 难度分级 / 更强策略
- 阵型预设 / 局内动画增强
