import type { Board, Cell, UnitType } from '../game/types'
import { BOARD_SIZE } from '../game/constants'

export const UNIT_COLORS: Record<UnitType, string> = {
  circle: '#2f80ed',
  triangle: '#eb5757',
  square: '#27ae60',
}

export const UNIT_LABELS: Record<UnitType, string> = {
  circle: '圆·防御',
  triangle: '三角·进攻',
  square: '方·生产',
}

export interface BoardRect {
  x: number
  y: number
  cell: number
  gap: number
}

export function makeBoardRect(
  x: number,
  y: number,
  cell: number,
  gap: number,
): BoardRect {
  return { x, y, cell, gap }
}

function cellCenter(rect: BoardRect, index: number): { x: number; y: number } {
  const n = 3
  const col = index % n
  const row = Math.floor(index / n)
  return {
    x: rect.x + col * (rect.cell + rect.gap) + rect.cell / 2,
    y: rect.y + row * (rect.cell + rect.gap) + rect.cell / 2,
  }
}

function drawShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, unit: UnitType): void {
  ctx.fillStyle = UNIT_COLORS[unit]
  ctx.beginPath()
  if (unit === 'circle') {
    ctx.arc(cx, cy, size * 0.34, 0, Math.PI * 2)
    ctx.fill()
  } else if (unit === 'triangle') {
    const r = size * 0.38
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx - r * 0.95, cy + r * 0.7)
    ctx.lineTo(cx + r * 0.95, cy + r * 0.7)
    ctx.closePath()
    ctx.fill()
  } else {
    const s = size * 0.56
    ctx.rect(cx - s / 2, cy - s / 2, s, s)
    ctx.fill()
  }
}

export function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  cell: Cell,
  selected: boolean,
): void {
  ctx.fillStyle = selected ? '#33333f' : '#22222b'
  ctx.strokeStyle = selected ? '#8b8bf0' : '#4e4e63'
  ctx.lineWidth = 2
  roundRect(ctx, x, y, size, size, 8)
  ctx.fill()
  ctx.stroke()

  if (cell) {
    drawShape(ctx, x + size / 2, y + size / 2, size, cell)
  }
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  rect: BoardRect,
  board: Board,
  label: string,
  highlightedIndex = -1,
): void {
  const n = 3
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 16px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(label, rect.x, rect.y - 16)

  for (let i = 0; i < BOARD_SIZE; i += 1) {
    const col = i % n
    const row = Math.floor(i / n)
    const x = rect.x + col * (rect.cell + rect.gap)
    const y = rect.y + row * (rect.cell + rect.gap)
    drawCell(ctx, x, y, rect.cell, board[i], i === highlightedIndex)
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export { cellCenter }
