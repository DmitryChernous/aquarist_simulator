import type { AquariumState, FishSpecies } from '../types'
import { vegetationOf } from './aquarium'

export interface CompatibilityReport {
  score: number
  temperature: number
  ph: number
  gh: number
  o2: number
  light: number
  vegetation: number
  issues: string[]
}

function factorWithin(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1
  const mid = (min + max) / 2
  const span = Math.max(0.0001, (max - min) / 2)
  const dist = Math.abs(value - mid) / span
  return Math.max(0, 1 - dist)
}

export function compatibility(species: FishSpecies, aq: AquariumState): CompatibilityReport {
  const temperature = factorWithin(aq.water.temperature, species.tempMin, species.tempMax)
  const ph = factorWithin(aq.water.ph, species.phMin, species.phMax)
  const gh = factorWithin(aq.water.gh, species.ghMin, species.ghMax)
  const o2 = factorWithin(aq.water.o2, species.o2Min, species.o2Max)
  const light = factorWithin(aq.water.light, species.lightMin, species.lightMax)
  const vegetation = factorWithin(vegetationOf(aq), species.vegMin, species.vegMax)
  const score = (temperature + ph + gh + o2 + light + vegetation) / 6

  const issues: string[] = []
  if (aq.water.temperature < species.tempMin || aq.water.temperature > species.tempMax) {
    issues.push(`температура ${aq.water.temperature}°C (нужно ${species.tempMin}–${species.tempMax})`)
  }
  if (aq.water.ph < species.phMin || aq.water.ph > species.phMax) {
    issues.push(`pH ${aq.water.ph} (нужно ${species.phMin}–${species.phMax})`)
  }
  if (aq.water.gh < species.ghMin || aq.water.gh > species.ghMax) {
    issues.push(`GH ${aq.water.gh}°dH (нужно ${species.ghMin}–${species.ghMax})`)
  }
  if (aq.water.o2 < species.o2Min || aq.water.o2 > species.o2Max) {
    issues.push(`O₂ ${aq.water.o2}% (нужно ${species.o2Min}–${species.o2Max})`)
  }
  if (aq.water.light < species.lightMin || aq.water.light > species.lightMax) {
    issues.push(`освещение ${aq.water.light}% (нужно ${species.lightMin}–${species.lightMax})`)
  }
  return { score, temperature, ph, gh, o2, light, vegetation, issues }
}