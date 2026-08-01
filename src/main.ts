import './style.css'
import { SPECIES_BY_ID } from './data/fish'
import { MAX_DESIGN_LEVEL, designUpgradeCost } from './data/aquarium'
import { totalRequiredVolume, updateHealth } from './sim/health'
import { dailyUpkeep, fishSellValue } from './sim/economy'
import { attractiveness, pickBuyerFish, visitorInterval } from './sim/buyers'
import { clearSave, loadState, saveState } from './save'
import { renderTank } from './ui/render'
import { buildApp } from './ui/panels'
import type { FishInstance, GameState, LogKind } from './types'

const DAY_SECONDS = 30
const TANK = { width: 960, height: 420 }
const LOG_LIMIT = 40

let state: GameState = loadState()

const ui = buildApp(
  {
    onBuyFish(speciesId: string) {
      const species = SPECIES_BY_ID[speciesId]
      if (!species) return
      if (state.money < species.buyPrice) {
        ui.flash('Не хватает денег!')
        return
      }
      state.money -= species.buyPrice
      const fish: FishInstance = {
        id: `f${state.epoch}-${Math.random().toString(36).slice(2, 8)}`,
        speciesId,
        health: 100,
        x: 40 + Math.random() * (TANK.width - 80),
        y: 40 + Math.random() * (TANK.height - 90),
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
      }
      state.fish.push(fish)
      pushLog(`Куплен ${species.name} за ${species.buyPrice}₽`, 'buy')
      bump()
    },
    onSellFish(fishId: string) {
      const idx = state.fish.findIndex((f) => f.id === fishId)
      if (idx < 0) return
      const fish = state.fish[idx]
      const species = SPECIES_BY_ID[fish.speciesId]
      const value = fishSellValue(fish, species)
      state.money += value
      state.fish.splice(idx, 1)
      pushLog(`Продана ${species.name} за ${value}₽`, 'sell')
      bump()
    },
    onAquariumChange(key, value) {
      state.aquarium[key] = value as never
      bump()
    },
    onDesignUpgrade() {
      if (state.aquarium.designLevel >= MAX_DESIGN_LEVEL) return
      const cost = designUpgradeCost(state.aquarium.designLevel)
      if (state.money < cost) {
        ui.flash('Не хватает денег на дизайн!')
        return
      }
      state.money -= cost
      state.aquarium.designLevel += 1
      pushLog(`Уровень дизайна повышен до ${state.aquarium.designLevel}`, 'info')
      bump()
    },
    onReset() {
      clearSave()
      location.reload()
    },
  },
  state.aquarium,
)

const canvas = document.getElementById('tank') as HTMLCanvasElement
canvas.width = TANK.width
canvas.height = TANK.height

function bump(): void {
  state.epoch += 1
}

function pushLog(text: string, kind: LogKind): void {
  state.log.push({ day: state.day, text, kind })
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT)
}

function visitor(): void {
  state.totalVisitors += 1
  const fish = pickBuyerFish(state, SPECIES_BY_ID)
  if (!fish) {
    pushLog('Посетитель заглянул, но продавать нечего — ушёл', 'info')
    bump()
    return
  }
  const species = SPECIES_BY_ID[fish.speciesId]
  const price = Math.round(species.sellPrice * (0.85 + Math.random() * 0.4))
  state.money += price
  state.fish = state.fish.filter((f) => f.id !== fish.id)
  pushLog(`Посетитель купил ${species.name} за ${price}₽`, 'sell')
  bump()
}

function updateFish(dt: number): void {
  const aq = state.aquarium
  const required = totalRequiredVolume(state.fish, SPECIES_BY_ID)
  const crowded = required > aq.volume

  const dead = new Set<string>()
  for (const fish of state.fish) {
    const species = SPECIES_BY_ID[fish.speciesId]
    updateHealth(fish, species, aq, crowded, dt)
    if (fish.health <= 0) {
      dead.add(fish.id)
      continue
    }

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

  if (dead.size > 0) {
    state.fish = state.fish.filter((f) => !dead.has(f.id))
    pushLog(`${dead.size} рыб погибло из-за плохих условий!`, 'warn')
    bump()
  }
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

  state.nextVisitorIn -= dt
  if (state.nextVisitorIn <= 0) {
    state.nextVisitorIn = visitorInterval(attractiveness(state, SPECIES_BY_ID))
    visitor()
  }
}

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  tick(dt)
  renderTank(canvas, state, SPECIES_BY_ID)
  ui.update(state, attractiveness(state, SPECIES_BY_ID))
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
setInterval(() => saveState(state), 2000)
