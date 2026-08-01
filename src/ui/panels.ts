import { FISH_SPECIES, SPECIES_BY_ID } from '../data/fish'
import { MAX_DESIGN_LEVEL, designUpgradeCost } from '../data/aquarium'
import { compatibility } from '../sim/conditions'
import type { AquariumConfig, GameState } from '../types'

export interface UIActions {
  onBuyFish(speciesId: string): void
  onSellFish(fishId: string): void
  onAquariumChange(key: keyof AquariumConfig, value: number): void
  onDesignUpgrade(): void
  onReset(): void
}

type TabName = 'tank' | 'store'

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

export function buildApp(actions: UIActions, initAquarium: AquariumConfig) {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (!app) throw new Error('#app not found')

  app.innerHTML = ''
  app.append(buildLayout())

  const hudMoney = app.querySelector<HTMLSpanElement>('.hud-money')!
  const hudDay = app.querySelector<HTMLSpanElement>('.hud-day')!
  const hudAtt = app.querySelector<HTMLSpanElement>('.hud-att')!
  const hudFlash = app.querySelector<HTMLSpanElement>('.hud-flash')!
  const tankFishList = app.querySelector<HTMLDivElement>('.tank-fish')!
  const storeGrid = app.querySelector<HTMLDivElement>('.store-grid')!
  const logList = app.querySelector<HTMLUListElement>('.log-list')!
  const designPanel = app.querySelector<HTMLDivElement>('.design-panel')!
  const crowdedBadge = app.querySelector<HTMLDivElement>('.tank-status')!

  buildSliders(actions, initAquarium)

  setupTabs(app)

  app.querySelector<HTMLButtonElement>('.btn-reset')!.addEventListener('click', () => actions.onReset())

  let epoch = -1
  let lastFlashAt = 0

  function flash(message: string): void {
    hudFlash.textContent = message
    hudFlash.classList.add('show')
    lastFlashAt = performance.now()
  }

  function update(state: GameState, att: number): void {
    hudMoney.textContent = `Деньги: ${state.money}₽`
    hudDay.textContent = `День ${state.day}`
    hudAtt.textContent = `Привлекательность: ${att}/100`
    hudAtt.classList.toggle('good', att >= 60)
    hudAtt.classList.toggle('mid', att >= 30 && att < 60)
    hudAtt.classList.toggle('bad', att < 30)

    if (performance.now() - lastFlashAt > 2500) hudFlash.classList.remove('show')

    if (state.epoch !== epoch) {
      epoch = state.epoch
      renderTankStatus(state)
      renderTankFish(state)
      renderStore(state)
      renderLog(state)
      renderDesign(state)
    }
    updateStoreButtons(state)
  }

  function renderTankStatus(state: GameState): void {
    const aq = state.aquarium
    let info = `Объём ${aq.volume} л · ${aq.temperature}°C · ${aq.hardness}°dH · растительность ${Math.round(aq.vegetation * 100)}%`
    const required = state.fish.reduce((acc, f) => acc + SPECIES_BY_ID[f.speciesId].minVolume, 0)
    if (required > aq.volume) {
      info += ` · <span class="warn">ПЕРЕНАСЕЛЕНИЕ (нужно ${required} л)</span>`
    }
    crowdedBadge.innerHTML = info
  }

  function renderTankFish(state: GameState): void {
    tankFishList.innerHTML = ''
    const title = el('div', 'list-title', `Рыбы в аквариуме (${state.fish.length})`)
    tankFishList.append(title)
    if (state.fish.length === 0) {
      tankFishList.append(el('div', 'empty', 'Аквариум пуст. Купите рыб в магазине.'))
      return
    }
    for (const fish of state.fish) {
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
      const sellBtn = el('button', 'btn small', 'Продать')
      sellBtn.addEventListener('click', () => actions.onSellFish(fish.id))
      row.append(dot, name, health, sellBtn)
      tankFishList.append(row)
    }
  }

  function renderStore(state: GameState): void {
    storeGrid.innerHTML = ''
    const aq = state.aquarium
    for (const species of FISH_SPECIES) {
      const card = el('div', 'store-card')
      const head = el('div', 'store-head')
      const dot = el('span', 'dot')
      dot.style.background = species.color
      head.append(dot, el('strong', 'store-name', species.name))
      card.append(head, el('div', 'store-latin', species.latin))

      const rep = compatibility(species, aq)
      const status =
        rep.score === 1
          ? ['подходит идеально', 'ok']
          : rep.score >= 0.5
            ? ['частично подходит', 'warn']
            : ['не подходит', 'dead']
      const statusEl = el('span', `compat ${status[1]}`, status[0])
      if (rep.issues.length) statusEl.title = rep.issues.join(', ')
      card.append(statusEl)

      card.append(
        el('div', 'store-params', [
          `${species.sizeCm} см · мин. ${species.minVolume} л`,
          `${species.tempMin}–${species.tempMax}°C · ${species.hardMin}–${species.hardMax}°dH`,
          species.schooling ? 'стайная' : 'одиночная',
        ].join(' · ')),
      )

      const priceRow = el('div', 'store-prices')
      priceRow.append(el('span', '', `Закупка ${species.buyPrice}₽`), el('span', 'sell-hint', `Продажа ${species.sellPrice}₽`))
      card.append(priceRow)

      const buyBtn = el('button', 'btn buy', `Купить за ${species.buyPrice}₽`)
      buyBtn.dataset.species = species.id
      buyBtn.addEventListener('click', () => actions.onBuyFish(species.id))
      card.append(buyBtn)
      storeGrid.append(card)
    }
  }

  function updateStoreButtons(state: GameState): void {
    storeGrid.querySelectorAll<HTMLButtonElement>('button.btn.buy').forEach((btn) => {
      const species = SPECIES_BY_ID[btn.dataset.species ?? '']
      if (!species) return
      btn.disabled = state.money < species.buyPrice
    })
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

  function renderDesign(state: GameState): void {
    designPanel.innerHTML = ''
    designPanel.append(el('div', '', `Уровень дизайна: ${state.aquarium.designLevel} / ${MAX_DESIGN_LEVEL}`))
    const nextCost = designUpgradeCost(state.aquarium.designLevel)
    const btn = el('button', 'btn', 'Улучшить дизайн')
    btn.disabled = state.aquarium.designLevel >= MAX_DESIGN_LEVEL || state.money < nextCost
    btn.append(el('span', 'btn-cost', state.aquarium.designLevel >= MAX_DESIGN_LEVEL ? '' : ` — ${nextCost}₽`))
    btn.addEventListener('click', () => actions.onDesignUpgrade())
    designPanel.append(btn)
  }

  return { update, flash }
}

function buildLayout(): HTMLElement {
  const game = el('div', 'game')

  const header = el('header', 'hud')
  const left = el('div', 'hud-left')
  left.append(
    el('span', 'hud-money', 'Деньги: —'),
    el('span', 'hud-day', 'День —'),
    el('span', 'hud-att', 'Привлекательность: —'),
  )
  const right = el('div', 'hud-right')
  right.append(el('span', 'hud-flash', ''))
  const resetBtn = el('button', 'btn small', 'Сброс')
  resetBtn.className = 'btn btn-reset'
  right.append(resetBtn)
  header.append(left, right)

  const nav = el('nav', 'tabs')
  nav.append(
    tabButton('tank', 'Аквариум', true),
    tabButton('store', 'Магазин', false),
    el('button', 'tab-btn disabled', 'Разводня'),
    el('button', 'tab-btn disabled', 'Опт'),
    el('button', 'tab-btn disabled', 'Сервис'),
  )

  const main = el('main', 'main')

  const tankTab = el('section', 'tab active')
  tankTab.id = 'tab-tank'
  const tankWrap = el('div', 'tank-wrap')
  const canvas = el('canvas')
  canvas.id = 'tank'
  canvas.width = 960
  canvas.height = 420
  tankWrap.append(canvas, el('div', 'tank-status', ''))
  const side = el('aside', 'side')
  side.append(el('h3', '', 'Параметры аквариума'))
  side.append(sliderGroup('volume', 'Объём, л', 20, 300, 10, 100, 'V'))
  side.append(sliderGroup('temperature', 'Температура, °C', 18, 31, 1, 25, 'T'))
  side.append(sliderGroup('hardness', 'Жёсткость, °dH', 0, 20, 1, 8, 'H'))
  side.append(sliderGroup('vegetation', 'Растительность, %', 0, 100, 5, 50, 'P'))
  side.append(el('h3', '', 'Дизайн'))
  const designPanel = el('div', 'design-panel')
  side.append(designPanel)
  side.append(el('h3', '', 'Рыбы'))
  side.append(el('div', 'tank-fish'))
  tankTab.append(tankWrap, side)

  const storeTab = el('section', 'tab')
  storeTab.id = 'tab-store'
  storeTab.append(el('div', 'store-grid'))
  main.append(tankTab, storeTab)

  const footer = el('footer', 'log-panel')
  footer.append(el('h3', '', 'Журнал событий'))
  footer.append(el('ul', 'log-list'))

  game.append(header, nav, main, footer)
  return game
}

function tabButton(name: TabName, label: string, active: boolean): HTMLButtonElement {
  const btn = el('button', 'tab-btn')
  btn.textContent = label
  btn.dataset.tab = name
  if (active) btn.classList.add('active')
  return btn
}

function sliderGroup(
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  suffix: string,
): HTMLElement {
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

function buildSliders(actions: UIActions, initAquarium: AquariumConfig): void {
  const map: Record<string, keyof AquariumConfig> = {
    V: 'volume',
    T: 'temperature',
    H: 'hardness',
    P: 'vegetation',
  }

  document.querySelectorAll<HTMLInputElement>('input[data-slider-key]').forEach((input) => {
    const key = map[input.dataset.sliderKey!]
    input.value = String(initAquarium[key] * (key === 'vegetation' ? 100 : 1))
    const suffix = input.dataset.sliderSuffix ?? ''
    const valueEl = input.closest('.slider-row')?.querySelector('.slider-value')
    if (valueEl) valueEl.textContent = `${input.value}${suffix}`
    input.addEventListener('input', () => {
      const value = key === 'vegetation' ? Number(input.value) / 100 : Number(input.value)
      actions.onAquariumChange(key, value)
    })
  })
}

function setupTabs(app: HTMLElement): void {
  app.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    const tab = btn.dataset.tab
    if (!tab || btn.classList.contains('disabled')) return
    btn.addEventListener('click', () => {
      app.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn))
      app.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${tab}`))
    })
  })
}
