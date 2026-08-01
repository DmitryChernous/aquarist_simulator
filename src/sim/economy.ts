import type { FishInstance, FishSpecies, GameState } from '../types'

const DAILY_RENT = 50

export function fishSellValue(fish: FishInstance, species: FishSpecies): number {
  const healthFactor = 0.5 + fish.health / 200
  return Math.round(species.sellPrice * healthFactor)
}

export function dailyUpkeep(state: GameState, speciesById: Record<string, FishSpecies>): number {
  let cost = DAILY_RENT
  for (const f of state.fish) {
    cost += speciesById[f.speciesId].sizeCm * 0.1
  }
  return Math.round(cost)
}
