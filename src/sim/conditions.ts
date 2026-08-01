import type { FishSpecies, AquariumConfig } from '../types'

export interface CompatibilityReport {
  score: number
  issues: string[]
}

function factorWithin(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1
  const mid = (min + max) / 2
  const span = Math.max(1, (max - min) / 2)
  const dist = Math.abs(value - mid) / span
  return Math.max(0, 1 - dist)
}

export function compatibility(species: FishSpecies, aq: AquariumConfig): CompatibilityReport {
  const t = factorWithin(aq.temperature, species.tempMin, species.tempMax)
  const h = factorWithin(aq.hardness, species.hardMin, species.hardMax)
  const v = factorWithin(aq.vegetation, species.vegMin, species.vegMax)
  const score = (t + h + v) / 3

  const issues: string[] = []
  if (aq.temperature < species.tempMin || aq.temperature > species.tempMax) {
    issues.push(`температура ${aq.temperature}°C (нужно ${species.tempMin}–${species.tempMax}°C)`)
  }
  if (aq.hardness < species.hardMin || aq.hardness > species.hardMax) {
    issues.push(`жёсткость ${aq.hardness}°dH (нужно ${species.hardMin}–${species.hardMax}°dH)`)
  }
  if (aq.vegetation < species.vegMin || aq.vegetation > species.vegMax) {
    issues.push(
      `растительность ${Math.round(aq.vegetation * 100)}% (нужно ${Math.round(species.vegMin * 100)}–${Math.round(species.vegMax * 100)}%)`,
    )
  }
  return { score, issues }
}
