import type { FurnitureDef, FurnitureId, ShopState } from '../types'
import { EQUIPMENT_SLOTS_PER_RACK } from './shop'

export const FURNITURE: Record<FurnitureId, FurnitureDef> = {
  coffeeTable: {
    id: 'coffeeTable',
    name: 'Журнальный столик',
    price: 250,
    desc: '+8 к привлекательности зала, +5% к конверсии покупателей',
    attractBonus: 8,
    conversionBonus: 0.05,
    upkeep: 1,
  },
  armchair: {
    id: 'armchair',
    name: 'Кресло',
    price: 450,
    desc: '+12 к привлекательности зала, +7% к конверсии покупателей',
    attractBonus: 12,
    conversionBonus: 0.07,
    upkeep: 2,
  },
  sofa: {
    id: 'sofa',
    name: 'Диван',
    price: 900,
    desc: '+20 к привлекательности зала, +10% к конверсии покупателей',
    attractBonus: 20,
    conversionBonus: 0.1,
    upkeep: 4,
  },
  displayRack: {
    id: 'displayRack',
    name: 'Стеллаж-витрина',
    price: 700,
    desc: 'Покупатели заказывают оборудование и декор со склада (4 позиции за витрину)',
    displaySlots: EQUIPMENT_SLOTS_PER_RACK,
    attractBonus: 2,
    upkeep: 5,
  },
}

export const FURNITURE_IDS = Object.keys(FURNITURE) as FurnitureId[]

export function furnitureCount(shop: ShopState, id: FurnitureId): number {
  return shop.furniture[id] ?? 0
}

export function furnitureAttractBonus(shop: ShopState): number {
  let sum = 0
  for (const [id, count] of Object.entries(shop.furniture)) {
    const def = FURNITURE[id as FurnitureId]
    sum += (def?.attractBonus ?? 0) * count
  }
  return sum
}

export function furnitureConversionBonus(shop: ShopState): number {
  let sum = 0
  for (const [id, count] of Object.entries(shop.furniture)) {
    const def = FURNITURE[id as FurnitureId]
    sum += (def?.conversionBonus ?? 0) * count
  }
  return sum
}

export function furnitureUpkeep(shop: ShopState): number {
  let sum = 0
  for (const [id, count] of Object.entries(shop.furniture)) {
    const def = FURNITURE[id as FurnitureId]
    sum += (def?.upkeep ?? 0) * count
  }
  return sum
}

export function displayCapacity(shop: ShopState): number {
  return (shop.furniture.displayRack ?? 0) * EQUIPMENT_SLOTS_PER_RACK
}
