import './style.css'
import { SPECIES_BY_ID } from './data/fish'
import { MAX_DESIGN_LEVEL, designUpgradeCost } from './data/aquarium'
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
import { dailyUpkeep, fishSellValue, wholesalePrice } from './sim/economy'
import {
  arrivalInterval,
  conversionChance,
  pickTargetFish,
  shopAttractiveness,
  tankAttractiveness,
} from './sim/buyers'
import { clearSave, loadState, saveState } from './save'
import { renderTank } from './ui/render'
import { buildApp } from './ui/panels'
import type { ComponentId, FishInstance, FishSpecies, GameState, LogKind, TankKind, TankState } from './types'

const DAY_SECONDS = 30
const TANK = { width: 960, height: 420 }
const LOG_LIMIT = 40
const MAX_VISITORS = 8

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
    if (state.money < species.buyPrice) {
      ui.flash('Не хватает денег!')
      return
    }
    state.money -= species.buyPrice
    addStock(storage, speciesId, 1)
    pushLog(`Куплена ${species.name} за ${species.buyPrice}₽ на склад`, 'buy')
    bump()
  },
  onWholesaleSell(speciesId, storageTankId) {
    const storage = tankById(storageTankId)
    if (!storage) return
    const item = storage.stock.find((s) => s.speciesId === speciesId)
    if (!item || item.count <= 0) return
    const species = SPECIES_BY_ID[speciesId]
    const revenue = wholesalePrice(species) * item.count
    state.money += revenue
    storage.stock = storage.stock.filter((s) => s.speciesId !== speciesId)
    pushLog(`Оптовая продажа ${item.count} × ${species.name} за ${revenue}₽`, 'sell')
    bump()
  },
  onStockToDisplay(speciesId, storageTankId, displayTankId, count) {
    const storage = tankById(storageTankId)
    const display = tankById(displayTankId)
    if (!storage || !display || display.kind !== 'display') return
    const item = storage.stock.find((s) => s.speciesId === speciesId)
    if (!item || item.count <= 0) return
    const species = SPECIES_BY_ID[speciesId]
    const currentReq = totalRequiredVolume(display.fish, SPECIES_BY_ID)
    const space = Math.floor((display.volume - currentReq) / species.minVolume)
    const n = Math.min(count, item.count, Math.max(0, space))
    if (n <= 0) {
      ui.flash('Нет места в витрине!')
      return
    }
    for (let i = 0; i < n; i++) display.fish.push(createFish(species))
    item.count -= n
    if (item.count <= 0) storage.stock = storage.stock.filter((s) => s.speciesId !== speciesId)
    pushLog(`Заселено ${n} × ${species.name} в «${display.name}»`, 'info')
    bump()
  },
  onSellDisplayFish(tankId, fishId) {
    const tank = tankById(tankId)
    if (!tank) return
    const idx = tank.fish.findIndex((f) => f.id === fishId)
    if (idx < 0) return
    const fish = tank.fish[idx]
    const species = SPECIES_BY_ID[fish.speciesId]
    const value = fishSellValue(fish, species)
    state.money += value
    state.sales += 1
    tank.fish.splice(idx, 1)
    pushLog(`Продана ${species.name} за ${value}₽`, 'sell')
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
      pushLog(`${SPECIES_BY_ID[fish.speciesId].name} убрана со витрины в склад`, 'info')
    }
    bump()
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
  const hasFish = state.tanks.some(
    (t) => t.kind === 'display' && t.fish.some((f) => f.health >= 15),
  )
  if (!hasFish) {
    state.nextVisitorIn = 60
    return
  }
  if (state.visitors.length >= MAX_VISITORS) {
    state.nextVisitorIn = 5
    return
  }
  state.visitors.push({
    id: `v${state.epoch}-${Math.random().toString(36).slice(2, 6)}`,
    phase: 'watching',
    timeLeft: 3 + Math.random() * 5 + state.shop.restAreas * 0.5,
    targetTankId: null,
    targetFishId: null,
  })
  state.totalVisitors += 1
  state.nextVisitorIn = arrivalInterval(shopAttractiveness(state), state.shop.cashRegister)
  pushLog('Посетитель зашёл и наблюдает за рыбами', 'info')
  bump()
}

function updateVisitors(dt: number): void {
  let changed = false
  for (const v of state.visitors) v.timeLeft -= dt

  for (const v of state.visitors) {
    if (v.timeLeft > 0) continue
    if (v.phase === 'watching') {
      const target = pickTargetFish(state)
      if (!target) {
        v.phase = 'leaving'
        v.timeLeft = 0.8
        pushLog('Посетитель посмотрел на пустые витрины и ушёл', 'info')
      } else {
        const p = conversionChance(
          shopAttractiveness(state),
          tankAttractiveness(target.tank),
          target.fish.health,
          state.shop.restAreas,
        )
        if (Math.random() < p) {
          v.phase = 'deciding'
          v.timeLeft = 0.5
          v.targetTankId = target.tank.id
          v.targetFishId = target.fish.id
        } else {
          v.phase = 'leaving'
          v.timeLeft = 0.8
          pushLog('Посетитель посмотрел на рыб и ушёл без покупки', 'info')
        }
      }
      changed = true
    } else if (v.phase === 'deciding') {
      const tank = tankById(v.targetTankId)
      const fish = tank?.fish.find((f) => f.id === v.targetFishId)
      if (tank && fish) {
        const species = SPECIES_BY_ID[fish.speciesId]
        const price = Math.round(species.sellPrice * (0.85 + Math.random() * 0.4))
        state.money += price
        tank.fish = tank.fish.filter((f) => f.id !== fish.id)
        state.sales += 1
        pushLog(`Посетитель купил ${species.name} за ${price}₽`, 'sell')
      } else {
        pushLog('Посетитель передумал — этой рыбы уже нет', 'info')
      }
      v.phase = 'leaving'
      v.timeLeft = 0.6
      changed = true
    }
  }

  const before = state.visitors.length
  state.visitors = state.visitors.filter((v) => v.timeLeft > 0)
  if (state.visitors.length !== before) changed = true
  if (changed) bump()
}

function tick(dt: number): void {
  state.daySeconds += dt
  if (state.daySeconds >= DAY_SECONDS) {
    state.daySeconds -= DAY_SECONDS
    state.day += 1
    const cost = dailyUpkeep(state, SPECIES_BY_ID)
    state.money -= cost
    pushLog(`День ${state.day}: аренда и содержание −${cost}₽`, 'money')
    bump()
  }

  updateFish(dt)
  updateVisitors(dt)

  state.nextVisitorIn -= dt
  if (state.nextVisitorIn <= 0) tryArrive()
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
