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
  hardMin: number
  hardMax: number
  vegMin: number
  vegMax: number
  schooling: boolean
  appeal: number
}

export type ComponentId = 'thermometer' | 'heater' | 'filter' | 'light' | 'pump'

export interface ComponentDef {
  id: ComponentId
  name: string
  price: number
  desc: string
}

export type TankKind = 'display' | 'storage'

export interface TankState {
  id: string
  name: string
  kind: TankKind
  volume: number
  temperature: number
  hardness: number
  vegetation: number
  designLevel: number
  components: ComponentId[]
  fish: FishInstance[]
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
}

export interface ShopState {
  cashRegister: boolean
  restAreas: number
  shelvingUnits: number
  componentRacks: number
  rackInventory: ComponentId[]
}

export type VisitorPhase = 'watching' | 'deciding' | 'leaving'

export interface VisitorState {
  id: string
  phase: VisitorPhase
  timeLeft: number
  targetTankId: string | null
  targetFishId: string | null
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
  tanks: TankState[]
  selectedTankId: string | null
  selectedStorageId: string | null
  day: number
  daySeconds: number
  log: LogEntry[]
  visitors: VisitorState[]
  nextVisitorIn: number
  totalVisitors: number
  sales: number
  epoch: number
}
