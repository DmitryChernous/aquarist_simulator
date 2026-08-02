import { FISH_SPECIES, SPECIES_BY_ID } from '../data/fish'
import { MAX_DESIGN_LEVEL, AQUARIUM_MODELS, designUpgradeCost } from '../data/aquarium'
import { EQUIPMENT, EQUIPMENT_IDS, SHELVES, rackCapacity, shelfLoadLeft, shelfUsedLiters } from '../data/shop'
import { DECOR, DECOR_KINDS } from '../data/decor'
import { tankAttractiveness } from '../sim/buyers'
import { availableStock, buyPrice, retailPrice, stockTotal, wholesalePrice } from '../sim/economy'
import { canStock, vegetationOf } from '../sim/aquarium'
import { DAY_DURATION_SECONDS, formatGameDate } from '../timing'
import type { AquariumState, DecorKind, EquipmentId, GameState, ShelfState } from '../types'

export interface UIActions {
  onAddShelf(specId: string): void
  onRemoveShelf(shelfId: string): void
  onAddStorage(): void
  onBuyShopItem(kind: 'cashRegister' | 'restArea' | 'componentRack'): void
  onAddAquarium(shelfId: string, modelId: string): void
  onRemoveAquarium(shelfId: string, aqId: string): void
  onSelectAquarium(aqId: string): void
  onSelectStorage(storageId: string): void
  onUpgradeDesign(aqId: string): void
  onWaterChange(aqId: string, key: 'temperature' | 'ph' | 'gh', value: number): void
  onBuyEquipment(id: EquipmentId): void
  onInstallEquipment(id: EquipmentId, aqId: string): void
  onRemoveEquipment(id: EquipmentId, aqId: string): void
  onEquipmentSetting(aqId: string, eqId: EquipmentId, paramId: string, value: number): void
  onAddDecor(aqId: string, kind: DecorKind): void
  onRemoveDecor(aqId: string, decorId: string): void
  onStockToAquarium(speciesId: string, aqId: string, count: number): void
  onMoveToStorage(aqId: string, fishId: string): void
  onBuyFishToStorage(speciesId: string, storageId: string): void
  onWholesaleSell(speciesId: string, storageId: string): void
  onFulfillOrder(orderId: string): void
  onTogglePause(): void
  onSetSpeed(speed: number): void
  onReset(): void
}

type TabName = 'zal' | 'aquarium' | 'storage' | 'store'
type WaterKey = 'temperature' | 'ph' | 'gh'

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
  const ordersPanel = app.querySelector<HTMLDivElement>('.orders-panel')!

  const storageSelect = app.querySelector<HTMLSelectElement>('#storageSelect')!
  const storageCards = app.querySelector<HTMLDivElement>('.storage-cards')!
  const storageHeader = app.querySelector<HTMLDivElement>('.storages .group-title')!
  const addStorageBtn = app.querySelector<HTMLButtonElement>('#addStorage')!
  const stockList = app.querySelector<HTMLDivElement>('.stock-list')!
  const rackPanel = app.querySelector<HTMLDivElement>('.rack-panel')!

  const aquariumSelect = app.querySelector<HTMLSelectElement>('#aquariumSelect')!
  const aquariumAtt = app.querySelector<HTMLSpanElement>('#aquariumAtt')!
  const waterPanel = app.querySelector<HTMLDivElement>('.water-panel')!
  const decorPanel = app.querySelector<HTMLDivElement>('.decor-panel')!
  const equipmentPanel = app.querySelector<HTMLDivElement>('.equipment-panel')!
  const designPanel = app.querySelector<HTMLDivElement>('.design-panel')!
  const stockinPanel = app.querySelector<HTMLDivElement>('.stockin-panel')!
  const aquariumFishList = app.querySelector<HTMLDivElement>('.aquarium-fish')!

  const storeDest = app.querySelector<HTMLSelectElement>('#storeDest')!
  const storeGrid = app.querySelector<HTMLDivElement>('.store-grid')!
  const logList = app.querySelector<HTMLUListElement>('.log-list')!

  app.querySelector<HTMLButtonElement>('.btn-reset')!.addEventListener('click', () => actions.onReset())
  pauseBtn.addEventListener('click', () => actions.onTogglePause())
  for (const btn of speedBtns) btn.addEventListener('click', () => actions.onSetSpeed(Number(btn.dataset.speed)))
  aquariumSelect.addEventListener('change', () => actions.onSelectAquarium(aquariumSelect.value))
  storageSelect.addEventListener('change', () => actions.onSelectStorage(storageSelect.value))
  addStorageBtn.addEventListener('click', () => {
    if (window.confirm('Добавить склад за 150₽?')) actions.onAddStorage()
  })
  setupTabs(app)

  let epoch = -1
  let lastFlashAt = 0

  function flash(message: string): void {
    hudFlash.textContent = message
    hudFlash.classList.add('show')
    lastFlashAt = performance.now()
  }

  function update(state: GameState, shopAtt: number, timeScale: number, paused: boolean): void {
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
      renderStorage(state)
      renderStore(state)
      renderLog(state)
    }
  }

  function renderZal(state: GameState): void {
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
      btn.addEventListener('click', () => actions.onAddShelf(specId))
      card.append(btn)
      shelfStore.append(card)
    }

    hallList.innerHTML = ''
    if (state.shelves.length === 0) hallList.append(el('div', 'empty', 'Зал пуст. Купите стеллаж выше.'))
    for (const shelf of state.shelves) {
      const card = el('div', 'shelf-card')
      const head = el('div', 'shelf-head')
      head.append(
        el('strong', '', shelf.name),
        el('span', 'shelf-meta', `занято ${shelf.aquariums.length}/${shelf.slabs.length} · загрузка ${shelfUsedLiters(shelf)}/${shelf.loadCapacityL} л`),
      )
      const delShelf = el('button', 'btn small danger', 'Убрать стеллаж')
      delShelf.addEventListener('click', () => {
        if (window.confirm('Удалить стеллаж вместе со стоящими на нём аквариумами?')) actions.onRemoveShelf(shelf.id)
      })
      head.append(delShelf)
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
      for (const p of [waterPanel, decorPanel, equipmentPanel, designPanel, stockinPanel, aquariumFishList]) p.innerHTML = ''
      return
    }
    aquariumAtt.textContent = `Привлекательность: ${tankAttractiveness(aq)}/100`

    waterPanel.innerHTML = ''
    const wDefs: [WaterKey, string, number, number, number][] = [
      ['temperature', 'Температура', 15, 35, 0.5],
      ['ph', 'Кислотность pH', 5, 8.5, 0.1],
      ['gh', 'Жёсткость GH', 0, 20, 1],
    ]
    for (const [key, label, min, max, step] of wDefs) {
      waterPanel.append(slider(label, min, max, step, aq.water[key], (v) => actions.onWaterChange(aq.id, key, v)))
    }
    waterPanel.append(el('div', 'water-read', `O₂: ${aq.water.o2}% (от аэратора) · Свет: ${aq.water.light}% (от осветителя)`))
    if (aq.equipment.some((e) => e.id === 'heater')) {
      waterPanel.append(el('div', 'warn', 'Нагреватель задаёт температуру — отрегулируйте его во вкладке оборудования.'))
    }

    decorPanel.innerHTML = ''
    decorPanel.append(el('div', 'comp-hint', `Растительность: ${Math.round(vegetationOf(aq) * 100)}% · декораций: ${aq.decor.length}`))
    const decorRow = el('div', 'modal-row')
    for (const kind of DECOR_KINDS) {
      const def = DECOR[kind]
      const btn = el('button', 'btn small', `+${def.name} — ${def.price}₽`)
      btn.disabled = state.money < def.price
      btn.addEventListener('click', () => actions.onAddDecor(aq.id, kind))
      decorRow.append(btn)
    }
    decorPanel.append(decorRow)
    if (aq.decor.length) {
      const list = el('div', 'comp-list')
      for (const d of aq.decor) {
        const rowEl = el('div', 'comp-row')
        const rm = el('button', 'btn small', 'Убрать')
        rm.addEventListener('click', () => actions.onRemoveDecor(aq.id, d.id))
        rowEl.append(el('span', 'comp-name', DECOR[d.kind].name), rm)
        list.append(rowEl)
      }
      decorPanel.append(list)
    }

    equipmentPanel.innerHTML = ''
    const freeSlots = 4 - aq.equipment.length
    equipmentPanel.append(el('div', 'comp-hint', `Оборудование: ${aq.equipment.length}/4 (свободно ${freeSlots})`))
    for (const inst of aq.equipment) {
      const def = EQUIPMENT[inst.id]
      const block = el('div', 'eq-block')
      const head = el('div', 'eq-head')
      head.append(el('strong', '', def.name))
      const rm = el('button', 'btn small', 'Снять')
      rm.addEventListener('click', () => actions.onRemoveEquipment(inst.id, aq.id))
      head.append(rm)
      block.append(head)
      for (const p of def.params) {
        block.append(
          slider(p.label, p.min, p.max, p.step, inst.settings[p.id] ?? p.default, (v) =>
            actions.onEquipmentSetting(aq.id, inst.id, p.id, v),
          ),
        )
      }
      equipmentPanel.append(block)
    }
    if (state.shop.rackInventory.length > 0) {
      equipmentPanel.append(el('div', 'comp-hint', 'Доступно с полки:'))
      for (const eid of state.shop.rackInventory) {
        const def = EQUIPMENT[eid]
        const row = el('div', 'comp-row')
        const btn = el('button', 'btn small', 'Установить')
        btn.disabled = aq.equipment.some((x) => x.id === eid) || freeSlots <= 0
        btn.addEventListener('click', () => actions.onInstallEquipment(eid, aq.id))
        row.append(el('span', '', def.name), btn)
        equipmentPanel.append(row)
      }
    }

    designPanel.innerHTML = ''
    designPanel.append(el('div', '', `Уровень дизайна: ${aq.designLevel} / ${MAX_DESIGN_LEVEL}`))
    const nextCost = designUpgradeCost(aq.designLevel)
    const dBtn = el('button', 'btn', 'Улучшить дизайн')
    dBtn.disabled = aq.designLevel >= MAX_DESIGN_LEVEL || state.money < nextCost
    if (aq.designLevel < MAX_DESIGN_LEVEL) dBtn.append(el('span', 'btn-cost', ` — ${nextCost}₽`))
    dBtn.addEventListener('click', () => actions.onUpgradeDesign(aq.id))
    designPanel.append(dBtn)

    stockinPanel.innerHTML = ''
    const stockById = new Map<string, number>()
    for (const st of state.storage) for (const item of st.stock) stockById.set(item.speciesId, (stockById.get(item.speciesId) ?? 0) + item.count)
    if (stockById.size === 0) stockinPanel.append(el('div', 'empty', 'Склад пуст — закупите рыб во вкладке «Магазин».'))
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
      row.append(dot, el('span', 'stock-name', `${species.name} (склад ${count} · в аквариум до ${room})`), inp, btn)
      stockinPanel.append(row)
    }

    aquariumFishList.innerHTML = ''
    aquariumFishList.append(el('div', 'list-title', `Рыбы в аквариуме (${aq.fish.length})`))
    if (aq.fish.length === 0) aquariumFishList.append(el('div', 'empty', 'Аквариум пуст. Заселите рыб выше.'))
    for (const fish of aq.fish) {
      const species = SPECIES_BY_ID[fish.speciesId]
      const row = el('div', 'fish-row')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      const fill = el('span', 'health-fill')
      fill.style.width = `${fish.health}%`
      fill.classList.add(fish.health > 60 ? 'ok' : fish.health > 30 ? 'warn' : 'dead')
      const name = el('span', 'fish-name', `${species.name} `)
      name.append(fill)
      const toStorage = el('button', 'btn small', 'В склад')
      toStorage.addEventListener('click', () => actions.onMoveToStorage(aq.id, fish.id))
      row.append(dot, name, el('span', 'health-num', `${Math.round(fish.health)}%`), toStorage)
      aquariumFishList.append(row)
    }
  }

  function renderStorage(state: GameState): void {
    fillSelect(storageSelect, state.storage.map((t) => ({ value: t.id, label: t.name })), state.selectedStorageId)
    const tank = state.storage.find((t) => t.id === state.selectedStorageId)
    storageHeader.textContent = `Склады (${state.storage.length})`
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
    const capacity = rackCapacity(state.shop)
    rackPanel.append(el('div', 'comp-hint', `Полка для комплектующих: занято ${state.shop.rackInventory.length} из ${capacity} мест`))
    for (const eid of EQUIPMENT_IDS) {
      const def = EQUIPMENT[eid]
      const owned = state.shop.rackInventory.filter((c) => c === eid).length
      const row = el('div', 'comp-row')
      const btn = el('button', 'btn small', `Купить — ${def.price}₽`)
      btn.disabled = state.money < def.price || state.shop.rackInventory.length >= capacity
      btn.addEventListener('click', () => actions.onBuyEquipment(eid))
      row.append(el('span', 'comp-name', `${def.name} (в наличии: ${owned})`), btn)
      rackPanel.append(row)
    }
  }

  function renderStore(state: GameState): void {
    fillSelect(storeDest, state.storage.map((t) => ({ value: t.id, label: t.name })), state.selectedStorageId)
    storeGrid.innerHTML = ''
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
  }

  function renderLog(state: GameState): void {
    logList.innerHTML = ''
    for (const entry of [...state.log].reverse().slice(0, 20)) {
      const li = el('li', `log-${entry.kind}`)
      li.append(el('span', 'log-day', `д.${entry.day}`), el('span', 'log-text', entry.text))
      logList.append(li)
    }
  }

  return { update, flash, selectTab: (tab: TabName) => switchTab(app, tab) }
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
    el('h2', 'sec-title', 'Купить стеллаж'),
    el('div', 'shelf-store'),
    el('h2', 'sec-title', 'Заказы покупателей'),
    el('div', 'orders-panel'),
    el('h2', 'sec-title', 'Выставочный зал'),
    buildHallCanvas(),
    el('div', 'hall-list'),
  )

  const aquariumTab = el('section', 'tab')
  aquariumTab.id = 'tab-aquarium'
  const aqBar = el('div', 'tank-bar')
  aqBar.append(el('label', '', 'Аквариум: '))
  const aquariumSelect = el('select')
  aquariumSelect.id = 'aquariumSelect'
  const aquariumAtt = el('span', '', '')
  aquariumAtt.id = 'aquariumAtt'
  aqBar.append(aquariumSelect, el('span', '', ' · '), aquariumAtt)
  aquariumTab.append(aqBar)
  const tankWrap = el('div', 'tank-wrap')
  const canvas = el('canvas')
  canvas.id = 'tank'
  canvas.width = 960
  canvas.height = 420
  tankWrap.append(canvas)
  const side = el('aside', 'side')
  side.append(el('h3', '', 'Параметры воды'))
  side.append(el('div', 'water-panel'))
  side.append(el('h3', '', 'Декорации'))
  side.append(el('div', 'decor-panel'))
  side.append(el('h3', '', 'Оборудование'))
  side.append(el('div', 'equipment-panel'))
  side.append(el('h3', '', 'Дизайн'))
  side.append(el('div', 'design-panel'))
  side.append(el('h3', '', 'Заселить из склада'))
  side.append(el('div', 'stockin-panel'))
  side.append(el('h3', '', 'Рыбы'))
  side.append(el('div', 'aquarium-fish'))
  aquariumTab.append(tankWrap, side)

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

  main.append(zalTab, aquariumTab, storageTab, storeTab)

  const footer = el('footer', 'log-panel')
  footer.append(el('h3', '', 'Журнал событий'))
  footer.append(el('ul', 'log-list'))

  game.append(header, nav, main, footer)
  return game
}