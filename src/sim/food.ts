import type { FishSpecies, FoodDef, FoodId, FoodSize, FoodStock, GameState } from '../types'
import { FOOD } from '../data/food'

const SIZE_RANK: Record<FoodSize, number> = { small: 0, medium: 1, large: 2 }

// Может ли рыба съесть корм: размер частиц не крупнее рта + диета подходит.
export function canEatFood(species: FishSpecies, def: FoodDef): boolean {
  if (SIZE_RANK[def.size] > SIZE_RANK[species.mouthSize]) return false
  if (def.diets !== 'all' && !def.diets.includes(species.diet)) return false
  return true
}

export function foodPortions(state: GameState, id: FoodId): number {
  const e = state.shop.foodStock.find((f) => f.id === id)
  return e ? e.count : 0
}

// Действующие записи о корме (только те, что есть в каталоге).
export function foodStockEntries(state: GameState): FoodStock[] {
  return state.shop.foodStock.filter((f) => FOOD[f.id] && f.count > 0)
}

// Дней до порчи живого корма при текущих условиях хранения:
// без холодильника живому корму хватает ровно на день, в холодильнике — на срок годности.
export function liveShelfDays(def: FoodDef, fridge: boolean): number {
  return fridge ? (def.shelfLifeDays ?? 1) : 1
}

// Сколько дней осталось до порчи (null для сухих).
export function freshnessLeft(entry: FoodStock, fridge: boolean): number | null {
  const def = FOOD[entry.id]
  if (!def || def.kind !== 'live') return null
  return Math.max(0, liveShelfDays(def, fridge) - entry.storedDays)
}