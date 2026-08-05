import type { FoodDef, FoodId } from '../types'

// Классификация кормов:
// - Сухие (dry): хлопья/гранулы/таблетки/палочки, не портятся.
//   Размер частиц (size) должен соответствовать рту рыбы (mouthSize):
//   small — мелкие рыбы, medium — средние, large — крупные.
//   Диеты (diets): 'all' едят все, либо список диет (хищники/растительноядные/всеядные).
// - Живые (live): сытнее, но требуют хранения и портятся (shelfLifeDays).
export const FOOD: Record<FoodId, FoodDef> = {
  flakes: {
    id: 'flakes',
    name: 'Хлопья универсальные',
    kind: 'dry',
    size: 'small',
    diets: 'all',
    desc: 'Мелкие хлопья для мальков и некрупных рыб. Не портятся.',
    price: 25,
    jarPortions: 40,
    satiety: 25,
  },
  granulesS: {
    id: 'granulesS',
    name: 'Гранулы средние',
    kind: 'dry',
    size: 'medium',
    diets: 'all',
    desc: 'Гранулы среднего калибра для рыб 5–15 см. Не портятся.',
    price: 35,
    jarPortions: 40,
    satiety: 25,
  },
  granulesL: {
    id: 'granulesL',
    name: 'Гранулы крупные',
    kind: 'dry',
    size: 'large',
    diets: 'all',
    desc: 'Крупные гранулы для больших рыб (золотая рыбка, крупные цихлиды).',
    price: 50,
    jarPortions: 40,
    satiety: 25,
  },
  tablets: {
    id: 'tablets',
    name: 'Таблетки тонущие',
    kind: 'dry',
    size: 'small',
    diets: 'all',
    desc: 'Тонущие таблетки для донных и ракообразных (креветки, улитки).',
    price: 45,
    jarPortions: 40,
    satiety: 25,
  },
  spirulina: {
    id: 'spirulina',
    name: 'Хлопья спирулины',
    kind: 'dry',
    size: 'small',
    diets: ['herbivore', 'omnivore'],
    desc: 'Растительный корм для растительноядных и всеядных рыб. Не портятся.',
    price: 40,
    jarPortions: 35,
    satiety: 25,
  },
  sticks: {
    id: 'sticks',
    name: 'Палочки для хищников',
    kind: 'dry',
    size: 'large',
    diets: ['carnivore', 'omnivore'],
    desc: 'Крупные палочки с высоким содержанием белка для хищных и всеядных.',
    price: 55,
    jarPortions: 30,
    satiety: 30,
  },
  artemia: {
    id: 'artemia',
    name: 'Артемия (живая)',
    kind: 'live',
    size: 'small',
    diets: ['carnivore', 'omnivore'],
    desc: 'Живые науплии артемии — идеальны для мелких хищников. Требуют холода, портятся за 3 дня.',
    price: 60,
    jarPortions: 25,
    satiety: 35,
    shelfLifeDays: 3,
  },
  bloodworm: {
    id: 'bloodworm',
    name: 'Мотыль (живой)',
    kind: 'live',
    size: 'medium',
    diets: ['carnivore', 'omnivore'],
    desc: 'Живой мотыль — любимое лакомство хищников. Портящийся, хранить холодно, 3 дня.',
    price: 55,
    jarPortions: 25,
    satiety: 35,
    shelfLifeDays: 3,
  },
  daphnia: {
    id: 'daphnia',
    name: 'Дафния (живая)',
    kind: 'live',
    size: 'small',
    diets: 'all',
    desc: 'Живая дафния — универсальный живой корм. Быстро портится (2 дня).',
    price: 40,
    jarPortions: 25,
    satiety: 30,
    shelfLifeDays: 2,
  },
}

export const FOOD_IDS = Object.keys(FOOD) as FoodId[]

export const FOOD_KIND_LABEL: Record<FoodDef['kind'], string> = {
  dry: 'Сухие',
  live: 'Живые',
}

export const FOOD_SIZE_LABEL: Record<FoodDef['size'], string> = {
  small: 'мелкий',
  medium: 'средний',
  large: 'крупный',
}
