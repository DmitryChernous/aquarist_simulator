import type { FishInstance, GameState, TankState } from '../types'
import { MAX_DESIGN_LEVEL } from '../data/aquarium'
import { SPECIES_BY_ID } from '../data/fish'

export interface TargetFish {
  tank: TankState
  fish: FishInstance
}

export function tankAttractiveness(tank: TankState): number {
  const design = (tank.designLevel / MAX_DESIGN_LEVEL) * 30
  const fish = tank.fish
  const healthAvg = fish.length ? fish.reduce((acc, f) => acc + f.health, 0) / fish.length : 0
  const healthPart = (healthAvg / 100) * 30
  const distinct = new Set(fish.map((f) => f.speciesId)).size
  const diversity = Math.min(distinct / 4, 1) * 20

  let appeal = 0
  for (const f of fish) {
    appeal += SPECIES_BY_ID[f.speciesId].appeal * (f.health / 100)
  }
  const appealPart = Math.min(appeal / 150, 1) * 20

  const compBonus = Math.min(
    tank.components.reduce((acc, c) => acc + (c === 'thermometer' ? 3 : 2), 0),
    15,
  )

  return Math.max(0, Math.min(100, Math.round(design + healthPart + diversity + appealPart + compBonus)))
}

export function shopAttractiveness(state: GameState): number {
  const displays = state.tanks.filter((t) => t.kind === 'display')
  if (displays.length === 0) return 0

  const avgTank = displays.reduce((acc, t) => acc + tankAttractiveness(t), 0) / displays.length
  const speciesSet = new Set<string>()
  for (const t of displays) for (const f of t.fish) speciesSet.add(f.speciesId)
  const diversity = Math.min(speciesSet.size / 6, 1) * 100
  const equipment = Math.min(
    state.shop.restAreas * 8 + state.shop.componentRacks * 3 + state.shop.shelvingUnits * 2,
    25,
  )

  return Math.max(0, Math.min(100, Math.round(avgTank * 0.5 + diversity * 0.3 + equipment)))
}

export function arrivalInterval(shopAtt: number, hasRegister: boolean): number {
  return hasRegister
    ? Math.max(4, 28 - shopAtt * 0.2)
    : Math.max(12, 45 - shopAtt * 0.3)
}

export function conversionChance(
  shopAtt: number,
  tankAtt: number,
  fishHealth: number,
  restAreas: number,
): number {
  return Math.max(
    0.05,
    Math.min(0.92, 0.25 + shopAtt / 150 + tankAtt / 200 + (fishHealth - 50) / 200 + restAreas * 0.06),
  )
}

export function pickTargetFish(state: GameState): TargetFish | null {
  const candidates: TargetFish[] = []
  for (const tank of state.tanks) {
    if (tank.kind !== 'display') continue
    for (const fish of tank.fish) {
      if (fish.health < 15) continue
      candidates.push({ tank, fish })
    }
  }
  if (candidates.length === 0) return null

  const weights = candidates.map((c) => {
    const species = SPECIES_BY_ID[c.fish.speciesId]
    let w = species.appeal * (c.fish.health / 100) * (tankAttractiveness(c.tank) / 50 + 0.5)
    if (c.fish.health < 50) w *= 0.3
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
