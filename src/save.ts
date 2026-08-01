import type { GameState } from './types'
import { FISH_SPECIES } from './data/fish'

const KEY = 'aquarist-save-v3'
export const START_MONEY = 800

export function defaultState(): GameState {
  return {
    money: START_MONEY,
    shop: {
      cashRegister: false,
      restAreas: 0,
      shelvingUnits: 0,
      componentRacks: 0,
      rackInventory: [],
    },
    market: Object.fromEntries(FISH_SPECIES.map((s) => [s.id, 1])),
    orders: [],
    tanks: [
      {
        id: 't1',
        name: 'Витрина 1',
        kind: 'display',
        volume: 100,
        temperature: 25,
        hardness: 8,
        vegetation: 0.5,
        designLevel: 0,
        components: [],
        fish: [],
        stock: [],
      },
      {
        id: 's1',
        name: 'Склад 1',
        kind: 'storage',
        volume: 0,
        temperature: 0,
        hardness: 0,
        vegetation: 0,
        designLevel: 0,
        components: [],
        fish: [],
        stock: [],
      },
    ],
    selectedTankId: 't1',
    selectedStorageId: 's1',
    day: 1,
    daySeconds: 0,
    log: [
      {
        day: 1,
        text: 'Добро пожаловать! Закупите рыб на склад, заселите их в витрину для привлекательности. Покупатели оставляют заказы — выполняйте их вручную.',
        kind: 'info',
      },
    ],
    nextVisitorIn: 25,
    totalVisitors: 0,
    sales: 0,
    epoch: 0,
  }
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<GameState>
    if (!parsed || typeof parsed !== 'object' || !parsed.shop || !Array.isArray(parsed.tanks)) {
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
