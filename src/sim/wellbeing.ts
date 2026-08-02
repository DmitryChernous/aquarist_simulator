import type { AquariumState, FishInstance, FishSpecies } from '../types'
import { compatibility } from './conditions'
import { usedVolume, vegetationOf } from './aquarium'

export interface NeedBar {
  id: string
  label: string
  score: number // 0..100 (100 — идеально)
  status: 'ok' | 'warn' | 'bad'
  note: string
}

export interface WellBeingReport {
  bars: NeedBar[]
  conditions: number // среднее по параметрам воды
  crowding: number // вместимость/литраж
  hunger: number
  health: number
  wellbeing: number // итог 0..100
  diseased: boolean
  starving: boolean
  crowded: boolean
}

export function statusOf(score: number): 'ok' | 'warn' | 'bad' {
  if (score >= 70) return 'ok'
  if (score >= 35) return 'warn'
  return 'bad'
}

export function fishWellbeing(species: FishSpecies, fish: FishInstance, aq: AquariumState): WellBeingReport {
  const c = compatibility(species, aq)
  const to = (v: number) => v * 100

  const temp = to(c.temperature)
  const ph = to(c.ph)
  const gh = to(c.gh)
  const o2 = to(c.o2)
  const light = to(c.light)
  const vegetation = to(c.vegetation)

  const required = usedVolume(aq)
  const crowding = required <= 0 ? 100 : Math.min(1, aq.volume / required) * 100
  const crowded = required > aq.volume

  const hunger = fish.hunger
  const starving = fish.hunger <= 15

  const conditions = (temp + o2 + ph + gh + light + vegetation) / 6
  const wellbeing = clamp(conditions * 0.4 + crowding * 0.15 + hunger * 0.25 + to(fish.health) * 0.2, 0, 100)

  const thermo = aq.equipment.some((e) => e.id === 'thermometer')
    const tempNote = thermo
      ? `${aq.water.temperature.toFixed(1)} °C (нужно ${species.tempMin}–${species.tempMax})`
      : 'неизвестно (установите термометр)'
    const tempBar: NeedBar = {
      id: 'temp',
      label: 'Температура воды',
      score: thermo ? temp : 0,
      status: thermo ? statusOf(temp) : 'warn',
      note: tempNote,
    }
    const bars: NeedBar[] = [
      tempBar,
    { id: 'o2', label: 'Кислород (O₂)', score: o2, status: statusOf(o2), note: `${Math.round(aq.water.o2)}% (нужно ${species.o2Min}–${species.o2Max})` },
    { id: 'ph', label: 'pH', score: ph, status: statusOf(ph), note: `${aq.water.ph.toFixed(1)} (нужно ${species.phMin}–${species.phMax})` },
    { id: 'gh', label: 'GH (жёсткость)', score: gh, status: statusOf(gh), note: `${aq.water.gh.toFixed(1)} °dH (нужно ${species.ghMin}–${species.ghMax})` },
    { id: 'light', label: 'Освещение', score: light, status: statusOf(light), note: `${Math.round(aq.water.light)}% (нужно ${species.lightMin}–${species.lightMax})` },
    { id: 'vegetation', label: 'Растительность', score: vegetation, status: statusOf(vegetation), note: `${Math.round(vegetationOf(aq) * 100)}% (нужно ${species.vegMin * 100}–${species.vegMax * 100}%)` },
    { id: 'crowding', label: 'Литраж / плотность', score: crowding, status: statusOf(crowding), note: crowded ? `перегрузка: нужен минимум ${required} л, свободно ${aq.volume} л` : `${aq.volume} л, используется ${required} л` },
    { id: 'hunger', label: 'Сытость (голод)', score: hunger, status: statusOf(hunger), note: starving ? 'рыба голодает — покормите!' : `${Math.round(hunger)}/100` },
    { id: 'health', label: 'Здоровье', score: to(fish.health), status: statusOf(fish.health), note: fish.diseased ? 'рыба болеет из-за плохих условий' : `${Math.round(fish.health)}%` },
  ]

  return {
    bars,
    conditions,
    crowding,
    hunger,
    health: to(fish.health),
    wellbeing,
    diseased: fish.diseased,
    starving,
    crowded,
  }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}