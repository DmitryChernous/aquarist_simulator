import type { DecorDef, DecorKind } from '../types'

export const DECOR: Record<DecorKind, DecorDef> = {
  plant: {
    kind: 'plant',
    name: 'Растение',
    price: 25,
    attract: 4,
    desc: '+привлекательность, поднимает растительность (повышает vegetation)',
    group: 'Растения',
  },
  stone: {
    kind: 'stone',
    name: 'Камень',
    price: 18,
    attract: 3,
    desc: '+привлекательность, слабо повышает жёсткость GH',
    group: 'Камни',
  },
  driftwood: {
    kind: 'driftwood',
    name: 'Коряга',
    price: 35,
    attract: 6,
    desc: '+привлекательность, подкисляет воду (снижает pH)',
    group: 'Коряги',
  },
  substrate: {
    kind: 'substrate',
    name: 'Грунт',
    price: 40,
    attract: 5,
    desc: '+привлекательность, натуральная подложка для аквариума',
    group: 'Грунт',
  },
}

export const DECOR_KINDS = Object.keys(DECOR) as DecorKind[]

export function decorList(): DecorDef[] {
  return Object.values(DECOR)
}