import { cloneBoard, countSquares, countTotal, countUnits, planStrikes, removeUnit } from './game/engine'
import {
  canCommit,
  commit,
  continueBattle,
  continueHandover,
  createGame,
  initialState,
  placeUnit,
  type GameState,
  type GameMode,
  type HandoverTarget,
} from './game/state'
import type { Board, Strike, UnitType } from './game/types'
import { BoardView } from './ui/board'
import { cellCenter, drawBoard, drawShape, makeBoardRect, UNIT_COLORS, UNIT_LABELS, type BoardRect } from './ui/render'
import './styles.css'

const app = document.querySelector<HTMLDivElement>('#app')!

const toolbar = document.createElement('div')
toolbar.className = 'toolbar'
const titleSpan = document.createElement('span')
titleSpan.className = 'title'
titleSpan.textContent = 'Shape3 · 三形阵'
toolbar.appendChild(titleSpan)

const roundSpan = document.createElement('span')
roundSpan.className = 'round'
toolbar.appendChild(roundSpan)

const palette = document.createElement('div')
palette.className = 'palette'
const paletteButtons = new Map<UnitType, HTMLButtonElement>()
const units: UnitType[] = ['circle', 'triangle', 'square']
for (const unit of units) {
  const btn = document.createElement('button')
  const dot = document.createElement('span')
  dot.className = 'dot'
  dot.style.background = UNIT_COLORS[unit]
  btn.appendChild(dot)
  btn.appendChild(document.createTextNode(UNIT_LABELS[unit]))
  btn.addEventListener('click', () => {
    selected = unit
    syncToolbar()
  })
  palette.appendChild(btn)
  paletteButtons.set(unit, btn)
}
toolbar.appendChild(palette)

const spacer = document.createElement('div')
spacer.className = 'spacer'
toolbar.appendChild(spacer)

const hintSpan = document.createElement('span')
hintSpan.className = 'hint'
toolbar.appendChild(hintSpan)

const undoBtn = document.createElement('button')
undoBtn.className = 'action'
undoBtn.textContent = '撤销'
undoBtn.addEventListener('click', () => {
  const last = placedHistory.pop()
  if (last === undefined) return
  const boards: [Board, Board] = [...state.boards] as [Board, Board]
  boards[state.currentPlayer] = removeUnit(boards[state.currentPlayer], last.index, last.unit)
  state = { ...state, boards, budget: state.budget + 1 }
  render()
})
toolbar.appendChild(undoBtn)

const confirmBtn = document.createElement('button')
confirmBtn.className = 'action primary'
confirmBtn.addEventListener('click', () => {
  state = commit(state)
  render()
})
toolbar.appendChild(confirmBtn)

const canvas = document.createElement('canvas')

const battlePanel = document.createElement('div')
battlePanel.className = 'battle-panel'

const overlay = document.createElement('div')
overlay.className = 'overlay'

app.appendChild(toolbar)
app.appendChild(canvas)
app.appendChild(battlePanel)
app.appendChild(overlay)

const ctx = canvas.getContext('2d')!

let state: GameState = initialState()
let selected: UnitType = 'circle'
let cell = 80
let gap = 10
let turnSignature = ''
const placedHistory: { index: number; unit: UnitType }[] = []
let battleAnim: BattleAnim | null = null
let rafId: number | null = null

const BATTLE_TRAVEL_MS = 300
const BATTLE_STAGGER_MS = 110

interface BattleAnim {
  stateRef: GameState
  preBoards: [Board, Board]
  triangles: [number, number]
  sources: [number[], number[]]
  strikes: [Strike[], Strike[]]
  start: number
  duration: number
}

function placementSignature(): string {
  return `${state.phase}:${state.currentPlayer}:${state.turn}`
}

const views: [BoardView, BoardView] = [
  new BoardView(state.boards[0], makeBoardRect(0, 0, 80, 10), '玩家 1'),
  new BoardView(state.boards[1], makeBoardRect(0, 0, 80, 10), '玩家 2'),
]

function playerName(p: number): string {
  return `玩家 ${p + 1}`
}

function isPlacementTurn(): boolean {
  return (state.phase === 'setup' || state.phase === 'place') && state.turn === 'place'
}

function showTwoBoards(): boolean {
  return state.phase === 'battle' || state.phase === 'gameover'
}

function layout(): void {
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const PAD = 40
  const MARGIN = 48

  if (showTwoBoards()) {
    const cellW = Math.floor((cw - MARGIN) / (2 * 3.24))
    const cellH = Math.floor((ch - PAD) / 3.24)
    cell = Math.max(36, Math.min(cellW, cellH))
  } else {
    const cellW = Math.floor((cw - PAD) / 3.24)
    const cellH = Math.floor((ch - PAD) / 3.24)
    cell = Math.max(36, Math.min(cellW, cellH))
  }

  gap = Math.floor(cell * 0.12)
  const bw = 3 * cell + 2 * gap
  const bh = 3 * cell + 2 * gap
  const y = Math.floor((ch - bh) / 2)

  if (showTwoBoards()) {
    const totalW = bw * 2 + MARGIN
    const x0 = Math.floor((cw - totalW) / 2)
    views[0].rect = makeBoardRect(x0, y, cell, gap)
    views[1].rect = makeBoardRect(x0 + bw + MARGIN, y, cell, gap)
  } else {
    const x = Math.floor((cw - bw) / 2)
    views[0].rect = makeBoardRect(x, y, cell, gap)
    views[1].rect = makeBoardRect(x, y, cell, gap)
  }
}

function drawCanvas(): void {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  if (showTwoBoards()) {
    views[0].draw(ctx)
    views[1].draw(ctx)
  } else {
    views[state.currentPlayer].draw(ctx)
  }
}

function triangleCells(board: Board): number[] {
  const out: number[] = []
  board.forEach((c, i) => {
    for (let k = 0; k < c.triangle; k += 1) out.push(i)
  })
  return out
}

function boardCenter(rect: BoardRect): { x: number; y: number } {
  const size = 3 * rect.cell + 2 * rect.gap
  return { x: rect.x + size / 2, y: rect.y + size / 2 }
}

function createBattleAnim(state: GameState): BattleAnim | null {
  const pre = state.preBoards
  if (!pre) return null
  const triangles: [number, number] = [countUnits(pre[0]).triangle, countUnits(pre[1]).triangle]
  const sources: [number[], number[]] = [triangleCells(pre[0]), triangleCells(pre[1])]
  const strikes: [Strike[], Strike[]] = [
    planStrikes(pre[1], triangles[0]),
    planStrikes(pre[0], triangles[1]),
  ]
  const maxStrikes = Math.max(strikes[0].length, strikes[1].length)
  const duration = BATTLE_TRAVEL_MS + maxStrikes * BATTLE_STAGGER_MS + 400
  return { stateRef: state, preBoards: pre, triangles, sources, strikes, start: performance.now(), duration }
}

function stopAnim(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  battleAnim = null
}

function startBattleAnimation(): void {
  if (battleAnim && battleAnim.stateRef === state) return
  battleAnim = createBattleAnim(state)
  if (!battleAnim) return
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(animLoop)
}

function animLoop(now: number): void {
  if (!battleAnim) return
  const elapsed = now - battleAnim.start
  if (elapsed >= battleAnim.duration) {
    battleAnim = null
    rafId = null
    drawCanvas()
    showBattle()
    return
  }
  drawBattleFrame(elapsed)
  rafId = requestAnimationFrame(animLoop)
}

function buildDisplayBoards(elapsed: number): [Board, Board] {
  const pre = battleAnim!.preBoards
  const d0 = cloneBoard(pre[0])
  const d1 = cloneBoard(pre[1])
  const boards = [d0, d1]
  for (let s = 0; s < 2; s += 1) {
    const src = boards[s]
    const tgt = boards[1 - s]
    for (let i = 0; i < battleAnim!.triangles[s]; i += 1) {
      const launch = i * BATTLE_STAGGER_MS
      const land = launch + BATTLE_TRAVEL_MS
      if (elapsed >= launch) {
        const cellIdx = battleAnim!.sources[s][i]
        if (cellIdx !== undefined && src[cellIdx].triangle > 0) {
          src[cellIdx].triangle -= 1
        }
      }
      if (elapsed >= land) {
        const strike = battleAnim!.strikes[s][i]
        if (strike) {
          tgt[strike.targetIndex][strike.unit] -= 1
        }
      }
    }
  }
  return [d0, d1]
}

function drawBattleFrame(elapsed: number): void {
  const [d0, d1] = buildDisplayBoards(elapsed)
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  drawBoard(ctx, views[0].rect, d0, views[0].label)
  drawBoard(ctx, views[1].rect, d1, views[1].label)
  drawImpacts(ctx, elapsed)
  drawProjectiles(ctx, elapsed)
}

function drawProjectiles(ctx: CanvasRenderingContext2D, elapsed: number): void {
  if (!battleAnim) return
  for (let s = 0; s < 2; s += 1) {
    for (let i = 0; i < battleAnim.triangles[s]; i += 1) {
      const launch = i * BATTLE_STAGGER_MS
      const land = launch + BATTLE_TRAVEL_MS
      if (elapsed < launch || elapsed >= land) continue
      const srcIdx = battleAnim.sources[s][i]
      const strike = battleAnim.strikes[s][i]
      const from = srcIdx !== undefined
        ? cellCenter(views[s].rect, srcIdx)
        : boardCenter(views[s].rect)
      const to = strike
        ? cellCenter(views[1 - s].rect, strike.targetIndex)
        : boardCenter(views[1 - s].rect)
      const p = (elapsed - launch) / BATTLE_TRAVEL_MS
      const x = from.x + (to.x - from.x) * p
      const y = from.y + (to.y - from.y) * p
      drawShape(ctx, x, y, Math.max(14, cell * 0.24), 'triangle')
    }
  }
}

function drawImpacts(ctx: CanvasRenderingContext2D, elapsed: number): void {
  if (!battleAnim) return
  for (let s = 0; s < 2; s += 1) {
    for (let i = 0; i < battleAnim.triangles[s]; i += 1) {
      const land = i * BATTLE_STAGGER_MS + BATTLE_TRAVEL_MS
      if (elapsed >= land && elapsed < land + 160) {
        const strike = battleAnim.strikes[s][i]
        if (!strike) continue
        const c = cellCenter(views[1 - s].rect, strike.targetIndex)
        const alpha = 1 - (elapsed - land) / 160
        ctx.save()
        ctx.globalAlpha = alpha * 0.6
        ctx.fillStyle = strike.unit === 'circle' ? '#2f80ed' : '#27ae60'
        ctx.beginPath()
        ctx.arc(c.x, c.y, cell * 0.42, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }
  }
}

function syncToolbar(): void {
  for (const [unit, btn] of paletteButtons) {
    btn.classList.toggle('active', unit === selected)
  }

  palette.style.display = isPlacementTurn() ? 'flex' : 'none'

  if (state.phase === 'title') {
    roundSpan.textContent = ''
  } else if (state.phase === 'setup') {
    roundSpan.textContent = '初始布阵'
  } else if (state.phase === 'place' || state.phase === 'battle') {
    roundSpan.textContent = `第 ${state.round} 回合`
  } else {
    roundSpan.textContent = '游戏结束'
  }

  if (isPlacementTurn()) {
    if (state.phase === 'setup') {
      hintSpan.textContent = state.budget > 0
        ? `${playerName(state.currentPlayer)} 布阵：还需 ${state.budget} 个图形`
        : '布阵完成，点击右侧确认'
      confirmBtn.textContent = '布阵完成'
    } else {
      hintSpan.textContent = state.budget > 0
        ? `${playerName(state.currentPlayer)} 放置：可放 ${state.budget} 个`
        : `${playerName(state.currentPlayer)} 无可放置图形，确认跳过`
      confirmBtn.textContent = '确认布阵'
    }
    undoBtn.style.display = 'inline-block'
    undoBtn.disabled = placedHistory.length === 0
    confirmBtn.style.display = 'inline-block'
    confirmBtn.disabled = !canCommit(state)
  } else {
    hintSpan.textContent = ''
    undoBtn.style.display = 'none'
    confirmBtn.style.display = 'none'
  }
}

function handoverMessage(target: HandoverTarget): { title: string; sub: string } {
  if (target === 'setupP1') {
    return { title: '玩家 1 布阵完成', sub: '请把设备交给玩家 2，准备布阵。' }
  }
  if (target === 'placeP0') {
    return { title: '进入下一回合', sub: '请把设备交给玩家 1。' }
  }
  return { title: '换手', sub: '请把设备交给玩家 2。' }
}

function showHandover(): void {
  const target = state.handoverTo
  if (target === null) return
  const msg = handoverMessage(target)
  const el = document.createElement('div')
  el.className = 'dialog'
  const h = document.createElement('h2')
  h.textContent = msg.title
  const p = document.createElement('p')
  p.textContent = msg.sub
  const btn = document.createElement('button')
  btn.className = 'action primary'
  btn.textContent = '我准备好了'
  btn.addEventListener('click', () => {
    state = continueHandover(state)
    render()
  })
  el.append(h, p, btn)
  showOverlay(el)
}

function showTitle(): void {
  const el = document.createElement('div')
  el.className = 'dialog'
  const h = document.createElement('h1')
  h.textContent = 'Shape3 · 三形阵'
  const sub = document.createElement('p')
  sub.textContent = '圆防御 · 三角进攻 · 方生产'

  const form = document.createElement('form')
  const elimLabel = document.createElement('label')
  const elimRadio = document.createElement('input')
  elimRadio.type = 'radio'
  elimRadio.name = 'mode'
  elimRadio.value = 'elimination'
  elimRadio.checked = true
  elimLabel.append(elimRadio, document.createTextNode(' 歼灭模式（兵力归零判负）'))

  const roundsLabel = document.createElement('label')
  const roundsRadio = document.createElement('input')
  roundsRadio.type = 'radio'
  roundsRadio.name = 'mode'
  roundsRadio.value = 'rounds'
  roundsLabel.append(roundsRadio, document.createTextNode(' 固定回合模式，共 '))

  const roundsInput = document.createElement('input')
  roundsInput.type = 'number'
  roundsInput.min = '1'
  roundsInput.max = '99'
  roundsInput.value = '10'
  roundsInput.style.width = '56px'
  roundsLabel.append(roundsInput, document.createTextNode(' 回合'))

  const capLabel = document.createElement('label')
  capLabel.append(document.createTextNode(' 每格兵力上限 '))
  const capInput = document.createElement('input')
  capInput.type = 'number'
  capInput.min = '1'
  capInput.max = '99'
  capInput.value = '9'
  capInput.style.width = '56px'
  capLabel.append(capInput)

  const start = document.createElement('button')
  start.type = 'submit'
  start.className = 'action primary'
  start.textContent = '开始游戏'

  form.append(elimLabel, document.createElement('br'), roundsLabel, document.createElement('br'), capLabel, document.createElement('br'), start)
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const mode: GameMode = elimRadio.checked ? 'elimination' : 'rounds'
    const maxRounds = Math.max(1, Number(roundsInput.value) || 10)
    const maxPerCell = Math.max(1, Number(capInput.value) || 9)
    state = createGame(mode, maxRounds, maxPerCell)
    render()
  })

  el.append(h, sub, form)
  showOverlay(el)
}

function showBattle(): void {
  const report = state.report
  const el = document.createElement('div')
  el.className = 'battle-content'
  const h = document.createElement('strong')
  h.textContent = '战斗结算'
  el.appendChild(h)

  if (report) {
    const r0 = report[0]
    const r1 = report[1]
    const line1 = document.createElement('div')
    line1.textContent = `玩家 1 发射 ${r0.triangles} 个三角 → 摧毁玩家 2 圆形 ${r0.circlesDestroyed}、方形 ${r0.squaresDestroyed}`
    const line2 = document.createElement('div')
    line2.textContent = `玩家 2 发射 ${r1.triangles} 个三角 → 摧毁玩家 1 圆形 ${r1.circlesDestroyed}、方形 ${r1.squaresDestroyed}`
    el.append(line1, line2)
  }

  const s0 = countSquares(state.boards[0])
  const s1 = countSquares(state.boards[1])
  const line3 = document.createElement('div')
  line3.textContent = `剩余生产：玩家 1 ${s0} · 玩家 2 ${s1}`
  el.appendChild(line3)

  const btn = document.createElement('button')
  btn.className = 'action primary'
  btn.textContent = '确认结算'
  btn.addEventListener('click', () => {
    state = continueBattle(state)
    render()
  })
  el.appendChild(btn)

  battlePanel.innerHTML = ''
  battlePanel.appendChild(el)
  battlePanel.style.display = 'flex'
}

function showGameover(): void {
  const el = document.createElement('div')
  el.className = 'dialog'
  const h = document.createElement('h1')
  if (state.outcome === 'draw') {
    h.textContent = '平局！'
  } else {
    h.textContent = `${playerName(state.outcome === 'p0' ? 0 : 1)} 获胜！`
  }
  const s0 = countSquares(state.boards[0])
  const s1 = countSquares(state.boards[1])
  const t0 = countTotal(state.boards[0])
  const t1 = countTotal(state.boards[1])
  const p = document.createElement('p')
  p.textContent = `方形：玩家 1 ${s0} · 玩家 2 ${s1}　|　总图形：玩家 1 ${t0} · 玩家 2 ${t1}`
  const btn = document.createElement('button')
  btn.className = 'action primary'
  btn.textContent = '再来一局'
  btn.addEventListener('click', () => {
    state = initialState()
    render()
  })
  el.append(h, p, btn)
  showOverlay(el)
}

function showOverlay(content: HTMLElement): void {
  overlay.innerHTML = ''
  overlay.appendChild(content)
  overlay.style.display = 'flex'
}

function hideOverlay(): void {
  overlay.style.display = 'none'
}

function render(): void {
  const sig = placementSignature()
  if (sig !== turnSignature) {
    turnSignature = sig
    placedHistory.length = 0
  }
  views[0].board = state.boards[0]
  views[1].board = state.boards[1]
  layout()
  syncToolbar()

  battlePanel.style.display = 'none'

  if (state.phase === 'battle') {
    startBattleAnimation()
    return
  }

  stopAnim()
  drawCanvas()

  if (state.phase === 'title') {
    showTitle()
    return
  }
  hideOverlay()

  if (state.turn === 'handover') {
    showHandover()
    return
  }

  if (state.phase === 'gameover') {
    showGameover()
  }
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  canvas.width = Math.floor(cw * dpr)
  canvas.height = Math.floor(ch * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render()
}

canvas.addEventListener('pointerdown', (e) => {
  if (!isPlacementTurn()) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const idx = views[state.currentPlayer].hitTest(mx, my)
  if (idx >= 0) {
    const next = placeUnit(state, idx, selected)
    if (next !== state) {
      placedHistory.push({ index: idx, unit: selected })
      state = next
      render()
    }
  }
})

window.addEventListener('resize', resize)
window.addEventListener('load', resize)
resize()
