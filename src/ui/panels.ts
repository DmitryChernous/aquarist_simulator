import { FISH_SPECIES, SPECIES_BY_ID } from '../data/fish'
import { MAX_DESIGN_LEVEL, AQUARIUM_MODELS, designUpgradeCost } from '../data/aquarium'
import { EQUIPMENT, EQUIPMENT_IDS, EQUIPMENT_SLOTS_PER_RACK, SHELVES, fitsOnSlab, shelfLoadLeft, shelfUsedLiters, storageCapacity, storageUsed } from '../data/shop'
import { DECOR, DECOR_KINDS } from '../data/decor'
import { ROOMS, ROOM_BY_ID } from '../data/rooms'
import { FURNITURE, FURNITURE_IDS, displayCapacity, furnitureCount } from '../data/furniture'
import { tankAttractiveness } from '../sim/buyers'
import { availableStock, buyPrice, decorStock, equipmentStock, retailPrice, stockTotal, wholesalePrice } from '../sim/economy'
import { canStock, vegetationOf, ROOM_TEMP, shelfOfAquarium } from '../sim/aquarium'
import { fishWellbeing } from '../sim/wellbeing'
import { VERSION } from '../version'
import { DAY_DURATION_SECONDS, formatGameDate } from '../timing'
import type { AquariumState, DecorKind, EquipmentId, FurnitureId, GameState, RoomId, ShelfState, ShopState } from '../types'
import type { WellBeingReport } from '../sim/wellbeing'

export interface UIActions {
  onBuyShelf(specId: string): void
  onPlaceShelf(specId: string, roomId: RoomId): void
  onMoveShelf(shelfId: string, roomId: RoomId): void
  onMoveAquarium(aqId: string, targetShelfId: string, targetSlabId: string): void
  onViewRoom(roomId: RoomId): void
  onSellShelf(shelfId: string): void
  onSellInventoryShelf(specId: string): void
  onAddStorage(): void
  onBuyShopItem(kind: 'cashRegister' | 'componentRack'): void
  onBuyFurniture(id: FurnitureId): void
  onAddAquarium(shelfId: string, modelId: string): void
  onRemoveAquarium(shelfId: string, aqId: string): void
  onSelectAquarium(aqId: string): void
  onSelectStorage(storageId: string): void
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
  onFeed(aqId: string, fishId: string | null): void
  onBuyFishToStorage(speciesId: string, storageId: string): void
  onWholesaleSell(speciesId: string, storageId: string): void
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

function storageObjectCard(title: string, sub: string, onClick: () => void): HTMLElement {
  const card = el('button', 'btn storage-object')
  card.append(el('strong', '', title), el('span', 'shop-desc', sub), el('span', 'comp-hint', 'Нажмите, чтобы открыть содержимое'))
  card.addEventListener('click', onClick)
  return card
}

function storageFullReason(shop: ShopState): string {
  const cap = storageCapacity(shop)
  if (cap <= 0) return 'Нет места для хранения. Купите полку комплектующих или стеллаж в «Обустройство» → «Оснащение».'
  return `Место на складе закончилось (${storageUsed(shop)}/${cap}). Купите полку комплектующих или стеллаж в «Обустройство» → «Оснащение».`
}

function allAquariums(state: GameState): AquariumState[] {
  const out: AquariumState[] = []
  for (const shelf of state.shelves) out.push(...shelf.aquariums)
  return out
}

function fillSelect(select: HTMLSelectElement, options: { value: string; label: string }[], current: string | null): void {
  const prev = select.value || current || options[0]?.value || ''
  select.innerHTML = ''
  for (const opt of options) {
    const o = el('option')
    o.value = opt.value
    o.textContent = opt.label
    select.append(o)
  }
  if (options.some((o) => o.value === prev)) select.value = prev
  else if (options.length) select.value = options[0].value
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
  c.width = 960
  c.height = 420
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

  const hallList = app.querySelector<HTMLDivElement>('.hall-list')!
  const hallActions = app.querySelector<HTMLDivElement>('.hall-actions')!
  const roomSwitch = app.querySelector<HTMLDivElement>('.room-switch')!
  const ordersPanel = app.querySelector<HTMLDivElement>('.orders-panel')!

  const storageBlock = app.querySelector<HTMLDivElement>('#storageBlock')!
  const storageSelect = app.querySelector<HTMLSelectElement>('#storageSelect')!
  const storageCards = app.querySelector<HTMLDivElement>('.storage-cards')!
  const addStorageBtn = app.querySelector<HTMLButtonElement>('#addStorage')!
  const stockList = app.querySelector<HTMLDivElement>('.stock-list')!
  const rackPanel = app.querySelector<HTMLDivElement>('.rack-panel')!
  const shelfInventory = app.querySelector<HTMLDivElement>('.shelf-inventory')!

  const aquariumSelect = app.querySelector<HTMLSelectElement>('#aquariumSelect')!
  const aquariumAtt = app.querySelector<HTMLSpanElement>('#aquariumAtt')!
  const aqInfo = app.querySelector<HTMLDivElement>('.aq-info')!
  const aqActions = app.querySelector<HTMLDivElement>('.aq-actions')!

  const storeDest = app.querySelector<HTMLSelectElement>('#storeDest')!
  const storeGrid = app.querySelector<HTMLDivElement>('.store-grid')!
  const decorStore = app.querySelector<HTMLDivElement>('.decor-store')!
  const equipStore = app.querySelector<HTMLDivElement>('.equip-store')!
  const storeTabs = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-group="sale"] .seg-btn'))
  const saleGroup = app.querySelector<HTMLDivElement>('[data-group="sale"]')!
  const furnGroup = app.querySelector<HTMLDivElement>('[data-group="furn"]')!
  const furnShelves = app.querySelector<HTMLDivElement>('.furn-shelves')!
  const furnEquip = app.querySelector<HTMLDivElement>('.furn-equip')!
  const furnFurn = app.querySelector<HTMLDivElement>('.furn-furn')!
  const furnTabs = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-group="furn"] .seg-btn'))
  const modeButtons = Array.from(app.querySelectorAll<HTMLButtonElement>('.store-mode .seg-btn'))
  const logList = app.querySelector<HTMLUListElement>('.log-list')!

  app.querySelector<HTMLButtonElement>('.btn-reset')!.addEventListener('click', () => actions.onReset())
  pauseBtn.addEventListener('click', () => actions.onTogglePause())
  for (const btn of speedBtns) btn.addEventListener('click', () => actions.onSetSpeed(Number(btn.dataset.speed)))
  aquariumSelect.addEventListener('change', () => actions.onSelectAquarium(aquariumSelect.value))
  storageSelect.addEventListener('change', () => actions.onSelectStorage(storageSelect.value))
  addStorageBtn.addEventListener('click', () => {
    if (window.confirm('Добавить склад за 150₽?')) actions.onAddStorage()
  })
  function setStoreSection(v: 'fish' | 'decor' | 'equip'): void {
    for (const b of storeTabs) b.classList.toggle('active', b.dataset.store === v)
    storeGrid.style.display = v === 'fish' ? '' : 'none'
    decorStore.style.display = v === 'decor' ? '' : 'none'
    equipStore.style.display = v === 'equip' ? '' : 'none'
  }
  for (const b of storeTabs) b.addEventListener('click', () => setStoreSection((b.dataset.store as 'fish' | 'decor' | 'equip') ?? 'fish'))
  setStoreSection('fish')

  function setFurnSection(v: 'shelves' | 'equip' | 'furn'): void {
    for (const b of furnTabs) b.classList.toggle('active', b.dataset.store === v)
    furnShelves.style.display = v === 'shelves' ? '' : 'none'
    furnEquip.style.display = v === 'equip' ? '' : 'none'
    furnFurn.style.display = v === 'furn' ? '' : 'none'
  }
  for (const b of furnTabs) b.addEventListener('click', () => setFurnSection((b.dataset.store as 'shelves' | 'equip' | 'furn') ?? 'shelves'))
  setFurnSection('shelves')

  function setStoreMode(mode: 'sale' | 'furn'): void {
    for (const b of modeButtons) b.classList.toggle('active', b.dataset.mode === mode)
    saleGroup.style.display = mode === 'sale' ? '' : 'none'
    furnGroup.style.display = mode === 'furn' ? '' : 'none'
  }
  for (const b of modeButtons) b.addEventListener('click', () => setStoreMode((b.dataset.mode as 'sale' | 'furn') ?? 'sale'))
  setStoreMode('sale')
  setupTabs(app)

  let epoch = -1
  let lastFlashAt = 0
  let latestState: GameState = null as unknown as GameState

  function flash(message: string): void {
    hudFlash.textContent = message
    hudFlash.classList.add('show')
    lastFlashAt = performance.now()
  }

  function update(state: GameState, shopAtt: number, timeScale: number, paused: boolean): void {
    latestState = state
    hudMoney.textContent = `Деньги: ${state.money}₽`
    hudDay.textContent = `День ${state.day} · ${formatGameDate(state.day)}`
    const ratio = Math.min(1, Math.max(0, state.daySeconds / DAY_DURATION_SECONDS))
    dayProgressFill.style.width = `${Math.round(ratio * 100)}%`
    pauseBtn.textContent = paused ? '▶' : '⏸'
    pauseBtn.classList.toggle('active', paused)
    for (const btn of speedBtns) btn.classList.toggle('active', !paused && timeScale === Number(btn.dataset.speed))
    hudAtt.textContent = `Привлекательность зала: ${shopAtt}/100`
    hudAtt.classList.toggle('good', shopAtt >= 60)
    hudAtt.classList.toggle('mid', shopAtt >= 30 && shopAtt < 60)
    hudAtt.classList.toggle('bad', shopAtt < 30)
    hudVisitors.textContent = `Заказов: ${state.orders.length}`
    hudSales.textContent = `Продаж: ${state.sales}`
    if (performance.now() - lastFlashAt > 2500) hudFlash.classList.remove('show')

    if (state.epoch !== epoch) {
      epoch = state.epoch
      renderZal(state)
      renderOrders(state)
      renderAquarium(state)
      renderStore(state)
      renderLog(state)
    }
  }

  function renderZal(state: GameState): void {
    roomSwitch.innerHTML = ''
    for (const r of ROOMS) {
      const b = el('button', r.id === state.viewRoom ? 'room-btn active' : 'room-btn', `${r.icon} ${r.name}`)
      b.addEventListener('click', () => actions.onViewRoom(r.id))
      roomSwitch.append(b)
    }

    hallActions.innerHTML = ''
    const buyShelf = el('button', 'btn', 'Добавить стойку')
    buyShelf.addEventListener('click', () => openAddShelfModal(state))
    hallActions.append(buyShelf)
    const placeShelf = el('button', 'btn', 'Разместить стойку')
    placeShelf.disabled = state.shop.shelvesInventory.length === 0
    placeShelf.title = state.shop.shelvesInventory.length > 0 ? `На складе: ${state.shop.shelvesInventory.length}` : 'На складе нет стоек'
    placeShelf.addEventListener('click', () => openPlaceShelfModal(state))
    hallActions.append(placeShelf)

    const roomShelves = state.shelves.filter((s) => s.roomId === state.viewRoom)
    hallList.innerHTML = ''
    if (roomShelves.length === 0) {
      const empty = el('div', 'empty hall-empty')
      const go = el('button', 'btn small', 'Купить стойку')
      go.addEventListener('click', () => openAddShelfModal(state))
      empty.append(
        el('span', '', `В помещении «${ROOM_BY_ID[state.viewRoom].name}» нет стоек. Купите стойку, затем разместите её и добавьте аквариум на полку.`),
        go,
      )
      hallList.append(empty)
    }
    for (const shelf of roomShelves) {
      if (shelf.aquariums.length === 0) {
        const empty = el('div', 'comp-hint', `«${shelf.name}» пуст. Добавьте аквариум на полку ниже.`)
        hallList.append(empty)
      }
      const card = el('div', 'shelf-card')
      const head = el('div', 'shelf-head')
      const roomBadge = el('span', 'room-badge', `${ROOM_BY_ID[shelf.roomId].icon} ${ROOM_BY_ID[shelf.roomId].name}`)
      head.append(
        el('strong', '', shelf.name),
        roomBadge,
        el('span', 'shelf-meta', `занято ${shelf.aquariums.length}/${shelf.slabs.length} · загрузка ${shelfUsedLiters(shelf)}/${shelf.loadCapacityL} л`),
      )
      const menuBtn = el('button', 'btn small', 'Действия')
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        openShelfMenu(shelf.id, state)
      })
      head.classList.add('clickable')
      head.addEventListener('click', () => openShelfMenu(shelf.id, state))
      head.append(menuBtn)
      card.append(head)
      const body = el('div', 'shelf-body')
      for (const slab of shelf.slabs) {
        const cell = el('div', 'shelf-cell')
        const aq = shelf.aquariums.find((a) => a.slabId === slab.id)
        cell.append(el('span', 'slab-tag', `Полка ${slab.width}×${slab.depth} см, выс. ${slab.height} см`))
        if (aq) {
          const tile = el('button', 'btn aq-tile')
          tile.style.background = 'linear-gradient(180deg,#0e3357,#07203a)'
          tile.append(
            el('strong', '', aq.name),
            el('span', 'aq-meta', `${aq.volume} л · ${aq.fish.length} рыб · привл. ${tankAttractiveness(aq)}`),
          )
          tile.addEventListener('click', () => {
            actions.onSelectAquarium(aq.id)
            switchTab(app, 'aquarium')
          })
          const move = el('button', 'btn small', '↔')
          move.title = 'Переместить на другую стойку'
          move.addEventListener('click', (e) => {
            e.stopPropagation()
            openAquariumMoveModal(state, aq.id)
          })
          cell.append(tile, move)
        } else {
          const add = el('button', 'btn small', 'Добавить аквариум')
          add.addEventListener('click', () => openAddAquariumModal(state, shelf, slab.id))
          cell.append(add)
        }
        body.append(cell)
      }
      card.append(body)
      hallList.append(card)
    }

    storageBlock.style.display = state.viewRoom === 'storage' ? '' : 'none'
    if (state.viewRoom === 'storage') renderStorage(state)
  }

  function openAddShelfModal(s: GameState): void {
    const { body } = overlay('Купить стойку (на склад)')
    body.append(el('div', 'comp-hint', 'Купленная стойка появляется в разделе «Стойки на складе» (помещение «Склад»). Затем разместите её в помещении через «Разместить стойку».'))
    for (const specId of Object.keys(SHELVES)) {
      const spec = SHELVES[specId as keyof typeof SHELVES]
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', `Купить — ${spec.price}₽`)
      btn.disabled = s.money < spec.price
      btn.addEventListener('click', () => actions.onBuyShelf(specId))
      row.append(
        el('strong', '', spec.name),
        el('span', 'shop-desc', `${spec.slabs.length} полки · до ${spec.loadCapacityL} л`),
        btn,
      )
      body.append(row)
    }
  }

  function openPlaceShelfModal(s: GameState): void {
    const { body } = overlay('Разместить стойку в помещении')
    if (s.shop.shelvesInventory.length === 0) {
      body.append(el('div', 'empty', 'На складе нет стоек.'))
      return
    }
    const count = new Map<string, number>()
    for (const id of s.shop.shelvesInventory) count.set(id, (count.get(id) ?? 0) + 1)
    body.append(el('div', 'comp-hint', 'На складе: ' + s.shop.shelvesInventory.length + ' стойка(и). Выберите помещение и что разместить.'))

    const roomSel = el('select')
    roomSel.className = 'room-select'
    for (const r of ROOMS) {
      const o = el('option')
      o.value = r.id
      o.textContent = `${r.icon} ${r.name}`
      roomSel.append(o)
    }
    roomSel.value = s.viewRoom
    const roomRow = el('div', 'modal-row')
    roomRow.append(el('strong', '', 'Помещение'), roomSel)
    body.append(roomRow)

    for (const [specId, n] of count) {
      const spec = SHELVES[specId as keyof typeof SHELVES]
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', 'Разместить')
      btn.addEventListener('click', () => actions.onPlaceShelf(specId, roomSel.value as RoomId))
      row.append(
        el('strong', '', `${spec.name} ×${n}`),
        el('span', 'shop-desc', `${spec.slabs.length} полки · до ${spec.loadCapacityL} л`),
        btn,
      )
      body.append(row)
    }
    body.append(el('div', 'comp-hint', 'Нужно избавиться от лишнего? Стойки со склада можно продать.'))
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
        const btn = el('button', 'btn small', 'Переместить')
        btn.addEventListener('click', () => openAquariumMoveModal(s, aq.id))
        row.append(btn)
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
      el('div', 'comp-hint', `Сейчас: ${src ? ROOM_BY_ID[src.roomId].icon + ' ' + ROOM_BY_ID[src.roomId].name + ' · ' + src.name : '—'}. Выберите свободную полку:`),
    )
    const targets: { shelf: ShelfState; slab: import('../types').ShelfSlab }[] = []
    for (const shelf of s.shelves) {
      for (const slab of shelf.slabs) {
        if (shelf.id === src?.id && slab.id === aq.slabId) continue
        if (shelf.aquariums.some((a) => a.slabId === slab.id)) continue
        if (!fitsOnSlab(aq, slab)) continue
        if (aq.volume > shelfLoadLeft(shelf)) continue
        targets.push({ shelf, slab })
      }
    }
    if (targets.length === 0) {
      body.append(el('div', 'empty', 'Нет свободных подходящих полок. Купите новую стойку или освободите полку.'))
      return
    }
    for (const t of targets) {
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', 'Перенести')
      btn.addEventListener('click', () => actions.onMoveAquarium(aq.id, t.shelf.id, t.slab.id))
      row.append(
        el('strong', '', `${ROOM_BY_ID[t.shelf.roomId].name} · ${t.shelf.name}`),
        el('span', 'shop-desc', `${t.slab.width}×${t.slab.depth}×${t.slab.height} см`),
        btn,
      )
      body.append(row)
    }
  }

  function openAddAquariumModal(s: GameState, shelf: ShelfState, slabId: string): void {
    const { body } = overlay('Добавить аквариум: на полку стойки «' + shelf.name + '»')
    const slab = shelf.slabs.find((sl) => sl.id === slabId)
    body.append(el('div', 'comp-hint', `Остаток грузоподъёмности: ${shelfLoadLeft(shelf)} л`))
    for (const model of AQUARIUM_MODELS) {
      const fits = slab ? model.w <= slab.width && model.d <= slab.depth && model.h <= slab.height : false
      const fitsLoad = model.volume <= shelfLoadLeft(shelf)
      const yes = fits && fitsLoad
      const row = el('div', 'modal-row')
      const badge = el('span', yes ? 'compat ok' : 'compat dead', yes ? 'помещается' : !fits ? 'не по габаритам' : 'превышает грузоподъёмность')
      const btn = el('button', 'btn small', `Купить ${model.name} — ${model.price}₽`)
      btn.disabled = s.money < model.price || !yes
      if (yes) btn.addEventListener('click', () => actions.onAddAquarium(shelf.id, model.id))
      row.append(el('strong', '', `${model.name} (${model.w}×${model.d}×${model.h} см, ${model.volume} л)`), badge, btn)
      body.append(row)
    }
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
      const badge = el('span', order.kind === 'demand' ? 'compat ok' : 'compat warn', order.kind === 'demand' ? 'по спросу' : 'по витрине')
      const total = order.unitPrice * order.qty
      const timer = el('span', 'order-timer', `⏳ ${Math.ceil(order.timeLeft)}с`)
      const sellBtn = el('button', 'btn small', `Продать за ${total}₽`)
      const stock = isFish
        ? availableStock(state, order.speciesId)
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

  function renderAquarium(state: GameState): void {
    const all = allAquariums(state)
    fillSelect(aquariumSelect, all.map((a) => ({ value: a.id, label: a.name })), state.selectedAquariumId)
    const aq = all.find((a) => a.id === state.selectedAquariumId)
    if (!aq) {
      aquariumAtt.textContent = 'Аквариум не выбран'
      aqInfo.innerHTML = ''
      aqActions.innerHTML = ''
      return
    }
    aquariumAtt.textContent = `Привлекательность: ${tankAttractiveness(aq)}/100`

    const aqShelf = shelfOfAquarium(state, aq)
    const aqRoom = aqShelf ? ROOM_BY_ID[aqShelf.roomId] : null

    aqInfo.innerHTML = ''
    aqInfo.append(el('div', 'aq-keys', aq.name))
    if (aqRoom && aqShelf) {
      aqInfo.append(el('div', 'aq-line loc-line', `${aqRoom.icon} Помещение: ${aqRoom.name} · Стойка: «${aqShelf.name}»`))
    }
    aqInfo.append(el('div', 'aq-line', `Объём ${aq.volume} л (${aq.w}×${aq.d}×${aq.h} см)`))
    const w = aq.water
    const hasThermo = aq.equipment.some((e) => e.id === 'thermometer')
    const tempLine = hasThermo
      ? `Температура: ${w.temperature.toFixed(1)} °C`
      : 'Температура: ? (нужен термометр)'
    aqInfo.append(
      el('div', 'list-title', 'Вода'),
      el('div', 'aq-line', tempLine),
      el('div', 'aq-line', `Комнатная: ${ROOM_TEMP} °C`),
      el('div', 'aq-line', `pH: ${w.ph.toFixed(1)} · GH: ${w.gh.toFixed(1)} °dH`),
      el('div', 'aq-line', `O₂: ${Math.round(w.o2)}% · Свет: ${Math.round(w.light)}%`),
    )
    aqInfo.append(
      el('div', 'list-title', 'Обитатели'),
      el('div', 'aq-line', `Рыб и животных: ${aq.fish.length}`),
    )
    aqInfo.append(
      el('div', 'list-title', 'Оборудование'),
      el('div', 'aq-line', aq.equipment.length ? aq.equipment.map((e) => EQUIPMENT[e.id].name).join(', ') : 'нет'),
    )
    aqInfo.append(
      el('div', 'list-title', 'Декор'),
      el('div', 'aq-line', `Растительность: ${Math.round(vegetationOf(aq) * 100)}% · объект(а/в): ${aq.decor.length}`),
    )
    aqInfo.append(el('div', 'list-title', 'Дизайн'))
    const dRow = el('div', 'design-row')
    const dBtn = el('button', 'btn small', `Уровень ${aq.designLevel}/${MAX_DESIGN_LEVEL} — улучшить`)
    dBtn.disabled = aq.designLevel >= MAX_DESIGN_LEVEL || state.money < designUpgradeCost(aq.designLevel)
    dBtn.addEventListener('click', () => actions.onUpgradeDesign(aq.id))
    dRow.append(dBtn)
    dRow.append(el('span', 'aq-line', ` (${designUpgradeCost(aq.designLevel)}₽)`))
    aqInfo.append(dRow)

    aqActions.innerHTML = ''
    const mkBtn = (label: string, fn: () => void) => {
      const b = el('button', 'btn aq-action', label)
      b.addEventListener('click', fn)
      aqActions.append(b)
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
    const { body } = overlay(`Обитатели: «${aq.name}»`)

    body.append(el('div', 'list-title', 'Заселить со склада'))
    const stockById = new Map<string, number>()
    for (const st of s.storage) for (const item of st.stock) stockById.set(item.speciesId, (stockById.get(item.speciesId) ?? 0) + item.count)
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

    const feedAll = el('button', 'btn small', `Кормить всех (5₽)`)
    feedAll.disabled = s.money < 5 || aq.fish.length === 0
    feedAll.addEventListener('click', () => actions.onFeed(aq.id, null))
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
    const feed = el('button', 'btn', `Покормить (5₽)`)
    feed.disabled = s.money < 5
    feed.addEventListener('click', () => actions.onFeed(aq.id, fish.id))
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

  function renderStorage(state: GameState): void {
    fillSelect(storageSelect, state.storage.map((t) => ({ value: t.id, label: t.name })), state.selectedStorageId)
    const tank = state.storage.find((t) => t.id === state.selectedStorageId)

    shelfInventory.innerHTML = ''
    const inv = state.shop.shelvesInventory
    if (inv.length === 0) {
      shelfInventory.append(el('div', 'empty', 'Пусто. Добавьте стойку на экране «Помещения».'))
    } else {
      const bySpec = new Map<string, number>()
      for (const id of inv) bySpec.set(id, (bySpec.get(id) ?? 0) + 1)
      const roomRow = el('div', 'comp-row')
      const roomSel = el('select')
      roomSel.className = 'room-select'
      for (const r of ROOMS) {
        const o = el('option')
        o.value = r.id
        o.textContent = `${r.icon} ${r.name}`
        roomSel.append(o)
      }
      roomSel.value = state.viewRoom
      roomRow.append(el('span', 'comp-name', 'Разместить в помещении:'), roomSel)
      shelfInventory.append(roomRow)
      for (const [specId, n] of bySpec) {
        const spec = SHELVES[specId as keyof typeof SHELVES]
        const row = el('div', 'comp-row')
        row.append(el('span', 'comp-name', `${spec?.name ?? specId} ×${n}`))
        const place = el('button', 'btn small', 'Разместить')
        place.addEventListener('click', () => actions.onPlaceShelf(specId, roomSel.value as RoomId))
        const sell = el('button', 'btn small danger', 'Продать')
        sell.addEventListener('click', () => actions.onSellInventoryShelf(specId))
        row.append(place, sell)
        shelfInventory.append(row)
      }
    }
    storageCards.innerHTML = ''
    for (const t of state.storage) {
      const card = el('div', 'tank-card')
      card.append(el('span', 'badge badge-storage', 'Склад'), el('strong', '', t.name), el('div', 'tank-card-line', `Рыб на хранении: ${stockTotal(t.stock)}`))
      const openBtn = el('button', 'btn small', 'Выбрать')
      openBtn.addEventListener('click', () => {
        actions.onSelectStorage(t.id)
      })
      card.append(openBtn)
      storageCards.append(card)
    }
    addStorageBtn.textContent = 'Добавить склад'
    addStorageBtn.disabled = state.money < 150

    stockList.innerHTML = ''
    stockList.append(el('div', 'list-title', 'Рыбы «на продажу»'))
    if (!tank || tank.stock.length === 0) stockList.append(el('div', 'empty', 'Склад пуст.'))
    else for (const item of tank.stock) {
      const species = SPECIES_BY_ID[item.speciesId]
      const f = state.market[item.speciesId] ?? 1
      const row = el('div', 'stock-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const btn = el('button', 'btn small', `Опт — ${wholesalePrice(species, f)}₽/шт`)
      btn.addEventListener('click', () => actions.onWholesaleSell(item.speciesId, tank.id))
      row.append(dot, el('span', 'stock-name', `${species.name} — ${item.count} шт.`), btn)
      stockList.append(row)
    }

    rackPanel.innerHTML = ''
    const cap = storageCapacity(state.shop)
    const used = storageUsed(state.shop)
    const summary = el('div', 'storage-summary')
    summary.append(el('span', 'storage-count', `Занято: ${used} из ${cap} мест · свободно ${Math.max(0, cap - used)}`))
    const bar = el('div', 'storage-bar')
    const fill = el('div', 'storage-bar-fill')
    fill.style.width = `${cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0}%`
    bar.append(fill)
    summary.append(bar)
    rackPanel.append(summary)

    const goShop = el('button', 'btn small', 'Купить полку или стеллаж')
    goShop.addEventListener('click', () => {
      setStoreMode('furn')
      setStoreSection('equip')
      switchTab(app, 'store')
    })
    rackPanel.append(goShop)

    const objects = el('div', 'storage-objects')
    const racks = state.shop.componentRacks
    const displays = furnitureCount(state.shop, 'displayRack')
    if (racks > 0) {
      objects.append(storageObjectCard(`Полка комплектующих ×${racks}`, `вместимость ${racks * EQUIPMENT_SLOTS_PER_RACK} мест`, () => openStorageModal(state)))
    }
    if (displays > 0) {
      objects.append(storageObjectCard(`Стеллаж-витрина ×${displays}`, `вместимость ${displays * EQUIPMENT_SLOTS_PER_RACK} мест`, () => openStorageModal(state)))
    }
    if (racks === 0 && displays === 0) {
      objects.append(el('div', 'empty', 'Места для хранения нет. Купите полку комплектующих или стеллаж в «Обустройство» → «Оснащение».'))
    }
    rackPanel.append(objects)
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
      const cap = storageCapacity(state.shop)
      hint.textContent = `Занято ${used} из ${cap} мест · свободно ${Math.max(0, cap - used)}. Оборудование и декор доступны с любой полки или стеллажа.`
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

  function renderStore(state: GameState): void {
    fillSelect(storeDest, state.storage.map((t) => ({ value: t.id, label: t.name })), state.selectedStorageId)

    storeGrid.innerHTML = ''
    equipStore.innerHTML = ''
    decorStore.innerHTML = ''

    for (const species of FISH_SPECIES) {
      const factor = state.market[species.id] ?? 1
      const card = el('div', 'store-card')
      const head = el('div', 'store-head')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      head.append(dot, el('strong', 'store-name', species.name))
      card.append(
        head,
        el('div', 'store-latin', species.latin),
        demandBadge(factor),
        el('div', 'store-params', [
          `${species.sizeCm} см · мин. ${species.minVolume} л`,
          `t ${species.tempMin}–${species.tempMax} °C · pH ${species.phMin}–${species.phMax} · GH ${species.ghMin}–${species.ghMax} °dH`,
          `O₂ ${species.o2Min}–${species.o2Max}% · свет ${species.lightMin}–${species.lightMax}%`,
        ].join(' · ')),
      )
      const priceRow = el('div', 'store-prices')
      priceRow.append(
        el('span', '', `Закупка ${buyPrice(species, factor)}₽`),
        el('span', 'sell-hint', `Розница ${retailPrice(species, factor)}₽ · опт ${wholesalePrice(species, factor)}₽`),
      )
      card.append(priceRow)
      const buyBtn = el('button', 'btn buy', `Купить на склад — ${buyPrice(species, factor)}₽`)
      const noMoney = state.money < buyPrice(species, factor)
      buyBtn.disabled = noMoney
      buyBtn.addEventListener('click', () => actions.onBuyFishToStorage(species.id, storeDest.value))
      card.append(buyBtn)
      if (noMoney) card.append(storeReason(`Не хватает денег: нужно ${buyPrice(species, factor)}₽`))
      storeGrid.append(card)
    }

    for (const kind of DECOR_KINDS) {
      const def = DECOR[kind]
      const card = el('div', 'store-card')
      const head = el('div', 'store-head')
      head.append(el('strong', 'store-name', def.name))
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
      const storageFull = storageUsed(state.shop) >= storageCapacity(state.shop)
      btn.disabled = noMoney || storageFull
      btn.addEventListener('click', () => actions.onBuyDecor(kind))
      card.append(btn)
      if (noMoney) card.append(storeReason(`Не хватает денег: нужно ${def.price}₽`))
      else if (storageFull) card.append(storeReason(storageFullReason(state.shop)))
      decorStore.append(card)
    }

    for (const eid of EQUIPMENT_IDS) {
      const def = EQUIPMENT[eid]
      const owned = state.shop.rackInventory.filter((c) => c === eid).length
      const card = el('div', 'store-card')
      const head2 = el('div', 'store-head')
      head2.append(el('strong', 'store-name', def.name))
      card.append(
        head2,
        el('div', 'store-desc', def.desc),
        (() => {
          const p = el('div', 'store-prices')
          p.append(el('span', '', `На складе: ${owned}`))
          return p
        })(),
      )
      const btn = el('button', 'btn buy', `Купить в склад — ${def.price}₽`)
      const noMoney = state.money < def.price
      const storageFull = storageUsed(state.shop) >= storageCapacity(state.shop)
      btn.disabled = noMoney || storageFull
      btn.addEventListener('click', () => actions.onBuyEquipment(eid))
      card.append(btn)
      if (noMoney) card.append(storeReason(`Не хватает денег: нужно ${def.price}₽`))
      else if (storageFull) card.append(storeReason(storageFullReason(state.shop)))
      equipStore.append(card)
    }

    renderFurnStore(state)
  }

  function renderFurnStore(state: GameState): void {
    const shop = state.shop

    furnShelves.innerHTML = ''
    furnShelves.append(el('div', 'comp-hint', 'Стойки для аквариумов: покупаются на склад, затем размещаются на «Помещениях».'))
    for (const specId of Object.keys(SHELVES)) {
      const spec = SHELVES[specId as keyof typeof SHELVES]
      const card = el('div', 'store-card')
      card.append(
        el('strong', 'store-name', spec.name),
        el('div', 'store-desc', `${spec.slabs.length} полки · до ${spec.loadCapacityL} л`),
      )
      const btn = el('button', 'btn buy', `Купить в склад — ${spec.price}₽`)
      const noMoney = state.money < spec.price
      btn.disabled = noMoney
      btn.addEventListener('click', () => actions.onBuyShelf(specId))
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
      el('strong', 'store-name', `Полка комплектующих ×${shop.componentRacks}`),
      el('div', 'store-desc', `Хранит оборудование и декор: занято ${storageUsed(shop)} из ${storageCapacity(shop)} мест`),
    )
    const rackBtn = el('button', 'btn buy', 'Купить — 150₽')
    const noMoneyRack = state.money < 150
    rackBtn.disabled = noMoneyRack
    rackBtn.addEventListener('click', () => actions.onBuyShopItem('componentRack'))
    rackCard.append(rackBtn)
    if (noMoneyRack) rackCard.append(storeReason('Не хватает денег: нужно 150₽'))
    furnEquip.append(rackCard)

    const dcount = furnitureCount(shop, 'displayRack')
    const displayCard = el('div', 'store-card')
    displayCard.append(
      el('strong', 'store-name', `Стеллаж-витрина ×${dcount}`),
      el('div', 'store-desc', 'Покупатели заказывают оборудование и декор со склада. Вместимость: ' + displayCapacity(shop) + ' позиций'),
    )
    const displayBtn = el('button', 'btn buy', 'Купить — 700₽')
    const noMoneyDisplay = state.money < 700
    displayBtn.disabled = noMoneyDisplay
    displayBtn.addEventListener('click', () => actions.onBuyFurniture('displayRack'))
    displayCard.append(displayBtn)
    if (noMoneyDisplay) displayCard.append(storeReason('Не хватает денег: нужно 700₽'))
    furnEquip.append(displayCard)

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
  }

  function renderLog(state: GameState): void {
    logList.innerHTML = ''
    for (const entry of [...state.log].reverse().slice(0, 20)) {
      const li = el('li', `log-${entry.kind}`)
      li.append(el('span', 'log-day', `д.${entry.day}`), el('span', 'log-text', entry.text))
      logList.append(li)
    }
  }

  return { update, flash, selectTab: (tab: TabName) => switchTab(app, tab), openShelfMenu: (id: string) => openShelfMenu(id, latestState) }
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

function addStorageButton(): HTMLButtonElement {
  const btn = el('button', 'btn')
  btn.textContent = 'Добавить склад'
  btn.id = 'addStorage'
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
  right.append(el('span', 'hud-flash', ''))
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
  zalTab.append(
    el('h2', 'sec-title', 'Помещения'),
    el('div', 'room-switch'),
    buildHallCanvas(),
    el('h2', 'sec-title', 'Управление стойками'),
    el('div', 'hall-actions'),
    el('div', 'hall-list'),
  )

  const storageBlock = el('div', 'storage-block')
  storageBlock.id = 'storageBlock'
  const storageBar = el('div', 'tank-bar')
  storageBar.append(el('label', '', 'Склад: '))
  const storageSelect = el('select')
  storageSelect.id = 'storageSelect'
  storageBar.append(storageSelect)
  storageBlock.append(
    el('h2', 'sec-title', 'Склады'),
    storageBar,
    el('div', 'tank-cards storage-cards'),
    addStorageButton(),
    el('h2', 'sec-title', 'Стойки на складе'),
    el('div', 'shelf-inventory'),
    el('h2', 'sec-title', 'Рыбы «на продажу»'),
    el('div', 'stock-list'),
    el('h2', 'sec-title', 'Место хранения на складе'),
    el('div', 'rack-panel'),
  )
  zalTab.append(storageBlock)

  const ordersTab = el('section', 'tab')
  ordersTab.id = 'tab-orders'
  ordersTab.append(
    el('h2', 'sec-title', 'Заказы покупателей'),
    el('div', 'orders-panel'),
  )

  const aquariumTab = el('section', 'tab')
  aquariumTab.id = 'tab-aquarium'
  aquariumTab.classList.add('aq-tab')
  const aqBar = el('div', 'tank-bar')
  aqBar.append(el('label', '', 'Аквариум: '))
  const aquariumSelect = el('select')
  aquariumSelect.id = 'aquariumSelect'
  const aquariumAtt = el('span', '', '')
  aquariumAtt.id = 'aquariumAtt'
  aqBar.append(aquariumSelect, el('span', '', ' · '), aquariumAtt)
  aquariumTab.append(aqBar)
  const aqBody = el('div', 'aq-body')
  const aqStage = el('div', 'aq-stage')
  const canvas = el('canvas')
  canvas.id = 'tank'
  canvas.width = 960
  canvas.height = 420
  aqStage.append(canvas)
  const aqInfo = el('aside', 'aq-info')
  aqInfo.append(el('h3', '', 'Состояние'))
  aqBody.append(aqStage, aqInfo)
  const aqActions = el('div', 'aq-actions')
  aquariumTab.append(aqBody, aqActions)

  const storeTab = el('section', 'tab')
  storeTab.id = 'tab-store'
  const storeMode = el('div', 'store-mode')
  storeMode.append(modeBtn('sale', 'Для продажи'), modeBtn('furn', 'Обустройство'))

  const saleGroup = el('div', 'store-group')
  saleGroup.dataset.group = 'sale'
  const storeBar = el('div', 'tank-bar')
  storeBar.append(el('label', '', 'Купить в склад: '))
  const storeDest = el('select')
  storeDest.id = 'storeDest'
  storeBar.append(storeDest)
  const storeTabs = el('div', 'store-tabs')
  storeTabs.append(
    segBtn('fish', 'Рыбы'),
    segBtn('decor', 'Декор'),
    segBtn('equip', 'Оборудование'),
  )
  const fishStore = el('div', 'store-grid')
  const decorStore = el('div', 'decor-store')
  const equipStore = el('div', 'equip-store')
  saleGroup.append(storeBar, storeTabs, fishStore, decorStore, equipStore)

  const furnGroup = el('div', 'store-group')
  furnGroup.dataset.group = 'furn'
  const furnBar = el('div', 'tank-bar')
  furnBar.append(el('span', 'store-bar-hint', 'Обустройство магазина: стойки, оснащение и мебель'))
  const furnTabs = el('div', 'store-tabs')
  furnTabs.append(
    segBtn('shelves', 'Стойки'),
    segBtn('equip', 'Оснащение'),
    segBtn('furn', 'Мебель'),
  )
  const furnShelves = el('div', 'store-grid furn-shelves')
  const furnEquip = el('div', 'decor-store furn-equip')
  const furnFurn = el('div', 'decor-store furn-furn')
  furnGroup.append(furnBar, furnTabs, furnShelves, furnEquip, furnFurn)

  storeTab.append(storeMode, saleGroup, furnGroup)

  main.append(zalTab, aquariumTab, storeTab, ordersTab)

  const footer = el('footer', 'log-panel')
  const footHead = el('div', 'log-head')
  footHead.append(el('h3', '', 'Журнал событий'), el('span', 'version-badge', `v${VERSION}`))
  footer.append(footHead)
  footer.append(el('ul', 'log-list'))

  game.append(header, nav, main, footer)
  return game
}