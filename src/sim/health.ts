import type { AquariumState, FishInstance, FishSpecies } from '../types'
import { compatibility } from './conditions'

export function hasEquipment(aq: AquariumState, id: string): boolean {
  return aq.equipment.some((e) => e.id === id)
}

export function updateHealth(
  fish: FishInstance,
  species: FishSpecies,
  aq: AquariumState,
  crowded: boolean,
  dt: number,
): void {
  const rep = compatibility(species, aq)

  const tempPenalty = (1 - rep.temperature) * 100
  const phGhPenalty = ((1 - rep.ph) + (1 - rep.gh)) * 50
  const o2Penalty = (1 - rep.o2) * 100
  const lightPenalty = (1 - rep.light) * 100
  const vegPenalty = (1 - rep.vegetation) * 100

  const hardPenalty = phGhPenalty * (hasEquipment(aq, 'filter') ? 0.5 : 1)
  const softPenalty = ((tempPenalty + o2Penalty + lightPenalty + vegPenalty) / 4) *
    (hasEquipment(aq, 'heater') ? 0.7 : 1)

  let penalty = (hardPenalty + softPenalty) / 2
  if (crowded) penalty += hasEquipment(aq, 'airPump') ? 12 : 25

  const regen = hasEquipment(aq, 'filter') ? 5 : 3
  if (penalty <= 0.01) {
    fish.health = Math.min(100, fish.health + regen * dt)
  } else {
    fish.health -= penalty * 0.02 * dt
  }
  fish.health = Math.max(0, Math.min(100, fish.health))
}