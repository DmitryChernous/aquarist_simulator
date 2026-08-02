import './style.css'
import { SPECIES_BY_ID } from './data/fish'
import { MAX_DESIGN_LEVEL, designUpgradeCost } from './data/aquarium'
import { DAY_DURATION_SECONDS } from './timing'
import {
  COMPONENTS,
  COMPONENT_SLOTS_PER_TANK,
  SHOP_ITEMS,
  DISPLAY_TANK_PRICE,
  STORAGE_TANK_PRICE,
  displaySlots,
  rackCapacity,
} from './data/shop'
import { totalRequiredVolume, updateHealth } from './sim/health'
import { availableStock, buyPrice, dailyUpkeep, wholesalePrice } from './sim/economy'
import {
  arrivalInterval,
  generateOrder,
  shopAttractiveness,
  updateMarket,
} from './sim/buyers'
import { clearSave, loadState, saveState } from './save'
import { renderTank } from './ui/render'
import { buildApp } from './ui/panels'
import type { ComponentId, FishInstance, FishSpecies, GameState, LogKind, TankKind, TankState } from './types'

const TANK = { width: 960, height: 420 }
const LOG_LIMIT = 40

let state: GameState = loadState()

const ui = buildApp({
  onBuyComponent(id: ComponentId) {
    const def = COMPONENTS[id]
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
    pushLog(`Куплен ${def.name} за ${def.price}₽`, 'buy')
    bump()
  },
  onInstallComponent(id, tankId) {
    const tank = tankById(tankId)
    if (!tank || tank.kind !== 'display') return
    if (tank.components.includes(id)) return
    if (tank.components.length >= COMPONENT_SLOTS_PER_TANK) {
      ui.flash('Нет свободных слотов для оборудования!')
      return
    }
    const idx = state.shop.rackInventory.indexOf(id)
    if (idx < 0) {
      ui.flash('Компонента нет на полке!')
      return
    }
    state.shop.rackInventory.splice(idx, 1)
    tank.components.push(id)
    pushLog(`${COMPONENTS[id].name} установлен в «${tank.name}»`, 'info')
    bump()
  },
  onRemoveComponent(id, tankId) {
    const tank = tankById(tankId)
    if (!tank) return
    tank.components = tank.components.filter((c) => c !== id)
    state.shop.rackInventory.push(id)
    pushLog(`${COMPONENTS[id].name} снят с «${tank.name}»`, 'info')
    bump()
  },
  onUpgradeDesign(tankId) {
    const tank = tankById(tankId)
    if (!tank) return
    if (tank.designLevel >= MAX_DESIGN_LEVEL) return
    const cost = designUpgradeCost(tank.designLevel)
    if (state.money < cost) {
      ui.flash('Не хватает денег на дизайн!')
      return
    }
    state.money -= cost
    tank.designLevel += 1
    pushLog(`Дизайн «${tank.name}» повышен до ${tank.designLevel}`, 'info')
    bump()
  },
  onSettingsChange(tankId, key, value) {
    const tank = tankById(tankId)
    if (!tank) return
    tank[key] = value
    bump()
  },
  onBuyShopItem(kind) {
    const def = SHOP_ITEMS[kind]
    if (state.money < def.price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= def.price
    if (kind === 'cashRegister') state.shop.cashRegister = true
    else if (kind === 'restArea') state.shop.restAreas += 1
    else if (kind === 'shelvingUnit') state.shop.shelvingUnits += 1
    else if (kind === 'componentRack') state.shop.componentRacks += 1
    pushLog(`Куплено: ${def.name} за ${def.price}₽`, 'buy')
    bump()
  },
  onAddTank(kind: TankKind) {
    const isDisplay = kind === 'display'
    if (isDisplay && displayTanks(state).length >= displaySlots(state.shop)) {
      ui.flash('Нет свободных мест — купите стеллаж!')
      return
    }
    const price = isDisplay ? DISPLAY_TANK_PRICE : STORAGE_TANK_PRICE
    if (state.money < price) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= price
    const seq = state.tanks.filter((t) => t.kind === kind).length + 1
    const tank: TankState = isDisplay
      ? {
          id: `t-${Date.now().toString(36)}`,
          name: `Витрина ${seq}`,
          kind: 'display',
          volume: 100,
          temperature: 25,
          hardness: 8,
          vegetation: 0.5,
          designLevel: 0,
          components: [],
          fish: [],
          stock: [],
        }
      : {
          id: `s-${Date.now().toString(36)}`,
          name: `Склад ${seq}`,
          kind: 'storage',
          volume: 0,
          temperature: 0,
          hardness: 0,
          vegetation: 0,
          designLevel: 0,
          components: [],
          fish: [],
          stock: [],
        }
    state.tanks.push(tank)
    if (isDisplay) state.selectedTankId = tank.id
    else state.selectedStorageId = tank.id
    pushLog(`Открыт «${tank.name}» за ${price}₽`, 'buy')
    bump()
  },
  onSelectDisplay(tankId) {
    state.selectedTankId = tankId
    bump()
  },
  onSelectStorage(tankId) {
    state.selectedStorageId = tankId
    bump()
  },
  onBuyFishToStorage(speciesId, storageTankId) {
    const storage = tankById(storageTankId)
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
  onWholesaleSell(speciesId, storageTankId) {
    const storage = tankById(storageTankId)
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
  onStockToDisplay(speciesId, displayTankId, count) {
    const display = tankById(displayTankId)
    if (!display || display.kind !== 'display') return
    const species = SPECIES_BY_ID[speciesId]
    const currentReq = totalRequiredVolume(display.fish, SPECIES_BY_ID)
    const space = Math.floor((display.volume - currentReq) / species.minVolume)
    const want = Math.min(count, space)
    if (want <= 0) {
      ui.flash('Нет места в витрине!')
      return
    }
    const taken = takeStock(speciesId, want)
    if (taken <= 0) {
      ui.flash('Нет рыб на складе!')
      return
    }
    for (let i = 0; i < taken; i++) display.fish.push(createFish(species))
    pushLog(`Заселено ${taken} × ${species.name} в «${display.name}»`, 'info')
    bump()
  },
  onMoveDisplayToStorage(tankId, fishId) {
    const tank = tankById(tankId)
    if (!tank) return
    const fish = tank.fish.find((f) => f.id === fishId)
    if (!fish) return
    tank.fish = tank.fish.filter((f) => f.id !== fishId)
    const storage = tankById(state.selectedStorageId) ?? storageTanks(state)[0]
    if (storage) {
      addStock(storage, fish.speciesId, 1)
      pushLog(`${SPECIES_BY_ID[fish.speciesId].name} убрана с витрины в склад`, 'info')
    }
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
  onEndDay() {
    advanceDay()
  },
  onReset() {
    clearSave()
    location.reload()
  },
})

const canvas = document.getElementById('tank') as HTMLCanvasElement
canvas.width = TANK.width
canvas.height = TANK.height

function tankById(id: string | null): TankState | undefined {
  return state.tanks.find((t) => t.id === id)
}

function displayTanks(s: GameState): TankState[] {
  return s.tanks.filter((t) => t.kind === 'display')
}

function storageTanks(s: GameState): TankState[] {
  return s.tanks.filter((t) => t.kind === 'storage')
}

function addStock(tank: TankState, speciesId: string, count: number): void {
  const item = tank.stock.find((s) => s.speciesId === speciesId)
  if (item) item.count += count
  else tank.stock.push({ speciesId, count })
}

function takeStock(speciesId: string, n: number): number {
  let need = n
  for (const tank of storageTanks(state)) {
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

function createFish(species: FishSpecies): FishInstance {
  return {
    id: `f${state.epoch}-${Math.random().toString(36).slice(2, 8)}`,
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
  if (fish.x < 16) {
    fish.x = 16
    fish.vx = Math.abs(fish.vx)
  }
  if (fish.x > TANK.width - 16) {
    fish.x = TANK.width - 16
    fish.vx = -Math.abs(fish.vx)
  }
  if (fish.y < 16) {
    fish.y = 16
    fish.vy = Math.abs(fish.vy)
  }
  if (fish.y > TANK.height - 30) {
    fish.y = TANK.height - 30
    fish.vy = -Math.abs(fish.vy)
  }
  fish.vx += (Math.random() - 0.5) * 4 * dt
  fish.vy += (Math.random() - 0.5) * 4 * dt
  const speed = 40
  const mag = Math.hypot(fish.vx, fish.vy)
  if (mag > speed) {
    fish.vx = (fish.vx / mag) * speed
    fish.vy = (fish.vy / mag) * speed
  }
}

function updateFish(dt: number): void {
  for (const tank of state.tanks) {
    if (tank.kind !== 'display') continue
    const required = totalRequiredVolume(tank.fish, SPECIES_BY_ID)
    const crowded = required > tank.volume
    const dead = new Set<string>()
    for (const fish of tank.fish) {
      const species = SPECIES_BY_ID[fish.speciesId]
      updateHealth(fish, species, tank, crowded, dt)
      if (fish.health <= 0) {
        dead.add(fish.id)
        continue
      }
      moveFish(fish, dt)
    }
    if (dead.size > 0) {
      tank.fish = tank.fish.filter((f) => !dead.has(f.id))
      pushLog(`${dead.size} рыб погибло в «${tank.name}» из-за плохих условий!`, 'warn')
      bump()
    }
  }
}

function tryArrive(): void {
  const hasAnything = state.tanks.some(
    (t) => (t.kind === 'storage' && t.stock.some((i) => i.count > 0)) || (t.kind === 'display' && t.fish.length > 0),
  )
  if (!hasAnything) {
    state.nextVisitorIn = 60
    return
  }
  const order = generateOrder(state)
  if (order) {
    state.orders.push(order)
    state.totalVisitors += 1
    const species = SPECIES_BY_ID[order.speciesId]
    pushLog(
      `Покупатель хочет ${species.name} ×${order.qty} (${order.kind === 'demand' ? 'по спросу' : 'по витрине'})`,
      'info',
    )
  }
  state.nextVisitorIn = arrivalInterval(shopAttractiveness(state), state.shop.cashRegister)
  bump()
}

function updateOrders(dt: number): void {
  let expired = 0
  for (const o of state.orders) o.timeLeft -= dt
  const before = state.orders.length
  state.orders = state.orders.filter((o) => {
    if (o.timeLeft <= 0) {
      expired++
      return false
    }
    return true
  })
  if (expired > 0) {
    pushLog(`${expired} заказ(а) не выполнено — покупатели ушли`, 'warn')
  }
  if (before !== state.orders.length || expired > 0) bump()
}

function tick(dt: number): void {
  state.daySeconds += dt
  if (state.daySeconds >= DAY_DURATION_SECONDS) advanceDay()

  updateFish(dt)
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
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  tick(dt)

  const selected = tankById(state.selectedTankId)
  if (selected && selected.kind === 'display') {
    renderTank(canvas, selected, SPECIES_BY_ID)
  }

  ui.update(state, shopAttractiveness(state))
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
setInterval(() => saveState(state), 2000)
setInterval(() => bump(), 1000)
