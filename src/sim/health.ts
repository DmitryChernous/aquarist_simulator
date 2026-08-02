import type { AquariumState, FishInstance, FishSpecies } from '../types'
import { clamp, fishWellbeing } from './wellbeing'

export function hasEquipment(aq: AquariumState, id: string): boolean {
  return aq.equipment.some((e) => e.id === id)
}

// Обновление состояния отдельной рыбы: условия, сытость, здоровье, рост, нерест.
export function updateHealth(
  fish: FishInstance,
  species: FishSpecies,
  aq: AquariumState,
  _crowded: boolean,
  dt: number,
): void {
  const rep = fishWellbeing(species, fish, aq)
  const filter = hasEquipment(aq, 'filter')

  // --- Сытость со временем падает (метаболизм) ---
  fish.hunger = clamp(fish.hunger - METABOLISM * dt, 0, 100)

  const okWater = rep.conditions >= 60
  const okHunger = rep.hunger >= 40

  // --- Ущерб здоровью от плохих условий / голода / перегруза ---
  let penalty = 0
  if (rep.conditions < 60) penalty += (60 - rep.conditions) * 0.5 * (filter ? 0.5 : 1)
  if (rep.hunger < 30) penalty += (30 - rep.hunger) * 0.6
  if (rep.crowding < 55) penalty += (55 - rep.crowding) * 0.5
  if (fish.diseased) penalty += 15

  if (penalty <= 0.01) {
    fish.health = clamp(fish.health + (filter ? 5 : 3) * dt, 0, 100)
  } else {
    fish.health = clamp(fish.health - penalty * 0.02 * dt, 0, 100)
  }

  // --- Болезнь при стойких плохих условиях ---
  if (!fish.diseased && rep.wellbeing < 45 && Math.random() < 0.18 * dt) {
    fish.diseased = true
  }
  if (fish.diseased && rep.wellbeing >= 65 && okHunger) {
    if (Math.random() < 0.3 * dt) fish.diseased = false
  }

  // --- Рост/взросление, только если комфортно и сыт ---
  if (okWater && okHunger && !fish.diseased) {
    fish.maturity = clamp(fish.maturity + GROWTH_RATE * dt, 0, 1)
  } else {
    fish.maturity = clamp(fish.maturity - GROWTH_RATE * 0.4 * dt, 0, 1)
  }

  // --- Готовность к нересту ---
  if (fish.maturity >= 0.85 && okWater && okHunger && !fish.diseased) {
    fish.spawnReady = clamp(fish.spawnReady + SPAWN_RATE * dt, 0, 100)
  } else {
    fish.spawnReady = clamp(fish.spawnReady - SPAWN_DECAY * dt, 0, 100)
  }
}

// Темп: сытость падает ~12/минуту, рост и нерест — масштаб дней.
// (игровой день ~ 2 мин реального времени, пауза и ускорение ×2/×3/×5 не учтены здесь)
const METABOLISM = 0.12
const GROWTH_RATE = 0.0006
const SPAWN_RATE = 0.25
const SPAWN_DECAY = 0.25

// кормление одной рыбы
export function feedFish(fish: FishInstance, amount: number): boolean {
  const before = fish.hunger
  fish.hunger = clamp(fish.hunger + amount, 0, 100)
  // перекорм: если рыба была уже наелась (>=100) — вернуть сигнал о перекорме
  return before >= 95
}