import type { EquipmentDef, EquipmentId, ShopState } from '../types'

export const EQUIPMENT: Record<EquipmentId, EquipmentDef> = {
  heater: {
    id: 'heater',
    name: 'Нагреватель',
    price: 60,
    desc: 'Поддерживает температуру на заданном значении',
    params: [
      { id: 'target', label: 'Целевая °C', min: 15, max: 35, step: 0.5, unit: '°C', default: 25 },
    ],
  },
  thermometer: {
    id: 'thermometer',
    name: 'Термометр',
    price: 30,
    desc: 'Точный контроль: +привлекательность витрины',
    params: [{ id: 'check', label: 'Контроль', min: 0, max: 1, step: 1, unit: '', default: 1 }],
  },
  airPump: {
    id: 'airPump',
    name: 'Аэратор (поверхность O₂)',
    price: 45,
    desc: 'Поднимает уровень кислорода O₂ в соответствии с мощностью',
    params: [
      { id: 'power', label: 'Мощность', min: 0, max: 100, step: 5, unit: '%', default: 60 },
    ],
  },
  light: {
    id: 'light',
    name: 'Освещение',
    price: 70,
    desc: 'Задаёт уровень освещения согласно интенсивности',
    params: [
      { id: 'intensity', label: 'Интенсивность', min: 0, max: 100, step: 5, unit: '%', default: 60 },
    ],
  },
  filter: {
    id: 'filter',
    name: 'Фильтр',
    price: 80,
    desc: 'Снижает ущерб от жёсткости и ускоряет выздоровление рыб',
    params: [
      { id: 'flow', label: 'Проток', min: 0, max: 100, step: 5, unit: '%', default: 60 },
    ],
  },
  co2: {
    id: 'co2',
    name: 'CO₂-дозатор',
    price: 100,
    desc: 'Подаёт CO₂, повышает растительность (хардкор: готов к учёту CO₂)',
    params: [
      { id: 'dosage', label: 'Дозировка', min: 0, max: 100, step: 5, unit: '%', default: 40 },
    ],
  },
}

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as EquipmentId[]

export const EQUIPMENT_SLOTS_PER_TANK = 4
export const EQUIPMENT_SLOTS_PER_RACK = 8
export const STORAGE_TANK_PRICE = 150
export const STORAGE_MAX_SLOTS = 500 // тестовая граница вместимости склада
export const STORAGE_RACK_CAPACITY = 40 // вместимость одного стеллажа

export const SHELVES: Record<string, import('../types').ShelfSpec> = {
  compact: {
    name: 'Компактная стойка',
    price: 500,
    loadCapacityL: 300,
    slabs: [
      { width: 60, depth: 40, height: 55, slot: 0 },
      { width: 90, depth: 45, height: 55, slot: 1 },
    ],
  },
  double: {
    name: 'Двойная стойка',
    price: 900,
    loadCapacityL: 600,
    slabs: [
      { width: 90, depth: 45, height: 55, slot: 0 },
      { width: 90, depth: 45, height: 55, slot: 1 },
    ],
  },
  premium: {
    name: 'Премиум-стойка',
    price: 1600,
    loadCapacityL: 1200,
    slabs: [
      { width: 120, depth: 60, height: 70, slot: 0 },
      { width: 120, depth: 60, height: 70, slot: 1 },
    ],
  },
}

export const SHELF_SPECS = Object.values(SHELVES)
export type ShelfSpecId = keyof typeof SHELVES

export function storageCapacity(shop: ShopState): number {
  return Math.min(STORAGE_MAX_SLOTS, shop.storageRacks * STORAGE_RACK_CAPACITY)
}

export function storageUsed(shop: ShopState): number {
  return shop.rackInventory.length + shop.rackDecor.length
}

export function shelfUsedLiters(shelf: import('../types').ShelfState): number {
  return shelf.aquariums.reduce((acc, a) => acc + a.volume, 0)
}

export function shelfLoadLeft(shelf: import('../types').ShelfState): number {
  return shelf.loadCapacityL - shelfUsedLiters(shelf)
}

export function fitsOnSlab(aq: import('../types').AquariumState, slab: import('../types').ShelfSlab): boolean {
  return aq.w <= slab.width && aq.d <= slab.depth && aq.h <= slab.height
}