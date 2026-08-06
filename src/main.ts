import './style.css'
import { VERSION } from './version'
import { SPECIES_BY_ID } from './data/fish'
import { MAX_DESIGN_LEVEL, AQUARIUM_MODELS, designUpgradeCost } from './data/aquarium'
import { EQUIPMENT, SHELVES, STOCK_BAG_DAYS, STORAGE_MAX_SLOTS, STORAGE_RACK_CAPACITY, STORAGE_TANK_PRICE, storageCapacity, storageUsed } from './data/shop'
import { DECOR } from './data/decor'
import { FOOD } from './data/food'
import { FURNITURE } from './data/furniture'
import { ROOM_BY_ID } from './data/rooms'
import { DAY_DURATION_SECONDS } from './timing'
import { allAquariums, canStock, fishRetailStock, fitAquariums, isSellable, orderForecast, recalcWater, takeSellableFish, tickWater, usedVolume } from './sim/aquarium'
import { updateHealth, feedFish } from './sim/health'
import { canEatFood, liveShelfDays } from './sim/food'
import { buyPrice, dailyUpkeep, wholesalePrice } from './sim/economy'
import { arrivalInterval, generateOrder, shopAttractiveness, updateMarket } from './sim/buyers'
import { clearSave, loadState, saveState } from './save'
import { renderAquarium } from './ui/render'
import { drawHall, layoutCashRegister, layoutFurniture, layoutHall, layoutStorageObjects, HALL_HEIGHT, HALL_WIDTH, ROOM_SHELF_CELL_CAPACITY, roomShelvesTotalCells, shelfCellSize } from './ui/renderHall'
import { buildApp } from './ui/panels'
import type { AquariumState, DecorKind, EquipmentId, FishInstance, FishSpecies, FurnitureId, GameState, LogKind, Order, PurchaseOrder, ShelfState, TankState } from './types'

const TANK = { width: 960, height: 420 }
const LOG_LIMIT = 40
let idc = 1

let state: GameState = loadState()

console.info(`[aquarist] запуск · версия ${VERSION} · баланс ${state.money}`)

let paused = false
let timeScale = 1

function uid(prefix: string): string {
  return `${prefix}${state.epoch}-${(idc++).toString(36)}`
}

function newAquarium(shelfId: string, slabId: string, modelId: string, x: number): AquariumState {
  const model = AQUARIUM_MODELS.find((m) => m.id === modelId) ?? AQUARIUM_MODELS[2]
  return {
    id: uid('a'),
    name: `Аквариум ${shelfAquariumNum(shelfId) + 1}`,
    shelfId,
    slabId,
    x,
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

// Может ли в продажный (голый) аквариум быть добавлен декор без переполнения:
// перевод в видовой режим переключает объём на полный minVolume, рыба не должна вылезти за лимит.
function decorateOverflows(aq: AquariumState): boolean {
  if (isSellable(aq) && aq.fish.length > 0) {
    const usedFull = aq.fish.reduce((acc, f) => acc + SPECIES_BY_ID[f.speciesId].minVolume, 0)
    if (usedFull > aq.volume) return true
  }
  return false
}

function addStock(stock: TankState['stock'], speciesId: string, count: number): void {
  stock.push({ speciesId, count, bagDays: STOCK_BAG_DAYS })
}

function takeStock(speciesId: string, n: number): number {
  let need = n
  // Берём в первую очередь старейшие партии (у них меньше дней в пакетах).
  const batches = state.storage.stock.filter((s) => s.speciesId === speciesId && s.count > 0).sort((a, b) => a.bagDays - b.bagDays)
  for (const batch of batches) {
    if (need <= 0) break
    const take = Math.min(batch.count, need)
    batch.count -= take
    need -= take
  }
  state.storage.stock = state.storage.stock.filter((s) => s.count > 0)
  return n - need
}

function itemStock(o: Order): number {
  if (o.itemType === 'equip') return state.shop.rackInventory.filter((e) => e === o.itemId).length
  if (o.itemType === 'decor') return state.shop.rackDecor.filter((d) => d === o.itemId).length
  return fishRetailStock(state, o.speciesId)
}

function takeItems(o: Order, n: number): void {
  if (o.itemType === 'fish') {
    takeSellableFish(state, o.speciesId, n)
    return
  }
  let need = n
  if (o.itemType === 'equip') {
    for (let i = state.shop.rackInventory.length - 1; i >= 0 && need > 0; i--) {
      if (state.shop.rackInventory[i] === o.itemId) {
        state.shop.rackInventory.splice(i, 1)
        need--
      }
    }
  } else {
    for (let i = state.shop.rackDecor.length - 1; i >= 0 && need > 0; i--) {
      if (state.shop.rackDecor[i] === o.itemId) {
        state.shop.rackDecor.splice(i, 1)
        need--
      }
    }
  }
}

function orderLabel(o: Order): string {
  if (o.itemType === 'equip') return EQUIPMENT[o.itemId as EquipmentId]?.name ?? o.itemId ?? ''
  if (o.itemType === 'decor') return DECOR[o.itemId as DecorKind]?.name ?? o.itemId ?? ''
  return SPECIES_BY_ID[o.speciesId]?.name ?? o.speciesId
}

const ui = buildApp({
  onBuyShelf(specId, roomId) {
    const spec = SHELVES[specId as keyof typeof SHELVES]
    if (!spec) return
    if (state.money < spec.price) {
      ui.flash('Не хватает денег!')
      return
    }
    const inRoom = state.shelves.filter((s) => s.roomId === roomId)
    const nextCells = roomShelvesTotalCells(inRoom) + (inRoom.length ? 1 : 0) + shelfCellSize(spec)
    if (nextCells > ROOM_SHELF_CELL_CAPACITY) {
      ui.flash(`В «${ROOM_BY_ID[roomId].name}» больше нет места для стойки!`)
      return
    }
    state.money -= spec.price
    const id = uid('sh')
    const name = `Стойка ${state.shelves.length + 1}`
    const shelf: ShelfState = {
      id,
      name,
      roomId,
      specId,
      pos: { x: 0, y: 0 },
      slabs: spec.slabs.map((sl, i) => ({ ...sl, id: `${id}-slab${i}` })),
      loadCapacityL: spec.loadCapacityL,
      aquariums: [],
    }
    state.shelves.push(shelf)
    state.viewRoom = roomId
    pushLog(`Куплена и размещена стойка «${spec.name}» в помещении «${ROOM_BY_ID[roomId].name}» за ${spec.price}₽`, 'buy')
    bump()
  },
  onViewRoom(roomId) {
    if (state.viewRoom === roomId) return
    state.viewRoom = roomId
    bump()
  },
  onMoveShelf(shelfId, roomId) {
    const shelf = state.shelves.find((s) => s.id === shelfId)
    if (!shelf || shelf.roomId === roomId) return
    const inTarget = state.shelves.filter((s) => s.roomId === roomId && s.id !== shelfId)
    const nextCells = roomShelvesTotalCells(inTarget) + (inTarget.length ? 1 : 0) + shelfCellSize(shelf)
    if (nextCells > ROOM_SHELF_CELL_CAPACITY) {
      ui.flash(`В «${ROOM_BY_ID[roomId].name}» нет места для этой стойки!`)
      return
    }
    const from = ROOM_BY_ID[shelf.roomId].name
    shelf.roomId = roomId
    state.viewRoom = roomId
    pushLog(`Стойка «${shelf.name}» перемещена из «${from}» в «${ROOM_BY_ID[roomId].name}»`, 'info')
    bump()
  },
  onMoveAquarium(aqId, targetShelfId) {
    const aq = allAquariums(state).find((a) => a.id === aqId)
    if (!aq) return
    const srcShelf = state.shelves.find((s) => s.id === aq.shelfId)
    const dstShelf = state.shelves.find((s) => s.id === targetShelfId)
    if (!srcShelf || !dstShelf) return
    if (srcShelf.id === dstShelf.id) return
    const place = fitAquariums(dstShelf, aq, 1)[0]
    if (!place) {
      ui.flash('На целевой стойке нет подходящего места!')
      return
    }
    srcShelf.aquariums = srcShelf.aquariums.filter((a) => a.id !== aq.id)
    aq.shelfId = dstShelf.id
    aq.slabId = place.slabId
    aq.x = place.x
    dstShelf.aquariums.push(aq)
    pushLog(`Аквариум «${aq.name}» перенесён с «${srcShelf.name}» на «${dstShelf.name}» (${ROOM_BY_ID[dstShelf.roomId].name})`, 'info')
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
    pushLog(`Стойка «${shelf.name}» продана за ${refund}₽ (${n} аквариум(ов) удалено)`, 'sell')
    bump()
  },
  onBuyShopItem(kind) {
    const PRICES = { cashRegister: 300, fridge: 250 }
    if (state.money < PRICES[kind]) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= PRICES[kind]
    if (kind === 'cashRegister') {
      state.shop.cashRegister = true
      pushLog('Куплена касса за 300₽ — покупатели приходят чаще', 'buy')
    } else if (kind === 'fridge') {
      state.shop.fridge = true
      pushLog('Куплен холодильник для живого корма за 250₽ — порча замедлена', 'buy')
    }
    bump()
  },
  onBuyRack(roomId) {
    if (state.racks.length * STORAGE_RACK_CAPACITY >= STORAGE_MAX_SLOTS) {
      ui.flash('Достигнут предел вместимости склада!')
      return
    }
    if (state.money < STORAGE_TANK_PRICE) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= STORAGE_TANK_PRICE
    state.racks.push({ id: uid('rk'), roomId })
    state.viewRoom = roomId
    pushLog(`Куплен и размещён стеллаж в «${ROOM_BY_ID[roomId].name}» за ${STORAGE_TANK_PRICE}₽ (+${STORAGE_RACK_CAPACITY} мест)`, 'buy')
    bump()
  },
  onBuyFurniture(id: FurnitureId) {
    const def = FURNITURE[id]
    if (state.money < def.price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= def.price
    state.shop.furniture[id] = (state.shop.furniture[id] ?? 0) + 1
    pushLog(`Куплена мебель «${def.name}» за ${def.price}₽`, 'buy')
    bump()
  },
  onBuyAquarium(modelId, shelfId, qty) {
    const model = AQUARIUM_MODELS.find((m) => m.id === modelId)
    const shelf = state.shelves.find((s) => s.id === shelfId)
    if (!model || !shelf || qty <= 0) return
    const placements = fitAquariums(shelf, model, qty)
    if (placements.length === 0) {
      ui.flash('Нет свободного места на этой стойке!')
      return
    }
    const total = model.price * placements.length
    if (state.money < total) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= total
    const created: AquariumState[] = []
    for (const p of placements) {
      const aq = newAquarium(shelfId, p.slabId, modelId, p.x)
      shelf.aquariums.push(aq)
      created.push(aq)
    }
    state.selectedAquariumId = created[0].id
    pushLog(`Куплено ${created.length} × «${model.name}» на стойку «${shelf.name}» за ${total}₽`, 'buy')
    bump()
  },
  onRemoveAquarium(shelfId, aqId) {
    const shelf = state.shelves.find((s) => s.id === shelfId)
    if (!shelf) return
    const aq = shelf.aquariums.find((a) => a.id === aqId)
    if (!aq) return
    shelf.aquariums = shelf.aquariums.filter((a) => a.id !== aqId)
    if (state.selectedAquariumId === aqId) state.selectedAquariumId = null
    pushLog(`Аквариум «${aq.name}» убран со стойки (${aq.fish.length} рыб удалено)`, 'warn')
    bump()
  },
  onSelectAquarium(aqId) {
    state.selectedAquariumId = aqId
    bump()
  },
  onRenameAquarium(aqId, name) {
    const aq = aquariumById(aqId)
    if (!aq) return
    const n = name.trim().slice(0, 40)
    if (!n || n === aq.name) return
    aq.name = n
    pushLog(`Аквариум переименован в «${n}»`, 'info')
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
    if (storageUsed(state.shop) >= storageCapacity(state.racks.length)) {
      ui.flash('Место на складе закончилось! Купите стеллаж в «Магазине».')
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
  onSellRackEquipment(id) {
    const idx = state.shop.rackInventory.indexOf(id)
    if (idx < 0) return
    state.shop.rackInventory.splice(idx, 1)
    const def = EQUIPMENT[id]
    const refund = Math.floor(def.price * 0.5)
    state.money += refund
    pushLog(`${def.name} продан со склада за ${refund}₽`, 'sell')
    bump()
  },
  onMaintain(aqId: string, kind: 'water' | 'bacteria' | 'clean' | 'temp' | 'light', value?: number) {
    const aq = aquariumById(aqId)
    if (!aq) return

    // Температуру и свет можно регулировать только при установленном оборудовании
    // (нагреватель / светильник). Настройка становится целью оборудования.
    if (kind === 'temp' || kind === 'light') {
      if (value === undefined) return
      const eqId = kind === 'temp' ? 'heater' : 'light'
      const inst = aq.equipment.find((e) => e.id === eqId)
      if (!inst) {
        ui.flash(kind === 'temp' ? 'Нет нагревателя — температуру регулировать нельзя' : 'Нет светильника — освещённость регулировать нельзя')
        return
      }
      const param = kind === 'temp' ? 'target' : 'intensity'
      inst.settings[param] = kind === 'temp' ? Math.max(15, Math.min(40, value)) : Math.max(0, Math.min(100, value))
      recalcWater(aq)
      pushLog(`Условия «${aq.name}»: ${kind === 'temp' ? 'температура' : 'освещённость'} → ${Math.round(value)}`, 'info')
      bump()
      return
    }
    if (kind === 'clean' && !aq.equipment.some((e) => e.id === 'filter')) {
      ui.flash('Нет фильтра — нечего чистить!')
      return
    }
    const HEAL = { water: 12, bacteria: 8, clean: 10 }
    for (const fish of aq.fish) fish.health = Math.min(100, fish.health + HEAL[kind])
    const label = kind === 'water' ? 'подмена воды' : kind === 'bacteria' ? 'добавлены бактерии' : 'почищен фильтр'
    pushLog(`В «${aq.name}»: ${label} — рыбы здоровее`, 'info')
    bump()
  },
  onAddDecor(aqId, kind) {
    const aq = aquariumById(aqId)
    if (!aq) return
    if (decorateOverflows(aq)) {
      ui.flash('Нельзя добавить декор: в аквариуме рыбы, которые не поместятся в видовом режиме!')
      return
    }
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
  onPlaceDecorFromRack(kind, aqId) {
    const aq = aquariumById(aqId)
    if (!aq) return
    if (decorateOverflows(aq)) {
      ui.flash('Нельзя добавить декор: в аквариуме рыбы, которые не поместятся в видовом режиме!')
      return
    }
    const idx = state.shop.rackDecor.indexOf(kind)
    if (idx < 0) {
      ui.flash('Декорации нет на складе!')
      return
    }
    state.shop.rackDecor.splice(idx, 1)
    const d: AquariumState['decor'][number] = {
      id: uid('d'),
      kind,
      x: 0.08 + Math.random() * 0.84,
      y: 0.08 + Math.random() * 0.6,
    }
    aq.decor.push(d)
    if (kind === 'stone') aq.water.gh = Math.min(20, aq.water.gh + 0.5)
    if (kind === 'driftwood') aq.water.ph = Math.max(5, aq.water.ph - 0.05)
    pushLog(`Из склада установлена декорация «${DECOR[kind].name}» в «${aq.name}»`, 'info')
    bump()
  },
  onSellRackDecor(kind) {
    const idx = state.shop.rackDecor.indexOf(kind)
    if (idx < 0) return
    state.shop.rackDecor.splice(idx, 1)
    const def = DECOR[kind]
    const refund = Math.floor(def.price * 0.5)
    state.money += refund
    pushLog(`Декорация «${def.name}» продана со склада за ${refund}₽`, 'sell')
    bump()
  },
  onBuyDecor(kind) {
    const def = DECOR[kind]
    if (state.money < def.price) {
      ui.flash('Не хватает денег!')
      return
    }
    if (storageUsed(state.shop) >= storageCapacity(state.racks.length)) {
      ui.flash('Место на складе закончилось! Купите стеллаж в «Магазине».')
      return
    }
    state.money -= def.price
    state.shop.rackDecor.push(kind)
    pushLog(`Куплена декорация «${def.name}» за ${def.price}₽ — на склад`, 'buy')
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
    addStock(state.storage.stock, fish.speciesId, 1)
    pushLog(`${SPECIES_BY_ID[fish.speciesId].name} убрана с аквариума в склад`, 'info')
    bump()
  },
  onFeed(aqId, fishId, foodId) {
    const aq = aquariumById(aqId)
    if (!aq) return
    if (aq.fish.length === 0) return
    const def = FOOD[foodId]
    if (!def) return
    const entry = state.shop.foodStock.find((f) => f.id === foodId)
    if (!entry || entry.count <= 0) {
      ui.flash('Нет корма на складе! Купите в «Магазине» → «Корм»')
      return
    }
    const targets = fishId ? aq.fish.filter((f) => f.id === fishId) : aq.fish
    const feedable = targets.filter((f) => canEatFood(SPECIES_BY_ID[f.speciesId], def))
    if (feedable.length === 0) {
      ui.flash(fishId ? 'Эта рыба не ест этот корм (размер или диета)' : 'Никто в аквариуме не ест этот корм')
      return
    }
    for (const f of feedable) feedFish(f, def.satiety)
    entry.count -= 1
    if (entry.count <= 0) state.shop.foodStock = state.shop.foodStock.filter((x) => x.id !== foodId)
    pushLog(`Кормление в «${aq.name}»: ${feedable.length} рыб кормом «${def.name}» (−1 порция)`, 'info')
    bump()
  },
  onBuyFood(id) {
    const def = FOOD[id]
    if (!def) return
    if (state.money < def.price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= def.price
    const entry = state.shop.foodStock.find((f) => f.id === id)
    if (entry) {
      entry.count += def.jarPortions
      if (def.kind === 'live') entry.storedDays = 0 // свежая партия
    } else state.shop.foodStock.push({ id, count: def.jarPortions, storedDays: 0 })
    pushLog(`Куплен корм «${def.name}» за ${def.price}₽ (${def.jarPortions} порций)`, 'buy')
    if (def.kind === 'live' && !state.shop.fridge) {
      pushLog('Нет холодильника: живой корм испортится к концу дня. Купите его в «Обустройство → Оснащение»', 'warn')
      ui.flash('Живой корм требует холодильника!')
    }
    bump()
  },
  onOrderFromSupplier(speciesId, count = 1) {
    const n = Math.max(1, Math.floor(count) || 1)
    const species = SPECIES_BY_ID[speciesId]
    const price = buyPrice(species, state.market[speciesId] ?? 1)
    const total = price * n
    if (state.money < total) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= total
    const order: PurchaseOrder = { id: uid('p'), speciesId, qty: n, arriveDay: state.day + 1 }
    state.purchases.push(order)
    pushLog(`Заказано ${n} × ${species.name} у поставщика за ${total}₽ — прибудет на склад завтра`, 'buy')
    // Агрегированный прогноз ёмкости (п.5 плана): не блокирует, но предупреждает.
    if (!orderForecast(state, speciesId, n).fits) {
      ui.flash('Не хватит места во всех аквариумах — рыба приедет в пакеты на склад')
    }
    bump()
  },
  onWholesaleSell(speciesId) {
    let total = 0
    for (const s of state.storage.stock) if (s.speciesId === speciesId) total += s.count
    if (total <= 0) return
    const species = SPECIES_BY_ID[speciesId]
    const revenue = wholesalePrice(species, state.market[speciesId] ?? 1) * total
    state.money += revenue
    state.sales += total
    state.storage.stock = state.storage.stock.filter((s) => s.speciesId !== speciesId)
    pushLog(`Оптовая продажа ${total} × ${species.name} за ${revenue}₽`, 'sell')
    bump()
  },
  onFulfillOrder(orderId) {
    const idx = state.orders.findIndex((o) => o.id === orderId)
    if (idx < 0) return
    const order = state.orders[idx]
    if (itemStock(order) < order.qty) {
      ui.flash('Не хватает товара на складе!')
      return
    }
    takeItems(order, order.qty)
    const revenue = order.unitPrice * order.qty
    state.money += revenue
    state.sales += order.qty
    state.orders.splice(idx, 1)
    pushLog(`Продано ${order.qty} × ${orderLabel(order)} за ${revenue}₽`, 'sell')
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
  const reg = layoutCashRegister(state)
  if (reg && sx >= reg.x && sx <= reg.x + reg.w && sy >= reg.y && sy <= reg.y + reg.h) {
    ui.selectTab('orders')
    return
  }
  for (const obj of layoutStorageObjects(state)) {
    if (sx >= obj.x && sx <= obj.x + obj.w && sy >= obj.y && sy <= obj.y + obj.h) {
      ui.openStorageModal()
      return
    }
  }
  const furniture = [...layoutFurniture(state)].sort((a, b) => b.box.wz - a.box.wz || b.box.wx - a.box.wx)
  for (const f of furniture) {
    if (sx >= f.x && sx <= f.x + f.w && sy >= f.y && sy <= f.y + f.h) {
      if (f.id === 'displayRack') ui.openStorageModal()
      else ui.openFurnitureModal(f.id)
      return
    }
  }
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
    hunger: 70 + Math.random() * 20,
    maturity: 0.5,
    spawnReady: 0,
    diseased: false,
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
    tickWater(aq, dt)
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
  const anyFishOrStock = allAquariums(state).some((a) => a.fish.length > 0) || state.storage.stock.some((i) => i.count > 0)
  if (!anyFishOrStock) {
    state.nextVisitorIn = 60
    return
  }
  const order = generateOrder(state)
  if (order) {
    state.orders.push(order)
    state.totalVisitors += 1
    pushLog(`${order.kind === 'demand' ? 'Покупатель ищет конкретное' : 'Покупатель выбрал по витрине'}: ${orderLabel(order)} ×${order.qty}`, 'info')
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

function advanceFoodSpoilage(): void {
  const spoiled = new Map<string, number>()
  for (const f of state.shop.foodStock) {
    const def = FOOD[f.id]
    if (!def || def.kind !== 'live') continue
    f.storedDays += 1
    if (f.storedDays >= liveShelfDays(def, state.shop.fridge)) {
      spoiled.set(def.name, (spoiled.get(def.name) ?? 0) + f.count)
    }
  }
  state.shop.foodStock = state.shop.foodStock.filter((f) => {
    const def = FOOD[f.id]
    return !(def && def.kind === 'live' && f.storedDays >= liveShelfDays(def, state.shop.fridge))
  })
  if (spoiled.size > 0) {
    const list = [...spoiled.entries()].map(([name, c]) => `${name} — ${c} порц.`).join(', ')
    pushLog(`Испортился живой корм: ${list}`, 'warn')
    ui.flash('Живой корм испортился на складе!')
  }
}

function settlePurchases(): void {
  if (state.purchases.length === 0) return
  const arrived: PurchaseOrder[] = []
  state.purchases = state.purchases.filter((p) => {
    if (p.arriveDay <= state.day) {
      arrived.push(p)
      return false
    }
    return true
  })
  if (arrived.length === 0) return
  let total = 0
  const names = new Map<string, number>()
  for (const p of arrived) {
    addStock(state.storage.stock, p.speciesId, p.qty)
    names.set(p.speciesId, (names.get(p.speciesId) ?? 0) + p.qty)
    total += p.qty
  }
  const list = [...names.entries()].map(([sid, c]) => `${SPECIES_BY_ID[sid].name} ×${c}`).join(', ')
  pushLog(`Поставка прибыла: ${list} (в пакетах — ${STOCK_BAG_DAYS} дн. на пересадку)`, 'info')
  ui.flash(`Поставка прибыла: ${total} ${total === 1 ? 'рыба' : 'рыб'} на складе`)
}

function advanceBags(): void {
  for (const s of state.storage.stock) s.bagDays -= 1
  const died = new Map<string, number>()
  for (const s of state.storage.stock) if (s.bagDays <= 0) died.set(s.speciesId, (died.get(s.speciesId) ?? 0) + s.count)
  if (died.size > 0) {
    state.storage.stock = state.storage.stock.filter((s) => s.bagDays > 0)
    const list = [...died.entries()].map(([sid, c]) => `${SPECIES_BY_ID[sid].name} — ${c}`).join(', ')
    pushLog(`Рыба погибла в пакетах (не пересажена): ${list}`, 'warn')
    ui.flash('Рыба погибла в пакетах — не успели пересадить!')
  }
}

function advanceDay(): void {
  state.day += 1
  state.daySeconds = 0
  updateMarket(state)
  settlePurchases()
  advanceFoodSpoilage()
  advanceBags()
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