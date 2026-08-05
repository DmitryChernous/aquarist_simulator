import type { AquariumState, FishSpecies, GameState, RoomId, ShelfState, TankState } from '../types'
import { SPECIES_BY_ID } from '../data/fish'
import { shelfLoadLeft } from '../data/shop'

// Комнатная температура: без нагревателя вода стремится к ней.
export const ROOM_TEMP = 24
// Скорость сходимости температуры кадра: доля отставания, закрываемая за 1 сек
const TEMP_APPROACH_PER_SEC = 0.05

// Сценарный объём воды: в «продажном» аквариуме рыба сидит недолго, поэтому ей
// достаточно меньшего объёма, чем в долгоживущей видовой витрине.
export const SALE_VOLUME_FACTOR = 0.4

export function allAquariums(state: GameState): AquariumState[] {
  const out: AquariumState[] = []
  for (const shelf of state.shelves) out.push(...shelf.aquariums)
  return out
}

export function aquariumsInRoom(state: GameState, roomId: RoomId): AquariumState[] {
  const out: AquariumState[] = []
  for (const shelf of state.shelves) if (shelf.roomId === roomId) out.push(...shelf.aquariums)
  return out
}

export function shelfOfAquarium(state: GameState, aq: AquariumState): ShelfState | undefined {
  return state.shelves.find((s) => s.id === aq.shelfId)
}

export function allStorage(state: GameState): TankState[] {
  return [state.storage]
}

// --- Размещение аквариумов на стойке ---
// Каждая полка (slab) может вмещать несколько аквариумов в ряд по ширине.
// Аквариум лежит от позиции x (см) слева по ширине aq.w.

export interface TankPlacement {
  slabId: string
  x: number
}

// Возвращает до `cap` размещений модели в стойку (по полкам по порядку slot),
// учитывая ширину/глубину/высоту полки, уже стоящие аквариумы и грузоподъёмность.
export function fitAquariums(shelf: ShelfState, model: { w: number; d: number; h: number; volume: number }, cap: number): TankPlacement[] {
  const out: TankPlacement[] = []
  if (cap <= 0) return out
  let remaining = shelfLoadLeft(shelf)
  for (const slab of shelf.slabs) {
    if (model.d > slab.depth || model.h > slab.height) continue
    const occ = shelf.aquariums
      .filter((a) => a.slabId === slab.id)
      .map((a) => ({ x: a.x ?? 0, w: a.w }))
      .sort((a, b) => a.x - b.x)
    let pos = 0
    let i = 0
    while (out.length < cap && remaining >= model.volume) {
      while (i < occ.length && occ[i].x + occ[i].w <= pos) i++
      const occStart = i < occ.length ? occ[i].x : slab.width
      if (pos + model.w > occStart) {
        if (i < occ.length) {
          pos = occ[i].x + occ[i].w
          continue
        }
        break
      }
      if (pos + model.w > slab.width) break
      out.push({ slabId: slab.id, x: pos })
      remaining -= model.volume
      pos += model.w
    }
    if (out.length >= cap || remaining < model.volume) break
  }
  return out
}

export function maxFitOnShelf(shelf: ShelfState, model: { w: number; d: number; h: number; volume: number }): number {
  return fitAquariums(shelf, model, 5000).length
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function usedVolume(aq: AquariumState, speciesById: Record<string, FishSpecies> = SPECIES_BY_ID): number {
  const factor = aq.forSale ? SALE_VOLUME_FACTOR : 1
  return aq.fish.reduce((acc, f) => acc + (speciesById[f.speciesId]?.minVolume ?? 0) * factor, 0)
}

export function canStock(aq: AquariumState, species: FishSpecies, _n: number): number {
  const left = aq.volume - usedVolume(aq)
  const per = species.minVolume * (aq.forSale ? SALE_VOLUME_FACTOR : 1)
  return Math.max(0, Math.floor(left / per))
}

// Свободная ёмкость по всем аквариумам для заданного вида — сколько рыб можно принять.
export function freeStockSpace(state: GameState, species: FishSpecies): number {
  let n = 0
  for (const aq of allAquariums(state)) n += canStock(aq, species, Number.MAX_SAFE_INTEGER)
  return n
}

// Розничный запас рыбы: только особи в «продажных» аквариумах (без декора).
export function fishRetailStock(state: GameState, speciesId: string): number {
  let n = 0
  for (const aq of allAquariums(state)) if (aq.forSale) for (const f of aq.fish) if (f.speciesId === speciesId) n++
  return n
}

// Изъять особей вида из продажных аквариумов для продажи.
export function takeSellableFish(state: GameState, speciesId: string, n: number): number {
  let need = n
  for (const aq of allAquariums(state)) {
    if (need <= 0) break
    if (!aq.forSale) continue
    const matches = aq.fish.filter((f) => f.speciesId === speciesId)
    if (matches.length === 0) continue
    const take = Math.min(matches.length, need)
    const remove = new Set(matches.slice(0, take).map((f) => f.id))
    aq.fish = aq.fish.filter((f) => !remove.has(f.id))
    need -= take
  }
  return n - need
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