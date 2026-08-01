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

export interface AquariumConfig {
  volume: number
  temperature: number
  hardness: number
  vegetation: number
  designLevel: number
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

export type LogKind = 'buy' | 'sell' | 'info' | 'warn' | 'money'

export interface LogEntry {
  day: number
  text: string
  kind: LogKind
}

export interface GameState {
  money: number
  aquarium: AquariumConfig
  fish: FishInstance[]
  day: number
  daySeconds: number
  log: LogEntry[]
  nextVisitorIn: number
  totalVisitors: number
  epoch: number
}
