import './style.css'
import { SPECIES_BY_ID } from './data/fish'
import { MAX_DESIGN_LEVEL, AQUARIUM_MODELS, designUpgradeCost } from './data/aquarium'
import { EQUIPMENT, SHELVES, STORAGE_TANK_PRICE, rackCapacity, shelfLoadLeft } from './data/shop'
import { DECOR } from './data/decor'
import { DAY_DURATION_SECONDS } from './timing'
import { allAquariums, canStock, recalcWater, usedVolume } from './sim/aquarium'
import { updateHealth } from './sim/health'
import { availableStock, buyPrice, dailyUpkeep, wholesalePrice } from './sim/economy'
import { arrivalInterval, generateOrder, shopAttractiveness, updateMarket } from './sim/buyers'
import { clearSave, loadState, saveState } from './save'
import { renderAquarium } from './ui/render'
import { drawHall, layoutHall, HALL_HEIGHT, HALL_WIDTH } from './ui/renderHall'
import { buildApp } from './ui/panels'
import type { AquariumState, EquipmentId, FishInstance, FishSpecies, GameState, LogKind, ShelfState, TankState } from './types'

const TANK = { width: 960, height: 420 }
const LOG_LIMIT = 40
let idc = 1

let state: GameState = loadState()

let paused = false
let timeScale = 1

function uid(prefix: string): string {
  return `${prefix}${state.epoch}-${(idc++).toString(36)}`
}

function newAquarium(shelfId: string, slabId: string, modelId: string): AquariumState {
  const model = AQUARIUM_MODELS.find((m) => m.id === modelId) ?? AQUARIUM_MODELS[2]
  return {
    id: uid('a'),
    name: `Аквариум ${shelfAquariumNum(shelfId) + 1}`,
    shelfId,
    slabId,
    w: model.w,
    d: model.d,
    h: model.h,
    volume: model.volume,
    water: { temperature: 25, ph: 7, gh: 8, o2: 30, light: 15 },
    decor: [],
    fish: [],
    equipment: [],
    designLevel: 0,
  }
}

function shelfAquariumNum(shelfId: string): number {
  const shelf = state.shelves.find((s) => s.id === shelfId)
  return shelf ? shelf.aquariums.length : 0
}

function freeSlabFor(state: GameState, shelfId: string, modelId: string): string | null {
  const shelf = state.shelves.find((s) => s.id === shelfId)
  if (!shelf) return null
  const model = AQUARIUM_MODELS.find((m) => m.id === modelId)
  if (!model || model.volume > shelfLoadLeft(shelf)) return null
  const free = shelf.slabs.find((slab) => !shelf.aquariums.some((a) => a.slabId === slab.id) && model.w <= slab.width && model.d <= slab.depth && model.h <= slab.height)
  return free ? free.id : null
}

function storageTank(state: GameState, id: string | null): TankState | undefined {
  return state.storage.find((t) => t.id === id)
}

function addStock(tank: TankState, speciesId: string, count: number): void {
  const item = tank.stock.find((s) => s.speciesId === speciesId)
  if (item) item.count += count
  else tank.stock.push({ speciesId, count })
}

function takeStock(speciesId: string, n: number): number {
  let need = n
  for (const tank of state.storage) {
    if (need <= 0) break
    const item = tank.stock.find((s) => s.speciesId === speciesId)
    if (!item || item.count <= 0) continue
    const take = Math.min(item.count, need)
    item.count -= take
    need -= take
    if (item.count <= 0) tank.stock = tank.stock.filter((s) => s.speciesId !== speciesId)
  }
  return n - need
}

const ui = buildApp({
  onBuyShelf(specId) {
    const spec = SHELVES[specId as keyof typeof SHELVES]
    if (!spec) return
    if (state.money < spec.price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= spec.price
    state.shop.shelvesInventory.push(specId)
    pushLog(`Куплен стеллаж «${spec.name}» за ${spec.price}₽ — на складе`, 'buy')
    bump()
  },
  onPlaceShelf(specId) {
    const spec = SHELVES[specId as keyof typeof SHELVES]
    if (!spec) return
    const idx = state.shop.shelvesInventory.indexOf(specId)
    if (idx < 0) {
      ui.flash('Такого стеллажа нет на складе!')
      return
    }
    state.shop.shelvesInventory.splice(idx, 1)
    const id = uid('sh')
    const name = `Стеллаж ${state.shelves.length + 1}`
    const shelf: ShelfState = {
      id,
      name,
      specId,
      pos: { x: 0, y: 0 },
      slabs: spec.slabs.map((sl, i) => ({ ...sl, id: `${id}-slab${i}` })),
      loadCapacityL: spec.loadCapacityL,
      aquariums: [],
    }
    state.shelves.push(shelf)
    pushLog(`Стеллаж «${spec.name}» размещён в зале`, 'info')
    bump()
  },
  onUnstoreShelf(shelfId) {
    const idx = state.shelves.findIndex((s) => s.id === shelfId)
    if (idx < 0) return
    const shelf = state.shelves[idx]
    if (shelf.aquariums.length > 0) {
      ui.flash('Сначала уберите аквариумы со стеллажа!')
      return
    }
    state.shelves.splice(idx, 1)
    state.shop.shelvesInventory.push(shelf.specId)
    if (state.selectedAquariumId === null || !allAquariums(state).some((a) => a.id === state.selectedAquariumId)) {
      state.selectedAquariumId = allAquariums(state)[0]?.id ?? null
    }
    pushLog(`Стеллаж «${shelf.name}» убран на склад`, 'info')
    bump()
  },
  onSellShelf(shelfId) {
    const idx = state.shelves.findIndex((s) => s.id === shelfId)
    if (idx < 0) return
    const shelf = state.shelves[idx]
    const spec = SHELVES[shelf.specId as keyof typeof SHELVES]
    const refund = spec ? Math.floor(spec.price * 0.5) : 0
    const n = shelf.aquariums.length
    state.shelves.splice(idx, 1)
    state.money += refund
    if (state.selectedAquariumId && shelf.aquariums.some((a) => a.id === state.selectedAquariumId)) {
      state.selectedAquariumId = allAquariums(state)[0]?.id ?? null
    }
    pushLog(`Стеллаж «${shelf.name}» продан за ${refund}₽ (${n} аквариум(ов) удалено)`, 'sell')
    bump()
  },
  onSellInventoryShelf(specId) {
    const idx = state.shop.shelvesInventory.indexOf(specId)
    if (idx < 0) return
    state.shop.shelvesInventory.splice(idx, 1)
    const spec = SHELVES[specId as keyof typeof SHELVES]
    const refund = spec ? Math.floor(spec.price * 0.5) : 0
    state.money += refund
    pushLog(`Стеллаж «${spec?.name}» продан со склада за ${refund}₽`, 'sell')
    bump()
  },
  onBuyShopItem(kind) {
    const PRICES = { cashRegister: 300, restArea: 250, componentRack: 150 }
    if (state.money < PRICES[kind]) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= PRICES[kind]
    if (kind === 'cashRegister') state.shop.cashRegister = true
    else if (kind === 'restArea') state.shop.restAreas += 1
    else if (kind === 'componentRack') state.shop.componentRacks += 1
    pushLog(`Куплено оборудование зала за ${PRICES[kind]}₽`, 'buy')
    bump()
  },
  onAddAquarium(shelfId, modelId) {
    const model = AQUARIUM_MODELS.find((m) => m.id === modelId)
    if (!model) return
    const slabId = freeSlabFor(state, shelfId, modelId)
    if (!slabId) {
      ui.flash('Нет свободной подходящей полки на стеллаже!')
      return
    }
    if (state.money < model.price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= model.price
    const aq = newAquarium(shelfId, slabId, modelId)
    const shelf = state.shelves.find((s) => s.id === shelfId)
    shelf?.aquariums.push(aq)
    state.selectedAquariumId = aq.id
    pushLog(`Открыт аквариум «${aq.name}» (${model.volume} л) за ${model.price}₽`, 'buy')
    bump()
  },
  onRemoveAquarium(shelfId, aqId) {
    const shelf = state.shelves.find((s) => s.id === shelfId)
    if (!shelf) return
    const aq = shelf.aquariums.find((a) => a.id === aqId)
    if (!aq) return
    shelf.aquariums = shelf.aquariums.filter((a) => a.id !== aqId)
    if (state.selectedAquariumId === aqId) state.selectedAquariumId = null
    pushLog(`Аквариум «${aq.name}» убран со стеллажа (${aq.fish.length} рыб удалено)`, 'warn')
    bump()
  },
  onSelectAquarium(aqId) {
    state.selectedAquariumId = aqId
    bump()
  },
  onSelectStorage(storageId) {
    state.selectedStorageId = storageId
    bump()
  },
  onUpgradeDesign(aqId) {
    const aq = aquariumById(aqId)
    if (!aq || aq.designLevel >= MAX_DESIGN_LEVEL) return
    const cost = designUpgradeCost(aq.designLevel)
    if (state.money < cost) {
      ui.flash('Не хватает денег на дизайн!')
      return
    }
    state.money -= cost
    aq.designLevel += 1
    pushLog(`Дизайн «${aq.name}» повышен до ${aq.designLevel}`, 'info')
    bump()
  },
  onWaterChange(aqId, key, value) {
    const aq = aquariumById(aqId)
    if (!aq) return
    aq.water[key] = value
    bump()
  },
  onBuyEquipment(id) {
    const def = EQUIPMENT[id]
    if (state.money < def.price) {
      ui.flash('Не хватает денег!')
      return
    }
    if (state.shop.rackInventory.length >= rackCapacity(state.shop)) {
      ui.flash('Полка для комплектующих заполнена!')
      return
    }
    state.money -= def.price
    state.shop.rackInventory.push(id)
    pushLog(`Куплено оборудование ${def.name} за ${def.price}₽`, 'buy')
    bump()
  },
  onInstallEquipment(id, aqId) {
    const aq = aquariumById(aqId)
    if (!aq) return
    if (aq.equipment.length >= 4) {
      ui.flash('Нет свободных слотов!')
      return
    }
    const idx = state.shop.rackInventory.indexOf(id)
    if (idx < 0) {
      ui.flash('Оборудования нет на полке!')
      return
    }
    state.shop.rackInventory.splice(idx, 1)
    aq.equipment.push({ id, settings: Object.fromEntries(EQUIPMENT[id].params.map((p) => [p.id, p.default])) })
    recalcWater(aq)
    pushLog(`${EQUIPMENT[id].name} установлен в «${aq.name}»`, 'info')
    bump()
  },
  onRemoveEquipment(id, aqId) {
    const aq = aquariumById(aqId)
    if (!aq) return
    aq.equipment = aq.equipment.filter((e) => e.id !== id)
    state.shop.rackInventory.push(id)
    recalcWater(aq)
    pushLog(`${EQUIPMENT[id].name} снят с «${aq.name}»`, 'info')
    bump()
  },
  onEquipmentSetting(aqId, eqId, paramId, value) {
    const aq = aquariumById(aqId)
    const inst = aq?.equipment.find((e) => e.id === eqId)
    if (!inst || !(paramId in inst.settings)) return
    inst.settings[paramId] = value
    recalcWater(aq!)
    bump()
  },
  onSellEquipment(equipId: EquipmentId, aqId: string) {
    const aq = aquariumById(aqId)
    if (!aq) return
    const idx = aq.equipment.findIndex((e) => e.id === equipId)
    if (idx < 0) return
    const def = EQUIPMENT[equipId]
    aq.equipment.splice(idx, 1)
    const refund = Math.floor(def.price * 0.5)
    state.money += refund
    recalcWater(aq)
    pushLog(`${def.name} продан с «${aq.name}» за ${refund}₽`, 'sell')
    bump()
  },
  onMaintain(aqId: string, kind: 'water' | 'bacteria' | 'clean' | 'temp' | 'light', value?: number) {
    const aq = aquariumById(aqId)
    if (!aq) return
    const HEAL = { water: 12, bacteria: 8, clean: 10 }
    const COST = { water: 100, bacteria: 80, clean: 60 }
    if (kind === 'temp' || kind === 'light') {
      if (value === undefined) return
      const target = kind === 'temp' ? 'temperature' : 'light'
      aq.water[target] = Math.max(kind === 'temp' ? 5 : 0, Math.min(kind === 'temp' ? 40 : 100, value))
      pushLog(`Условия «${aq.name}»: ${kind === 'temp' ? 'температура' : 'освещённость'} → ${Math.round(aq.water[target])}`, 'info')
      bump()
      return
    }
    if (kind === 'clean' && !aq.equipment.some((e) => e.id === 'filter')) {
      ui.flash('Нет фильтра — нечего чистить!')
      return
    }
    const cost = COST[kind]
    if (state.money < cost) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= cost
    for (const fish of aq.fish) fish.health = Math.min(100, fish.health + HEAL[kind])
    const label = kind === 'water' ? 'подмена воды' : kind === 'bacteria' ? 'добавлены бактерии' : 'почищен фильтр'
    pushLog(`В «${aq.name}»: ${label} (−${cost}₽, рыбы здоровее)`, 'info')
    bump()
  },
  onAddDecor(aqId, kind) {
    const aq = aquariumById(aqId)
    if (!aq) return
    const def = DECOR[kind]
    if (state.money < def.price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= def.price
    const d: AquariumState['decor'][number] = {
      id: uid('d'),
      kind,
      x: 0.08 + Math.random() * 0.84,
      y: 0.08 + Math.random() * 0.6,
    }
    aq.decor.push(d)
    if (kind === 'stone') aq.water.gh = Math.min(20, aq.water.gh + 0.5)
    if (kind === 'driftwood') aq.water.ph = Math.max(5, aq.water.ph - 0.05)
    pushLog(`Добавлена декорация «${def.name}» в «${aq.name}»`, 'info')
    bump()
  },
  onRemoveDecor(aqId, decorId) {
    const aq = aquariumById(aqId)
    if (!aq) return
    const d = aq.decor.find((x) => x.id === decorId)
    if (!d) return
    aq.decor = aq.decor.filter((x) => x.id !== decorId)
    pushLog(`Декорация убрана из «${aq.name}»`, 'info')
    bump()
  },
  onStockToAquarium(speciesId, aqId, count) {
    const aq = aquariumById(aqId)
    if (!aq) return
    const species = SPECIES_BY_ID[speciesId]
    const room = canStock(aq, species, count)
    const want = Math.min(count, room)
    if (want <= 0) {
      ui.flash('Нет места в аквариуме!')
      return
    }
    const taken = takeStock(speciesId, want)
    if (taken <= 0) {
      ui.flash('Нет рыб на складе!')
      return
    }
    for (let i = 0; i < taken; i++) aq.fish.push(createFish(species))
    pushLog(`Заселено ${taken} × ${species.name} в «${aq.name}»`, 'info')
    bump()
  },
  onMoveToStorage(aqId, fishId) {
    const aq = aquariumById(aqId)
    if (!aq) return
    const fish = aq.fish.find((f) => f.id === fishId)
    if (!fish) return
    aq.fish = aq.fish.filter((f) => f.id !== fishId)
    const storage = storageTank(state, state.selectedStorageId) ?? state.storage[0]
    if (storage) {
      addStock(storage, fish.speciesId, 1)
      pushLog(`${SPECIES_BY_ID[fish.speciesId].name} убрана с аквариума в склад`, 'info')
    }
    bump()
  },
  onBuyFishToStorage(speciesId, storageId) {
    const storage = storageTank(state, storageId)
    if (!storage) return
    const species = SPECIES_BY_ID[speciesId]
    const price = buyPrice(species, state.market[speciesId] ?? 1)
    if (state.money < price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= price
    addStock(storage, speciesId, 1)
    pushLog(`Куплена ${species.name} за ${price}₽ на склад`, 'buy')
    bump()
  },
  onWholesaleSell(speciesId, storageId) {
    const storage = storageTank(state, storageId)
    if (!storage) return
    const item = storage.stock.find((s) => s.speciesId === speciesId)
    if (!item || item.count <= 0) return
    const species = SPECIES_BY_ID[speciesId]
    const revenue = wholesalePrice(species, state.market[speciesId] ?? 1) * item.count
    state.money += revenue
    state.sales += item.count
    storage.stock = storage.stock.filter((s) => s.speciesId !== speciesId)
    pushLog(`Оптовая продажа ${item.count} × ${species.name} за ${revenue}₽`, 'sell')
    bump()
  },
  onFulfillOrder(orderId) {
    const idx = state.orders.findIndex((o) => o.id === orderId)
    if (idx < 0) return
    const order = state.orders[idx]
    if (availableStock(state, order.speciesId) < order.qty) {
      ui.flash('Не хватает рыб на складе!')
      return
    }
    takeStock(order.speciesId, order.qty)
    const revenue = order.unitPrice * order.qty
    state.money += revenue
    state.sales += order.qty
    state.orders.splice(idx, 1)
    pushLog(`Продано ${order.qty} × ${SPECIES_BY_ID[order.speciesId].name} за ${revenue}₽`, 'sell')
    bump()
  },
  onAddStorage() {
    if (state.money < STORAGE_TANK_PRICE) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= STORAGE_TANK_PRICE
    const tank: TankState = { id: uid('s'), name: `Склад ${state.storage.length + 1}`, kind: 'storage', stock: [] }
    state.storage.push(tank)
    state.selectedStorageId = tank.id
    pushLog(`Открыт склад «${tank.name}» за ${STORAGE_TANK_PRICE}₽`, 'buy')
    bump()
  },
  onTogglePause() {
    paused = !paused
  },
  onSetSpeed(speed) {
    timeScale = speed
    paused = false
  },
  onReset() {
    clearSave()
    location.reload()
  },
})

const canvas = document.getElementById('tank') as HTMLCanvasElement
canvas.width = TANK.width
canvas.height = TANK.height

const hallCanvas = document.getElementById('hall') as HTMLCanvasElement
hallCanvas.width = HALL_WIDTH
hallCanvas.height = HALL_HEIGHT

hallCanvas.addEventListener('click', (e) => {
  const rect = hallCanvas.getBoundingClientRect()
  const sx = ((e.clientX - rect.left) / rect.width) * HALL_WIDTH
  const sy = ((e.clientY - rect.top) / rect.height) * HALL_HEIGHT
  const { shelves } = layoutHall(state)
  for (const shelf of shelves) {
    for (const tank of shelf.tanks) {
      if (sx >= tank.x && sx <= tank.x + tank.w && sy >= tank.y && sy <= tank.y + tank.h) {
        state.selectedAquariumId = tank.aqId
        bump()
        ui.selectTab('aquarium')
        return
      }
    }
    if (sx >= shelf.x && sx <= shelf.x + shelf.w && sy >= shelf.y && sy <= shelf.y + shelf.h) {
      ui.openShelfMenu(shelf.shelfId)
      return
    }
  }
})

function aquariumById(id: string | null): AquariumState | undefined {
  return allAquariums(state).find((a) => a.id === id)
}

function createFish(species: FishSpecies): FishInstance {
  return {
    id: uid('f'),
    speciesId: species.id,
    health: 100,
    x: 40 + Math.random() * (TANK.width - 80),
    y: 40 + Math.random() * (TANK.height - 90),
    vx: (Math.random() - 0.5) * 40,
    vy: (Math.random() - 0.5) * 40,
  }
}

function bump(): void {
  state.epoch += 1
}

function pushLog(text: string, kind: LogKind): void {
  state.log.push({ day: state.day, text, kind })
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT)
}

function moveFish(fish: FishInstance, dt: number): void {
  fish.x += fish.vx * dt
  fish.y += fish.vy * dt
  if (fish.x < 16) { fish.x = 16; fish.vx = Math.abs(fish.vx) }
  if (fish.x > TANK.width - 16) { fish.x = TANK.width - 16; fish.vx = -Math.abs(fish.vx) }
  if (fish.y < 16) { fish.y = 16; fish.vy = Math.abs(fish.vy) }
  if (fish.y > TANK.height - 30) { fish.y = TANK.height - 30; fish.vy = -Math.abs(fish.vy) }
  fish.vx += (Math.random() - 0.5) * 4 * dt
  fish.vy += (Math.random() - 0.5) * 4 * dt
  const mag = Math.hypot(fish.vx, fish.vy)
  if (mag > 40) {
    fish.vx = (fish.vx / mag) * 40
    fish.vy = (fish.vy / mag) * 40
  }
}

function updateAquariums(dt: number): void {
  for (const aq of allAquariums(state)) {
    recalcWater(aq)
    const required = usedVolume(aq, SPECIES_BY_ID)
    const crowded = required > aq.volume
    const dead = new Set<string>()
    for (const fish of aq.fish) {
      const species = SPECIES_BY_ID[fish.speciesId]
      updateHealth(fish, species, aq, crowded, dt)
      if (fish.health <= 0) {
        dead.add(fish.id)
        continue
      }
      moveFish(fish, dt)
    }
    if (dead.size > 0) {
      aq.fish = aq.fish.filter((f) => !dead.has(f.id))
      pushLog(`${dead.size} рыб погибло в «${aq.name}» из-за плохих условий!`, 'warn')
      bump()
    }
  }
}

function tryArrive(): void {
  const anyFishOrStock = allAquariums(state).some((a) => a.fish.length > 0) || state.storage.some((t) => t.stock.some((i) => i.count > 0))
  if (!anyFishOrStock) {
    state.nextVisitorIn = 60
    return
  }
  const order = generateOrder(state)
  if (order) {
    state.orders.push(order)
    state.totalVisitors += 1
    pushLog(`Покупатель хочет ${SPECIES_BY_ID[order.speciesId].name} ×${order.qty} (${order.kind === 'demand' ? 'по спросу' : 'по витрине'})`, 'info')
  }
  state.nextVisitorIn = arrivalInterval(shopAttractiveness(state), state.shop.cashRegister)
  bump()
}

function updateOrders(dt: number): void {
  let expired = 0
  for (const o of state.orders) o.timeLeft -= dt
  const before = state.orders.length
  state.orders = state.orders.filter((o) => {
    if (o.timeLeft <= 0) { expired++; return false }
    return true
  })
  if (expired > 0) pushLog(`${expired} заказ(а) не выполнено — покупатели ушли`, 'warn')
  if (before !== state.orders.length || expired > 0) bump()
}

function tick(dt: number): void {
  state.daySeconds += dt
  if (state.daySeconds >= DAY_DURATION_SECONDS) advanceDay()
  updateAquariums(dt)
  updateOrders(dt)
  state.nextVisitorIn -= dt
  if (state.nextVisitorIn <= 0) tryArrive()
}

function advanceDay(): void {
  state.day += 1
  state.daySeconds = 0
  updateMarket(state)
  const cost = dailyUpkeep(state, SPECIES_BY_ID)
  state.money -= cost
  pushLog(`День ${state.day}: рынок изменился, аренда и содержание −${cost}₽`, 'money')
  bump()
}

let last = performance.now()
function frame(now: number): void {
  const rawDt = Math.min(0.05, (now - last) / 1000)
  last = now
  const dt = paused ? 0 : rawDt * timeScale
  tick(dt)

  const selected = aquariumById(state.selectedAquariumId)
  if (selected) renderAquarium(canvas, selected, SPECIES_BY_ID)

  const hctx = hallCanvas.getContext('2d')
  if (hctx) drawHall(hctx, state, state.selectedAquariumId, now / 1000)

  ui.update(state, shopAttractiveness(state), timeScale, paused)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
setInterval(() => saveState(state), 2000)
setInterval(() => bump(), 1000)