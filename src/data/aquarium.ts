export interface AquariumModel {
  id: string
  name: string
  w: number
  d: number
  h: number
  volume: number
  price: number
}

// w/d/h — см; поместимость на полке проверяется этими габаритами
export const AQUARIUM_MODELS: AquariumModel[] = [
  { id: 'nano', name: 'Нано 20л', w: 30, d: 20, h: 25, volume: 20, price: 120 },
  { id: 'small', name: 'Малый 40л', w: 40, d: 25, h: 30, volume: 40, price: 160 },
  { id: 'mid', name: 'Средний 100л', w: 60, d: 35, h: 40, volume: 100, price: 220 },
  { id: 'large', name: 'Большой 150л', w: 80, d: 40, h: 45, volume: 150, price: 320 },
  { id: 'xl', name: 'XL 250л', w: 100, d: 50, h: 50, volume: 250, price: 500 },
]

export function aquariumModelById(id: string): AquariumModel | undefined {
  return AQUARIUM_MODELS.find((m) => m.id === id)
}