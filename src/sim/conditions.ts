import type { FishSpecies, TankState } from '../types'

export interface CompatibilityReport {
  score: number
  temperature: number
  hardness: number
  vegetation: number
  issues: string[]
}

function factorWithin(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1
  const mid = (min + max) / 2
  const span = Math.max(1, (max - min) / 2)
  const dist = Math.abs(value - mid) / span
  return Math.max(0, 1 - dist)
}

export function compatibility(species: FishSpecies, tank: TankState): CompatibilityReport {
  const temperature = factorWithin(tank.temperature, species.tempMin, species.tempMax)
  const hardness = factorWithin(tank.hardness, species.hardMin, species.hardMax)
  const vegetation = factorWithin(tank.vegetation, species.vegMin, species.vegMax)
  const score = (temperature + hardness + vegetation) / 3

  const issues: string[] = []
  if (tank.temperature < species.tempMin || tank.temperature > species.tempMax) {
    issues.push(`температура ${tank.temperature}°C (нужно ${species.tempMin}–${species.tempMax}°C)`)
  }
  if (tank.hardness < species.hardMin || tank.hardness > species.hardMax) {
    issues.push(`жёсткость ${tank.hardness}°dH (нужно ${species.hardMin}–${species.hardMax}°dH)`)
  }
  if (tank.vegetation < species.vegMin || tank.vegetation > species.vegMax) {
    issues.push(
      `растительность ${Math.round(tank.vegetation * 100)}% (нужно ${Math.round(species.vegMin * 100)}–${Math.round(species.vegMax * 100)}%)`,
    )
  }
  return { score, temperature, hardness, vegetation, issues }
}
