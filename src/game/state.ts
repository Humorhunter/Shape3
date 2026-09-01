import { BOARD_SIZE, DEFAULT_MAX_PER_CELL } from './constants'
import {
  canPlace,
  countSquares,
  countTotal,
  determineOutcome,
  emptyBoard,
  place,
  resolveBattle,
} from './engine'
import type { BattleReport, Board, Outcome, PlayerIndex, UnitType } from './types'

export type GameMode = 'elimination' | 'rounds'
export type Phase = 'title' | 'setup' | 'place' | 'battle' | 'gameover'
export type Turn = 'place' | 'handover'
export type HandoverTarget = 'setupP1' | 'placeP0' | 'placeP1'

export interface GameState {
  phase: Phase
  mode: GameMode
  maxRounds: number
  maxPerCell: number
  round: number
  boards: [Board, Board]
  preBoards: [Board, Board] | null
  currentPlayer: PlayerIndex
  turn: Turn
  budget: number
  handoverTo: HandoverTarget | null
  report: BattleReport | null
  outcome: Outcome
}

export const INITIAL_BUDGET = BOARD_SIZE

export function initialState(): GameState {
  return {
    phase: 'title',
    mode: 'elimination',
    maxRounds: 10,
    maxPerCell: DEFAULT_MAX_PER_CELL,
    round: 1,
    boards: [emptyBoard(), emptyBoard()],
    preBoards: null,
    currentPlayer: 0,
    turn: 'place',
    budget: INITIAL_BUDGET,
    handoverTo: null,
    report: null,
    outcome: 'ongoing',
  }
}

export function createGame(mode: GameMode, maxRounds: number, maxPerCell: number): GameState {
  return {
    ...initialState(),
    phase: 'setup',
    mode,
    maxRounds,
    maxPerCell,
    currentPlayer: 0,
    turn: 'place',
    budget: INITIAL_BUDGET,
  }
}

function isPlacementPhase(phase: Phase): boolean {
  return phase === 'setup' || phase === 'place'
}

export function canCommit(state: GameState): boolean {
  if (!isPlacementPhase(state.phase) || state.turn !== 'place') return false
  if (state.phase === 'setup') {
    return countTotal(state.boards[state.currentPlayer]) === BOARD_SIZE
  }
  return true
}

export function placeUnit(state: GameState, index: number, unit: UnitType): GameState {
  if (!isPlacementPhase(state.phase) || state.turn !== 'place') return state
  if (state.budget <= 0) return state
  const board = state.boards[state.currentPlayer]
  if (!canPlace(board, index, state.maxPerCell)) return state

  const boards: [Board, Board] = [...state.boards] as [Board, Board]
  boards[state.currentPlayer] = place(board, index, unit, state.maxPerCell)
  return { ...state, boards, budget: state.budget - 1 }
}

export function commit(state: GameState): GameState {
  if (!canCommit(state)) return state
  if (state.phase === 'setup') {
    if (state.currentPlayer === 0) {
      return { ...state, turn: 'handover', handoverTo: 'setupP1' }
    }
    return enterBattle(state)
  }
  if (state.currentPlayer === 0) {
    return { ...state, turn: 'handover', handoverTo: 'placeP1' }
  }
  return enterBattle(state)
}

function enterBattle(state: GameState): GameState {
  const preBoards: [Board, Board] = [
    state.boards[0].map((c) => ({ ...c })),
    state.boards[1].map((c) => ({ ...c })),
  ]
  const { p0, p1, report } = resolveBattle(state.boards[0], state.boards[1])
  return {
    ...state,
    phase: 'battle',
    turn: 'place',
    boards: [p0, p1],
    preBoards,
    report,
  }
}

export function continueHandover(state: GameState): GameState {
  if (state.turn !== 'handover' || state.handoverTo === null) return state
  const target = state.handoverTo
  if (target === 'setupP1') {
    return {
      ...state,
      turn: 'place',
      handoverTo: null,
      currentPlayer: 1,
      budget: INITIAL_BUDGET,
    }
  }
  if (target === 'placeP0') {
    return {
      ...state,
      phase: 'place',
      turn: 'place',
      handoverTo: null,
      currentPlayer: 0,
      budget: countSquares(state.boards[0]),
    }
  }
  return {
    ...state,
    phase: 'place',
    turn: 'place',
    handoverTo: null,
    currentPlayer: 1,
    budget: countSquares(state.boards[1]),
  }
}

export function continueBattle(state: GameState): GameState {
  if (state.phase !== 'battle') return state
  const elim = determineOutcome(state.boards[0], state.boards[1])
  if (elim !== 'ongoing') {
    return { ...state, phase: 'gameover', outcome: elim }
  }
  if (state.mode === 'rounds' && state.round >= state.maxRounds) {
    return {
      ...state,
      phase: 'gameover',
      outcome: decideByScore(state.boards[0], state.boards[1]),
    }
  }
  return {
    ...state,
    phase: 'place',
    round: state.round + 1,
    turn: 'handover',
    handoverTo: 'placeP0',
    currentPlayer: 0,
    budget: 0,
  }
}

export function decideByScore(p0: Board, p1: Board): Outcome {
  const s0 = countSquares(p0)
  const s1 = countSquares(p1)
  if (s0 !== s1) return s0 > s1 ? 'p0' : 'p1'
  const t0 = countTotal(p0)
  const t1 = countTotal(p1)
  if (t0 !== t1) return t0 > t1 ? 'p0' : 'p1'
  return 'draw'
}
