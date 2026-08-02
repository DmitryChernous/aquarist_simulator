import type { AquariumState, FishSpecies, GameState, TankState } from '../types'
import { SPECIES_BY_ID } from '../data/fish'

// Комнатная температура: без нагревателя вода стремится к ней.
export const ROOM_TEMP = 24
// скорость сходимости температуры кадра: доля отставания, закрываемая за 1 сек
const TEMP_APPROACH_PER_SEC = 0.05

export function allAquariums(state: GameState): AquariumState[] {
  const out: AquariumState[] = []
  for (const shelf of state.shelves) out.push(...shelf.aquariums)
  return out
}

export function allStorage(state: GameState): TankState[] {
  return state.storage
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function usedVolume(aq: AquariumState, speciesById: Record<string, FishSpecies> = SPECIES_BY_ID): number {
  return aq.fish.reduce((acc, f) => acc + (speciesById[f.speciesId]?.minVolume ?? 0), 0)
}

export function canStock(aq: AquariumState, species: FishSpecies, _n: number): number {
  const left = aq.volume - usedVolume(aq)
  return Math.max(0, Math.floor(left / species.minVolume))
}

export function plantCount(aq: AquariumState): number {
  return aq.decor.filter((d) => d.kind === 'plant').length
}

export function vegetationOf(aq: AquariumState): number {
  const plants = plantCount(aq)
  const co2 = aq.equipment.find((e) => e.id === 'co2')
  let v = plants * 0.08
  if (co2) v += (co2.settings.dosage ?? 40) * 0.02 * 0.4
  return clamp(v, 0, 1)
}

// Целевая температура: нагреватель может только греть, поэтому ниже комнатной
// температуры цель опускать нельзя (охлаждать можно только подменой, позже).
export function targetTemperature(aq: AquariumState): number {
  const heater = aq.equipment.find((e) => e.id === 'heater')
  const setPoint = heater ? Number(heater.settings.target ?? ROOM_TEMP) : ROOM_TEMP
  return clamp(Math.max(setPoint, ROOM_TEMP), 15, 40)
}

export function hasEquipment(aq: AquariumState, id: string): boolean {
  return aq.equipment.some((e) => e.id === id)
}

// Пересчёт производных параметров воды из установленного оборудования.
export function recalcWater(aq: AquariumState): void {
  const pump = aq.equipment.find((e) => e.id === 'airPump')
  aq.water.o2 = pump ? clamp(Math.round(pump.settings.power ?? 0), 0, 100) : 30

  const light = aq.equipment.find((e) => e.id === 'light')
  aq.water.light = light ? clamp(Math.round(light.settings.intensity ?? 0), 0, 100) : 15

  aq.water.temperature = targetTemperature(aq)
}

// Покадровое обновление воды: o2/свет мгновенно, температура плавно стремится к цели.
export function tickWater(aq: AquariumState, dt: number): void {
  const pump = aq.equipment.find((e) => e.id === 'airPump')
  aq.water.o2 = pump ? clamp(Math.round(pump.settings.power ?? 0), 0, 100) : 30

  const light = aq.equipment.find((e) => e.id === 'light')
  aq.water.light = light ? clamp(Math.round(light.settings.intensity ?? 0), 0, 100) : 15

  const tgt = targetTemperature(aq)
  aq.water.temperature += (tgt - aq.water.temperature) * clamp(dt * TEMP_APPROACH_PER_SEC, 0, 1)
}