import { FISH_SPECIES, SPECIES_BY_ID } from '../data/fish'
import { MAX_DESIGN_LEVEL, designUpgradeCost } from '../data/aquarium'
import {
  COMPONENTS,
  COMPONENT_IDS,
  COMPONENT_SLOTS_PER_TANK,
  SHOP_ITEMS,
  DISPLAY_TANK_SLOTS_PER_SHELF,
  DISPLAY_TANK_PRICE,
  STORAGE_TANK_PRICE,
  displaySlots,
  rackCapacity,
} from '../data/shop'
import { compatibility } from '../sim/conditions'
import { tankAttractiveness } from '../sim/buyers'
import { availableStock, buyPrice, retailPrice, stockTotal, wholesalePrice } from '../sim/economy'
import type { ComponentId, GameState, TankKind, TankState } from '../types'

export interface UIActions {
  onBuyComponent(id: ComponentId): void
  onInstallComponent(id: ComponentId, tankId: string): void
  onRemoveComponent(id: ComponentId, tankId: string): void
  onUpgradeDesign(tankId: string): void
  onSettingsChange(tankId: string, key: 'volume' | 'temperature' | 'hardness' | 'vegetation', value: number): void
  onBuyShopItem(kind: 'cashRegister' | 'restArea' | 'shelvingUnit' | 'componentRack'): void
  onAddTank(kind: TankKind): void
  onSelectDisplay(tankId: string): void
  onSelectStorage(tankId: string): void
  onBuyFishToStorage(speciesId: string, storageTankId: string): void
  onWholesaleSell(speciesId: string, storageTankId: string): void
  onStockToDisplay(speciesId: string, displayTankId: string, count: number): void
  onMoveDisplayToStorage(tankId: string, fishId: string): void
  onFulfillOrder(orderId: string): void
  onEndDay(): void
  onReset(): void
}

type TabName = 'zal' | 'display' | 'storage' | 'store'
type SettingsKey = 'volume' | 'temperature' | 'hardness' | 'vegetation'

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

function displayTanks(state: GameState): TankState[] {
  return state.tanks.filter((t) => t.kind === 'display')
}

function storageTanks(state: GameState): TankState[] {
  return state.tanks.filter((t) => t.kind === 'storage')
}

function tankById(state: GameState, id: string | null): TankState | undefined {
  return state.tanks.find((t) => t.id === id)
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

function demandBadge(factor: number): HTMLElement {
  if (factor >= 1.3) return el('span', 'compat ok', `спрос высокий ×${factor.toFixed(2)}`)
  if (factor >= 0.85) return el('span', 'compat warn', `спрос средний ×${factor.toFixed(2)}`)
  return el('span', 'compat dead', `спрос низкий ×${factor.toFixed(2)}`)
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

  const displaySelect = app.querySelector<HTMLSelectElement>('#displaySelect')!
  const storageSelect = app.querySelector<HTMLSelectElement>('#storageSelect')!
  const storeDest = app.querySelector<HTMLSelectElement>('#storeDest')!

  const shopEquipment = app.querySelector<HTMLDivElement>('.shop-equipment')!
  const ordersPanel = app.querySelector<HTMLDivElement>('.orders-panel')!
  const displayCards = app.querySelector<HTMLDivElement>('.display-cards')!
  const storageCards = app.querySelector<HTMLDivElement>('.storage-cards')!
  const displayHeader = app.querySelector<HTMLDivElement>('.displays .group-title')!
  const storageHeader = app.querySelector<HTMLDivElement>('.storages .group-title')!
  const addDisplayBtn = app.querySelector<HTMLButtonElement>('#addDisplay')!
  const addStorageBtn = app.querySelector<HTMLButtonElement>('#addStorage')!
  const visitorsInfo = app.querySelector<HTMLDivElement>('.visitors-info')!
  const displayAtt = app.querySelector<HTMLSpanElement>('.display-att')!
  const tankStatus = app.querySelector<HTMLDivElement>('.tank-status')!
  const designPanel = app.querySelector<HTMLDivElement>('.design-panel')!
  const componentsPanel = app.querySelector<HTMLDivElement>('.components-panel')!
  const stockinPanel = app.querySelector<HTMLDivElement>('.stockin-panel')!
  const tankFishList = app.querySelector<HTMLDivElement>('.tank-fish')!
  const stockList = app.querySelector<HTMLDivElement>('.stock-list')!
  const rackPanel = app.querySelector<HTMLDivElement>('.rack-panel')!
  const storeGrid = app.querySelector<HTMLDivElement>('.store-grid')!
  const logList = app.querySelector<HTMLUListElement>('.log-list')!

  const sliderInputs = Array.from(app.querySelectorAll<HTMLInputElement>('input[data-slider-key]'))
  const sliderValues = new Map<string, HTMLSpanElement>()
  sliderInputs.forEach((input) => {
    const row = input.closest('.slider-row')
    if (row) sliderValues.set(input.dataset.sliderKey!, row.querySelector('.slider-value')!)
  })

  displaySelect.addEventListener('change', () => actions.onSelectDisplay(displaySelect.value))
  storageSelect.addEventListener('change', () => actions.onSelectStorage(storageSelect.value))
  app.querySelector<HTMLButtonElement>('.btn-reset')!.addEventListener('click', () => actions.onReset())
  app.querySelector<HTMLButtonElement>('.btn-endday')!.addEventListener('click', () => {
    if (window.confirm('Завершить день? Обновится рынок, будет списана аренда и содержание.')) actions.onEndDay()
  })
  addDisplayBtn.addEventListener('click', () => actions.onAddTank('display'))
  addStorageBtn.addEventListener('click', () => actions.onAddTank('storage'))

  setupTabs(app)

  let epoch = -1
  let lastFlashAt = 0
  let lastDisplayId: string | null = null

  function flash(message: string): void {
    hudFlash.textContent = message
    hudFlash.classList.add('show')
    lastFlashAt = performance.now()
  }

  function syncSliders(tank: TankState): void {
    for (const input of sliderInputs) {
      const key = input.dataset.sliderKey as SettingsKey
      const raw = key === 'vegetation' ? tank.vegetation * 100 : tank[key]
      input.value = String(Math.round(raw))
      sliderValues.get(key)?.replaceChildren(document.createTextNode(`${input.value}${input.dataset.sliderSuffix ?? ''}`))
    }
  }

  function update(state: GameState, shopAtt: number): void {
    hudMoney.textContent = `Деньги: ${state.money}₽`
    hudDay.textContent = `День ${state.day} · ${Math.floor(state.daySeconds)}с`
    hudAtt.textContent = `Привлекательность зала: ${shopAtt}/100`
    hudAtt.classList.toggle('good', shopAtt >= 60)
    hudAtt.classList.toggle('mid', shopAtt >= 30 && shopAtt < 60)
    hudAtt.classList.toggle('bad', shopAtt < 30)
    hudVisitors.textContent = `Заказов: ${state.orders.length}`
    hudSales.textContent = `Продаж: ${state.sales}`
    if (performance.now() - lastFlashAt > 2500) hudFlash.classList.remove('show')

    const selectedDisplay = tankById(state, state.selectedTankId)
    if (lastDisplayId !== state.selectedTankId && selectedDisplay) {
      lastDisplayId = state.selectedTankId
      syncSliders(selectedDisplay)
    }

    if (state.epoch !== epoch) {
      epoch = state.epoch
      renderZal(state)
      renderOrders(state)
      renderDisplay(state)
      renderStorage(state)
      renderStore(state)
      renderLog(state)
    }
  }

  function renderZal(state: GameState): void {
    const shop = state.shop
    const slots = displaySlots(shop)
    const displays = displayTanks(state)

    shopEquipment.innerHTML = ''
    const items: { key: 'cashRegister' | 'restArea' | 'shelvingUnit' | 'componentRack'; state: string }[] = [
      { key: 'cashRegister', state: shop.cashRegister ? 'Установлена' : 'Нет' },
      { key: 'restArea', state: `×${shop.restAreas}` },
      { key: 'shelvingUnit', state: `×${shop.shelvingUnits}` },
      { key: 'componentRack', state: `×${shop.componentRacks}` },
    ]
    for (const item of items) {
      const def = SHOP_ITEMS[item.key]
      const card = el('div', 'shop-card')
      const isRegister = item.key === 'cashRegister'
      card.append(el('strong', 'shop-name', def.name), el('div', 'shop-desc', def.desc), el('div', 'shop-state', item.state))
      if (!(isRegister && shop.cashRegister)) {
        const btn = el('button', 'btn small', `Купить — ${def.price}₽`)
        btn.disabled = state.money < def.price
        btn.addEventListener('click', () => actions.onBuyShopItem(item.key))
        card.append(btn)
      }
      shopEquipment.append(card)
    }

    displayHeader.textContent = `Выставочные аквариумы (${displays.length} / ${slots})`
    displayCards.innerHTML = ''
    for (const t of displays) {
      const card = el('div', 'tank-card')
      card.append(
        el('span', 'badge badge-display', 'Витрина'),
        el('strong', '', t.name),
        el('div', 'tank-card-line', `Рыб: ${t.fish.length} · привл. ${tankAttractiveness(t)}/100`),
      )
      const openBtn = el('button', 'btn small', 'Открыть')
      openBtn.addEventListener('click', () => {
        actions.onSelectDisplay(t.id)
        switchTab(app, 'display')
      })
      card.append(openBtn)
      displayCards.append(card)
    }
    addDisplayBtn.textContent = `Добавить витрину — ${DISPLAY_TANK_PRICE}₽ (${DISPLAY_TANK_SLOTS_PER_SHELF} на стеллаж)`
    addDisplayBtn.disabled = displays.length >= slots || state.money < DISPLAY_TANK_PRICE

    const storages = storageTanks(state)
    storageHeader.textContent = `Склад / «на продажу» (${storages.length})`
    storageCards.innerHTML = ''
    for (const t of storages) {
      const card = el('div', 'tank-card')
      card.append(
        el('span', 'badge badge-storage', 'Склад'),
        el('strong', '', t.name),
        el('div', 'tank-card-line', `Рыб на хранении: ${stockTotal(t.stock)}`),
      )
      const openBtn = el('button', 'btn small', 'Открыть')
      openBtn.addEventListener('click', () => {
        actions.onSelectStorage(t.id)
        switchTab(app, 'storage')
      })
      card.append(openBtn)
      storageCards.append(card)
    }
    addStorageBtn.textContent = `Добавить склад — ${STORAGE_TANK_PRICE}₽`
    addStorageBtn.disabled = state.money < STORAGE_TANK_PRICE

    visitorsInfo.textContent =
      state.orders.length === 0
        ? 'Покупатели приходят, когда в магазине есть рыбы. Они оставляют заказы — выполняйте их вручную. День завершайте кнопкой «Завершить день» — обновится рынок и будет списана аренда.'
        : 'Покупатели оставили заказы. Выполните их, пока клиенты не ушли. Кнопкой «Завершить день» запустите следующий день.'
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
      const kindLabel = order.kind === 'demand' ? 'по спросу' : 'по витрине'
      const badge = el('span', order.kind === 'demand' ? 'compat ok' : 'compat warn', kindLabel)
      const total = order.unitPrice * order.qty
      const timer = el('span', 'order-timer', `⏳ ${Math.ceil(order.timeLeft)}с`)
      const sellBtn = el('button', 'btn small', `Продать за ${total}₽`)
      sellBtn.disabled = availableStock(state, order.speciesId) < order.qty
      sellBtn.addEventListener('click', () => actions.onFulfillOrder(order.id))
      row.append(
        dot,
        el('span', 'order-name', `${species.name} ×${order.qty}`),
        el('span', 'order-price', `по ${order.unitPrice}₽`),
        timer,
        badge,
        sellBtn,
      )
      ordersPanel.append(row)
    }
  }

  function renderDisplay(state: GameState): void {
    fillSelect(
      displaySelect,
      displayTanks(state).map((t) => ({ value: t.id, label: t.name })),
      state.selectedTankId,
    )
    const tank = tankById(state, state.selectedTankId)
    if (!tank || tank.kind !== 'display') {
      displayAtt.textContent = 'Витрина не выбрана'
      tankStatus.textContent = 'Добавьте витрину во вкладке «Зал».'
      designPanel.innerHTML = ''
      componentsPanel.innerHTML = ''
      stockinPanel.innerHTML = ''
      tankFishList.innerHTML = ''
      return
    }

    displayAtt.textContent = `Привлекательность витрины: ${tankAttractiveness(tank)}/100`
    const required = tank.fish.reduce((acc, f) => acc + SPECIES_BY_ID[f.speciesId].minVolume, 0)
    let info = `Объём ${tank.volume} л · ${tank.temperature}°C · ${tank.hardness}°dH · растительность ${Math.round(tank.vegetation * 100)}% · дизайн ${tank.designLevel}/${MAX_DESIGN_LEVEL}`
    if (required > tank.volume) info += ` · <span class="warn">ПЕРЕНАСЕЛЕНИЕ (нужно ${required} л)</span>`
    tankStatus.innerHTML = info

    designPanel.innerHTML = ''
    designPanel.append(el('div', '', `Уровень дизайна: ${tank.designLevel} / ${MAX_DESIGN_LEVEL}`))
    const nextCost = designUpgradeCost(tank.designLevel)
    const designBtn = el('button', 'btn', 'Улучшить дизайн')
    designBtn.disabled = tank.designLevel >= MAX_DESIGN_LEVEL || state.money < nextCost
    designBtn.append(el('span', 'btn-cost', tank.designLevel >= MAX_DESIGN_LEVEL ? '' : ` — ${nextCost}₽`))
    designBtn.addEventListener('click', () => actions.onUpgradeDesign(tank.id))
    designPanel.append(designBtn)

    componentsPanel.innerHTML = ''
    const freeSlots = COMPONENT_SLOTS_PER_TANK - tank.components.length
    componentsPanel.append(
      el('div', 'comp-hint', `Слоты компонентов: ${tank.components.length} / ${COMPONENT_SLOTS_PER_TANK}${freeSlots > 0 ? ` (свободно ${freeSlots})` : ''}`),
    )
    if (tank.components.length > 0) {
      for (const cid of tank.components) {
        const def = COMPONENTS[cid]
        const row = el('div', 'comp-row')
        const removeBtn = el('button', 'btn small', 'Снять')
        removeBtn.addEventListener('click', () => actions.onRemoveComponent(cid, tank.id))
        row.append(el('span', '', def.name), removeBtn)
        componentsPanel.append(row)
      }
    } else {
      componentsPanel.append(el('div', 'empty', 'Оборудование не установлено.'))
    }
    if (state.shop.rackInventory.length > 0) {
      componentsPanel.append(el('div', 'comp-hint', 'Доступно с полки:'))
      for (const cid of state.shop.rackInventory) {
        const def = COMPONENTS[cid]
        const row = el('div', 'comp-row')
        const btn = el('button', 'btn small', 'Установить')
        btn.disabled = tank.components.includes(cid) || freeSlots <= 0
        btn.addEventListener('click', () => actions.onInstallComponent(cid, tank.id))
        row.append(el('span', '', def.name), btn)
        componentsPanel.append(row)
      }
    }

    stockinPanel.innerHTML = ''
    const stockById = new Map<string, number>()
    for (const st of storageTanks(state)) {
      for (const item of st.stock) stockById.set(item.speciesId, (stockById.get(item.speciesId) ?? 0) + item.count)
    }
    if (stockById.size === 0) {
      stockinPanel.append(el('div', 'empty', 'Склад пуст — закупите рыб во вкладке «Магазин».'))
    }
    for (const [speciesId, count] of stockById) {
      const species = SPECIES_BY_ID[speciesId]
      const row = el('div', 'stock-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const name = el('span', 'stock-name', `${species.name} — на складе ${count}`)
      const countInput = el('input')
      countInput.type = 'number'
      countInput.min = '1'
      countInput.max = String(count)
      countInput.value = '1'
      countInput.className = 'count-input'
      const moveBtn = el('button', 'btn small', 'Заселить')
      moveBtn.addEventListener('click', () => {
        const n = Math.max(1, Math.min(count, Number(countInput.value) || 1))
        actions.onStockToDisplay(speciesId, tank.id, n)
      })
      row.append(dot, name, countInput, moveBtn)
      stockinPanel.append(row)
    }

    tankFishList.innerHTML = ''
    tankFishList.append(el('div', 'list-title', `Рыбы в витрине (${tank.fish.length})`))
    if (tank.fish.length === 0) {
      tankFishList.append(el('div', 'empty', 'Витрина пуста. Заселите рыб из склада выше.'))
    }
    for (const fish of tank.fish) {
      const species = SPECIES_BY_ID[fish.speciesId]
      const row = el('div', 'fish-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const name = el('span', 'fish-name', species.name)
      const health = el('span', 'health')
      const bar = el('span', 'health-bar')
      const fill = el('span', 'health-fill')
      fill.style.width = `${fish.health}%`
      fill.classList.add(fish.health > 60 ? 'ok' : fish.health > 30 ? 'warn' : 'dead')
      bar.append(fill)
      health.append(bar, el('span', 'health-num', `${Math.round(fish.health)}%`))
      const toStorage = el('button', 'btn small', 'В склад')
      toStorage.addEventListener('click', () => actions.onMoveDisplayToStorage(tank.id, fish.id))
      row.append(dot, name, health, toStorage)
      tankFishList.append(row)
    }
  }

  function renderStorage(state: GameState): void {
    fillSelect(
      storageSelect,
      storageTanks(state).map((t) => ({ value: t.id, label: t.name })),
      state.selectedStorageId,
    )
    const tank = tankById(state, state.selectedStorageId)
    if (!tank || tank.kind !== 'storage') {
      stockList.innerHTML = ''
      rackPanel.innerHTML = ''
      return
    }

    stockList.innerHTML = ''
    stockList.append(el('div', 'list-title', `Рыбы «на продажу» (${stockTotal(tank.stock)} шт.)`))
    if (tank.stock.length === 0) {
      stockList.append(el('div', 'empty', 'Склад пуст. Закупите рыб во вкладке «Магазин».'))
    }
    for (const item of tank.stock) {
      const species = SPECIES_BY_ID[item.speciesId]
      const f = state.market[item.speciesId] ?? 1
      const row = el('div', 'stock-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const name = el('span', 'stock-name', `${species.name} — ${item.count} шт.`)
      const wholesaleBtn = el('button', 'btn small', `Опт — ${wholesalePrice(species, f)}₽/шт`)
      wholesaleBtn.addEventListener('click', () => actions.onWholesaleSell(item.speciesId, tank.id))
      row.append(dot, name, wholesaleBtn)
      stockList.append(row)
    }

    rackPanel.innerHTML = ''
    const capacity = rackCapacity(state.shop)
    rackPanel.append(
      el('div', 'comp-hint', `Полка для комплектующих: занято ${state.shop.rackInventory.length} из ${capacity} мест`),
    )
    for (const cid of COMPONENT_IDS) {
      const def = COMPONENTS[cid]
      const owned = state.shop.rackInventory.filter((c) => c === cid).length
      const row = el('div', 'comp-row')
      const buyBtn = el('button', 'btn small', `Купить — ${def.price}₽`)
      buyBtn.disabled = state.money < def.price || state.shop.rackInventory.length >= capacity
      buyBtn.addEventListener('click', () => actions.onBuyComponent(cid))
      row.append(el('span', 'comp-name', `${def.name} (в наличии: ${owned})`), buyBtn)
      rackPanel.append(row)
    }
  }

  function renderStore(state: GameState): void {
    fillSelect(
      storeDest,
      storageTanks(state).map((t) => ({ value: t.id, label: t.name })),
      state.selectedStorageId,
    )
    storeGrid.innerHTML = ''
    const refTank = tankById(state, state.selectedTankId)
    for (const species of FISH_SPECIES) {
      const factor = state.market[species.id] ?? 1
      const card = el('div', 'store-card')
      const head = el('div', 'store-head')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      head.append(dot, el('strong', 'store-name', species.name))
      card.append(head, el('div', 'store-latin', species.latin))
      card.append(demandBadge(factor))

      if (refTank && refTank.kind === 'display') {
        const rep = compatibility(species, refTank)
        const status =
          rep.score === 1 ? ['подходит идеально', 'ok'] : rep.score >= 0.5 ? ['частично подходит', 'warn'] : ['не подходит', 'dead']
        const statusEl = el('span', `compat ${status[1]}`, status[0])
        if (rep.issues.length) statusEl.title = rep.issues.join(', ')
        card.append(statusEl)
      }

      card.append(
        el('div', 'store-params', [
          `${species.sizeCm} см · мин. ${species.minVolume} л`,
          `${species.tempMin}–${species.tempMax}°C · ${species.hardMin}–${species.hardMax}°dH`,
          species.schooling ? 'стайная' : 'одиночная',
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
  }

  function renderLog(state: GameState): void {
    logList.innerHTML = ''
    const entries = [...state.log].reverse().slice(0, 20)
    for (const entry of entries) {
      const li = el('li', `log-${entry.kind}`)
      li.append(el('span', 'log-day', `д.${entry.day}`), el('span', 'log-text', entry.text))
      logList.append(li)
    }
  }

  return { update, flash }
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

function sliderGroup(key: SettingsKey, label: string, min: number, max: number, step: number, initial: number, suffix: string): HTMLElement {
  const wrap = el('div', 'slider-row')
  const labelEl = el('label', 'slider-label', `${label}: `)
  const valueEl = el('span', 'slider-value', `${initial}${suffix}`)
  labelEl.append(valueEl)
  const input = el('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(initial)
  input.dataset.sliderKey = key
  input.dataset.sliderSuffix = suffix
  input.addEventListener('input', () => {
    valueEl.textContent = `${input.value}${suffix}`
  })
  wrap.append(labelEl, input)
  return wrap
}

function buildLayout(): HTMLElement {
  const game = el('div', 'game')

  const header = el('header', 'hud')
  const left = el('div', 'hud-left')
  left.append(
    el('span', 'hud-money', 'Деньги: —'),
    el('span', 'hud-day', 'День —'),
    el('span', 'hud-att', 'Привлекательность: —'),
    el('span', 'hud-visitors', 'Заказов: —'),
    el('span', 'hud-sales', 'Продаж: —'),
  )
  const right = el('div', 'hud-right')
  right.append(el('span', 'hud-flash', ''))
  const endDayBtn = el('button', 'btn small btn-endday', 'Завершить день')
  right.append(endDayBtn)
  const resetBtn = el('button', 'btn small btn-reset', 'Сброс')
  right.append(resetBtn)
  header.append(left, right)

  const nav = el('nav', 'tabs')
  nav.append(
    tabButton('zal', 'Зал', true),
    tabButton('display', 'Витрина', false),
    tabButton('storage', 'Склад', false),
    tabButton('store', 'Магазин', false),
    el('button', 'tab-btn disabled', 'Разводня'),
    el('button', 'tab-btn disabled', 'Опт'),
    el('button', 'tab-btn disabled', 'Сервис'),
  )

  const main = el('main', 'main')

  const zalTab = el('section', 'tab active')
  zalTab.id = 'tab-zal'
  zalTab.append(
    el('h2', 'sec-title', 'Оборудование зала'),
    el('div', 'shop-equipment'),
    el('h2', 'sec-title', 'Заказы покупателей'),
    el('div', 'orders-panel'),
    el('h2', 'sec-title', 'Аквариумы'),
    el('div', 'tank-lists'),
    el('div', 'visitors-info'),
  )
  const tankLists = zalTab.querySelector<HTMLDivElement>('.tank-lists')!
  const displays = el('div', 'tank-group displays')
  displays.append(el('div', 'group-title', 'Выставочные аквариумы'))
  displays.append(el('div', 'tank-cards display-cards'))
  const addDisplay = el('button', 'btn', 'Добавить витрину')
  addDisplay.id = 'addDisplay'
  displays.append(addDisplay)
  const storages = el('div', 'tank-group storages')
  storages.append(el('div', 'group-title', 'Склад / «на продажу»'))
  storages.append(el('div', 'tank-cards storage-cards'))
  const addStorage = el('button', 'btn', 'Добавить склад')
  addStorage.id = 'addStorage'
  storages.append(addStorage)
  tankLists.append(displays, storages)

  const displayTab = el('section', 'tab')
  displayTab.id = 'tab-display'
  const displayBar = el('div', 'tank-bar')
  displayBar.append(el('label', '', 'Витрина: '))
  const displaySelect = el('select')
  displaySelect.id = 'displaySelect'
  displayBar.append(displaySelect, el('span', 'display-att', ''))
  displayTab.append(displayBar)
  const tankWrap = el('div', 'tank-wrap')
  const canvas = el('canvas')
  canvas.id = 'tank'
  canvas.width = 960
  canvas.height = 420
  tankWrap.append(canvas, el('div', 'tank-status', ''))
  const side = el('aside', 'side')
  side.append(el('h3', '', 'Параметры аквариума'))
  side.append(sliderGroup('volume', 'Объём, л', 20, 300, 10, 100, ' л'))
  side.append(sliderGroup('temperature', 'Температура, °C', 18, 31, 1, 25, '°C'))
  side.append(sliderGroup('hardness', 'Жёсткость, °dH', 0, 20, 1, 8, '°dH'))
  side.append(sliderGroup('vegetation', 'Растительность, %', 0, 100, 5, 50, '%'))
  side.append(el('h3', '', 'Дизайн'))
  side.append(el('div', 'design-panel'))
  side.append(el('h3', '', 'Компоненты'))
  side.append(el('div', 'components-panel'))
  side.append(el('h3', '', 'Заселить из склада'))
  side.append(el('div', 'stockin-panel'))
  side.append(el('h3', '', 'Рыбы'))
  side.append(el('div', 'tank-fish'))
  displayTab.append(tankWrap, side)

  const storageTab = el('section', 'tab')
  storageTab.id = 'tab-storage'
  const storageBar = el('div', 'tank-bar')
  storageBar.append(el('label', '', 'Склад: '))
  const storageSelect = el('select')
  storageSelect.id = 'storageSelect'
  storageBar.append(storageSelect)
  storageTab.append(
    storageBar,
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
  storeTab.append(storeBar, el('div', 'store-grid'))

  main.append(zalTab, displayTab, storageTab, storeTab)

  const footer = el('footer', 'log-panel')
  footer.append(el('h3', '', 'Журнал событий'))
  footer.append(el('ul', 'log-list'))

  game.append(header, nav, main, footer)
  return game
}
