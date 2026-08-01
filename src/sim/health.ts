import type { FishInstance, FishSpecies, AquariumConfig } from '../types'
import { compatibility } from './conditions'

export function requiredVolume(species: FishSpecies): number {
  return species.minVolume
}

export function totalRequiredVolume(
  fish: FishInstance[],
  speciesById: Record<string, FishSpecies>,
): number {
  return fish.reduce((acc, f) => acc + requiredVolume(speciesById[f.speciesId]), 0)
}

export function updateHealth(
  fish: FishInstance,
  species: FishSpecies,
  aq: AquariumConfig,
  crowded: boolean,
  dt: number,
): void {
  const rep = compatibility(species, aq)
  let penalty = (1 - rep.score) * 100
  if (crowded) penalty += 25

  if (penalty <= 0.01) {
    fish.health = Math.min(100, fish.health + 3 * dt)
  } else {
    fish.health -= penalty * 0.02 * dt
  }
  fish.health = Math.max(0, Math.min(100, fish.health))
}
