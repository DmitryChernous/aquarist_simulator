import { FISH_SPECIES, SPECIES_BY_ID } from '../data/fish'
import { MAX_DESIGN_LEVEL, AQUARIUM_MODELS, designUpgradeCost } from '../data/aquarium'
import type { AquariumModel } from '../data/aquarium'
import { EQUIPMENT, EQUIPMENT_IDS, SHELVES, STORAGE_MAX_SLOTS, STORAGE_RACK_CAPACITY, STORAGE_TANK_PRICE, shelfLoadLeft, shelfUsedLiters, storageCapacity, storageUsed } from '../data/shop'
import { DECOR, DECOR_KINDS } from '../data/decor'
import { FOOD, FOOD_IDS, FOOD_KIND_LABEL, FOOD_SIZE_LABEL } from '../data/food'
import { ROOMS, ROOM_BY_ID } from '../data/rooms'
import { FURNITURE, FURNITURE_IDS, furnitureCount } from '../data/furniture'
import { HALL_HEIGHT, HALL_WIDTH, ROOM_SHELF_CELL_CAPACITY, roomShelvesTotalCells, shelfCellSize } from './renderHall'
import { shopAttractiveness, tankAttractiveness } from '../sim/buyers'
import { buyPrice, decorStock, equipmentStock, retailPrice, wholesalePrice } from '../sim/economy'
import { canEatFood, foodPortions, foodStockEntries, freshnessLeft } from '../sim/food'
import { canStock, fishRetailStock, maxFitOnShelf, vegetationOf, ROOM_TEMP, shelfOfAquarium } from '../sim/aquarium'
import { fishWellbeing } from '../sim/wellbeing'
import { VERSION } from '../version'
import { DAY_DURATION_SECONDS, formatGameDate } from '../timing'
import type { AquariumState, DecorDef, DecorKind, EquipmentId, FishDiet, FishSpecies, FoodId, FurnitureId, GameState, RoomId, ShelfState, ShopState } from '../types'
import type { WellBeingReport } from '../sim/wellbeing'

const DIET_LABEL: Record<FishDiet, string> = {
  carnivore: 'хищники',
  herbivore: 'растительноядные',
  omnivore: 'всеядные',
}

export interface UIActions {
  onBuyShelf(specId: string, roomId: RoomId): void
  onMoveShelf(shelfId: string, roomId: RoomId): void
  onMoveAquarium(aqId: string, targetShelfId: string): void
  onViewRoom(roomId: RoomId): void
  onSellShelf(shelfId: string): void
  onBuyShopItem(kind: 'cashRegister' | 'fridge'): void
  onBuyRack(roomId: RoomId): void
  onBuyFurniture(id: FurnitureId): void
  onBuyAquarium(modelId: string, shelfId: string, qty: number): void
  onRemoveAquarium(shelfId: string, aqId: string): void
  onSelectAquarium(aqId: string): void
  onRenameAquarium(aqId: string, name: string): void
  onUpgradeDesign(aqId: string): void
  onWaterChange(aqId: string, key: 'temperature' | 'ph' | 'gh', value: number): void
  onSellEquipment(id: EquipmentId, aqId: string): void
  onMaintain(aqId: string, kind: 'water' | 'bacteria' | 'clean' | 'temp' | 'light', value?: number): void
  onBuyEquipment(id: EquipmentId): void
  onInstallEquipment(id: EquipmentId, aqId: string): void
  onRemoveEquipment(id: EquipmentId, aqId: string): void
  onEquipmentSetting(aqId: string, eqId: EquipmentId, paramId: string, value: number): void
  onAddDecor(aqId: string, kind: DecorKind): void
  onRemoveDecor(aqId: string, decorId: string): void
  onBuyDecor(kind: DecorKind): void
  onPlaceDecorFromRack(kind: DecorKind, aqId: string): void
  onSellRackDecor(kind: DecorKind): void
  onSellRackEquipment(id: EquipmentId): void
  onStockToAquarium(speciesId: string, aqId: string, count: number): void
  onMoveToStorage(aqId: string, fishId: string): void
  onFeed(aqId: string, fishId: string | null, foodId: FoodId): void
  onBuyFood(id: FoodId): void
  onOrderFromSupplier(speciesId: string, count: number): void
  onWholesaleSell(speciesId: string): void
  onFulfillOrder(orderId: string): void
  onTogglePause(): void
  onSetSpeed(speed: number): void
  onReset(): void
}

type TabName = 'zal' | 'aquarium' | 'store' | 'orders'


function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function storeReason(text: string): HTMLElement {
  const r = el('div', 'store-reason')
  r.textContent = text
  return r
}

function storageFullReason(rackCount: number, shop: ShopState): string {
  const cap = storageCapacity(rackCount)
  if (cap <= 0) return 'Нет места для хранения. Купите стеллаж в «Обустройство» → «Оснащение».'
  return `Место на складе закончилось (${storageUsed(shop)}/${cap}). Купите стеллаж в «Обустройство» → «Оснащение».`
}

function allAquariums(state: GameState): AquariumState[] {
  const out: AquariumState[] = []
  for (const shelf of state.shelves) out.push(...shelf.aquariums)
  return out
}

function fillSelect(select: HTMLSelectElement, options: { value: string; label: string }[], current: string | null, preferCurrent = false): void {
  const prev = select.dataset.prevValue ?? (select.value || current || options[0]?.value || '')
  select.innerHTML = ''
  for (const opt of options) {
    const o = el('option')
    o.value = opt.value
    o.textContent = opt.label
    select.append(o)
  }
  const target = preferCurrent
    ? (options.some((o) => o.value === current) ? current : options[0]?.value ?? '')
    : (options.some((o) => o.value === prev) ? prev : options[0]?.value ?? '')
  if (target) select.value = target
  select.dataset.prevValue = select.value
}

function statusOf(score: number): 'ok' | 'warn' | 'bad' {
  if (score >= 70) return 'ok'
  if (score >= 35) return 'warn'
  return 'bad'
}

function welfareLabel(rep: WellBeingReport): string {
  if (rep.diseased) return 'болеет'
  if (rep.wellbeing >= 75) return 'отлично'
  if (rep.wellbeing >= 55) return 'хорошо'
  if (rep.wellbeing >= 35) return 'плохо'
  return 'критично'
}

function welfareClass(rep: WellBeingReport): string {
  return rep.diseased ? 'dead' : statusOf(rep.wellbeing)
}

function demandBadge(factor: number): HTMLElement {
  if (factor >= 1.3) return el('span', 'compat ok', `спрос высокий ×${factor.toFixed(2)}`)
  if (factor >= 0.85) return el('span', 'compat warn', `спрос средний ×${factor.toFixed(2)}`)
  return el('span', 'compat dead', `спрос низкий ×${factor.toFixed(2)}`)
}

// Слайдер с живой подписью значения
function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (v: number) => void,
): HTMLElement {
  const valueEl = el('span', 'slider-value', `${value}`)
  const labelEl = el('label', 'slider-label', `${label}: `)
  labelEl.append(valueEl)
  const input = el('input') as HTMLInputElement
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  input.addEventListener('input', () => {
    valueEl.textContent = `${input.value}`
    onChange(Number(input.value))
  })
  const wrapRow = el('div', 'slider-row')
  wrapRow.append(labelEl, input)
  return wrapRow
}

function buildHallCanvas(): HTMLCanvasElement {
  const c = el('canvas')
  c.id = 'hall'
  c.width = HALL_WIDTH
  c.height = HALL_HEIGHT
  c.className = 'hall-canvas'
  return c
}

function overlay(title: string): { modal: HTMLDivElement; body: HTMLDivElement; close: () => void } {
  const back = el('div', 'overlay')
  const modal = el('div', 'modal')
  const head = el('div', 'modal-head')
  const closeBtn = el('button', 'btn small', 'Закрыть')
  head.append(el('strong', '', title), closeBtn)
  const body = el('div', 'modal-body')
  modal.append(head, body)
  back.append(modal)
  document.body.append(back)
  const close = () => back.remove()
  closeBtn.addEventListener('click', close)
  back.addEventListener('click', (e) => {
    if (e.target === back) close()
  })
  return { modal, close, body }
}

export function buildApp(actions: UIActions) {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = ''
  app.append(buildLayout())

  const hudMoney = app.querySelector<HTMLSpanElement>('.hud-money')!
  const hudDay = app.querySelector<HTMLSpanElement>('.hud-day')!
  const hudAtt = app.querySelector<HTMLSpanElement>('.hud-att')!
  const hudVisitors = app.querySelector<HTMLSpanElement>('.hud-visitors')!
  const hudSales = app.querySelector<HTMLSpanElement>('.hud-sales')!
  const hudFlash = app.querySelector<HTMLSpanElement>('.hud-flash')!
  const dayProgressFill = app.querySelector<HTMLDivElement>('.day-progress-fill')!
  const pauseBtn = app.querySelector<HTMLButtonElement>('.btn-pause')!
  const speedBtns = Array.from(app.querySelectorAll<HTMLButtonElement>('.btn-speed'))

  const hallActions = app.querySelector<HTMLDivElement>('.hall-actions')!
  const roomSwitch = app.querySelector<HTMLDivElement>('.room-switch')!
  const ordersPanel = app.querySelector<HTMLDivElement>('.orders-panel')!
  const orderBanner = app.querySelector<HTMLButtonElement>('.order-banner')!

  const roomAside = app.querySelector<HTMLDivElement>('.room-aside')!

  const aquariumSelect = app.querySelector<HTMLSelectElement>('#aquariumSelect')!
  const aquariumAtt = app.querySelector<HTMLSpanElement>('#aquariumAtt')!
  const aqInfo = app.querySelector<HTMLDivElement>('.aq-info')!
  const aqActions = app.querySelector<HTMLDivElement>('.aq-actions')!

  const storeGrid = app.querySelector<HTMLDivElement>('.store-fish-list')!
  const storeFishDetail = app.querySelector<HTMLDivElement>('.store-fish-detail')!
  const decorStore = app.querySelector<HTMLDivElement>('.decor-store')!
  const equipStore = app.querySelector<HTMLDivElement>('.equip-store')!
  const foodStore = app.querySelector<HTMLDivElement>('.food-store')!
  const storeTabs = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-group="sale"] .seg-btn'))
  const storeControls = app.querySelector<HTMLDivElement>('.store-controls')!
  const saleGroup = app.querySelector<HTMLDivElement>('[data-group="sale"]')!
  const furnGroup = app.querySelector<HTMLDivElement>('[data-group="furn"]')!
  const furnShelves = app.querySelector<HTMLDivElement>('.furn-shelves')!
  const furnEquip = app.querySelector<HTMLDivElement>('.furn-equip')!
  const furnFurn = app.querySelector<HTMLDivElement>('.furn-furn')!
  const furnAq = app.querySelector<HTMLDivElement>('.furn-aq')!
  const furnTabs = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-group="furn"] .seg-btn'))
  const modeButtons = Array.from(app.querySelectorAll<HTMLButtonElement>('.store-mode .seg-btn'))
  const logList = app.querySelector<HTMLUListElement>('.log-list')!

  // Плавающий индикатор поставок: не занимает место в сетке магазина и не сдвигает карточки.
  const purchasesPill = el('div', 'purchases-pill')
  document.body.appendChild(purchasesPill)

  app.querySelector<HTMLButtonElement>('.btn-reset')!.addEventListener('click', () => actions.onReset())
  pauseBtn.addEventListener('click', () => actions.onTogglePause())
  for (const btn of speedBtns) btn.addEventListener('click', () => actions.onSetSpeed(Number(btn.dataset.speed)))

  hudVisitors.classList.add('clickable')
  hudVisitors.addEventListener('click', () => switchTab(app, 'orders'))
  orderBanner.addEventListener('click', () => switchTab(app, 'orders'))
  aquariumSelect.addEventListener('change', () => actions.onSelectAquarium(aquariumSelect.value))
  let latestState: GameState = null as unknown as GameState

  let activeStoreMode: 'sale' | 'furn' = 'sale'
  let activeStoreSection = 'fish'
  let selectedFishId: string | null = null
  let purchaseQty = 1
  let storeSearch = ''
  let fishFamilyFilter = 'all'
  let fishRegionFilter = 'all'
  let fishGroup: 'none' | 'family' | 'region' = 'none'
  let fishSort = 'name'
  let decorGroupFilter = 'all'
  let decorSort = 'price'
  let equipCatFilter = 'all'
  let equipSort = 'price'
  let furnSort = 'price'
  let foodKindFilter: 'all' | 'dry' | 'live' = 'all'
  let foodSizeFilter: 'all' | 'small' | 'medium' | 'large' = 'all'
  let foodSort = 'price'

  const EQUIP_CATEGORY_LABEL: Record<string, string> = {
    filter: 'Фильтры', pump: 'Помпы', light: 'Лампы', heater: 'Нагреватели', co2: 'Углекислый газ', measure: 'Измерение',
  }

  let editAqId: string | null = null
  let editDraft = ''
  let editFocusPending = false
  let editSelStart = 0
  let editSelEnd = 0
  let editInput: HTMLInputElement | null = null
  let aqNameBox: HTMLElement | null = null
  // Свёрнутые/развёрнутые карточки информации об аквариуме (п.3 плана).
  // Ключи сразу развёрнуты по умолчанию; состояние хранится между перерисовками.
  const aqCardOpen = new Set<string>(['water'])

  function setStoreSection(v: 'fish' | 'decor' | 'equip' | 'food'): void {
    activeStoreMode = 'sale'
    activeStoreSection = v
    for (const b of storeTabs) b.classList.toggle('active', b.dataset.store === v)
    storeGrid.style.display = v === 'fish' ? '' : 'none'
    decorStore.style.display = v === 'decor' ? '' : 'none'
    equipStore.style.display = v === 'equip' ? '' : 'none'
    foodStore.style.display = v === 'food' ? '' : 'none'
    renderStoreControls()
  }
  for (const b of storeTabs) b.addEventListener('click', () => setStoreSection((b.dataset.store as 'fish' | 'decor' | 'equip' | 'food') ?? 'fish'))
  setStoreSection('fish')

  function setFurnSection(v: 'shelves' | 'equip' | 'furn' | 'aquariums'): void {
    activeStoreMode = 'furn'
    activeStoreSection = v
    for (const b of furnTabs) b.classList.toggle('active', b.dataset.store === v)
    furnShelves.style.display = v === 'shelves' ? '' : 'none'
    furnEquip.style.display = v === 'equip' ? '' : 'none'
    furnFurn.style.display = v === 'furn' ? '' : 'none'
    furnAq.style.display = v === 'aquariums' ? '' : 'none'
    renderStoreControls()
  }
  for (const b of furnTabs) b.addEventListener('click', () => setFurnSection((b.dataset.store as 'shelves' | 'equip' | 'furn' | 'aquariums') ?? 'shelves'))
  setFurnSection('shelves')

  function setStoreMode(mode: 'sale' | 'furn'): void {
    activeStoreMode = mode
    for (const b of modeButtons) b.classList.toggle('active', b.dataset.mode === mode)
    saleGroup.style.display = mode === 'sale' ? '' : 'none'
    furnGroup.style.display = mode === 'furn' ? '' : 'none'
    renderStoreControls()
  }
  for (const b of modeButtons) b.addEventListener('click', () => setStoreMode((b.dataset.mode as 'sale' | 'furn') ?? 'sale'))
  setStoreMode('sale')
  setupTabs(app)

  let epoch = -1
  let flashTimer = 0

  let activeTab: TabName = 'zal'
  let lastZalFp = ''
  let lastAqFp = ''
  let lastOrdersFp = ''
  let lastStoreFp = ''
  let lastPanelCheck = 0
  let lastDayPct = -1
  let renderedLogCount = 0
  let lastPurchasesPillFp = ''

  function flash(message: string): void {
    hudFlash.textContent = message
    hudFlash.classList.add('show')
    clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => hudFlash.classList.remove('show'), 2600)
  }

  function update(state: GameState, shopAtt: number, timeScale: number, paused: boolean): void {
    latestState = state
    updateHud(state, shopAtt, timeScale, paused)

    const activeEl = app.querySelector<HTMLButtonElement>('.tab-btn.active')
    const active = (activeEl?.dataset.tab as TabName | undefined) ?? 'zal'

    if (state.epoch !== epoch) {
      epoch = state.epoch
      activeTab = active
      checkPanels(state, true)
    } else if (active !== activeTab) {
      activeTab = active
      checkPanels(state, true)
    } else if (performance.now() - lastPanelCheck >= 250) {
      lastPanelCheck = performance.now()
      checkPanels(state, false)
    }
    renderLogAppend(state)
    renderPurchasesPill(state)
  }

  function renderPurchasesPill(state: GameState): void {
    const show = state.purchases.length > 0 && activeTab === 'store'
    purchasesPill.classList.toggle('show', show)
    if (!show) return
    const pending = new Map<string, { qty: number; day: number }>()
    for (const p of state.purchases) {
      const e = pending.get(p.speciesId) ?? { qty: 0, day: Infinity }
      e.qty += p.qty
      e.day = Math.min(e.day, p.arriveDay)
      pending.set(p.speciesId, e)
    }
    const key = [...pending.entries()].map(([sid, e]) => `${sid}:${e.qty}:${e.day}`).join(',')
    if (key === lastPurchasesPillFp) return
    lastPurchasesPillFp = key
    purchasesPill.innerHTML = ''
    purchasesPill.append(el('div', 'purchases-pill-title', `В пути от поставщика (${state.purchases.length})`))
    for (const [sid, e] of pending) {
      const species = SPECIES_BY_ID[sid]
      const row = el('div', 'comp-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      row.append(dot, el('span', 'comp-name', `${species.name} ×${e.qty}`), el('span', 'badge', `День ${e.day}`))
      purchasesPill.append(row)
    }
  }

  function updateHud(state: GameState, shopAtt: number, timeScale: number, paused: boolean): void {
    setHudText(hudMoney, `Деньги: ${state.money}₽`)
    setHudText(hudDay, `День ${state.day} · ${formatGameDate(state.day)}`)
    const ratio = Math.min(1, Math.max(0, state.daySeconds / DAY_DURATION_SECONDS))
    const pct = Math.round(ratio * 100)
    if (pct !== lastDayPct) {
      lastDayPct = pct
      dayProgressFill.style.width = `${pct}%`
    }
    if (pauseBtn.textContent !== (paused ? '▶' : '⏸')) pauseBtn.textContent = paused ? '▶' : '⏸'
    pauseBtn.classList.toggle('active', paused)
    for (const btn of speedBtns) btn.classList.toggle('active', !paused && timeScale === Number(btn.dataset.speed))
    setHudText(hudAtt, `Привлекательность зала: ${shopAtt}/100`)
    hudAtt.classList.toggle('good', shopAtt >= 60)
    hudAtt.classList.toggle('mid', shopAtt >= 30 && shopAtt < 60)
    hudAtt.classList.toggle('bad', shopAtt < 30)
    setHudText(hudVisitors, `Заказов: ${state.orders.length}`)
    setHudText(hudSales, `Продаж: ${state.sales}`)
  }

  function setHudText(node: HTMLElement, text: string): void {
    if (node.textContent !== text) node.textContent = text
  }

  function checkPanels(state: GameState, force: boolean): void {
    const zf = fpZal(state)
    if (force || zf !== lastZalFp) {
      lastZalFp = zf
      if (activeTab === 'zal') renderZal(state)
    }
    const of = fpOrders(state)
    if (force || of !== lastOrdersFp) {
      lastOrdersFp = of
      if (activeTab === 'orders') renderOrders(state)
    }
    const af = fpAq(state)
    if (force || af !== lastAqFp) {
      lastAqFp = af
      if (activeTab === 'aquarium') renderAquarium(state)
    }
    const sf = fpStore(state)
    if (force || sf !== lastStoreFp) {
      lastStoreFp = sf
      if (activeTab === 'store') renderStore(state)
    }
  }

  function fpZal(state: GameState): string {
    let s = `${state.viewRoom}|orders:${state.orders.length}|shelves:${state.shelves.map((sh) => `${sh.id}:${sh.roomId}:${sh.aquariums.length}:${sh.aquariums.reduce((a, q) => a + q.fish.length, 0)}`).join(',')}|racks:${state.racks.length}|money:${state.money >= STORAGE_TANK_PRICE ? 1 : 0}|racksFull:${state.racks.length * STORAGE_RACK_CAPACITY >= STORAGE_MAX_SLOTS ? 1 : 0}|filter:${storageFilter}|furn:${state.shop.furniture.displayRack ?? 0}:${(state.shop.furniture.coffeeTable ?? 0) + (state.shop.furniture.armchair ?? 0) + (state.shop.furniture.sofa ?? 0)}|sales:${state.sales}|vis:${state.totalVisitors}|att:${Math.round(shopAttractiveness(state))}`
    if (state.viewRoom === 'storage') {
      s += `|u:${storageUsed(state.shop)}/${storageCapacity(state.racks.length)}|f:${state.storage.stock.map((i) => i.speciesId + ':' + i.count).join(',')}|e:${state.shop.rackInventory.join(',')}|d:${state.shop.rackDecor.join(',')}`
    }
    return s
  }

  function fpOrders(state: GameState): string {
    return state.orders.map((o) => `${o.id}:${Math.ceil(o.timeLeft)}:${o.itemType}:${o.qty}:${o.unitPrice}`).join(',')
  }

  function fpAq(state: GameState): string {
    const all = allAquariums(state)
    let s = all.map((a) => `${a.id}:${a.fish.length}:${a.equipment.length}:${a.decor.length}:${a.designLevel}:${a.decor.length === 0 ? 1 : 0}:${shelfOfAquarium(state, a)?.id ?? ''}`).join(',')
    const aq = all.find((a) => a.id === state.selectedAquariumId)
    if (aq) {
      const w = aq.water
      const minHealth = aq.fish.length ? Math.round(Math.min(...aq.fish.map((f) => f.health)) * 100) : 0
      s += `|sel:${aq.id}|w:${w.temperature.toFixed(1)}:${w.ph.toFixed(1)}:${w.gh.toFixed(1)}:${Math.round(w.o2)}:${Math.round(w.light)}|att:${Math.round(tankAttractiveness(aq))}|h:${minHealth}|$:${state.money >= designUpgradeCost(aq.designLevel) ? 1 : 0}`
    }
    return s
  }

  function fpStore(state: GameState): string {
    const m = FISH_SPECIES.map((f) => (state.market[f.id] ?? 1).toFixed(2)).join(',')
    const stk = state.storage.stock.map((i) => i.speciesId + ':' + i.count).join(',')
    const shelves = state.shelves.map((sh) => `${sh.id}:${sh.aquariums.length}:${sh.aquariums.reduce((a, q) => a + q.fish.length, 0)}`).join(',')
    return `${Math.round(state.money)}|m:${m}|stk:${stk}|inv:${state.shop.rackInventory.join(',')}|dec:${state.shop.rackDecor.join(',')}|u:${storageUsed(state.shop)}/${storageCapacity(state.racks.length)}|r:${state.racks.length}|sh:${shelves}|p:${state.purchases.length}`
  }

  function renderLogAppend(state: GameState): void {
    const n = state.log.length
    if (n < renderedLogCount) {
      logList.innerHTML = ''
      for (const e of [...state.log].reverse().slice(0, 20)) {
        const li = el('li', `log-${e.kind}`)
        li.append(el('span', 'log-day', `д.${e.day}`), el('span', 'log-text', e.text))
        logList.append(li)
      }
      renderedLogCount = n
      return
    }
    for (let i = renderedLogCount; i < n; i++) {
      const e = state.log[i]
      const li = el('li', `log-${e.kind}`)
      li.append(el('span', 'log-day', `д.${e.day}`), el('span', 'log-text', e.text))
      logList.append(li)
    }
    renderedLogCount = n
  }

  function renderZal(state: GameState): void {
    roomSwitch.innerHTML = ''
    for (const r of ROOMS) {
      const b = el('button', r.id === state.viewRoom ? 'room-btn active' : 'room-btn', `${r.icon} ${r.name}`)
      b.addEventListener('click', () => actions.onViewRoom(r.id))
      roomSwitch.append(b)
    }

    hallActions.innerHTML = ''
    const buyShelf = el('button', 'btn', `Добавить стойку в «${ROOM_BY_ID[state.viewRoom].name}»`)
    buyShelf.addEventListener('click', () => openAddShelfModal(state))
    hallActions.append(buyShelf)
    const addRack = el('button', 'btn', `Добавить стеллаж — ${STORAGE_TANK_PRICE}₽`)
    const racksFull = state.racks.length * STORAGE_RACK_CAPACITY >= STORAGE_MAX_SLOTS
    addRack.disabled = state.money < STORAGE_TANK_PRICE || racksFull
    addRack.title = racksFull ? `Достигнут предел вместимости склада (${STORAGE_MAX_SLOTS} мест)` : 'Добавляет стеллаж хранения в текущее помещение'
    addRack.addEventListener('click', () => actions.onBuyRack(state.viewRoom))
    hallActions.append(addRack)

    const manage = el('button', 'btn', 'Управление стойками')
    manage.addEventListener('click', () => openShelvesModal(state))
    hallActions.append(manage)

    const n = state.orders.length
    orderBanner.classList.toggle('show', n > 0)
    orderBanner.textContent = n > 0 ? `✦ ${n} ${n === 1 ? 'заказ' : 'заказов'} ожидают — открыть` : ''

    renderRoomAside(state)
  }

  function openShelvesModal(s: GameState): void {
    const { body } = overlay('Управление стойками')
    body.append(el('div', 'comp-hint', 'Канвас выше — основное представление зала. Здесь — сводка по стойкам и быстрые действия.'))
    if (s.shelves.length === 0) {
      body.append(el('div', 'empty', 'Стоек нет. Купите стойку и разместите её в помещении.'))
      return
    }
    for (const shelf of s.shelves) {
      const card = el('div', 'shelf-card compact')
      const head = el('div', 'shelf-head')
      const roomBadge = el('span', 'room-badge', `${ROOM_BY_ID[shelf.roomId].icon} ${ROOM_BY_ID[shelf.roomId].name}`)
      head.append(
        el('strong', '', shelf.name),
        roomBadge,
        el('span', 'shelf-meta', `аквариумов ${shelf.aquariums.length} · загрузка ${shelfUsedLiters(shelf)}/${shelf.loadCapacityL} л`),
      )
      const actionsBtn = el('button', 'btn small', 'Действия')
      actionsBtn.addEventListener('click', () => openShelfMenu(shelf.id, s))
      head.append(actionsBtn)
      card.append(head)
      if (shelf.aquariums.length > 0) {
        const list = el('div', 'shelf-body')
        for (const aq of shelf.aquariums) {
          const tile = el('button', 'btn aq-tile small')
          tile.title = `Открыть «${aq.name}»`
          tile.append(
            el('strong', '', aq.name),
            el('span', 'aq-meta', `${aq.volume} л · ${aq.fish.length} рыб`),
          )
          tile.addEventListener('click', () => {
            actions.onSelectAquarium(aq.id)
            switchTab(app, 'aquarium')
          })
          list.append(tile)
        }
        card.append(list)
      }
      body.append(card)
    }
  }

  function openAddShelfModal(s: GameState): void {
    const { body } = overlay(`Купить стойку в «${ROOM_BY_ID[s.viewRoom].name}»`)
    body.append(el('div', 'comp-hint', 'Стойка размещается сразу в текущее помещение.'))
    for (const specId of Object.keys(SHELVES)) {
      const spec = SHELVES[specId as keyof typeof SHELVES]
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', `Купить и разместить — ${spec.price}₽`)
      btn.disabled = s.money < spec.price
      btn.addEventListener('click', () => actions.onBuyShelf(specId, s.viewRoom))
      row.append(
        el('strong', '', spec.name),
        el('span', 'shop-desc', `${spec.slabs.length} полки · до ${spec.loadCapacityL} л`),
        btn,
      )
      body.append(row)
    }
  }

  function openShelfMenu(shelfId: string, s: GameState): void {
    const shelf = s.shelves.find((sh) => sh.id === shelfId)
    if (!shelf) return
    const spec = SHELVES[shelf.specId as keyof typeof SHELVES]
    const { body } = overlay(`Стойка «${shelf.name}»`)
    body.append(
      el('div', 'comp-hint', `Помещение: ${ROOM_BY_ID[shelf.roomId].icon} ${ROOM_BY_ID[shelf.roomId].name} · занято ${shelf.aquariums.length}/${shelf.slabs.length} полок · ${shelfUsedLiters(shelf)}/${shelf.loadCapacityL} л`),
    )

    const move = el('button', 'btn', 'Переместить в другое помещение…')
    move.addEventListener('click', () => openShelfMoveModal(shelf))
    body.append(move)

    const add = el('button', 'btn', 'Добавить аквариум…')
    add.addEventListener('click', () => openAddAquariumModal(s, shelf))
    body.append(add)

    const specPrice = spec ? spec.price : 0
    const sell = el('button', 'btn danger', `Продать — ${Math.floor(specPrice * 0.5)}₽`)
    sell.addEventListener('click', () => {
      if (window.confirm(`Продать стойку «${shelf.name}»? Аквариумы (${shelf.aquariums.length}) будут удалены.`)) {
        actions.onSellShelf(shelf.id)
      }
    })
    body.append(sell)

    if (shelf.aquariums.length > 0) {
      const aqList = el('div', 'comp-list')
      aqList.append(el('div', 'list-title', 'На стойке:'))
      for (const aq of shelf.aquariums) {
        const row = el('div', 'comp-row')
        row.append(el('span', 'comp-name', aq.name))
        const ren = el('button', 'btn small', 'Переименовать')
        ren.addEventListener('click', () => openRenameModal(aq.name, (n) => actions.onRenameAquarium(aq.id, n)))
        const btn = el('button', 'btn small', 'Переместить')
        btn.addEventListener('click', () => openAquariumMoveModal(s, aq.id))
        row.append(ren, btn)
        aqList.append(row)
      }
      body.append(aqList)
    }
  }

  function openShelfMoveModal(shelf: ShelfState): void {
    const { body } = overlay(`Переместить стойку «${shelf.name}»`)
    body.append(el('div', 'comp-hint', `Сейчас: ${ROOM_BY_ID[shelf.roomId].icon} ${ROOM_BY_ID[shelf.roomId].name}. Выберите помещение:`))
    for (const r of ROOMS) {
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', 'Переместить')
      btn.disabled = r.id === shelf.roomId
      btn.addEventListener('click', () => actions.onMoveShelf(shelf.id, r.id))
      row.append(
        el('strong', '', `${r.icon} ${r.name}`),
        el('span', 'shop-desc', r.desc),
        btn,
      )
      body.append(row)
    }
  }

  function openAquariumMoveModal(s: GameState, aqId: string): void {
    const aq = allAquariums(s).find((a) => a.id === aqId)
    if (!aq) return
    const src = s.shelves.find((sh) => sh.id === aq.shelfId)
    const { body } = overlay(`Переместить «${aq.name}»`)
    body.append(
      el('div', 'comp-hint', `Сейчас: ${src ? ROOM_BY_ID[src.roomId].icon + ' ' + ROOM_BY_ID[src.roomId].name + ' · ' + src.name : '—'}. Выберите стойку назначения со свободным местом:`),
    )
    const targetShelves = s.shelves.filter((sh) => sh.id !== src?.id && maxFitOnShelf(sh, aq) > 0)
    if (targetShelves.length === 0) {
      body.append(el('div', 'empty', 'Нет стоек со свободным местом. Купите новую стойку или освободите место.'))
      return
    }
    for (const t of targetShelves) {
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', 'Перенести')
      btn.addEventListener('click', () => actions.onMoveAquarium(aq.id, t.id))
      row.append(
        el('strong', '', `${ROOM_BY_ID[t.roomId].name} · ${t.name}`),
        el('span', 'shop-desc', `${maxFitOnShelf(t, aq)} мест(а) · заглаз ${t.aquariums.length}/${t.slabs.length} полок`),
        btn,
      )
      body.append(row)
    }
  }

  function openAddAquariumModal(s: GameState, shelf: ShelfState): void {
    const { body } = overlay('Добавить аквариум на стойку «' + shelf.name + '»')
    body.append(el('div', 'comp-hint', `Остаток грузоподъёмности: ${shelfLoadLeft(shelf)} л`))
    for (const model of AQUARIUM_MODELS) {
      const max = maxFitOnShelf(shelf, model)
      const row = el('div', 'modal-row')
      const badge = el('span', max > 0 ? 'compat ok' : 'compat dead', max > 0 ? `помещается до ${max} шт` : 'не помещается')
      const qty = el('input')
      qty.type = 'number'
      qty.value = String(Math.min(1, max))
      qty.min = '1'
      qty.max = String(max)
      qty.style.width = '56px'
      const btn = el('button', 'btn small', `Купить — ${model.price}₽/шт`)
      const update = (): void => {
        const n = Math.max(0, Math.min(max, Number(qty.value) || 0))
        btn.disabled = s.money < model.price * n || n <= 0
      }
      qty.addEventListener('input', update)
      update()
      btn.addEventListener('click', () => {
        const n = Math.max(0, Math.min(max, Number(qty.value) || 0))
        if (n > 0) actions.onBuyAquarium(model.id, shelf.id, n)
      })
      row.append(el('strong', '', `${model.name} (${model.w}×${model.d}×${model.h} см, ${model.volume} л)`), badge, qty, btn)
      body.append(row)
    }
  }

  function openBuyAquariumModal(s: GameState, model: AquariumModel): void {
    const { body } = overlay(`Купить «${model.name}»`)
    body.append(el('div', 'comp-hint', `${model.w}×${model.d}×${model.h} см, ${model.volume} л — ${model.price}₽/шт. Выберите стойку и количество.`))
    const placeables: { shelf: ShelfState; max: number; qty: HTMLInputElement }[] = []
    for (const shelf of s.shelves) {
      const max = maxFitOnShelf(shelf, model)
      if (max > 0) placeables.push({ shelf, max, qty: el('input') })
    }
    const totalEl = el('div', 'comp-hint')
    const buyBtn = el('button', 'btn buy', 'Купить')
    const pick = (): number => placeables.reduce((acc, p) => acc + Math.max(0, Math.min(p.max, Number(p.qty.value) || 0)), 0)
    const recalc = (): void => {
      const total = pick() * model.price
      totalEl.textContent = `Итого: ${total}₽`
      buyBtn.disabled = pick() <= 0 || s.money < total
    }
    if (placeables.length === 0) {
      body.append(el('div', 'empty', 'Нет стоек со свободной подходящей полкой.'))
      body.append(storeReason('Сначала купите и разместите стойку в «Помещениях»'))
      return
    }
    for (const p of placeables) {
      p.qty.type = 'number'
      p.qty.value = '0'
      p.qty.min = '0'
      p.qty.max = String(p.max)
      p.qty.style.width = '56px'
      p.qty.addEventListener('input', () => {
        p.qty.value = String(Math.max(0, Math.min(p.max, Number(p.qty.value) || 0)))
        recalc()
      })
      const row = el('div', 'modal-row')
      row.append(el('strong', '', `${ROOM_BY_ID[p.shelf.roomId].name} · ${p.shelf.name}`), el('span', 'shop-desc', `до ${p.max} шт`), p.qty)
      body.append(row)
    }
    body.append(totalEl, buyBtn)
    buyBtn.addEventListener('click', () => {
      for (const p of placeables) {
        const n = Math.max(0, Math.min(p.max, Number(p.qty.value) || 0))
        if (n > 0) actions.onBuyAquarium(model.id, p.shelf.id, n)
      }
      recalc()
    })
    recalc()
  }

  function renderOrders(state: GameState): void {
    ordersPanel.innerHTML = ''
    if (state.orders.length === 0) {
      ordersPanel.append(el('div', 'empty', 'Заказов нет.'))
      return
    }
    for (const order of state.orders) {
      const isFish = order.itemType !== 'equip' && order.itemType !== 'decor'
      const name = isFish
        ? SPECIES_BY_ID[order.speciesId]?.name ?? order.speciesId
        : order.itemType === 'equip'
          ? EQUIPMENT[order.itemId as EquipmentId]?.name ?? order.itemId ?? ''
          : DECOR[order.itemId as DecorKind]?.name ?? order.itemId ?? ''
      const row = el('div', 'order-row')
      if (isFish) {
        const species = SPECIES_BY_ID[order.speciesId]
        const dot = el('span', 'dot')
        dot.style.background = species.color
        row.append(dot)
      }
      const badge = el('span', order.kind === 'demand' ? 'compat ok' : 'compat warn', order.kind === 'demand' ? 'ищет конкретное' : 'по витрине')
      const total = order.unitPrice * order.qty
      const timer = el('span', 'order-timer', `⏳ ${Math.ceil(order.timeLeft)}с`)
      const sellBtn = el('button', 'btn small', `Продать за ${total}₽`)
      const stock = isFish
        ? fishRetailStock(state, order.speciesId)
        : order.itemType === 'equip'
          ? equipmentStock(state, order.itemId as EquipmentId)
          : decorStock(state, order.itemId as DecorKind)
      sellBtn.disabled = stock < order.qty
      sellBtn.addEventListener('click', () => actions.onFulfillOrder(order.id))
      row.append(
        el('span', 'order-name', `${name} ×${order.qty}`),
        badge,
        el('span', 'order-price', `по ${order.unitPrice}₽`),
        timer,
        sellBtn,
      )
      ordersPanel.append(row)
    }
  }

  function renderAqNameRow(container: HTMLElement, aq: AquariumState): void {
    if (editAqId === aq.id && editInput && container.contains(editInput)) return
    const wasFocused = container.contains(document.activeElement)
    container.innerHTML = ''
    if (editAqId === aq.id) {
      const inp = el('input') as HTMLInputElement
      inp.type = 'text'
      inp.maxLength = 40
      inp.className = 'rename-inline'
      inp.value = editDraft
      editInput = inp
      const finish = (canceled: boolean): void => {
        if (!canceled) {
          const n = editDraft.trim()
          if (n && n !== aq.name) actions.onRenameAquarium(aq.id, n)
        }
        editAqId = null
        editInput = null
        renderAqNameRow(container, aq)
      }
      const save = (): void => finish(false)
      const cancel = (): void => finish(true)
      inp.addEventListener('input', () => {
        editDraft = inp.value
        editSelStart = inp.selectionStart ?? inp.value.length
        editSelEnd = inp.selectionEnd ?? editSelStart
      })
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') cancel()
      })
      const ok = el('button', 'icon-btn', '✓')
      ok.title = 'Сохранить'
      ok.addEventListener('click', save)
      const x = el('button', 'icon-btn', '✕')
      x.title = 'Отменить'
      x.addEventListener('click', cancel)
      const row = el('div', 'aq-name-row edit')
      row.append(inp, ok, x)
      container.append(row)
      if (editFocusPending) {
        editFocusPending = false
        inp.focus()
        inp.select()
      } else if (wasFocused) {
        inp.focus()
        inp.setSelectionRange(editSelStart, editSelEnd)
      }
      return
    }
    editInput = null
    const nameRow = el('div', 'aq-name-row')
    nameRow.append(el('div', 'aq-keys', aq.name))
    const editBtn = el('button', 'icon-btn', '✎')
    editBtn.title = 'Переименовать'
    editBtn.addEventListener('click', () => {
      if (editAqId) return
      editAqId = aq.id
      editDraft = aq.name
      editFocusPending = true
      renderAqNameRow(container, aq)
    })
    nameRow.append(editBtn)
    container.append(nameRow)
  }

  function openRenameModal(current: string, onSave: (name: string) => void): void {
    const { body } = overlay('Переименовать аквариум')
    const inp = el('input') as HTMLInputElement
    inp.type = 'text'
    inp.maxLength = 40
    inp.value = current
    inp.className = 'count-input rename-input'
    inp.placeholder = 'Название аквариума'
    const save = el('button', 'btn buy', 'Сохранить')
    const apply = (): void => {
      const n = inp.value.trim()
      if (!n) {
        inp.focus()
        return
      }
      onSave(n)
    }
    save.addEventListener('click', apply)
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') apply()
    })
    const row = el('div', 'modal-row')
    row.append(inp, save)
    body.append(el('div', 'comp-hint', 'Например: «Цихлидник Южной Америки». Название видно на канвасе, в списках и в селекторе. Максимум 40 символов.'))
    body.append(row)
    inp.focus()
    inp.select()
  }

  function renderAquarium(state: GameState): void {
    const all = allAquariums(state)
    fillSelect(aquariumSelect, all.map((a) => {
      const sh = shelfOfAquarium(state, a)
      const label = sh ? `${ROOM_BY_ID[sh.roomId].icon} ${ROOM_BY_ID[sh.roomId].name} · ${sh.name} · ${a.name}` : a.name
      return { value: a.id, label }
    }), state.selectedAquariumId, true)
    const aq = all.find((a) => a.id === state.selectedAquariumId)
    if (!aq) {
      aquariumAtt.textContent = 'Аквариум не выбран'
      editAqId = null
      aqInfo.innerHTML = ''
      aqActions.innerHTML = ''
      return
    }
    if (editAqId && aq.id !== editAqId) {
      editAqId = null
      editInput = null
    }
    aquariumAtt.textContent = `Привлекательность: ${tankAttractiveness(aq)}/100`

    const aqShelf = shelfOfAquarium(state, aq)
    const aqRoom = aqShelf ? ROOM_BY_ID[aqShelf.roomId] : null

    if (!aqNameBox) {
      aqNameBox = el('div', 'aq-name-box')
      aqInfo.prepend(aqNameBox)
    } else if (aqNameBox.parentNode !== aqInfo) {
      aqInfo.prepend(aqNameBox)
    }
    renderAqNameRow(aqNameBox, aq)
    while (aqInfo.lastChild && aqInfo.lastChild !== aqNameBox) aqInfo.removeChild(aqInfo.lastChild)

    // Верхняя сводка: расположение и статус продажи.
    aqInfo.append(el('div', 'aq-line loc-line', aqRoom && aqShelf
      ? `${aqRoom.icon} Помещение: ${aqRoom.name} · Стойка: «${aqShelf.name}»`
      : 'Аквариум не на стойке'))
    aqInfo.append(el('div', aq.decor.length === 0 ? 'aq-line sale-line' : 'aq-line', aq.decor.length === 0 ? 'Продажный (без декора): рыбу из него можно продавать в розницу' : 'Видовой аквариум: рыбу из него не продают — уберите декор, чтобы сделать продажным'))

    const chip = (text: string, ok?: boolean): HTMLSpanElement => {
      const c = el('span', 'chip chip-' + (ok ? 'ok' : 'warn'), text)
      return c
    }

    // Сверяем параметры воды с диапазонами присутствующих видов.
    const fishGroups = new Map<string, { count: number; minHealth: number }>()
    for (const f of aq.fish) {
      const g = fishGroups.get(f.speciesId) ?? { count: 0, minHealth: 100 }
      g.count++
      g.minHealth = Math.min(g.minHealth, f.health)
      fishGroups.set(f.speciesId, g)
    }
    const presentSpecies = aq.fish.map((f) => SPECIES_BY_ID[f.speciesId]).filter((s): s is FishSpecies => !!s)
    const outOfRange = (get: (s: FishSpecies) => [number, number], v: number): boolean =>
      presentSpecies.some((s) => { const [mn, mx] = get(s); return v < mn || v > mx })
    const water = aq.water
    const waterOff: string[] = []
    if (outOfRange((s) => [s.tempMin, s.tempMax], water.temperature)) waterOff.push('температура')
    if (outOfRange((s) => [s.phMin, s.phMax], water.ph)) waterOff.push('pH')
    if (outOfRange((s) => [s.ghMin, s.ghMax], water.gh)) waterOff.push('GH')
    if (outOfRange((s) => [s.o2Min, s.o2Max], water.o2)) waterOff.push('O₂')
    const hasThermo = aq.equipment.some((e) => e.id === 'thermometer')

    // Карточка: заголовок-сворачиватель + свёрнутая сводка + развёрнутое тело.
    const aqCard = (id: string, icon: string, title: string, summary: Array<HTMLElement | string>, body: Array<HTMLElement | string>): HTMLDivElement => {
      const open = aqCardOpen.has(id)
      const card = el('div', 'aq-card' + (open ? ' open' : ''))
      const head = el('button', 'aq-card-head')
      head.setAttribute('type', 'button')
      const sumBox = el('span', 'aq-card-sum')
      sumBox.append(...summary)
      head.append(el('span', 'aq-chev', open ? '▾' : '▸'), el('span', 'aq-card-ico', icon), el('span', 'aq-card-title', title), sumBox)
      head.addEventListener('click', () => {
        if (aqCardOpen.has(id)) aqCardOpen.delete(id)
        else aqCardOpen.add(id)
        renderAquarium(latestState)
      })
      card.append(head)
      if (open) {
        const bodyEl = el('div', 'aq-card-body')
        bodyEl.append(...body)
        card.append(bodyEl)
      }
      return card
    }

    // Карточка «Вода».
    aqInfo.append(aqCard('water', '💧', 'Вода', [
      el('span', 'aq-sum-val', `T ${hasThermo ? water.temperature.toFixed(1) + ' °C' : '?'} · pH ${water.ph.toFixed(1)} · GH ${water.gh.toFixed(1)} · O₂ ${Math.round(water.o2)}%`),
      presentSpecies.length
        ? (waterOff.length ? el('span', 'chip chip-warn', `вне нормы: ${waterOff.join(', ')}`) : el('span', 'chip chip-ok', 'в норме'))
        : el('span', 'chip', 'рыб нет'),
    ], [
      el('div', 'aq-line' + (waterOff.includes('температура') ? ' off' : ''), hasThermo ? `Температура: ${water.temperature.toFixed(1)} °C` : 'Температура: ? (установите термометр)'),
      el('div', 'aq-line', `Комнатная: ${ROOM_TEMP} °C`),
      el('div', 'aq-line' + (waterOff.includes('pH') || waterOff.includes('GH') ? ' off' : ''), `pH: ${water.ph.toFixed(1)} · GH: ${water.gh.toFixed(1)} °dH`),
      el('div', 'aq-line' + (waterOff.includes('O₂') ? ' off' : ''), `O₂: ${Math.round(water.o2)}% · Свет: ${Math.round(water.light)}%`),
      presentSpecies.length ? el('div', 'aq-line eq-row-muted', 'Off-метка = параметр вне диапазона обитающих в аквариуме видов.') : el('div', 'aq-line eq-row-muted', 'Ориентиров для параметров нет — разместите рыбу.'),
    ]))

    // Карточка «Обитатели».
    const fishBody: Array<HTMLElement> = []
    for (const [sid, g] of fishGroups) {
      const sp = SPECIES_BY_ID[sid]
      if (!sp) continue
      const row = el('div', 'fish-group-row')
      const dot = el('span', 'fish-dot', '●')
      dot.style.color = sp.color
      const name = el('span', 'name', `${sp.name} ×${g.count}`)
      const hp = el('span', 'health-pct')
      hp.style.color = g.minHealth > 60 ? 'var(--ok)' : g.minHealth > 30 ? 'var(--warn)' : 'var(--dead)'
      hp.textContent = `здоровье ${Math.round(g.minHealth)}% `
      row.append(dot, name, hp)
      fishBody.push(row)
    }
    const fishSum: Array<HTMLElement | string> = [el('span', 'aq-sum-val', aq.fish.length ? `${aq.fish.length} ос. · ${fishGroups.size} вид.` : 'нет рыбы')]
    if (aq.fish.length) fishSum.push(chip(`${Math.round(Math.min(...aq.fish.map((f) => f.health)))}%`, Math.min(...aq.fish.map((f) => f.health)) > 60))
    aqInfo.append(aqCard('fish', '🐟', 'Обитатели', fishSum, fishBody))

    // Карточка «Оборудование».
    const eqCounts = new Map<EquipmentId, number>()
    for (const e of aq.equipment) eqCounts.set(e.id, (eqCounts.get(e.id) ?? 0) + 1)
    const eqBody: Array<HTMLElement> = []
    for (const [eid, count] of eqCounts) {
      const def = EQUIPMENT[eid]
      const row = el('div', 'equip-row')
      row.append(el('span', 'aq-card-ico', '🔧'), el('span', 'name', `${def.name}${count > 1 ? ` ×${count}` : ''}`))
      eqBody.push(row)
    }
    if (!eqBody.length) eqBody.push(el('div', 'aq-line eq-row-muted', 'Оборудования нет'))
    aqInfo.append(aqCard('equip', '🔧', 'Оборудование', [
      aq.equipment.length ? aq.equipment.map((e) => EQUIPMENT[e.id].name).join(', ') : 'нет',
    ], eqBody))

    // Карточка «Декор».
    const decorCounts = new Map<string, number>()
    for (const d of aq.decor) decorCounts.set(d.kind, (decorCounts.get(d.kind) ?? 0) + 1)
    const decorBody: Array<HTMLElement> = []
    for (const kind of decorCounts.keys()) {
      const def = DECOR[kind as DecorKind]
      const count = decorCounts.get(kind as DecorKind) ?? 0
      const row = el('div', 'decor-row')
      row.append(el('span', 'equip-ico', '🪨'), el('span', 'name', `${def ? def.name : kind}${count > 1 ? ` ×${count}` : ''}`))
      decorBody.push(row)
    }
    if (!decorBody.length) decorBody.push(el('div', 'aq-line eq-row-muted', 'Декора нет'))
    aqInfo.append(aqCard('decor', '🪴', 'Декор', [
      el('span', 'aq-sum-val', `растительность ${Math.round(vegetationOf(aq) * 100)}% · объектов ${aq.decor.length}`),
    ], [
      el('div', 'aq-line', `Растительность: ${Math.round(vegetationOf(aq) * 100)}%`),
      ...decorBody,
    ]))

    // Карточка «Дизайн».
    aqInfo.append(aqCard('design', '🎨', 'Дизайн', [
      el('span', 'aq-sum-val', `уровень ${aq.designLevel}/${MAX_DESIGN_LEVEL} · улучшить ${designUpgradeCost(aq.designLevel)}₽`),
    ], (() => {
      const dRow = el('div', 'design-row')
      const dBtn = el('button', 'btn small', `Уровень ${aq.designLevel}/${MAX_DESIGN_LEVEL} — улучшить`)
      dBtn.disabled = aq.designLevel >= MAX_DESIGN_LEVEL || state.money < designUpgradeCost(aq.designLevel)
      dBtn.addEventListener('click', () => actions.onUpgradeDesign(aq.id))
      dRow.append(dBtn)
      dRow.append(el('span', 'aq-line', ` (${designUpgradeCost(aq.designLevel)}₽)`))
      return [dRow] as Array<HTMLElement>
    })()))

    aqActions.innerHTML = ''
    const mkBtn = (label: string, fn: () => void) => {
      const b = el('button', 'btn aq-action', label)
      b.addEventListener('click', fn)
      aqActions.append(b)
      return b
    }
    mkBtn('Оборудование', () => openEquipmentModal(state, aq.id))
    mkBtn('Декор', () => openDecorModal(state, aq.id))
    mkBtn('Обитатели', () => openInhabitantsModal(state, aq.id))
    mkBtn('Обслуживание', () => openMaintenanceModal(state, aq.id))
    mkBtn('Переместить', () => openAquariumMoveModal(state, aq.id))
  }

  function openEquipmentModal(s: GameState, aqId: string): void {
    const aqName = allAquariums(s).find((a) => a.id === aqId)?.name ?? ''
    const { body } = overlay(`Оборудование: «${aqName}»`)

    const render = (): void => {
      const aq = allAquariums(s).find((a) => a.id === aqId)
      if (!aq) return
      body.innerHTML = ''

      body.append(el('div', 'list-title', 'Установлено'))
      if (aq.equipment.length === 0) body.append(el('div', 'empty', 'Нет установленного оборудования.'))
      for (const inst of aq.equipment) {
        const def = EQUIPMENT[inst.id]
        const block = el('div', 'comp-row')
        block.append(el('span', 'comp-name', def.name))
        const rack = el('button', 'btn small', 'На склад')
        rack.addEventListener('click', () => {
          actions.onRemoveEquipment(inst.id, aq.id)
          render()
        })
        const sellEq = el('button', 'btn small danger', `Продать (${Math.floor(def.price * 0.5)}₽)`)
        sellEq.addEventListener('click', () => {
          actions.onSellEquipment(inst.id, aq.id)
          render()
        })
        block.append(rack, sellEq)
        body.append(block)
        for (const p of def.params) {
          body.append(
            slider(p.label, p.min, p.max, p.step, inst.settings[p.id] ?? p.default, (v) =>
              actions.onEquipmentSetting(aq.id, inst.id, p.id, v),
            ),
          )
        }
      }

      body.append(el('div', 'list-title', 'На складе'))
      if (s.shop.rackInventory.length === 0) {
        body.append(el('div', 'empty', 'На складе нет оборудования. Купите в «Магазине» → «Для продажи» → «Оборудование».'))
      }
      for (const eid of s.shop.rackInventory) {
        const def = EQUIPMENT[eid]
        const row = el('div', 'comp-row')
        const btn = el('button', 'btn small', 'Установить')
        btn.addEventListener('click', () => {
          actions.onInstallEquipment(eid, aq.id)
          render()
        })
        row.append(el('span', 'comp-name', def.name), btn)
        body.append(row)
      }
    }

    render()
  }

  function openDecorModal(s: GameState, aqId: string): void {
    const aq = allAquariums(s).find((a) => a.id === aqId)
    if (!aq) return
    const { body } = overlay(`Декор: «${aq.name}»`)
    body.append(el('div', 'comp-hint', `Растительность: ${Math.round(vegetationOf(aq) * 100)}%`))
    body.append(el('div', 'list-title', 'Добавить'))
    const addRow = el('div', 'modal-row')
    for (const kind of DECOR_KINDS) {
      const def = DECOR[kind]
      const btn = el('button', 'btn small', `+${def.name} — ${def.price}₽`)
      btn.disabled = s.money < def.price
      btn.addEventListener('click', () => actions.onAddDecor(aq.id, kind))
      addRow.append(btn)
    }
    body.append(addRow)
    body.append(el('div', 'list-title', 'Установлено'))
    if (aq.decor.length === 0) body.append(el('div', 'empty', 'Декора нет.'))
    for (const d of aq.decor) {
      const row = el('div', 'comp-row')
      const rm = el('button', 'btn small', 'Убрать')
      rm.addEventListener('click', () => actions.onRemoveDecor(aq.id, d.id))
      row.append(el('span', 'comp-name', DECOR[d.kind].name), rm)
      body.append(row)
    }
  }

  function openInhabitantsModal(s: GameState, aqId: string): void {
    const aq = allAquariums(s).find((a) => a.id === aqId)
    if (!aq) return
    const { body, close } = overlay(`Обитатели: «${aq.name}»`)

    const goStore = el('button', 'btn buy', 'Купить рыб в магазине →')
    goStore.addEventListener('click', () => {
      close()
      switchTab(app, 'store')
      setStoreMode('sale')
      setStoreSection('fish')
    })
    body.append(goStore)
    body.append(el('div', 'list-title', 'Заселить со склада'))
    const stockById = new Map<string, number>()
    for (const item of s.storage.stock) stockById.set(item.speciesId, (stockById.get(item.speciesId) ?? 0) + item.count)
    if (stockById.size === 0) body.append(el('div', 'empty', 'Склад пуст — закупите обитателей во вкладке «Магазин».'))
    for (const [speciesId, count] of stockById) {
      const species = SPECIES_BY_ID[speciesId]
      const room = canStock(aq, species, 1)
      const row = el('div', 'stock-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const inp = el('input') as HTMLInputElement
      inp.type = 'number'
      inp.min = '1'
      inp.max = String(Math.max(1, Math.min(count, room)))
      inp.value = '1'
      inp.className = 'count-input'
      const btn = el('button', 'btn small', 'Заселить')
      btn.disabled = room <= 0
      btn.addEventListener('click', () => {
        const n = Math.max(1, Math.min(count, room, Number(inp.value) || 1))
        actions.onStockToAquarium(speciesId, aq.id, n)
      })
      row.append(dot, el('span', 'stock-name', `${species.name} (склад ${count} · до ${room})`), inp, btn)
      body.append(row)
    }

    body.append(el('div', 'list-title', 'В аквариуме'))
    const fishWrap = el('div')
    if (aq.fish.length === 0) fishWrap.append(el('div', 'empty', 'Аквариум пуст.'))

    const feedAll = el('button', 'btn small', 'Кормить всех')
    feedAll.disabled = aq.fish.length === 0
    feedAll.addEventListener('click', () => openFeedModal(s, aq.id, null))
    body.append(feedAll)

    for (const fish of aq.fish) {
      const species = SPECIES_BY_ID[fish.speciesId]
      const rep = fishWellbeing(species, fish, aq)
      const row = el('div', 'fish-row stock-row-btn')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const fill = el('span', 'health-fill')
      fill.style.width = `${fish.health}%`
      fill.classList.add(fish.health > 60 ? 'ok' : fish.health > 30 ? 'warn' : 'dead')
      const name = el('span', 'fish-name', `${species.name} `)
      name.append(fill)
      const badge = el('span', 'welfare-tag', welfareLabel(rep))
      badge.classList.add('welfare', welfareClass(rep))
      row.append(dot, name, el('span', 'health-num', `${Math.round(fish.health)}%`), badge)
      row.appendChild(el('span', 'fish-caret', '›'))
      row.addEventListener('click', () => openFishDetailModal(s, aq.id, fish.id))
      fishWrap.append(row)
    }
    body.append(fishWrap)
  }

  function openFeedModal(s: GameState, aqId: string, fishId: string | null): void {
    const aq = allAquariums(s).find((a) => a.id === aqId)
    if (!aq) return
    const { body, close } = overlay(`Покормить: «${aq.name}»`)
    const targets = fishId ? aq.fish.filter((f) => f.id === fishId) : aq.fish
    const render = (): void => {
      body.innerHTML = ''
      body.append(el('div', 'comp-hint', fishId ? 'Выберите корм, который съест эта рыба:' : 'Корм съедают те рыбы, которым он подходит по размеру и диете.'))
      const entries = foodStockEntries(s)
      if (entries.length === 0) {
        body.append(el('div', 'empty', 'На складе нет корма.'))
        const go = el('button', 'btn buy', 'Купить корм в магазине →')
        go.addEventListener('click', () => {
          close()
          switchTab(app, 'store')
          setStoreMode('sale')
          setStoreSection('food')
        })
        body.append(go)
        return
      }
      for (const entry of entries) {
        const def = FOOD[entry.id]
        const feedable = targets.filter((f) => canEatFood(SPECIES_BY_ID[f.speciesId], def))
        const fresh = freshnessLeft(entry, s.shop.fridge)
        const row = el('div', 'comp-row')
        row.append(el('span', 'comp-name', `${def.name} — ${entry.count} порций`))
        if (fresh != null) {
          const noFridge = def.kind === 'live' && !s.shop.fridge
          const tag = el('span', noFridge || fresh <= 1 ? 'live-warn' : 'badge', noFridge ? 'портится к концу дня (нет холодильника)' : fresh === 0 ? 'испортится сегодня' : `свежесть: ${fresh} дн.`)
          row.append(tag)
        }
        const fitLbl = fishId ? (feedable.length > 0 ? 'подходит' : 'не подходит') : `${feedable.length}/${targets.length} съедят`
        const fit = el('span', feedable.length > 0 ? 'feed-ok' : 'feed-no', fitLbl)
        row.append(fit)
        const btn = el('button', 'btn small', 'Покормить')
        btn.disabled = feedable.length === 0
        btn.addEventListener('click', () => {
          actions.onFeed(aq.id, fishId, entry.id)
          render()
        })
        row.append(btn)
        body.append(row)
      }
    }
    render()
  }

  function openFishDetailModal(s: GameState, aqId: string, fishId: string): void {
    const aq = allAquariums(s).find((a) => a.id === aqId)
    const fish = aq?.fish.find((f) => f.id === fishId)
    const species = fish && SPECIES_BY_ID[fish.speciesId]
    if (!aq || !fish || !species) return
    const rep = fishWellbeing(species, fish, aq)
    const { body } = overlay(`${species.name}`)
    body.append(
      el('div', 'list-title', 'Самочувствие'),
      el('div', 'well-total', `${Math.round(rep.wellbeing)}/100`),
    )
    const tag = el('span', 'welfare-tag', welfareLabel(rep))
    tag.classList.add('welfare', welfareClass(rep))
    const line = el('div', 'well-line')
    line.append(el('span', '', 'Общее состояние: '), tag)
    body.append(
      line,
      el('div', 'aq-line', `Рост/взросление: ${Math.round(fish.maturity * 100)}%`),
      el('div', 'aq-line', `Готовность к нересту: ${Math.round(fish.spawnReady)}%`),
      el('div', 'aq-line', rep.diseased ? 'Состояние: болеет' : 'Состояние: здоров'),
    )
    body.appendChild(el('div', 'list-title', 'Потребности'))
    for (const b of rep.bars) {
      const rowEl = el('div', 'need-row')
      const lbl = el('div', 'need-head')
      lbl.append(el('span', 'need-label', b.label), el('span', 'need-val', b.note))
      const barWrap = el('div', 'need-bar')
      const fill = el('div', 'need-fill')
      fill.style.width = `${b.score}%`
      fill.classList.add(b.status)
      barWrap.appendChild(fill)
      rowEl.append(lbl, barWrap)
      body.appendChild(rowEl)
    }
    const feed = el('button', 'btn', 'Покормить')
    feed.addEventListener('click', () => openFeedModal(s, aq.id, fish.id))
    body.appendChild(feed)
    const toStorage = el('button', 'btn danger', 'В склад')
    toStorage.addEventListener('click', () => actions.onMoveToStorage(aq.id, fish.id))
    body.appendChild(toStorage)
  }

  function openMaintenanceModal(s: GameState, aqId: string): void {
    const aq = allAquariums(s).find((a) => a.id === aqId)
    if (!aq) return
    const heater = aq.equipment.find((e) => e.id === 'heater')
    const lamp = aq.equipment.find((e) => e.id === 'light')
    const hasHeater = Boolean(heater)
    const hasLamp = Boolean(lamp)

    const curTemp = heater ? heater.settings.target ?? ROOM_TEMP : ROOM_TEMP
    const curLight = lamp ? lamp.settings.intensity ?? 0 : 0

    let newTemp = curTemp
    let newLight = curLight
    const refreshApply = () => {
      const tChanged = hasHeater && Math.abs(newTemp - curTemp) > 0.01
      const lChanged = hasLamp && Math.abs(newLight - curLight) > 0.01
      apply.disabled = !tChanged && !lChanged
    }

    const { body } = overlay(`Обслуживание: «${aq.name}»`)
    body.append(
      el('div', 'list-title', 'Условия воды'),
      el('div', 'aq-line', `Комнатная температура: ${ROOM_TEMP} °C`),
    )

    const tempSlider = slider('Температура', 15, 40, 0.5, curTemp, (v) => {
      newTemp = v
      refreshApply()
    })
    if (!hasHeater) {
      tempSlider.classList.add('slider-disabled')
      const inp = tempSlider.querySelector('input')
      if (inp) inp.disabled = true
    }
    const tempBlock = el('div', 'slider-block')
    tempBlock.append(tempSlider)
    body.append(tempBlock)
    if (!hasHeater) {
      body.append(el('div', 'comp-hint', 'Нет нагревателя — температуру регулировать нельзя. Без него вода стремится к комнаной.'))
    }

    const lightSlider = slider('Освещённость', 0, 100, 1, curLight, (v) => {
      newLight = v
      refreshApply()
    })
    if (!hasLamp) {
      lightSlider.classList.add('slider-disabled')
      const inp = lightSlider.querySelector('input')
      if (inp) inp.disabled = true
    }
    const lightBlock = el('div', 'slider-block')
    lightBlock.append(lightSlider)
    body.append(lightBlock)
    if (!hasLamp) {
      body.append(el('div', 'comp-hint', 'Нет светильника — освещённость регулировать нельзя.'))
    }

    const apply = el('button', 'btn', 'Применить')
    apply.addEventListener('click', () => {
      if (hasHeater && Math.abs(newTemp - curTemp) > 0.01) actions.onMaintain(aq.id, 'temp', newTemp)
      if (hasLamp && Math.abs(newLight - curLight) > 0.01) actions.onMaintain(aq.id, 'light', newLight)
    })
    refreshApply()
    body.append(apply)

    body.append(el('div', 'list-title', 'Работы'))
    const workList = el('div', 'comp-list')
    const jobs: [string, 'water' | 'bacteria' | 'clean'][] = [
      ['Подменить воду', 'water'],
      ['Добавить бактерии', 'bacteria'],
      ['Почистить фильтр', 'clean'],
    ]
    for (const [label, kind] of jobs) {
      const row = el('div', 'comp-row')
      const btn = el('button', 'btn small', 'Выполнить')
      btn.addEventListener('click', () => actions.onMaintain(aq.id, kind))
      row.append(el('span', 'comp-name', label), btn)
      workList.append(row)
    }
    body.append(workList)
  }

  let storageFilter = 'all'

  function renderRoomAside(state: GameState): void {
    roomAside.innerHTML = ''
    const room = ROOM_BY_ID[state.viewRoom]
    roomAside.append(el('h2', 'sec-title', `${room.icon} ${room.name}`))
    roomAside.append(el('div', 'store-desc', room.desc))
    if (state.viewRoom === 'storage') renderStorageAside(state)
    else if (state.viewRoom === 'hall') renderHallAside(state)
    else renderBreedingAside(state)
  }

  function renderHallAside(state: GameState): void {
    const shelves = state.shelves
    const aquariums = shelves.reduce((a, s) => a + s.aquariums.length, 0)
    const fish = shelves.reduce((a, s) => a + s.aquariums.reduce((b, q) => b + q.fish.length, 0), 0)
    const furn = state.shop.furniture
    const usedCells = roomShelvesTotalCells(state.shelves.filter((s) => s.roomId === state.viewRoom))
    const lines: [string, string][] = [
      ['Стоек', `${shelves.length} (ячейки ${usedCells}/${ROOM_SHELF_CELL_CAPACITY})`],
      ['Аквариумов', String(aquariums)],
      ['Рыб', String(fish)],
      ['Привлекательность', `${shopAttractiveness(state)}/100`],
      ['Витрин', String(furn.displayRack ?? 0)],
      ['Мебели', String((furn.coffeeTable ?? 0) + (furn.armchair ?? 0) + (furn.sofa ?? 0))],
      ['Продаж', String(state.sales)],
      ['Посетителей', String(state.totalVisitors)],
    ]
    const grid = el('div', 'aside-stats')
    for (const [k, v] of lines) {
      const row = el('div', 'aside-stat')
      row.append(el('span', 'aside-stat-k', k), el('span', 'aside-stat-v', v))
      grid.append(row)
    }
    roomAside.append(grid)
  }

  function renderBreedingAside(state: GameState): void {
    const here = state.shelves.filter((s) => s.roomId === 'breeding')
    const aquariums = here.reduce((a, s) => a + s.aquariums.length, 0)
    const fish = here.reduce((a, s) => a + s.aquariums.reduce((b, q) => b + q.fish.length, 0), 0)
    const grid = el('div', 'aside-stats')
    for (const [k, v] of [['Стоек', String(here.length)], ['Аквариумов', String(aquariums)], ['Рыб', String(fish)]] as const) {
      const row = el('div', 'aside-stat')
      row.append(el('span', 'aside-stat-k', k), el('span', 'aside-stat-v', v))
      grid.append(row)
    }
    roomAside.append(grid)
    roomAside.append(el('div', 'empty', 'Раздел «Разводня» в разработке.'))
  }

  function renderStorageAside(state: GameState): void {
    const cap = storageCapacity(state.racks.length)
    const used = storageUsed(state.shop)
    const summary = el('div', 'storage-summary')
    summary.append(el('span', 'storage-count', `Вместимость: ${cap} мест`))
    const bar = el('div', 'storage-bar')
    const fill = el('div', 'storage-bar-fill')
    fill.style.width = `${cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0}%`
    bar.append(fill)
    summary.append(bar)
    summary.append(el('span', 'storage-count', `Занято ${used} · свободно ${Math.max(0, cap - used)}`))
    roomAside.append(summary)

    const tabs = el('div', 'store-tabs')
    for (const [key, label] of [['all', 'Все'], ['fish', 'Рыбы'], ['food', 'Корма'], ['equip', 'Оборудование'], ['decor', 'Декор']] as const) {
      const b = el('button', key === storageFilter ? 'seg-btn active' : 'seg-btn', label)
      b.addEventListener('click', () => { storageFilter = key; renderRoomAside(state) })
      tabs.append(b)
    }
    roomAside.append(tabs)

    const list = el('div', 'rack-list')

    if (storageFilter === 'all' || storageFilter === 'fish') {
      const fishHead = el('div', 'list-title', 'Рыбы')
      list.append(fishHead)
      const tank = state.storage
      if (tank.stock.length === 0) list.append(el('div', 'empty', 'Нет рыб на складе.'))
      else {
        const groups = new Map<string, { count: number; minDays: number }>()
        for (const item of tank.stock) {
          const e = groups.get(item.speciesId) ?? { count: 0, minDays: Infinity }
          e.count += item.count
          e.minDays = Math.min(e.minDays, item.bagDays)
          groups.set(item.speciesId, e)
        }
        for (const [speciesId, g] of groups) {
          const species = SPECIES_BY_ID[speciesId]
          const f = state.market[speciesId] ?? 1
          const row = el('div', 'stock-row')
          const dot = el('span', 'dot')
          dot.style.background = species.color
          const btn = el('button', 'btn small', `Опт — ${wholesalePrice(species, f)}₽/шт`)
          btn.addEventListener('click', () => { actions.onWholesaleSell(speciesId); renderRoomAside(state) })
          row.append(dot, el('span', 'stock-name', `${species.name} — ${g.count} шт.`))
          row.append(el('span', g.minDays <= 1 ? 'live-warn' : 'badge', g.minDays === 0 ? 'гибнет сегодня!' : `в пакетах ${g.minDays} дн.`))
          row.append(btn)
          list.append(row)
        }
      }
    }

    if (storageFilter === 'all' || storageFilter === 'food') {
      const foodHead = el('div', 'list-title', 'Корма')
      list.append(foodHead)
      if (state.shop.fridge) list.append(el('div', 'feed-ok', 'Холодильник есть — живой корм хранится свой срок'))
      else list.append(el('div', 'live-warn', 'Нет холодильника — живой корм портится к концу дня'))
      const entries = foodStockEntries(state)
      if (entries.length === 0) list.append(el('div', 'empty', 'Нет корма.'))
      else for (const entry of entries) {
        const def = FOOD[entry.id]
        const fresh = freshnessLeft(entry, state.shop.fridge)
        const row = el('div', 'comp-row')
        row.append(el('span', 'comp-name', `${def.name} — ${entry.count} порций`))
        if (fresh != null) {
          const noFridge = def.kind === 'live' && !state.shop.fridge
          row.append(el('span', noFridge || fresh <= 1 ? 'live-warn' : 'badge', noFridge ? 'портится к концу дня (нет холодильника)' : fresh === 0 ? 'испортится сегодня' : `свежесть: ${fresh} дн.`))
        }
        list.append(row)
      }
    }

    if (storageFilter === 'all' || storageFilter === 'equip') {
      const eqHead = el('div', 'list-title', 'Оборудование')
      list.append(eqHead)
      const eq = new Map<EquipmentId, number>()
      for (const id of state.shop.rackInventory) eq.set(id, (eq.get(id) ?? 0) + 1)
      if (eq.size === 0) list.append(el('div', 'empty', 'Нет оборудования.'))
      else for (const [id, count] of eq) {
        const row = el('div', 'comp-row')
        row.append(el('span', 'comp-name', `${EQUIPMENT[id]?.name ?? id} ×${count}`))
        list.append(row)
      }
    }

    if (storageFilter === 'all' || storageFilter === 'decor') {
      const decHead = el('div', 'list-title', 'Декор')
      list.append(decHead)
      const dec = new Map<DecorKind, number>()
      for (const k of state.shop.rackDecor) dec.set(k, (dec.get(k) ?? 0) + 1)
      if (dec.size === 0) list.append(el('div', 'empty', 'Нет декора.'))
      else for (const [kind, count] of dec) {
        const row = el('div', 'comp-row')
        row.append(el('span', 'comp-name', `${DECOR[kind]?.name ?? kind} ×${count}`))
        list.append(row)
      }
    }

    roomAside.append(list)

    const buyRack = el('button', 'btn', `Купить стеллаж — ${STORAGE_TANK_PRICE}₽ (+${STORAGE_RACK_CAPACITY} мест)`)
    buyRack.disabled = state.money < STORAGE_TANK_PRICE || state.racks.length * STORAGE_RACK_CAPACITY >= STORAGE_MAX_SLOTS
    buyRack.addEventListener('click', () => {
      setStoreMode('furn')
      setStoreSection('equip')
      switchTab(app, 'store')
    })
    roomAside.append(buyRack)
  }

  let rackFilter = 'all'
  let rackSort = 'name'

  function renderRackList(state: GameState, onChanged?: () => void): HTMLElement {
    const list = el('div', 'rack-list')
    type Row = { label: string; price: number; count: number; kind: 'equip' | 'decor'; id: string }
    const rows: Row[] = []
    const eqCount = new Map<EquipmentId, number>()
    for (const eid of state.shop.rackInventory) eqCount.set(eid, (eqCount.get(eid) ?? 0) + 1)
    for (const [eid, count] of eqCount) {
      if (rackFilter !== 'all' && rackFilter !== 'equip' && rackFilter !== eid) continue
      const def = EQUIPMENT[eid]
      rows.push({ label: def.name, price: def.price, count, kind: 'equip', id: eid })
    }
    if (rackFilter === 'all' || rackFilter === 'decor') {
      const dec = new Map<DecorKind, number>()
      for (const k of state.shop.rackDecor) dec.set(k, (dec.get(k) ?? 0) + 1)
      for (const [kind, count] of dec) {
        rows.push({ label: DECOR[kind].name, price: DECOR[kind].price, count, kind: 'decor', id: kind })
      }
    }
    const by = (cmp: (a: Row, b: Row) => number) => rows.sort(cmp)
    if (rackSort === 'price') by((a, b) => a.price - b.price || a.label.localeCompare(b.label))
    else if (rackSort === 'priceDesc') by((a, b) => b.price - a.price || a.label.localeCompare(b.label))
    else if (rackSort === 'count') by((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    else by((a, b) => a.label.localeCompare(b.label))

    if (rows.length === 0) {
      list.append(el('div', 'empty', 'На полке ничего нет.'))
      return list
    }
    for (const row of rows) {
      const item = el('div', 'comp-row')
      item.append(el('span', 'comp-name', `${row.label} ×${row.count}`))
      const sell = el('button', 'btn small danger', `Продать (${Math.floor(row.price * 0.5)}₽)`)
      sell.addEventListener('click', () => {
        if (row.kind === 'equip') actions.onSellRackEquipment(row.id as EquipmentId)
        else actions.onSellRackDecor(row.id as DecorKind)
        onChanged?.()
      })
      const install = el('button', 'btn small', row.kind === 'equip' ? 'Установить' : 'Разместить')
      install.addEventListener('click', () => openRackInstallModal(state, row.kind, row.id as EquipmentId, row.id as DecorKind, onChanged))
      item.append(sell, install)
      list.append(item)
    }
    return list
  }

  function openRackInstallModal(s: GameState, kind: 'equip' | 'decor', eid: EquipmentId, dkind: DecorKind, onChanged?: () => void): void {
    const all = allAquariums(s)
    const { body, close } = overlay(kind === 'equip' ? 'Установить оборудование' : 'Разместить декор')
    if (all.length === 0) {
      body.append(el('div', 'empty', 'Нет аквариумов. Добавьте аквариум на стойку.'))
      return
    }
    body.append(el('div', 'comp-hint', kind === 'equip' ? 'Выберите аквариум для установки:' : 'Выберите аквариум для декора:'))
    for (const aq of all) {
      const row = el('div', 'modal-row')
      const sh = shelfOfAquarium(s, aq)
      const loc = sh ? `${ROOM_BY_ID[sh.roomId].icon} ${ROOM_BY_ID[sh.roomId].name}` : ''
      const name = el('strong', '', `${aq.name} (${aq.volume} л)`)
      const btn = el('button', 'btn small', kind === 'equip' ? 'Установить' : 'Разместить')
      btn.addEventListener('click', () => {
        if (kind === 'equip') actions.onInstallEquipment(eid, aq.id)
        else actions.onPlaceDecorFromRack(dkind, aq.id)
        close()
        onChanged?.()
      })
      row.append(name, el('span', 'comp-hint', [loc, kind === 'equip' ? 'без ограничений по слоту' : ''].filter(Boolean).join(' · ')), btn)
      body.append(row)
    }
  }

  function openFurnitureModal(state: GameState, id: FurnitureId): void {
    const def = FURNITURE[id]
    const { body } = overlay(def.name)
    const count = state.shop.furniture[id] ?? 0
    body.append(el('div', 'shop-desc', def.desc))
    body.append(el('div', 'comp-hint', `Куплено: ${count}`))
    if (def.attractBonus) body.append(el('div', 'comp-hint', `+${def.attractBonus} к привлекательности зала`))
    if (def.conversionBonus) body.append(el('div', 'comp-hint', `+${Math.round(def.conversionBonus * 100)}% к конверсии покупателей`))
    if (def.displaySlots) body.append(el('div', 'comp-hint', `Позиций для заказов: ${count * def.displaySlots}`))
    if (def.upkeep) body.append(el('div', 'comp-hint', `Содержание: ${def.upkeep * count}₽/день`))
    if (id === 'displayRack') {
      const btn = el('button', 'btn small', 'Открыть содержимое витрины')
      btn.addEventListener('click', () => openStorageModal(state))
      body.append(btn)
    }
  }

  function openStorageModal(state: GameState): void {
    const { body, close } = overlay('Хранение на складе')
    const hint = el('div', 'comp-hint')
    body.append(hint)

    const controlRow = el('div', 'rack-tools')
    const catSel = el('select')
    catSel.className = 'rack-filter'
    const CATS: { value: string; label: string }[] = [
      { value: 'all', label: 'Всё (оборудование и декор)' },
      { value: 'equip', label: 'Оборудование' },
      { value: 'decor', label: 'Декор' },
      ...EQUIPMENT_IDS.map((id) => ({ value: id, label: EQUIPMENT[id].name })),
    ]
    fillSelect(catSel, CATS, rackFilter)
    const sortSel = el('select')
    sortSel.className = 'rack-sort'
    const SORTS: { value: string; label: string }[] = [
      { value: 'name', label: 'Сорт: по имени' },
      { value: 'price', label: 'Сорт: по цене ↑' },
      { value: 'priceDesc', label: 'Сорт: по цене ↓' },
      { value: 'count', label: 'Сорт: по количеству' },
    ]
    fillSelect(sortSel, SORTS, rackSort)
    controlRow.append(catSel, sortSel)
    body.append(controlRow)

    const listWrap = el('div')
    body.append(listWrap)
    const render = (): void => {
      const used = storageUsed(state.shop)
      const cap = storageCapacity(state.racks.length)
      hint.textContent = `Занято ${used} из ${cap} мест · свободно ${Math.max(0, cap - used)}. Оборудование и декор доступны с любого стеллажа.`
      listWrap.innerHTML = ''
      listWrap.append(renderRackList(state, render))
    }
    catSel.addEventListener('change', () => {
      rackFilter = catSel.value
      render()
    })
    sortSel.addEventListener('change', () => {
      rackSort = sortSel.value
      render()
    })
    render()

    const goShop = el('button', 'btn small', 'Купить в магазине')
    goShop.addEventListener('click', () => {
      close()
      setStoreMode('sale')
      setStoreSection('equip')
      switchTab(app, 'store')
    })
    body.append(goShop)
  }

  function chip(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
    const b = el('button', active ? 'chip active' : 'chip', label)
    b.addEventListener('click', onClick)
    return b
  }

  function renderStoreControls(): void {
    storeControls.innerHTML = ''
    if (!latestState) return
    const top = el('div', 'store-controls-top')
    const search = el('input', 'store-search') as HTMLInputElement
    search.type = 'search'
    search.placeholder = 'Поиск…'
    search.value = storeSearch
    search.addEventListener('input', () => { storeSearch = search.value; renderStore(latestState) })
    top.append(search)

    const chipsRow = el('div', 'filter-chips')

    const isSale = activeStoreMode === 'sale'
    if (isSale && activeStoreSection === 'fish') {
      const sortSel = el('select')
      for (const [v, l] of [['name', 'Сортировка: имя'], ['price', 'Цена ↑'], ['priceDesc', 'Цена ↓'], ['appeal', 'Привлекательность'], ['size', 'Размер']] as const) {
        const o = el('option'); o.value = v; o.textContent = l; if (fishSort === v) o.selected = true; sortSel.append(o)
      }
      sortSel.addEventListener('change', () => { fishSort = sortSel.value; renderStore(latestState) })
      const groupSel = el('select')
      for (const [v, l] of [['none', 'Группировка: нет'], ['family', 'По семейству'], ['region', 'По региону']] as const) {
        const o = el('option'); o.value = v; o.textContent = l; if (fishGroup === v) o.selected = true; groupSel.append(o)
      }
      groupSel.addEventListener('change', () => { fishGroup = groupSel.value as typeof fishGroup; renderStore(latestState) })
      top.append(sortSel, groupSel)

      const fams = Array.from(new Set(FISH_SPECIES.map((f) => f.family))).sort()
      const regions = Array.from(new Set(FISH_SPECIES.map((f) => f.region))).sort()
      chipsRow.append(el('span', 'filter-label', 'Семейство:'))
      chipsRow.append(chip('Все', fishFamilyFilter === 'all', () => { fishFamilyFilter = 'all'; renderStore(latestState) }))
      for (const fam of fams) chipsRow.append(chip(fam, fishFamilyFilter === fam, () => { fishFamilyFilter = fam; renderStore(latestState) }))
      chipsRow.append(el('span', 'filter-label', 'Регион:'))
      chipsRow.append(chip('Все', fishRegionFilter === 'all', () => { fishRegionFilter = 'all'; renderStore(latestState) }))
      for (const r of regions) chipsRow.append(chip(r, fishRegionFilter === r, () => { fishRegionFilter = r; renderStore(latestState) }))
    } else if (isSale && activeStoreSection === 'decor') {
      const sortSel = el('select')
      for (const [v, l] of [['price', 'Сортировка: цена'], ['priceDesc', 'Цена ↓'], ['appeal', 'Привлекательность'], ['name', 'Имя']] as const) {
        const o = el('option'); o.value = v; o.textContent = l; if (decorSort === v) o.selected = true; sortSel.append(o)
      }
      sortSel.addEventListener('change', () => { decorSort = sortSel.value; renderStore(latestState) })
      top.append(sortSel)
      const groups = Array.from(new Set(DECOR_KINDS.map((k) => DECOR[k].group))).sort()
      chipsRow.append(el('span', 'filter-label', 'Группа:'))
      chipsRow.append(chip('Все', decorGroupFilter === 'all', () => { decorGroupFilter = 'all'; renderStore(latestState) }))
      for (const g of groups) chipsRow.append(chip(g, decorGroupFilter === g, () => { decorGroupFilter = g; renderStore(latestState) }))
    } else if (isSale && activeStoreSection === 'equip') {
      const sortSel = el('select')
      for (const [v, l] of [['price', 'Сортировка: цена'], ['priceDesc', 'Цена ↓'], ['power', 'Мощность'], ['name', 'Имя']] as const) {
        const o = el('option'); o.value = v; o.textContent = l; if (equipSort === v) o.selected = true; sortSel.append(o)
      }
      sortSel.addEventListener('change', () => { equipSort = sortSel.value; renderStore(latestState) })
      top.append(sortSel)
      chipsRow.append(el('span', 'filter-label', 'Категория:'))
      chipsRow.append(chip('Все', equipCatFilter === 'all', () => { equipCatFilter = 'all'; renderStore(latestState) }))
      for (const key of Object.keys(EQUIP_CATEGORY_LABEL)) chipsRow.append(chip(EQUIP_CATEGORY_LABEL[key], equipCatFilter === key, () => { equipCatFilter = key; renderStore(latestState) }))
    } else if (isSale && activeStoreSection === 'food') {
      const sortSel = el('select')
      for (const [v, l] of [['price', 'Сортировка: цена'], ['priceDesc', 'Цена ↓'], ['portions', 'Порций в банке'], ['satiety', 'Сытость'], ['name', 'Имя']] as const) {
        const o = el('option'); o.value = v; o.textContent = l; if (foodSort === v) o.selected = true; sortSel.append(o)
      }
      sortSel.addEventListener('change', () => { foodSort = sortSel.value; renderStore(latestState) })
      top.append(sortSel)
      chipsRow.append(el('span', 'filter-label', 'Тип:'))
      chipsRow.append(chip('Все', foodKindFilter === 'all', () => { foodKindFilter = 'all'; renderStore(latestState) }))
      chipsRow.append(chip('Сухие', foodKindFilter === 'dry', () => { foodKindFilter = 'dry'; renderStore(latestState) }))
      chipsRow.append(chip('Живые', foodKindFilter === 'live', () => { foodKindFilter = 'live'; renderStore(latestState) }))
      chipsRow.append(el('span', 'filter-label', 'Размер:'))
      chipsRow.append(chip('Все', foodSizeFilter === 'all', () => { foodSizeFilter = 'all'; renderStore(latestState) }))
      chipsRow.append(chip('Мелкий', foodSizeFilter === 'small', () => { foodSizeFilter = 'small'; renderStore(latestState) }))
      chipsRow.append(chip('Средний', foodSizeFilter === 'medium', () => { foodSizeFilter = 'medium'; renderStore(latestState) }))
      chipsRow.append(chip('Крупный', foodSizeFilter === 'large', () => { foodSizeFilter = 'large'; renderStore(latestState) }))
    } else {
      const sortSel = el('select')
      for (const [v, l] of [['price', 'Сортировка: цена'], ['name', 'Имя']] as const) {
        const o = el('option'); o.value = v; o.textContent = l; if (furnSort === v) o.selected = true; sortSel.append(o)
      }
      sortSel.addEventListener('change', () => { furnSort = sortSel.value; renderStore(latestState) })
      top.append(sortSel)
    }

    storeControls.append(top)
    if (chipsRow.childNodes.length > 0) storeControls.append(chipsRow)
  }

  function renderStore(state: GameState): void {
    renderStoreControls()
    storeGrid.innerHTML = ''
    storeFishDetail.innerHTML = ''
    equipStore.innerHTML = ''
    decorStore.innerHTML = ''
    foodStore.innerHTML = ''

    renderStoreFish(state)
    renderStoreDecor(state)
    renderStoreEquip(state)
    renderStoreFood(state)
    renderFurnStore(state)
  }

  function renderStoreFish(state: GameState): void {
    let items = FISH_SPECIES.map((species) => ({ species, factor: state.market[species.id] ?? 1 }))
    const q = storeSearch.trim().toLowerCase()
    if (q) items = items.filter(({ species }) => species.name.toLowerCase().includes(q) || species.latin.toLowerCase().includes(q))
    if (fishFamilyFilter !== 'all') items = items.filter(({ species }) => species.family === fishFamilyFilter)
    if (fishRegionFilter !== 'all') items = items.filter(({ species }) => species.region === fishRegionFilter)
    const cmp: Record<string, (a: { species: FishSpecies; factor: number }, b: { species: FishSpecies; factor: number }) => number> = {
      name: (a, b) => a.species.name.localeCompare(b.species.name, 'ru'),
      price: (a, b) => buyPrice(a.species, a.factor) - buyPrice(b.species, b.factor),
      priceDesc: (a, b) => buyPrice(b.species, b.factor) - buyPrice(a.species, a.factor),
      appeal: (a, b) => a.species.appeal - b.species.appeal,
      size: (a, b) => a.species.sizeCm - b.species.sizeCm,
    }
    items.sort(cmp[fishSort] ?? cmp.name)

    const byGroup = fishGroup === 'family' ? 'family' : fishGroup === 'region' ? 'region' : null

    // Левый столбец: список рыб (только наименования).
    storeGrid.innerHTML = ''
    let lastKey: string | null = null
    const orderTotal = (id: string): number =>
      state.purchases.filter((p) => p.speciesId === id).reduce((a, p) => a + p.qty, 0)
    if (items.length === 0) {
      storeGrid.append(el('div', 'store-empty', 'Ничего не найдено'))
    }
    for (const { species } of items) {
      const key = byGroup ? species[byGroup] : null
      if (byGroup && key !== lastKey) {
        lastKey = key
        storeGrid.append(el('div', 'grid-group-head', byGroup === 'family' ? `${species.family} — семейство` : species.region))
      }
      const row = el('button', selectedFishId === species.id ? 'store-fish-item active' : 'store-fish-item')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const nameEl = el('span', 'store-name', species.name)
      row.append(dot, nameEl)
      const inTransit = orderTotal(species.id)
      if (inTransit > 0) row.append(el('span', 'badge in-transit', `✈ ${inTransit}`))
      row.addEventListener('click', () => {
        selectedFishId = species.id
        purchaseQty = 1
        renderStore(state)
      })
      storeGrid.append(row)
    }

    // Правый столбец: описание + форма заказа.
    storeFishDetail.innerHTML = ''
    const sel = items.find(({ species }) => species.id === selectedFishId)
    if (!sel) {
      storeFishDetail.append(el('div', 'store-empty', items.length ? 'Выберите рыбу из списка слева' : 'Ничего не найдено'))
      return
    }
    const { species, factor } = sel
    const unit = buyPrice(species, factor)
    const maxAffordable = Math.max(0, Math.floor(state.money / unit))
    if (purchaseQty > maxAffordable && maxAffordable >= 1) purchaseQty = maxAffordable
    const total = unit * purchaseQty
    const inTransit = orderTotal(species.id)
    const firstArrive = inTransit > 0
      ? Math.min(...state.purchases.filter((p) => p.speciesId === species.id).map((p) => p.arriveDay))
      : null

    const head = el('div', 'store-head')
    const dot = el('span', 'dot')
    dot.style.background = species.color
    head.append(dot, el('strong', 'store-name', species.name))
    const badges = el('div', 'store-badges')
    badges.append(el('span', 'badge', species.family), el('span', 'badge', species.region), demandBadge(factor))
    storeFishDetail.append(
      head,
      el('div', 'store-latin', species.latin),
      badges,
      el('div', 'store-params', [
        `${species.sizeCm} см · мин. ${species.minVolume} л`,
        `t ${species.tempMin}–${species.tempMax} °C · pH ${species.phMin}–${species.phMax} · GH ${species.ghMin}–${species.ghMax} °dH`,
        `O₂ ${species.o2Min}–${species.o2Max}% · свет ${species.lightMin}–${species.lightMax}%`,
      ].join(' · ')),
    )
    const prices = el('div', 'store-prices')
    prices.append(
      el('span', '', `Закупка: ${unit}₽ / шт`),
      el('span', 'sell-hint', `Розница ${retailPrice(species, factor)}₽ · опт ${wholesalePrice(species, factor)}₽`),
    )
    storeFishDetail.append(prices)
    if (inTransit > 0) storeFishDetail.append(el('div', 'feed-ok', `В пути: ${inTransit} · День ${firstArrive}`))

    const form = el('div', 'order-form')
    form.append(el('div', 'list-title', 'Заказ у поставщика'))
    form.append(el('div', 'comp-hint', 'Оплата сейчас, рыба прибудет на склад в пакетах на следующий день.'))

    const qtyRow = el('div', 'order-qty-row')
    const qtyInput = el('input') as HTMLInputElement
    if (maxAffordable >= 1) {
      qtyInput.type = 'number'
      qtyInput.min = '1'
      qtyInput.max = String(maxAffordable)
      qtyInput.value = String(purchaseQty)
    } else {
      qtyInput.type = 'number'
      qtyInput.min = '1'
      qtyInput.max = '1'
      qtyInput.value = '1'
      qtyInput.disabled = true
    }
    qtyInput.className = 'count-input'
    qtyRow.append(el('span', 'qty-label', 'Количество'), qtyInput)
    form.append(qtyRow)

    const slider = el('input') as HTMLInputElement
    slider.type = 'range'
    slider.min = '1'
    slider.max = String(Math.max(1, maxAffordable))
    slider.step = '1'
    slider.value = String(Math.max(1, Math.min(purchaseQty, Math.max(1, maxAffordable))))
    slider.className = 'order-slider'
    if (maxAffordable < 1) slider.disabled = true

    const totalEl = el('div', 'order-total', `Итого: ${total}₽`)
    const orderBtn = el('button', 'btn buy', `Заказать ${purchaseQty} шт — ${total}₽`)
    orderBtn.disabled = purchaseQty < 1 || state.money < total
    orderBtn.title = 'Прибудет на склад в пакетах на следующий день'
    orderBtn.addEventListener('click', () => actions.onOrderFromSupplier(species.id, purchaseQty))

    const sync = (): void => {
      let n = Number(qtyInput.value) || 1
      n = Math.max(1, Math.min(n, maxAffordable))
      purchaseQty = n
      slider.value = String(n)
      qtyInput.value = String(n)
      totalEl.textContent = `Итого: ${unit * n} ₽`
      orderBtn.textContent = `Заказать ${n} шт — ${unit * n}₽`
      orderBtn.disabled = state.money < unit * n
    }
    qtyInput.addEventListener('input', sync)
    slider.addEventListener('input', () => { qtyInput.value = slider.value; sync() })

    form.append(slider, totalEl)
    if (maxAffordable < 1) form.append(storeReason(`Не хватает денег даже на 1 шт: нужно ${unit}₽`))
    form.append(orderBtn)
    storeFishDetail.append(form)
  }

  function renderStoreDecor(state: GameState): void {
    let items = DECOR_KINDS.map((kind) => ({ kind, def: DECOR[kind] }))
    const q = storeSearch.trim().toLowerCase()
    if (q) items = items.filter(({ def }) => def.name.toLowerCase().includes(q))
    if (decorGroupFilter !== 'all') items = items.filter(({ def }) => def.group === decorGroupFilter)
    const cmp: Record<string, (a: { def: DecorDef }, b: { def: DecorDef }) => number> = {
      price: (a, b) => a.def.price - b.def.price,
      priceDesc: (a, b) => b.def.price - a.def.price,
      appeal: (a, b) => a.def.attract - b.def.attract,
      name: (a, b) => a.def.name.localeCompare(b.def.name, 'ru'),
    }
    items.sort(cmp[decorSort] ?? cmp.price)
    for (const { kind, def } of items) {
      const card = el('div', 'store-card')
      const head = el('div', 'store-head')
      head.append(el('strong', 'store-name', def.name), el('span', 'badge', def.group))
      card.append(
        head,
        el('div', 'store-desc', def.desc),
        (() => {
          const p = el('div', 'store-prices')
          p.append(el('span', '', `Привлекательность: +${def.attract}`))
          return p
        })(),
      )
      const btn = el('button', 'btn buy', `Купить в склад — ${def.price}₽`)
      const noMoney = state.money < def.price
      const storageFull = storageUsed(state.shop) >= storageCapacity(state.racks.length)
      btn.disabled = noMoney || storageFull
      btn.addEventListener('click', () => actions.onBuyDecor(kind))
      card.append(btn)
      if (noMoney) card.append(storeReason(`Не хватает денег: нужно ${def.price}₽`))
      else if (storageFull) card.append(storeReason(storageFullReason(state.racks.length, state.shop)))
      decorStore.append(card)
    }
    if (items.length === 0) decorStore.append(el('div', 'store-empty', 'Ничего не найдено'))
  }

  function renderStoreEquip(state: GameState): void {
    let ids = EQUIPMENT_IDS as EquipmentId[]
    const q = storeSearch.trim().toLowerCase()
    if (q) ids = ids.filter((eid) => EQUIPMENT[eid].name.toLowerCase().includes(q))
    if (equipCatFilter !== 'all') ids = ids.filter((eid) => EQUIPMENT[eid].category === equipCatFilter)
    const cmp: Record<string, (a: EquipmentId, b: EquipmentId) => number> = {
      price: (a, b) => EQUIPMENT[a].price - EQUIPMENT[b].price,
      priceDesc: (a, b) => EQUIPMENT[b].price - EQUIPMENT[a].price,
      power: (a, b) => EQUIPMENT[a].power - EQUIPMENT[b].power,
      name: (a, b) => EQUIPMENT[a].name.localeCompare(EQUIPMENT[b].name, 'ru'),
    }
    ids.sort(cmp[equipSort] ?? cmp.price)
    for (const eid of ids) {
      const def = EQUIPMENT[eid]
      const owned = state.shop.rackInventory.filter((c) => c === eid).length
      const card = el('div', 'store-card')
      const head2 = el('div', 'store-head')
      head2.append(el('strong', 'store-name', def.name), el('span', 'badge', EQUIP_CATEGORY_LABEL[def.category] ?? def.category))
      card.append(
        head2,
        el('div', 'store-desc', def.desc),
        (() => {
          const p = el('div', 'store-prices')
          p.append(el('span', '', def.power > 0 ? `Мощность: ${def.power} Вт` : ''), el('span', '', `На складе: ${owned}`))
          return p
        })(),
      )
      const btn = el('button', 'btn buy', `Купить в склад — ${def.price}₽`)
      const noMoney = state.money < def.price
      const storageFull = storageUsed(state.shop) >= storageCapacity(state.racks.length)
      btn.disabled = noMoney || storageFull
      btn.addEventListener('click', () => actions.onBuyEquipment(eid))
      card.append(btn)
      if (noMoney) card.append(storeReason(`Не хватает денег: нужно ${def.price}₽`))
      else if (storageFull) card.append(storeReason(storageFullReason(state.racks.length, state.shop)))
      equipStore.append(card)
    }
    if (ids.length === 0) equipStore.append(el('div', 'store-empty', 'Ничего не найдено'))
  }

  function renderStoreFood(state: GameState): void {
    let ids = FOOD_IDS
    const q = storeSearch.trim().toLowerCase()
    if (q) ids = ids.filter((id) => FOOD[id].name.toLowerCase().includes(q))
    if (foodKindFilter !== 'all') ids = ids.filter((id) => FOOD[id].kind === foodKindFilter)
    if (foodSizeFilter !== 'all') ids = ids.filter((id) => FOOD[id].size === foodSizeFilter)
    const cmp: Record<string, (a: FoodId, b: FoodId) => number> = {
      price: (a, b) => FOOD[a].price - FOOD[b].price,
      priceDesc: (a, b) => FOOD[b].price - FOOD[a].price,
      portions: (a, b) => FOOD[a].jarPortions - FOOD[b].jarPortions,
      satiety: (a, b) => FOOD[a].satiety - FOOD[b].satiety,
      name: (a, b) => FOOD[a].name.localeCompare(FOOD[b].name, 'ru'),
    }
    ids.sort(cmp[foodSort] ?? cmp.price)
    for (const id of ids) {
      const def = FOOD[id]
      const owned = foodPortions(state, id)
      const card = el('div', 'store-card')
      const head = el('div', 'store-head')
      head.append(
        el('strong', 'store-name', def.name),
        el('span', 'badge', FOOD_KIND_LABEL[def.kind]),
        el('span', 'badge', `Размер: ${FOOD_SIZE_LABEL[def.size]}`),
      )
      const dietLbl = def.diets === 'all' ? 'все диеты' : def.diets.map((d) => DIET_LABEL[d]).join(', ')
      card.append(
        head,
        el('div', 'store-desc', def.desc),
        (() => {
          const p = el('div', 'store-prices')
          p.append(el('span', '', `Порций в банке: ${def.jarPortions} · сытость: +${def.satiety}`))
          if (def.kind === 'live' && def.shelfLifeDays != null) {
            if (state.shop.fridge) p.append(el('span', 'badge', `В холодильнике хранится ${def.shelfLifeDays} дн.`))
            else p.append(el('span', 'live-warn', `Без холодильника испортится к концу дня (в холоде — ${def.shelfLifeDays} дн.)`))
          }
          return p
        })(),
        el('div', 'store-params', `Подходит: ${dietLbl}`),
      )
      const btn = el('button', 'btn buy', `Купить банку — ${def.price}₽`)
      const noMoney = state.money < def.price
      btn.disabled = noMoney
      btn.addEventListener('click', () => actions.onBuyFood(id))
      card.append(btn)
      if (noMoney) card.append(storeReason(`Не хватает денег: нужно ${def.price}₽`))
      else if (owned > 0) card.append(el('div', 'feed-ok', `На складе: ${owned} порций`))
      if (def.kind === 'live' && !state.shop.fridge) card.append(storeReason('Нет холодильника — купите его в «Обустройство → Оснащение»'))
      foodStore.append(card)
    }
    if (ids.length === 0) foodStore.append(el('div', 'store-empty', 'Ничего не найдено'))
  }

  function openBuyRoomModal(title: string, action: (roomId: RoomId) => void, canPlaceIn?: (roomId: RoomId) => boolean): void {
    const { body, close } = overlay(title)
    body.append(el('div', 'comp-hint', 'Выберите помещение, где разместить объект:'))
    for (const r of ROOMS) {
      const fits = canPlaceIn ? canPlaceIn(r.id) : true
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', fits ? 'Разместить здесь' : 'Нет места')
      btn.disabled = !fits
      btn.addEventListener('click', () => { action(r.id); close() })
      row.append(
        el('strong', '', `${r.icon} ${r.name}`),
        el('span', 'shop-desc', fits ? r.desc : `${r.desc} · помещение заполнено`),
        btn,
      )
      body.append(row)
    }
  }

  function renderFurnStore(state: GameState): void {
    const shop = state.shop
    furnShelves.innerHTML = ''
    for (const specId of Object.keys(SHELVES)) {
      const spec = SHELVES[specId as keyof typeof SHELVES]
      const card = el('div', 'store-card')
      card.append(
        el('strong', 'store-name', spec.name),
        el('div', 'store-desc', `${spec.slabs.length} полки · до ${spec.loadCapacityL} л`),
      )
      const btn = el('button', 'btn buy', `Купить и разместить — ${spec.price}₽`)
      const noMoney = state.money < spec.price
      btn.disabled = noMoney
      btn.addEventListener('click', () => openBuyRoomModal(`Купить стойку «${spec.name}»`, (roomId) => actions.onBuyShelf(specId, roomId), (roomId) => {
        const inRoom = state.shelves.filter((x) => x.roomId === roomId)
        return roomShelvesTotalCells(inRoom) + (inRoom.length ? 1 : 0) + shelfCellSize(spec) <= ROOM_SHELF_CELL_CAPACITY
      }))
      card.append(btn)
      if (noMoney) card.append(storeReason(`Не хватает денег: нужно ${spec.price}₽`))
      furnShelves.append(card)
    }

    furnEquip.innerHTML = ''
    const regCard = el('div', 'store-card')
    regCard.append(
      el('strong', 'store-name', 'Касса'),
      el('div', 'store-desc', shop.cashRegister ? 'Установлена — покупатели приходят чаще' : 'Ускоряет приход покупателей'),
    )
    if (!shop.cashRegister) {
      const regBtn = el('button', 'btn buy', 'Купить — 300₽')
      const noMoney = state.money < 300
      regBtn.disabled = noMoney
      regBtn.addEventListener('click', () => actions.onBuyShopItem('cashRegister'))
      regCard.append(regBtn)
      if (noMoney) regCard.append(storeReason('Не хватает денег: нужно 300₽'))
    }
    furnEquip.append(regCard)

    const rackCard = el('div', 'store-card')
    rackCard.append(
      el('strong', 'store-name', `Стеллаж ×${state.racks.length}`),
      el('div', 'store-desc', `Хранит оборудование и декор: занято ${storageUsed(shop)} из ${storageCapacity(state.racks.length)} мест (+${STORAGE_RACK_CAPACITY} за стеллаж)`),
    )
    const rackBtn = el('button', 'btn buy', `Купить и разместить — ${STORAGE_TANK_PRICE}₽`)
    const rackFull = state.racks.length * STORAGE_RACK_CAPACITY >= STORAGE_MAX_SLOTS
    const noMoneyRack = state.money < STORAGE_TANK_PRICE
    rackBtn.disabled = noMoneyRack || rackFull
    rackBtn.addEventListener('click', () => openBuyRoomModal('Купить стеллаж', (roomId) => actions.onBuyRack(roomId)))
    rackCard.append(rackBtn)
    if (rackFull) rackCard.append(storeReason(`Достигнут предел вместимости склада (${STORAGE_MAX_SLOTS} мест)`))
    else if (noMoneyRack) rackCard.append(storeReason(`Не хватает денег: нужно ${STORAGE_TANK_PRICE}₽`))
    furnEquip.append(rackCard)

    const dcount = furnitureCount(shop, 'displayRack')
    const displayCard = el('div', 'store-card')
    displayCard.append(
      el('strong', 'store-name', `Витрина ×${dcount}`),
      el('div', 'store-desc', 'Показывает покупателям наличие товаров со склада (вместимость склада не увеличивает)'),
    )
    const displayBtn = el('button', 'btn buy', 'Купить — 700₽')
    const noMoneyDisplay = state.money < 700
    displayBtn.disabled = noMoneyDisplay
    displayBtn.addEventListener('click', () => actions.onBuyFurniture('displayRack'))
    displayCard.append(displayBtn)
    if (noMoneyDisplay) displayCard.append(storeReason('Не хватает денег: нужно 700₽'))
    furnEquip.append(displayCard)

    const fridgeCard = el('div', 'store-card')
    fridgeCard.append(
      el('strong', 'store-name', shop.fridge ? 'Холодильник' : 'Холодильник для корма'),
      el('div', 'store-desc', shop.fridge ? 'Установлен — живой корм хранится свой срок годности' : 'Хранит живой корм: без него артемия/мотыль/дафния портятся к концу дня'),
    )
    if (!shop.fridge) {
      const fridgeBtn = el('button', 'btn buy', 'Купить — 250₽')
      const noMoneyFridge = state.money < 250
      fridgeBtn.disabled = noMoneyFridge
      fridgeBtn.addEventListener('click', () => actions.onBuyShopItem('fridge'))
      fridgeCard.append(fridgeBtn)
      if (noMoneyFridge) fridgeCard.append(storeReason('Не хватает денег: нужно 250₽'))
    }
    furnEquip.append(fridgeCard)

    furnFurn.innerHTML = ''
    for (const id of FURNITURE_IDS) {
      if (id === 'displayRack') continue
      const def = FURNITURE[id]
      const n = furnitureCount(shop, id)
      const card = el('div', 'store-card')
      card.append(
        el('strong', 'store-name', `${def.name} ×${n}`),
        el('div', 'store-desc', def.desc),
      )
      const btn = el('button', 'btn buy', `Купить — ${def.price}₽`)
      const noMoneyF = state.money < def.price
      btn.disabled = noMoneyF
      btn.addEventListener('click', () => actions.onBuyFurniture(id))
      card.append(btn)
      if (noMoneyF) card.append(storeReason(`Не хватает денег: нужно ${def.price}₽`))
      furnFurn.append(card)
    }

    furnAq.innerHTML = ''
    for (const model of AQUARIUM_MODELS) {
      const canPlace = state.shelves.some((shelf) => maxFitOnShelf(shelf, model) > 0)
      const card = el('div', 'store-card')
      card.append(
        el('strong', 'store-name', model.name),
        el('div', 'store-desc', `${model.w}×${model.d}×${model.h} см, ${model.volume} л — ${model.price}₽/шт`),
      )
      const btn = el('button', 'btn buy', 'Купить — ' + model.price + '₽/шт')
      btn.disabled = !canPlace
      btn.addEventListener('click', () => openBuyAquariumModal(state, model))
      card.append(btn)
      if (!canPlace) {
        card.append(storeReason('Нет стоек со свободной подходящей полкой'))
        card.append(storeReason('Сначала купите и разместите стойку в «Помещениях»'))
      }
      furnAq.append(card)
    }
  }

  return { update, flash, selectTab: (tab: TabName) => switchTab(app, tab), openShelfMenu: (id: string) => openShelfMenu(id, latestState), openStorageModal: () => openStorageModal(latestState), openFurnitureModal: (id: FurnitureId) => openFurnitureModal(latestState, id) }
}

function switchTab(app: HTMLElement, tab: TabName): void {
  app.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab))
  app.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`))
}

function setupTabs(app: HTMLElement): void {
  app.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    const tab = btn.dataset.tab
    if (!tab || btn.classList.contains('disabled')) return
    btn.addEventListener('click', () => switchTab(app, tab as TabName))
  })
}

function tabButton(name: TabName, label: string, active: boolean): HTMLButtonElement {
  const btn = el('button', 'tab-btn')
  btn.textContent = label
  btn.dataset.tab = name
  if (active) btn.classList.add('active')
  return btn
}

function segBtn(store: string, label: string): HTMLButtonElement {
  const btn = el('button', 'seg-btn')
  btn.textContent = label
  btn.dataset.store = store
  return btn
}

function modeBtn(mode: 'sale' | 'furn', label: string): HTMLButtonElement {
  const btn = el('button', 'seg-btn')
  btn.textContent = label
  btn.dataset.mode = mode
  return btn
}

function buildLayout(): HTMLElement {
  const game = el('div', 'game')

  const header = el('header', 'hud')
  const left = el('div', 'hud-left')
  left.append(el('span', 'hud-money', 'Деньги: —'), el('span', 'hud-day', 'День —'))
  const progress = el('div', 'day-progress')
  progress.append(el('div', 'day-progress-fill'))
  left.append(progress)
  left.append(
    el('span', 'hud-att', 'Привлекательность: —'),
    el('span', 'hud-visitors', 'Заказов: —'),
    el('span', 'hud-sales', 'Продаж: —'),
  )
  const right = el('div', 'hud-right')
  const timeControl = el('div', 'time-control')
  timeControl.append(el('button', 'btn small btn-pause', '⏸'))
  for (const speed of [1, 2, 3, 5]) {
    const b = el('button', 'btn small btn-speed', `${speed}x`)
    b.dataset.speed = String(speed)
    timeControl.append(b)
  }
  right.append(timeControl)
  right.append(el('button', 'btn small btn-reset', 'Сброс'))
  header.append(left, right)

  const nav = el('nav', 'tabs')
  nav.append(
    tabButton('zal', 'Помещения', true),
    tabButton('aquarium', 'Аквариум', false),
    tabButton('store', 'Магазин', false),
    tabButton('orders', 'Заказы', false),
    el('button', 'tab-btn disabled', 'Опт'),
    el('button', 'tab-btn disabled', 'Сервис'),
  )

  const main = el('main', 'main')

  const zalTab = el('section', 'tab active')
  zalTab.id = 'tab-zal'
  const roomLayout = el('div', 'room-layout')
  const roomStage = el('div', 'room-stage')
  roomStage.append(
    el('div', 'room-switch'),
    buildHallCanvas(),
    el('button', 'order-banner', ''),
    el('h2', 'sec-title', 'Управление стойками'),
    el('div', 'hall-actions'),
  )
  const roomAside = el('aside', 'room-aside')
  roomLayout.append(roomStage, roomAside)
  zalTab.append(roomLayout)

  const ordersTab = el('section', 'tab')
  ordersTab.id = 'tab-orders'
  ordersTab.append(
    el('div', 'orders-panel'),
  )

  const aquariumTab = el('section', 'tab')
  aquariumTab.id = 'tab-aquarium'
  aquariumTab.classList.add('aq-tab')
  const aqLayout = el('div', 'room-layout')
  const aqStage = el('div', 'room-stage')
  const aqBar = el('div', 'tank-bar')
  aqBar.append(el('label', '', 'Аквариум: '))
  const aquariumSelect = el('select')
  aquariumSelect.id = 'aquariumSelect'
  const aquariumAtt = el('span', '', '')
  aquariumAtt.id = 'aquariumAtt'
  aqBar.append(aquariumSelect, el('span', '', ' · '), aquariumAtt)
  aqStage.append(aqBar)
  const aqStageWrap = el('div', 'aq-stage')
  const canvas = el('canvas')
  canvas.id = 'tank'
  canvas.width = 960
  canvas.height = 420
  aqStageWrap.append(canvas)
  aqStage.append(aqStageWrap)
  const aqActions = el('div', 'aq-actions')
  aqStage.append(aqActions)
  const aqInfo = el('aside', 'room-aside aq-info')
  aqInfo.append(el('h3', '', 'Состояние'))
  aqLayout.append(aqStage, aqInfo)
  aquariumTab.append(aqLayout)

  const storeTab = el('section', 'tab')
  storeTab.id = 'tab-store'
  const storeMode = el('div', 'store-mode')
  storeMode.append(modeBtn('sale', 'Для продажи'), modeBtn('furn', 'Обустройство'))

  const saleGroup = el('div', 'store-group')
  saleGroup.dataset.group = 'sale'
  const storeTabs = el('div', 'store-tabs')
  storeTabs.append(
    segBtn('fish', 'Рыбы'),
    segBtn('decor', 'Декор'),
    segBtn('equip', 'Оборудование'),
    segBtn('food', 'Корм'),
  )
  const fishStore = el('div', 'store-fish-layout')
  const storeFishList = el('div', 'store-fish-list')
  const storeFishDetail = el('div', 'store-fish-detail')
  fishStore.append(storeFishList, storeFishDetail)
  const decorStore = el('div', 'decor-store')
  const equipStore = el('div', 'equip-store')
  const foodStore = el('div', 'decor-store food-store')
  saleGroup.append(storeTabs, fishStore, decorStore, equipStore, foodStore)

  const furnGroup = el('div', 'store-group')
  furnGroup.dataset.group = 'furn'
  const furnTabs = el('div', 'store-tabs')
  furnTabs.append(
    segBtn('shelves', 'Стойки'),
    segBtn('equip', 'Оснащение'),
    segBtn('furn', 'Мебель'),
    segBtn('aquariums', 'Аквариумы'),
  )
  const furnShelves = el('div', 'store-grid furn-shelves')
  const furnEquip = el('div', 'decor-store furn-equip')
  const furnFurn = el('div', 'decor-store furn-furn')
  const furnAq = el('div', 'decor-store furn-aq')
  furnGroup.append(furnTabs, furnShelves, furnEquip, furnFurn, furnAq)

  const storeControls = el('div', 'store-controls')

  storeTab.append(storeMode, storeControls, saleGroup, furnGroup)

  main.append(zalTab, aquariumTab, storeTab, ordersTab)

  const footer = el('footer', 'log-panel')
  const footHead = el('div', 'log-head')
  footHead.append(el('h3', '', 'Журнал событий'), el('span', 'version-badge', `v${VERSION}`))
  footer.append(footHead)
  footer.append(el('ul', 'log-list'))

  game.append(header, nav, main, footer, el('div', 'hud-flash'))
  return game
}