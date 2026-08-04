export interface FishSpecies {
  id: string
  name: string
  latin: string
  color: string
  buyPrice: number
  sellPrice: number
  sizeCm: number
  minVolume: number
  tempMin: number
  tempMax: number
  phMin: number
  phMax: number
  ghMin: number
  ghMax: number
  o2Min: number
  o2Max: number
  lightMin: number
  lightMax: number
  vegMin: number
  vegMax: number
  schooling: boolean
  appeal: number
}

// --- Вода (расширяемый реестр параметров) ---
export type WaterParamId =
  | 'temperature'
  | 'ph'
  | 'gh'
  | 'o2'
  | 'light'
  // будущие (хардкор), зарегистрированы для расширения:
  | 'nh3'
  | 'no2'
  | 'no3'
  | 'po4'
  | 'kh'
  | 'cl'
  | 'co2'
  | 'fe'
  | 'k'
  | 'ca'
  | 'cu'
  | 'mg'

export interface WaterParamDef {
  id: WaterParamId
  name: string
  unit: string
  min: number
  max: number
  step: number
  editable: boolean // управляется напрямую слайдером сейчас
  derived: boolean // вычисляется из оборудования (o2/light)
  casual: boolean // включено в текущий (casual) режим; false — хардкор, скрыто
}

export interface WaterLevels {
  temperature: number
  ph: number
  gh: number
  o2: number
  light: number
  // будущие производные/токсики оставляем вне базового объекта,
  // а расширяем через WATER_PARAMS: Record в будущем хардкор-режиме
}

// --- Оборудование ---
export type EquipmentId = 'heater' | 'thermometer' | 'filter' | 'airPump' | 'light' | 'co2'

export interface EquipmentParamDef {
  id: string
  label: string
  min: number
  max: number
  step: number
  unit: string
  default: number
}

export interface EquipmentDef {
  id: EquipmentId
  name: string
  price: number
  desc: string
  params: EquipmentParamDef[]
}

export interface EquipmentInst {
  id: EquipmentId
  settings: Record<string, number>
}

// --- Декорация ---
export type DecorKind = 'plant' | 'stone' | 'driftwood' | 'substrate'

export interface Decoration {
  id: string
  kind: DecorKind
  x: number
  y: number
}

export interface DecorDef {
  kind: DecorKind
  name: string
  price: number
  attract: number
  desc: string
}

// --- Аквариум (витрина) ---
export interface AquariumState {
  id: string
  name: string
  shelfId: string | null
  slabId: string | null
  x: number // горизонтальная позиция (см) от левого края полки
  w: number
  d: number
  h: number
  volume: number
  water: WaterLevels
  decor: Decoration[]
  fish: FishInstance[]
  equipment: EquipmentInst[]
  designLevel: number
}

// --- Помещения ---
export type RoomId = 'hall' | 'storage' | 'breeding'

export interface RoomDef {
  id: RoomId
  name: string
  icon: string
  desc: string
}

// --- Стойка (стеллаж) ---
export interface ShelfSlab {
  id: string
  width: number
  depth: number
  height: number
  slot: number
}

export interface ShelfState {
  id: string
  name: string
  roomId: RoomId
  pos: { x: number; y: number }
  slabs: ShelfSlab[]
  loadCapacityL: number
  specId: string
  aquariums: AquariumState[]
}

export interface ShelfSpec {
  name: string
  price: number
  slabs: Omit<ShelfSlab, 'id'>[]
  loadCapacityL: number
}

// --- Хранение (склад / «на продажу») ---
export interface TankState {
  id: string
  name: string
  kind: 'storage'
  stock: StockItem[]
}

export interface StockItem {
  speciesId: string
  count: number
}

export interface FishInstance {
  id: string
  speciesId: string
  health: number
  x: number
  y: number
  vx: number
  vy: number
  hunger: number // сытость 0..100 (0 — голод, 100 — наелся)
  maturity: number // взросление/рост 0..1
  spawnReady: number // готовность к нересту 0..100
  diseased: boolean // болеет ли
}

// --- Мебель магазина ---
export type FurnitureId = 'coffeeTable' | 'armchair' | 'sofa' | 'displayRack'

export interface FurnitureDef {
  id: FurnitureId
  name: string
  price: number
  desc: string
  attractBonus?: number // +к привлекательности зала
  conversionBonus?: number // +к шансу конверсии покупателя (доля)
  displaySlots?: number // витрина: позиций на одну витрину
  upkeep?: number // ежедневное содержание
}

// Терминология (единая по всему проекту):
// - «Стойка»  — аквариумный стеллаж (state.shelves: 1 и более полок + аквариумы).
// - «Стеллаж» — хранилище предметов (state.racks): оборудование и декор,
//   размещается в помещении, каждый даёт +STORAGE_RACK_CAPACITY мест.
// - «Витрина» (displayRack) — мебель в зале: демонстрирует ассортимент покупателям.
export interface ShopState {
  cashRegister: boolean
  furniture: Partial<Record<FurnitureId, number>> // купленная мебель (вкл. витрину)
  rackInventory: EquipmentId[] // оборудование на стеллаже склада
  rackDecor: DecorKind[] // декорации на складе
}

export interface RackState {
  id: string
  roomId: RoomId
}

export type OrderKind = 'demand' | 'display'
export type OrderItemType = 'fish' | 'equip' | 'decor'

export interface Order {
  id: string
  itemType: OrderItemType
  speciesId: string // для рыб (itemType === 'fish')
  itemId?: string // для оборудования/декора (itemType === 'equip' | 'decor')
  qty: number
  unitPrice: number
  timeLeft: number
  kind: OrderKind
}

export type LogKind = 'buy' | 'sell' | 'info' | 'warn' | 'money'

export interface LogEntry {
  day: number
  text: string
  kind: LogKind
}

export interface GameState {
  money: number
  shop: ShopState
  shelves: ShelfState[]
  racks: RackState[] // стеллажи (хранилище инвентаря): каждый даёт +STORAGE_RACK_CAPACITY мест
  storage: TankState // единственный склад
  market: Record<string, number>
  orders: Order[]
  selectedAquariumId: string | null
  viewRoom: RoomId
  day: number
  daySeconds: number
  log: LogEntry[]
  nextVisitorIn: number
  totalVisitors: number
  sales: number
  epoch: number
}