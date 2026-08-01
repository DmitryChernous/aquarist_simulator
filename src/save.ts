import type { GameState } from './types'

const KEY = 'aquarist-save-v1'
export const START_MONEY = 800

export function defaultState(): GameState {
  return {
    money: START_MONEY,
    aquarium: { volume: 100, temperature: 25, hardness: 8, vegetation: 0.5, designLevel: 0 },
    fish: [],
    day: 1,
    daySeconds: 0,
    log: [{ day: 1, text: 'Добро пожаловать! Купите рыб и настройте аквариум под их нужды.', kind: 'info' }],
    nextVisitorIn: 20,
    totalVisitors: 0,
    epoch: 0,
  }
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<GameState>
    if (!parsed || typeof parsed !== 'object' || !parsed.aquarium || !Array.isArray(parsed.fish)) {
      return defaultState()
    }
    return { ...defaultState(), ...parsed } as GameState
  } catch {
    return defaultState()
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // игнорируем ошибки сохранения
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY)
}
