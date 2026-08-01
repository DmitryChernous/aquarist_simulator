import type { FishInstance, FishSpecies, TankState } from '../types'
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

export function hasComponent(tank: TankState, id: string): boolean {
  return tank.components.includes(id as never)
}

export function updateHealth(
  fish: FishInstance,
  species: FishSpecies,
  tank: TankState,
  crowded: boolean,
  dt: number,
): void {
  const rep = compatibility(species, tank)

  let tempPenalty = (1 - rep.temperature) * 100
  if (hasComponent(tank, 'heater')) tempPenalty *= 0.5
  let hardPenalty = (1 - rep.hardness) * 100
  if (hasComponent(tank, 'filter')) hardPenalty *= 0.5
  let vegPenalty = (1 - rep.vegetation) * 100
  if (hasComponent(tank, 'light')) vegPenalty *= 0.5

  let penalty = (tempPenalty + hardPenalty + vegPenalty) / 3
  if (crowded) penalty += hasComponent(tank, 'pump') ? 12 : 25

  const regen = hasComponent(tank, 'filter') ? 5 : 3
  if (penalty <= 0.01) {
    fish.health = Math.min(100, fish.health + regen * dt)
  } else {
    fish.health -= penalty * 0.02 * dt
  }
  fish.health = Math.max(0, Math.min(100, fish.health))
}
