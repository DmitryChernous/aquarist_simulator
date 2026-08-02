import type { DecorDef, DecorKind } from '../types'

export const DECOR: Record<DecorKind, DecorDef> = {
  plant: {
    kind: 'plant',
    name: 'Растение',
    price: 25,
    attract: 4,
    desc: '+привлекательность, поднимает растительность (повышает vegetation)',
  },
  stone: {
    kind: 'stone',
    name: 'Камень',
    price: 18,
    attract: 3,
    desc: '+привлекательность, слабо повышает жёсткость GH',
  },
  driftwood: {
    kind: 'driftwood',
    name: 'Коряга',
    price: 35,
    attract: 6,
    desc: '+привлекательность, подкисляет воду (снижает pH)',
  },
}

export const DECOR_KINDS = Object.keys(DECOR) as DecorKind[]

export function decorList(): DecorDef[] {
  return Object.values(DECOR)
}