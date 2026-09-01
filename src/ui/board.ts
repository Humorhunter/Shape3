import type { Board } from '../game/types'
import { BOARD_SIZE } from '../game/constants'
import { cellCenter, drawBoard, type BoardRect } from './render'

export class BoardView {
  constructor(
    public board: Board,
    public rect: BoardRect,
    public label: string,
  ) {}

  draw(ctx: CanvasRenderingContext2D, highlightedIndex = -1): void {
    drawBoard(ctx, this.rect, this.board, this.label, highlightedIndex)
  }

  hitTest(mx: number, my: number): number {
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const { x, y } = cellCenter(this.rect, i)
      const half = this.rect.cell / 2
      if (mx >= x - half && mx <= x + half && my >= y - half && my <= y + half) {
        return i
      }
    }
    return -1
  }
}
