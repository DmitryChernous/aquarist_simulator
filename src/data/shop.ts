import type { ComponentDef, ComponentId, ShopState } from '../types'

export const COMPONENTS: Record<ComponentId, ComponentDef> = {
  thermometer: { id: 'thermometer', name: 'Термометр', price: 30, desc: 'Точный контроль воды: +привлекательность витрины' },
  pump: { id: 'pump', name: 'Помпа', price: 50, desc: 'Аэрация: вдвое снижает штраф за перенаселение' },
  heater: { id: 'heater', name: 'Нагреватель', price: 60, desc: 'Снижает ущерб от неверной температуры' },
  light: { id: 'light', name: 'Освещение', price: 70, desc: 'Снижает ущерб от неверной растительности' },
  filter: { id: 'filter', name: 'Фильтр', price: 80, desc: 'Снижает ущерб от жёсткости и ускоряет выздоровление' },
}

export const COMPONENT_IDS = Object.keys(COMPONENTS) as ComponentId[]

export const COMPONENT_SLOTS_PER_TANK = 3
export const COMPONENT_SLOTS_PER_RACK = 4

export const SHOP_ITEMS: Record<
  'cashRegister' | 'restArea' | 'shelvingUnit' | 'componentRack',
  { name: string; price: number; desc: string }
> = {
  cashRegister: { name: 'Касса', price: 300, desc: 'Покупатели приходят заметно чаще' },
  restArea: { name: 'Зона отдыха', price: 250, desc: 'Посетители дольше смотрят и чаще покупают' },
  shelvingUnit: { name: 'Стеллаж для аквариумов', price: 400, desc: '+2 места для выставочных аквариумов' },
  componentRack: { name: 'Полка для комплектующих', price: 150, desc: `+${COMPONENT_SLOTS_PER_RACK} мест для оборудования` },
}

export const DISPLAY_TANK_SLOTS_PER_SHELF = 2
export const DISPLAY_TANK_PRICE = 200
export const STORAGE_TANK_PRICE = 150

export function displaySlots(shop: ShopState): number {
  return 1 + shop.shelvingUnits * DISPLAY_TANK_SLOTS_PER_SHELF
}

export function rackCapacity(shop: ShopState): number {
  return shop.componentRacks * COMPONENT_SLOTS_PER_RACK
}
