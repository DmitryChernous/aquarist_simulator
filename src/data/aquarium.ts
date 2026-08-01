export const AQUARIUM_LIMITS = {
  volume: { min: 20, max: 300, step: 10 },
  temperature: { min: 18, max: 31, step: 1 },
  hardness: { min: 0, max: 20, step: 1 },
  vegetation: { min: 0, max: 1, step: 0.05 },
} as const

export const MAX_DESIGN_LEVEL = 5

export function designUpgradeCost(level: number): number {
  return 100 + level * 150
}
