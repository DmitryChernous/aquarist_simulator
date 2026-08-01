import type { GameState, Order, TankState } from '../types'
import { MAX_DESIGN_LEVEL } from '../data/aquarium'
import { FISH_SPECIES, SPECIES_BY_ID } from '../data/fish'

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
  return hasRegister ? Math.max(4, 28 - shopAtt * 0.2) : Math.max(12, 45 - shopAtt * 0.3)
}

export function conversionChance(state: GameState): number {
  const shopAtt = shopAttractiveness(state)
  let healthSum = 0
  let healthCount = 0
  for (const t of state.tanks) {
    if (t.kind !== 'display') continue
    for (const f of t.fish) {
      healthSum += f.health
      healthCount++
    }
  }
  const avg = healthCount ? healthSum / healthCount : 0
  return Math.max(0.08, Math.min(0.95, 0.25 + shopAtt / 150 + state.shop.restAreas * 0.05 + (avg - 50) / 200))
}

export function speciesDisplayScore(state: GameState, speciesId: string): number {
  let sum = 0
  let count = 0
  for (const tank of state.tanks) {
    if (tank.kind !== 'display') continue
    const tAtt = tankAttractiveness(tank)
    for (const f of tank.fish) {
      if (f.speciesId !== speciesId) continue
      sum += (f.health / 100) * (tAtt / 100)
      count++
    }
  }
  if (count === 0) return 0
  return Math.max(0, Math.min(1, sum / count))
}

export function updateMarket(state: GameState): void {
  for (const species of FISH_SPECIES) {
    const f = state.market[species.id] ?? 1
    const drift = (Math.random() - 0.5) * 0.12
    const revert = (1 - f) * 0.08
    state.market[species.id] = Math.max(0.5, Math.min(1.8, f + drift + revert))
  }
}

function pickWeighted(values: string[], weights: number[]): string {
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = Math.random() * total
  for (let i = 0; i < values.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return values[i]
  }
  return values[values.length - 1]
}

export function generateOrder(state: GameState): Order | null {
  if (Math.random() >= conversionChance(state)) return null

  const inStock = new Set<string>()
  for (const t of state.tanks) {
    if (t.kind !== 'storage') continue
    for (const item of t.stock) if (item.count > 0) inStock.add(item.speciesId)
  }
  const onDisplay = new Set<string>()
  for (const t of state.tanks) {
    if (t.kind !== 'display') continue
    for (const f of t.fish) onDisplay.add(f.speciesId)
  }
  if (inStock.size === 0 && onDisplay.size === 0) return null

  const determined = onDisplay.size === 0 ? true : Math.random() < 0.5

  let speciesId: string
  let qty: number
  let unitPrice: number
  let kind: Order['kind']

  if (determined) {
    const arr = [...new Set([...inStock, ...onDisplay])]
    const weights = arr.map((s) => Math.max(0.3, state.market[s] ?? 1))
    speciesId = pickWeighted(arr, weights)
    qty = 1 + Math.floor(Math.random() * 3)
    const f = state.market[speciesId] ?? 1
    unitPrice = Math.round(SPECIES_BY_ID[speciesId].sellPrice * f * (0.92 + Math.random() * 0.16))
    kind = 'demand'
  } else {
    const arr = [...onDisplay]
    const weights = arr.map((s) => speciesDisplayScore(state, s) + 0.05)
    speciesId = pickWeighted(arr, weights)
    const quality = speciesDisplayScore(state, speciesId)
    qty = 1 + Math.floor(Math.random() * 2)
    const f = state.market[speciesId] ?? 1
    const priceBoost = 0.85 + 0.3 * quality + state.shop.restAreas * 0.02
    unitPrice = Math.round(SPECIES_BY_ID[speciesId].sellPrice * f * priceBoost)
    kind = 'display'
  }

  return {
    id: `o${state.epoch}-${Math.random().toString(36).slice(2, 7)}`,
    speciesId,
    qty,
    unitPrice,
    timeLeft: 18 + Math.random() * 22,
    kind,
  }
}
