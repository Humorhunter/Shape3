import { emptyBoard, place } from './game/engine'
import type { Board, UnitType } from './game/types'
import { BoardView } from './ui/board'
import { makeBoardRect, UNIT_COLORS, UNIT_LABELS } from './ui/render'
import './styles.css'

const app = document.querySelector<HTMLDivElement>('#app')!

const toolbar = document.createElement('div')
toolbar.className = 'toolbar'
const title = document.createElement('span')
title.className = 'title'
title.textContent = 'Shape3 · 三形阵'
toolbar.appendChild(title)

const palette = document.createElement('div')
palette.className = 'palette'
const units: UnitType[] = ['circle', 'triangle', 'square']
const paletteButtons = new Map<UnitType, HTMLButtonElement>()
for (const unit of units) {
  const btn = document.createElement('button')
  const dot = document.createElement('span')
  dot.className = 'dot'
  dot.style.background = UNIT_COLORS[unit]
  btn.appendChild(dot)
  btn.appendChild(document.createTextNode(UNIT_LABELS[unit]))
  btn.addEventListener('click', () => setSelected(unit))
  palette.appendChild(btn)
  paletteButtons.set(unit, btn)
}
toolbar.appendChild(palette)

const spacer = document.createElement('div')
spacer.className = 'spacer'
toolbar.appendChild(spacer)

const hint = document.createElement('span')
hint.style.opacity = '0.7'
hint.style.fontSize = '13px'
toolbar.appendChild(hint)

const resetBtn = document.createElement('button')
resetBtn.className = 'action'
resetBtn.textContent = '重置'
resetBtn.addEventListener('click', () => {
  boards[0] = emptyBoard()
  boards[1] = emptyBoard()
  views[0].board = boards[0]
  views[1].board = boards[1]
  render()
})
toolbar.appendChild(resetBtn)

const canvas = document.createElement('canvas')
app.appendChild(toolbar)
app.appendChild(canvas)

const ctx = canvas.getContext('2d')!

const boards: [Board, Board] = [emptyBoard(), emptyBoard()]
const views: [BoardView, BoardView] = [
  new BoardView(boards[0], makeBoardRect(0, 0, 80, 10), '玩家 1'),
  new BoardView(boards[1], makeBoardRect(0, 0, 80, 10), '玩家 2'),
]

let selected: UnitType = 'circle'
let cell = 80
let gap = 10

function setSelected(unit: UnitType): void {
  selected = unit
  render()
}

function layout(): void {
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  cell = Math.max(40, Math.floor(Math.min(cw / 3.6, ch / 7.6)))
  gap = Math.floor(cell * 0.12)
  const bw = 3 * cell + 2 * gap
  const x = Math.floor((cw - bw) / 2)
  views[0].rect = makeBoardRect(x, 44, cell, gap)
  views[1].rect = makeBoardRect(x, 44 + 3 * cell + 2 * gap + 48, cell, gap)
}

function render(): void {
  for (const btn of paletteButtons) {
    const [unit, el] = btn
    el.classList.toggle('active', unit === selected)
  }
  hint.textContent = '点击阵地放置选中的图形'

  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  views[0].draw(ctx)
  views[1].draw(ctx)
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  canvas.width = Math.floor(cw * dpr)
  canvas.height = Math.floor(ch * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  layout()
  render()
}

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  for (let p = 0; p < 2; p += 1) {
    const idx = views[p].hitTest(mx, my)
    if (idx >= 0) {
      const next = place(boards[p], idx, selected)
      boards[p] = next
      views[p].board = next
      break
    }
  }
  render()
})

window.addEventListener('resize', resize)
resize()
