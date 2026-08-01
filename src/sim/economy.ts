import type { FishInstance, FishSpecies, GameState } from '../types'

const DAILY_RENT = 50

export function fishSellValue(fish: FishInstance, species: FishSpecies): number {
  const healthFactor = 0.5 + fish.health / 200
  return Math.round(species.sellPrice * healthFactor)
}

export function wholesalePrice(species: FishSpecies): number {
  return Math.round(species.sellPrice * 0.6)
}

export function stockTotal(stock: { speciesId: string; count: number }[]): number {
  return stock.reduce((acc, s) => acc + s.count, 0)
}

export function dailyUpkeep(state: GameState, speciesById: Record<string, FishSpecies>): number {
  let cost = DAILY_RENT
  for (const tank of state.tanks) {
    for (const fish of tank.fish) {
      cost += speciesById[fish.speciesId].sizeCm * 0.1
    }
    for (const item of tank.stock) {
      cost += speciesById[item.speciesId].sizeCm * 0.05 * item.count
    }
  }
  return Math.round(cost)
}
