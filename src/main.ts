import { clear, countSquares, countTotal } from './game/engine'
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
import type { Board, UnitType } from './game/types'
import { BoardView } from './ui/board'
import { makeBoardRect, UNIT_COLORS, UNIT_LABELS } from './ui/render'
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
  const idx = placedHistory.pop()
  if (idx === undefined) return
  const boards: [Board, Board] = [...state.boards] as [Board, Board]
  boards[state.currentPlayer] = clear(boards[state.currentPlayer], idx)
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
const placedHistory: number[] = []

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
  if (showTwoBoards()) {
    cell = Math.max(36, Math.floor(Math.min(cw / 3.6, (ch - 96) / 7.2)))
  } else {
    cell = Math.max(36, Math.floor(Math.min(cw / 3.6, ch / 3.8)))
  }
  gap = Math.floor(cell * 0.12)
  const bw = 3 * cell + 2 * gap
  const x = Math.floor((cw - bw) / 2)
  const bh = 3 * cell + 2 * gap
  const y0 = showTwoBoards() ? 20 : Math.max(20, Math.floor((ch - bh) / 2))
  views[0].rect = makeBoardRect(x, y0, cell, gap)
  views[1].rect = makeBoardRect(x, y0 + bh + 56, cell, gap)
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

  const start = document.createElement('button')
  start.type = 'submit'
  start.className = 'action primary'
  start.textContent = '开始游戏'

  form.append(elimLabel, document.createElement('br'), roundsLabel, document.createElement('br'), start)
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const mode: GameMode = elimRadio.checked ? 'elimination' : 'rounds'
    const maxRounds = Math.max(1, Number(roundsInput.value) || 10)
    state = createGame(mode, maxRounds)
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
  btn.textContent = '继续'
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
  drawCanvas()
  syncToolbar()

  battlePanel.style.display = 'none'

  if (state.phase === 'title') {
    showTitle()
    return
  }
  hideOverlay()

  if (state.turn === 'handover') {
    showHandover()
    return
  }

  if (state.phase === 'battle') {
    showBattle()
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
      placedHistory.push(idx)
      state = next
      render()
    }
  }
})

window.addEventListener('resize', resize)
window.addEventListener('load', resize)
resize()
