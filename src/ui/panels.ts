import { FISH_SPECIES, SPECIES_BY_ID } from '../data/fish'
import { MAX_DESIGN_LEVEL, AQUARIUM_MODELS, designUpgradeCost } from '../data/aquarium'
import { EQUIPMENT, EQUIPMENT_IDS, SHELVES, rackCapacity, shelfLoadLeft, shelfUsedLiters } from '../data/shop'
import { DECOR, DECOR_KINDS } from '../data/decor'
import { tankAttractiveness } from '../sim/buyers'
import { availableStock, buyPrice, retailPrice, stockTotal, wholesalePrice } from '../sim/economy'
import { canStock, vegetationOf } from '../sim/aquarium'
import { fishWellbeing } from '../sim/wellbeing'
import { DAY_DURATION_SECONDS, formatGameDate } from '../timing'
import type { AquariumState, DecorKind, EquipmentId, GameState, ShelfState } from '../types'
import type { WellBeingReport } from '../sim/wellbeing'

export interface UIActions {
  onBuyShelf(specId: string): void
  onPlaceShelf(specId: string): void
  onUnstoreShelf(shelfId: string): void
  onSellShelf(shelfId: string): void
  onSellInventoryShelf(specId: string): void
  onAddStorage(): void
  onBuyShopItem(kind: 'cashRegister' | 'restArea' | 'componentRack'): void
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

type TabName = 'zal' | 'aquarium' | 'storage' | 'store' | 'orders' | 'furni'


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

  const shopEquipment = app.querySelector<HTMLDivElement>('.shop-equipment')!
  const shelfStore = app.querySelector<HTMLDivElement>('.shelf-store')!
  const hallList = app.querySelector<HTMLDivElement>('.hall-list')!
  const hallActions = app.querySelector<HTMLDivElement>('.hall-actions')!
  const ordersPanel = app.querySelector<HTMLDivElement>('.orders-panel')!

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
  const storeTabs = Array.from(app.querySelectorAll<HTMLButtonElement>('.store-tabs .seg-btn'))
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
      renderFurn(state)
      renderOrders(state)
      renderAquarium(state)
      renderStorage(state)
      renderStore(state)
      renderLog(state)
    }
  }

  function renderZal(state: GameState): void {
    hallActions.innerHTML = ''
    const buyShelf = el('button', 'btn', 'Добавить стеллаж')
    buyShelf.addEventListener('click', () => openAddShelfModal(state))
    hallActions.append(buyShelf)
    const placeShelf = el('button', 'btn', 'Разместить стеллаж')
    placeShelf.disabled = state.shop.shelvesInventory.length === 0
    placeShelf.title = state.shop.shelvesInventory.length > 0 ? `На складе: ${state.shop.shelvesInventory.length}` : 'На складе нет стеллажей'
    placeShelf.addEventListener('click', () => openPlaceShelfModal(state))
    hallActions.append(placeShelf)

    hallList.innerHTML = ''
    if (state.shelves.length === 0) {
      const empty = el('div', 'empty hall-empty')
      const go = el('button', 'btn small', 'Купить стеллаж')
      go.addEventListener('click', () => openAddShelfModal(state))
      empty.append(el('span', '', 'Зал пуст. Купите стеллаж, затем разместите его и добавьте аквариум на полку.'), go)
      hallList.append(empty)
    }
    for (const shelf of state.shelves) {
      if (shelf.aquariums.length === 0) {
        const empty = el('div', 'comp-hint', `«${shelf.name}» пуст. Добавьте аквариум на полку ниже.`)
        hallList.append(empty)
      }
      const card = el('div', 'shelf-card')
      const head = el('div', 'shelf-head')
      head.append(
        el('strong', '', shelf.name),
        el('span', 'shelf-meta', `занято ${shelf.aquariums.length}/${shelf.slabs.length} · загрузка ${shelfUsedLiters(shelf)}/${shelf.loadCapacityL} л`),
      )
      const menuBtn = el('button', 'btn small', 'Действия')
      menuBtn.addEventListener('click', () => openShelfMenu(shelf.id, state))
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
          cell.append(tile)
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
  }

  function renderFurn(state: GameState): void {
    const shop = state.shop
    shopEquipment.innerHTML = ''
    const PRICES = { cashRegister: 300, restArea: 250, componentRack: 150 }
    const items: { key: 'cashRegister' | 'restArea' | 'componentRack'; label: string; state: string }[] = [
      { key: 'cashRegister', label: 'Касса', state: shop.cashRegister ? 'Установлена' : 'Нет' },
      { key: 'restArea', label: `Зона отдыха ×${shop.restAreas}`, state: '' },
      { key: 'componentRack', label: `Полка комплектующих ×${shop.componentRacks}`, state: '' },
    ]
    for (const item of items) {
      const card = el('div', 'shop-card')
      card.append(el('strong', 'shop-name', item.label), el('div', 'shop-state', item.state))
      if (!(item.key === 'cashRegister' && shop.cashRegister)) {
        const btn = el('button', 'btn small', `Купить — ${PRICES[item.key]}₽`)
        btn.disabled = state.money < PRICES[item.key]
        btn.addEventListener('click', () => actions.onBuyShopItem(item.key))
        card.append(btn)
      }
      shopEquipment.append(card)
    }

    shelfStore.innerHTML = ''
    shelfStore.append(el('div', 'comp-hint', 'Стеллажи (стоимость от числа полок и грузоподъёмности):'))
    for (const specId of Object.keys(SHELVES)) {
      const spec = SHELVES[specId as keyof typeof SHELVES]
      const card = el('div', 'shop-card')
      card.append(
        el('strong', 'shop-name', spec.name),
        el('div', 'shop-desc', `${spec.slabs.length} полки · до ${spec.loadCapacityL} л`),
      )
      const btn = el('button', 'btn small', `Купить — ${spec.price}₽`)
      btn.disabled = state.money < spec.price
      btn.addEventListener('click', () => actions.onBuyShelf(specId))
      card.append(btn)
      shelfStore.append(card)
    }
  }

  function openAddShelfModal(s: GameState): void {
    const { body } = overlay('Купить стеллаж (на склад)')
    body.append(el('div', 'comp-hint', 'Купленный стеллаж появляется на складе. Затем разместите его в зале через «Разместить стеллаж».'))
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
    const { body } = overlay('Разместить стеллаж в зале')
    if (s.shop.shelvesInventory.length === 0) {
      body.append(el('div', 'empty', 'На складе нет стеллажей.'))
      return
    }
    const count = new Map<string, number>()
    for (const id of s.shop.shelvesInventory) count.set(id, (count.get(id) ?? 0) + 1)
    body.append(el('div', 'comp-hint', 'На складе: ' + s.shop.shelvesInventory.length + ' стеллаж(ей). Выберите, что разместить.'))
    for (const [specId, n] of count) {
      const spec = SHELVES[specId as keyof typeof SHELVES]
      const row = el('div', 'modal-row')
      const btn = el('button', 'btn small', 'Разместить')
      btn.addEventListener('click', () => actions.onPlaceShelf(specId))
      row.append(
        el('strong', '', `${spec.name} ×${n}`),
        el('span', 'shop-desc', `${spec.slabs.length} полки · до ${spec.loadCapacityL} л`),
        btn,
      )
      body.append(row)
    }
    body.append(el('div', 'comp-hint', 'Нужно избавиться от лишнего? Стеллажи со склада можно продать.'))
  }

  function openShelfMenu(shelfId: string, s: GameState): void {
    const shelf = s.shelves.find((sh) => sh.id === shelfId)
    if (!shelf) return
    const spec = SHELVES[shelf.specId as keyof typeof SHELVES]
    const { body } = overlay(`Стеллаж «${shelf.name}»`)
    body.append(el('div', 'comp-hint', `${shelf.aquariums.length}/${shelf.slabs.length} полок занято · ${shelfUsedLiters(shelf)}/${shelf.loadCapacityL} л`))

    const unstore = el('button', 'btn', 'Убрать на склад')
    unstore.disabled = shelf.aquariums.length > 0
    if (shelf.aquariums.length > 0) unstore.title = 'Сначала уберите аквариумы с полок'
    unstore.addEventListener('click', () => actions.onUnstoreShelf(shelf.id))
    body.append(unstore)

    const specPrice = spec ? spec.price : 0
    const sell = el('button', 'btn danger', `Продать — ${Math.floor(specPrice * 0.5)}₽`)
    sell.addEventListener('click', () => {
      if (window.confirm(`Продать стеллаж «${shelf.name}»? Аквариумы (${shelf.aquariums.length}) будут удалены.`)) {
        actions.onSellShelf(shelf.id)
      }
    })
    body.append(sell)

    if (shelf.aquariums.length > 0) {
      const aqList = el('div', 'comp-list')
      aqList.append(el('div', 'list-title', 'На стеллаже:'))
      for (const aq of shelf.aquariums) {
        aqList.append(el('div', 'comp-row', aq.name))
      }
      body.append(aqList)
    }
  }

  function openAddAquariumModal(s: GameState, shelf: ShelfState, slabId: string): void {
    const { body } = overlay('Добавить аквариум: на полку стеллажа «' + shelf.name + '»')
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
      const species = SPECIES_BY_ID[order.speciesId]
      const row = el('div', 'order-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const badge = el('span', order.kind === 'demand' ? 'compat ok' : 'compat warn', order.kind === 'demand' ? 'по спросу' : 'по витрине')
      const total = order.unitPrice * order.qty
      const timer = el('span', 'order-timer', `⏳ ${Math.ceil(order.timeLeft)}с`)
      const sellBtn = el('button', 'btn small', `Продать за ${total}₽`)
      sellBtn.disabled = availableStock(state, order.speciesId) < order.qty
      sellBtn.addEventListener('click', () => actions.onFulfillOrder(order.id))
      row.append(
        dot,
        el('span', 'order-name', `${species.name} ×${order.qty}`),
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

    aqInfo.innerHTML = ''
    aqInfo.append(el('div', 'aq-keys', aq.name))
    aqInfo.append(el('div', 'aq-line', `Объём ${aq.volume} л (${aq.w}×${aq.d}×${aq.h} см)`))
    const w = aq.water
    aqInfo.append(
      el('div', 'list-title', 'Вода'),
      el('div', 'aq-line', `Температура: ${w.temperature.toFixed(1)} °C`),
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
  }

  function openEquipmentModal(s: GameState, aqId: string): void {
    const aq = allAquariums(s).find((a) => a.id === aqId)
    if (!aq) return
    const { body } = overlay(`Оборудование: «${aq.name}»`)
    const freeSlots = 4 - aq.equipment.length
    body.append(el('div', 'comp-hint', `Слоты: ${aq.equipment.length}/4 (свободно ${freeSlots})`))

    body.append(el('div', 'list-title', 'Установлено'))
    if (aq.equipment.length === 0) body.append(el('div', 'empty', 'Нет установленного оборудования.'))
    for (const inst of aq.equipment) {
      const def = EQUIPMENT[inst.id]
      const block = el('div', 'comp-row')
      block.append(el('span', 'comp-name', def.name))
      const rack = el('button', 'btn small', 'На склад')
      rack.addEventListener('click', () => actions.onRemoveEquipment(inst.id, aq.id))
      const sellEq = el('button', 'btn small danger', `Продать (${Math.floor(def.price * 0.5)}₽)`)
      sellEq.addEventListener('click', () => actions.onSellEquipment(inst.id, aq.id))
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

    body.append(el('div', 'list-title', 'На полке (склад)'))
    if (s.shop.rackInventory.length === 0) {
      body.append(el('div', 'empty', 'На полке нет оборудования. Купите на вкладке «Склад».'))
    }
    for (const eid of s.shop.rackInventory) {
      const def = EQUIPMENT[eid]
      const row = el('div', 'comp-row')
      const btn = el('button', 'btn small', 'Установить')
      btn.disabled = aq.equipment.length >= 4 || aq.equipment.some((x) => x.id === eid)
      btn.addEventListener('click', () => actions.onInstallEquipment(eid, aq.id))
      row.append(el('span', 'comp-name', def.name), btn)
      body.append(row)
    }
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
    const { body } = overlay(`Обслуживание: «${aq.name}»`)
    body.append(
      el('div', 'list-title', 'Условия'),
      slider('Температура', 15, 35, 0.5, aq.water.temperature, (v) => actions.onMaintain(aq.id, 'temp', v)),
      slider('Освещённость', 0, 100, 1, aq.water.light, (v) => actions.onMaintain(aq.id, 'light', v)),
    )
    body.append(el('div', 'list-title', 'Работы'))
    const workList = el('div', 'comp-list')
    const jobs: [string, number][] = [
      ['Подменить воду', 100],
      ['Добавить бактерии', 80],
      ['Почистить фильтр', 60],
    ]
    for (const [label, cost] of jobs) {
      const row = el('div', 'comp-row')
      const btn = el('button', 'btn small', `${label} — ${cost}₽`)
      btn.disabled = s.money < cost
      const kind = label === 'Подменить воду' ? 'water' : label === 'Добавить бактерии' ? 'bacteria' : 'clean'
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
      shelfInventory.append(el('div', 'empty', 'Пусто. Добавьте стеллаж на экране «Зал».'))
    } else {
      const bySpec = new Map<string, number>()
      for (const id of inv) bySpec.set(id, (bySpec.get(id) ?? 0) + 1)
      for (const [specId, n] of bySpec) {
        const spec = SHELVES[specId as keyof typeof SHELVES]
        const row = el('div', 'comp-row')
        row.append(el('span', 'comp-name', `${spec?.name ?? specId} ×${n}`))
        const place = el('button', 'btn small', 'Разместить в зале')
        place.addEventListener('click', () => actions.onPlaceShelf(specId))
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
      const openBtn = el('button', 'btn small', 'Открыть')
      openBtn.addEventListener('click', () => {
        actions.onSelectStorage(t.id)
        switchTab(app, 'storage')
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
    const renderRackPanel = () => {
      rackPanel.innerHTML = ''
      const capacity = rackCapacity(state.shop)
      const headerRow = el('div', 'rack-head')
      headerRow.append(el('div', 'comp-hint', `Полка для комплектующих: занято ${state.shop.rackInventory.length} из ${capacity} мест`))
      const goShop = el('button', 'btn small', 'Открыть магазин')
      goShop.addEventListener('click', () => {
        setStoreSection('equip')
        switchTab(app, 'store')
      })
      headerRow.append(goShop)
      rackPanel.append(headerRow)

      const controlRow = el('div', 'rack-tools')
      const catSel = el('select')
      catSel.className = 'rack-filter'
      const CATS: { value: string; label: string }[] = [
        { value: 'all', label: 'Всё оборудование' },
        { value: 'decor', label: 'Только декор' },
        ...EQUIPMENT_IDS.map((id) => ({ value: id, label: EQUIPMENT[id].name })),
      ]
      fillSelect(catSel, CATS, rackFilter)
      catSel.addEventListener('change', () => {
        rackFilter = catSel.value
        renderRackPanel()
      })
      const sortSel = el('select')
      sortSel.className = 'rack-sort'
      const SORTS: { value: string; label: string }[] = [
        { value: 'name', label: 'Сорт: по имени' },
        { value: 'price', label: 'Сорт: по цене ↑' },
        { value: 'priceDesc', label: 'Сорт: по цене ↓' },
        { value: 'count', label: 'Сорт: по количеству' },
      ]
      fillSelect(sortSel, SORTS, rackSort)
      sortSel.addEventListener('change', () => {
        rackSort = sortSel.value
        renderRackPanel()
      })
      controlRow.append(catSel, sortSel)
      rackPanel.append(controlRow)
      rackPanel.append(renderRackList(state))
    }
    renderRackPanel()
  }

  let rackFilter = 'all'
  let rackSort = 'name'

  function renderRackList(state: GameState): HTMLElement {
    const list = el('div', 'rack-list')
    type Row = { label: string; price: number; count: number; kind: 'equip' | 'decor'; id: string }
    const rows: Row[] = []
    const eqCount = new Map<EquipmentId, number>()
    for (const eid of state.shop.rackInventory) eqCount.set(eid, (eqCount.get(eid) ?? 0) + 1)
    for (const [eid, count] of eqCount) {
      if (rackFilter !== 'all' && rackFilter !== 'decor' && rackFilter !== eid) continue
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
      })
      const install = el('button', 'btn small', row.kind === 'equip' ? 'Установить' : 'Разместить')
      install.addEventListener('click', () => openRackInstallModal(state, row.kind, row.id as EquipmentId, row.id as DecorKind))
      item.append(sell, install)
      list.append(item)
    }
    return list
  }

  function openRackInstallModal(s: GameState, kind: 'equip' | 'decor', eid: EquipmentId, dkind: DecorKind): void {
    const all = allAquariums(s)
    const { body } = overlay(kind === 'equip' ? 'Установить оборудование' : 'Разместить декор')
    if (all.length === 0) {
      body.append(el('div', 'empty', 'Нет аквариумов. Добавьте аквариум на стеллаж.'))
      return
    }
    body.append(el('div', 'comp-hint', kind === 'equip' ? 'Выберите аквариум для установки:' : 'Выберите аквариум для декора:'))
    for (const aq of all) {
      const row = el('div', 'modal-row')
      const full = aq.equipment.length >= 4
      const name = el('strong', '', `${aq.name} (${aq.volume} л)`)
      const btn = el('button', 'btn small', kind === 'equip' ? 'Установить' : 'Разместить')
      btn.disabled = kind === 'equip' && (full || aq.equipment.some((x) => x.id === eid))
      btn.addEventListener('click', () => {
        if (kind === 'equip') actions.onInstallEquipment(eid, aq.id)
        else actions.onPlaceDecorFromRack(dkind, aq.id)
      })
      row.append(name, el('span', 'comp-hint', kind === 'equip' && full ? 'слоты заполнены' : ''), btn)
      body.append(row)
    }
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
      buyBtn.disabled = state.money < buyPrice(species, factor)
      buyBtn.addEventListener('click', () => actions.onBuyFishToStorage(species.id, storeDest.value))
      card.append(buyBtn)
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
      btn.disabled = state.money < def.price
      btn.addEventListener('click', () => actions.onBuyDecor(kind))
      card.append(btn)
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
      btn.disabled = state.money < def.price || state.shop.rackInventory.length >= rackCapacity(state.shop)
      btn.addEventListener('click', () => actions.onBuyEquipment(eid))
      card.append(btn)
      equipStore.append(card)
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
    tabButton('zal', 'Зал', true),
    tabButton('aquarium', 'Аквариум', false),
    tabButton('storage', 'Склад', false),
    tabButton('store', 'Магазин', false),
    tabButton('orders', 'Заказы', false),
    tabButton('furni', 'Обустройство', false),
    el('button', 'tab-btn disabled', 'Разводня'),
    el('button', 'tab-btn disabled', 'Опт'),
    el('button', 'tab-btn disabled', 'Сервис'),
  )

  const main = el('main', 'main')

  const zalTab = el('section', 'tab active')
  zalTab.id = 'tab-zal'
  zalTab.append(
    el('h2', 'sec-title', 'Выставочный зал'),
    buildHallCanvas(),
    el('h2', 'sec-title', 'Управление стеллажами'),
    el('div', 'hall-actions'),
    el('div', 'hall-list'),
  )

  const ordersTab = el('section', 'tab')
  ordersTab.id = 'tab-orders'
  ordersTab.append(
    el('h2', 'sec-title', 'Заказы покупателей'),
    el('div', 'orders-panel'),
  )

  const furnTab = el('section', 'tab')
  furnTab.id = 'tab-furn'
  furnTab.append(
    el('h2', 'sec-title', 'Обустройство магазина'),
    el('div', 'shop-equipment'),
    el('h2', 'sec-title', 'Купить стеллаж'),
    el('div', 'shelf-store'),
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

  const storageTab = el('section', 'tab')
  storageTab.id = 'tab-storage'
  const storageBar = el('div', 'tank-bar')
  storageBar.append(el('label', '', 'Склад: '))
  const storageSelect = el('select')
  storageSelect.id = 'storageSelect'
  storageBar.append(storageSelect)
  storageTab.append(
    storageBar,
    el('h2', 'sec-title', 'Склады'),
    el('div', 'tank-cards storage-cards'),
    addStorageButton(),
    el('h2', 'sec-title', 'Стеллажи на складе'),
    el('div', 'shelf-inventory'),
    el('h2', 'sec-title', 'Рыбы «на продажу»'),
    el('div', 'stock-list'),
    el('h2', 'sec-title', 'Полка для комплектующих'),
    el('div', 'rack-panel'),
  )

  const storeTab = el('section', 'tab')
  storeTab.id = 'tab-store'
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
  storeTab.append(storeBar, storeTabs, fishStore, decorStore, equipStore)

  main.append(zalTab, aquariumTab, storageTab, storeTab, ordersTab, furnTab)

  const footer = el('footer', 'log-panel')
  footer.append(el('h3', '', 'Журнал событий'))
  footer.append(el('ul', 'log-list'))

  game.append(header, nav, main, footer)
  return game
}