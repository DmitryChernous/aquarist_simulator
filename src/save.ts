import type { AquariumState, FurnitureId, GameState, RoomId, TankState } from './types'
import { FISH_SPECIES } from './data/fish'
import { AQUARIUM_MODELS } from './data/aquarium'
import { EQUIPMENT } from './data/shop'
import { FURNITURE } from './data/furniture'

const KEY = 'aquarist-save-v4'
export const START_MONEY = 5000

const LEGACY_EQ: Record<string, string> = {
  heater: 'heater',
  pump: 'airPump',
  light: 'light',
  filter: 'filter',
  thermometer: 'thermometer',
  co2: 'co2',
}

function eqInstances(ids: string[]): AquariumState['equipment'] {
  const result: AquariumState['equipment'] = []
  for (const id of ids) {
    const def = EQUIPMENT[id as keyof typeof EQUIPMENT]
    if (!def) continue
    result.push({ id: def.id, settings: Object.fromEntries(def.params.map((p) => [p.id, p.default])) })
  }
  return result
}

function migrateFurniture(shop: any): Partial<Record<FurnitureId, number>> {
  const raw = shop?.furniture
  if (raw && typeof raw === 'object') {
    const out: Partial<Record<FurnitureId, number>> = {}
    for (const [id, n] of Object.entries(raw)) {
      if (FURNITURE[id as FurnitureId] && Number(n) > 0) out[id as FurnitureId] = Number(n)
    }
    return out
  }
  const rest = Number(shop?.restAreas ?? 0)
  return rest > 0 ? { coffeeTable: rest } : {}
}

export function defaultState(): GameState {
  const slabs = [
    { id: 'slab0', width: 90, depth: 45, height: 55, slot: 0 },
    { id: 'slab1', width: 90, depth: 45, height: 55, slot: 1 },
  ]
  const aq: AquariumState = {
    id: 'a1',
    name: 'Аквариум 1',
    shelfId: 'sh1',
    slabId: 'slab0',
    x: 0,
    w: 60,
    d: 35,
    h: 40,
    volume: 100,
    water: { temperature: 25, ph: 7, gh: 8, o2: 30, light: 15 },
    decor: [],
    fish: [],
    equipment: [],
    designLevel: 0,
  }
  return {
    money: START_MONEY,
    shop: {
      cashRegister: false,
      furniture: {},
      rackInventory: ['heater', 'thermometer', 'airPump', 'filter'],
      rackDecor: [],
    },
    shelves: [{ id: 'sh1', name: 'Стойка 1', roomId: 'hall', pos: { x: 0, y: 0 }, slabs, loadCapacityL: 300, specId: 'compact', aquariums: [aq] }],
    racks: [{ id: 'r1', roomId: 'storage' }],
    storage: { id: 's1', name: 'Склад 1', kind: 'storage', stock: [] },
    market: Object.fromEntries(FISH_SPECIES.map((s) => [s.id, 1])),
    orders: [],
    selectedAquariumId: 'a1',
    viewRoom: 'hall',
    day: 1,
    daySeconds: 0,
    log: [
      {
        day: 1,
        text: 'Добро пожаловать! Откройте «Помещения» — расставляйте стойки и аквариумы по комнатам (зал, склад, разводня). Закупите рыб во «Магазине» на склад, заселите их в аквариум. Настройте воду и оборудование (аэрация, свет).',
        kind: 'info',
      },
    ],
    nextVisitorIn: 25,
    totalVisitors: 0,
    sales: 0,
    epoch: 0,
  }
}

function migrateFish(list: any[]): AquariumState['fish'] {
  return (Array.isArray(list) ? list : []).map((f) => ({
    id: String(f.id || Math.random().toString(36).slice(2, 9)),
    speciesId: String(f.speciesId),
    health: typeof f.health === 'number' ? f.health : 100,
    x: typeof f.x === 'number' ? f.x : 40,
    y: typeof f.y === 'number' ? f.y : 40,
    vx: 0,
    vy: 0,
    hunger: typeof f.hunger === 'number' ? f.hunger : 80,
    maturity: typeof f.maturity === 'number' ? f.maturity : 0.5,
    spawnReady: typeof f.spawnReady === 'number' ? f.spawnReady : 0,
    diseased: Boolean(f.diseased),
  }))
}

function migrateStorageTanks(tanks: any[]): TankState[] {
  return (Array.isArray(tanks) ? tanks : [])
    .filter((t) => t && t.kind === 'storage')
    .map((t, i) => ({
      id: String(t.id || `s${i}`),
      name: String(t.name || `Склад ${i + 1}`),
      kind: 'storage' as const,
      stock: Array.isArray(t.stock)
        ? t.stock.map((s: any) => ({ speciesId: String(s.speciesId), count: Number(s.count ?? 0) }))
        : [],
    }))
}

// Сливает старое хранение (массив складов) в единственный склад.
function normalizeStorage(parsed: any, base: TankState): TankState {
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : []
  const stock: { speciesId: string; count: number }[] = []
  for (const t of list) {
    if (!t || !Array.isArray(t.stock)) continue
    for (const it of t.stock) {
      if (!it || typeof it.speciesId !== 'string') continue
      const ex = stock.find((s) => s.speciesId === it.speciesId)
      if (ex) ex.count += Number(it.count ?? 0)
      else stock.push({ speciesId: it.speciesId, count: Number(it.count ?? 0) })
    }
  }
  return { ...base, stock: stock.filter((s) => s.count > 0) }
}

function migrateDisplayTanks(tanks: any[]): AquariumState[] {
  const displays = (Array.isArray(tanks) ? tanks : []).filter((t) => t && t.kind === 'display')
  const model = AQUARIUM_MODELS.find((m) => m.volume === 100) ?? AQUARIUM_MODELS[2]
  return displays.map((t, i) => ({
    id: String(t.id || `a${i}`),
    name: String(t.name || `Аквариум ${i + 1}`),
    shelfId: 'sh1',
    slabId: i % 2 === 0 ? 'slab0' : 'slab1',
    x: 0,
    w: model.w,
    d: model.d,
    h: model.h,
    volume: Number(t.volume) || model.volume,
    water: {
      temperature: Number(t.temperature) || 25,
      ph: 7,
      gh: Number(t.hardness) || 8,
      o2: 30,
      light: 15,
    },
    decor: [],
    fish: migrateFish(t.fish),
    equipment: eqInstances((Array.isArray(t.components) ? t.components : []).map((c: string) => LEGACY_EQ[c]).filter(Boolean)),
    designLevel: Number(t.designLevel ?? 0),
  }))
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameState>
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.shelves)) {
        return defaultState()
      }
      const base = defaultState()
      const shelves = (parsed.shelves as any[]).map((s, i) => ({
        ...(s as any),
        id: s.id ?? `sh-restored-${i}`,
        specId: (s as any).specId ?? 'compact',
        roomId: ((s as any).roomId ?? 'hall') as RoomId,
        aquariums: (Array.isArray((s as any).aquariums) ? (s as any).aquariums : []).map((a: any) => ({
          ...a,
          x: typeof a.x === 'number' ? a.x : 0,
        })),
      }))
      const storage = normalizeStorage(parsed.storage, base.storage)
      const rackCount = Math.max(1, Number(((parsed.shop as any)?.storageRacks ?? (parsed.shop as any)?.componentRacks ?? base.racks.length)))
      const racks: { id: string; roomId: RoomId }[] = Array.from({ length: rackCount }, (_, i) => ({ id: `r${i + 1}`, roomId: 'storage' as RoomId }))
      return {
        ...base,
        ...parsed,
        storage,
        racks,
        viewRoom: ((parsed as any).viewRoom ?? 'hall') as RoomId,
        shop: {
          ...base.shop,
          ...(parsed.shop ?? {}),
          furniture: migrateFurniture(parsed.shop),
          rackDecor: parsed.shop?.rackDecor ?? base.shop.rackDecor,
        },
        shelves,
      }
    }
    const legacyRaw = localStorage.getItem('aquarist-save-v3')
    if (legacyRaw) {
      const old = JSON.parse(legacyRaw) as any
      if (old && Array.isArray(old.tanks)) {
      const aquariums = migrateDisplayTanks(old.tanks)
      const storageTanks = migrateStorageTanks(old.tanks)
      const mergedStock: { speciesId: string; count: number }[] = []
      for (const t of storageTanks) for (const it of t.stock) {
        const ex = mergedStock.find((s) => s.speciesId === it.speciesId)
        if (ex) ex.count += it.count
        else mergedStock.push({ ...it })
      }
      const rackCount = Math.max(1, Number(old.shop?.componentRacks ?? old.shop?.storageRacks ?? 1))
      localStorage.removeItem('aquarist-save-v3')
      return {
        ...defaultState(),
        money: Number.isFinite(Number(old.money)) ? Number(old.money) : START_MONEY,
        shop: {
          cashRegister: Boolean(old.shop?.cashRegister),
          furniture: migrateFurniture(old.shop),
          rackInventory: Array.isArray(old.shop?.rackInventory) ? old.shop.rackInventory : [],
          rackDecor: Array.isArray(old.shop?.rackDecor) ? old.shop.rackDecor : [],
        },
        racks: Array.from({ length: rackCount }, (_, i) => ({ id: `r${i + 1}`, roomId: 'storage' as RoomId })),
        shelves: [
          {
            id: 'sh1',
            name: 'Стойка 1',
            roomId: 'hall',
            pos: { x: 0, y: 0 },
            slabs: [
              { id: 'slab0', width: 600, depth: 45, height: 55, slot: 0 },
              { id: 'slab1', width: 600, depth: 45, height: 55, slot: 1 },
            ],
            loadCapacityL: Math.max(200, aquariums.reduce((acc, a) => acc + a.volume, 0)),
            specId: 'compact',
            aquariums,
          },
        ],
        storage: { id: 's1', name: 'Склад 1', kind: 'storage', stock: mergedStock },
        selectedAquariumId: aquariums[0]?.id ?? null,
        viewRoom: 'hall',
          day: Number.isFinite(Number(old.day)) && Number(old.day) > 0 ? Number(old.day) : 1,
          orders: Array.isArray(old.orders) ? old.orders : [],
          nextVisitorIn: Number.isFinite(Number(old.nextVisitorIn)) ? Number(old.nextVisitorIn) : 25,
          totalVisitors: Number(old.totalVisitors) || 0,
          sales: Number(old.sales) || 0,
        }
      }
      return defaultState()
    }
    return defaultState()
  } catch {
    return defaultState()
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // игнорируем ошибки сохранения
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem('aquarist-save-v3')
}