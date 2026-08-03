import type { DecorKind, EquipmentId, FishSpecies, GameState } from '../types'
import { allAquariums } from './aquarium'
import { furnitureUpkeep } from '../data/furniture'

const DAILY_RENT = 50

export function retailPrice(species: FishSpecies, factor: number): number {
  return Math.round(species.sellPrice * factor)
}

export function buyPrice(species: FishSpecies, factor: number): number {
  return Math.round(species.buyPrice * factor)
}

export function wholesalePrice(species: FishSpecies, factor: number): number {
  return Math.round(species.sellPrice * factor * 0.6)
}

export function stockTotal(stock: { speciesId: string; count: number }[]): number {
  return stock.reduce((acc, s) => acc + s.count, 0)
}

export function availableStock(state: GameState, speciesId: string): number {
  let n = 0
  for (const tank of state.storage) {
    for (const item of tank.stock) if (item.speciesId === speciesId) n += item.count
  }
  return n
}

export function equipmentStock(state: GameState, id: EquipmentId): number {
  return state.shop.rackInventory.filter((e) => e === id).length
}

export function decorStock(state: GameState, kind: DecorKind): number {
  return state.shop.rackDecor.filter((d) => d === kind).length
}

export function dailyUpkeep(state: GameState, speciesById: Record<string, FishSpecies>): number {
  let cost = DAILY_RENT + furnitureUpkeep(state.shop)
  for (const aq of allAquariums(state)) {
    for (const fish of aq.fish) cost += speciesById[fish.speciesId].sizeCm * 0.1
    for (const _eq of aq.equipment) cost += 4
  }
  for (const tank of state.storage) {
    for (const item of tank.stock) cost += speciesById[item.speciesId].sizeCm * 0.05 * item.count
  }
  return Math.round(cost)
}