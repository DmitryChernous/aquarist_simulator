import type { FishInstance, FishSpecies, GameState } from '../types'
import { MAX_DESIGN_LEVEL } from '../data/aquarium'

export function attractiveness(
  state: GameState,
  speciesById: Record<string, FishSpecies>,
): number {
  const { aquarium, fish } = state

  const design = (aquarium.designLevel / MAX_DESIGN_LEVEL) * 30
  const healthAvg = fish.length
    ? fish.reduce((acc, f) => acc + f.health, 0) / fish.length
    : 0
  const healthPart = (healthAvg / 100) * 30
  const distinct = new Set(fish.map((f) => f.speciesId)).size
  const diversity = Math.min(distinct / 4, 1) * 20

  let appealSum = 0
  for (const f of fish) {
    appealSum += speciesById[f.speciesId].appeal * (f.health / 100)
  }
  const appeal = Math.min(appealSum / 150, 1) * 20

  return Math.max(0, Math.min(100, Math.round(design + healthPart + diversity + appeal)))
}

export function visitorInterval(attractivenessValue: number): number {
  return Math.max(3, 30 - attractivenessValue * 0.25)
}

export function pickBuyerFish(
  state: GameState,
  speciesById: Record<string, FishSpecies>,
): FishInstance | null {
  const candidates = state.fish.filter((f) => f.health >= 15)
  if (candidates.length === 0) return null

  const weights = candidates.map((f) => {
    const s = speciesById[f.speciesId]
    let w = s.appeal * (f.health / 100)
    if (f.health < 50) w *= 0.3
    return Math.max(0.01, w)
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}
