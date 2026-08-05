import type { FishSpecies } from '../types'

export const FISH_SPECIES: FishSpecies[] = [
  {
    id: 'neon', name: 'Неон обыкновенный', latin: 'Paracheirodon innesi', color: '#3f8bff', family: 'Харациновые', region: 'Южная Америка',
    buyPrice: 40, sellPrice: 85, sizeCm: 3.5, minVolume: 10,
    tempMin: 22, tempMax: 28, phMin: 5.5, phMax: 7.0, ghMin: 1, ghMax: 10,
    o2Min: 30, o2Max: 90, lightMin: 25, lightMax: 70, vegMin: 0.4, vegMax: 0.8,
    schooling: true, appeal: 60,
    diet: 'omnivore', mouthSize: 'small',
  },
  {
    id: 'guppy', name: 'Гуппи', latin: 'Poecilia reticulata', color: '#ff8c42', family: 'Пецилиевые', region: 'Южная Америка',
    buyPrice: 25, sellPrice: 55, sizeCm: 4.5, minVolume: 8,
    tempMin: 22, tempMax: 28, phMin: 6.5, phMax: 8.0, ghMin: 5, ghMax: 19,
    o2Min: 25, o2Max: 85, lightMin: 30, lightMax: 75, vegMin: 0.2, vegMax: 0.6,
    schooling: false, appeal: 45,
    diet: 'omnivore', mouthSize: 'small',
  },
  {
    id: 'danio', name: 'Данио-рерио', latin: 'Danio rerio', color: '#6aa9ff', family: 'Карповые', region: 'Азия',
    buyPrice: 35, sellPrice: 75, sizeCm: 5, minVolume: 15,
    tempMin: 18, tempMax: 25, phMin: 6.0, phMax: 7.5, ghMin: 5, ghMax: 19,
    o2Min: 40, o2Max: 100, lightMin: 30, lightMax: 70, vegMin: 0.2, vegMax: 0.5,
    schooling: true, appeal: 50,
    diet: 'omnivore', mouthSize: 'small',
  },
  {
    id: 'swordtail', name: 'Меченосец', latin: 'Xiphophorus hellerii', color: '#ff4f4f', family: 'Пецилиевые', region: 'Центральная Америка',
    buyPrice: 60, sellPrice: 130, sizeCm: 12, minVolume: 40,
    tempMin: 20, tempMax: 26, phMin: 7.0, phMax: 8.2, ghMin: 8, ghMax: 20,
    o2Min: 30, o2Max: 90, lightMin: 25, lightMax: 70, vegMin: 0.1, vegMax: 0.5,
    schooling: false, appeal: 50,
    diet: 'omnivore', mouthSize: 'medium',
  },
  {
    id: 'goldfish', name: 'Золотая рыбка', latin: 'Carassius auratus', color: '#ffb03a', family: 'Карповые', region: 'Азия',
    buyPrice: 100, sellPrice: 210, sizeCm: 20, minVolume: 80,
    tempMin: 18, tempMax: 24, phMin: 6.5, phMax: 8.0, ghMin: 5, ghMax: 20,
    o2Min: 35, o2Max: 95, lightMin: 20, lightMax: 60, vegMin: 0, vegMax: 0.3,
    schooling: false, appeal: 55,
    diet: 'omnivore', mouthSize: 'large',
  },
  {
    id: 'angelfish', name: 'Скалярия', latin: 'Pterophyllum scalare', color: '#cdd6e6', family: 'Цихловые', region: 'Южная Америка',
    buyPrice: 150, sellPrice: 320, sizeCm: 15, minVolume: 100,
    tempMin: 24, tempMax: 28, phMin: 6.0, phMax: 7.5, ghMin: 2, ghMax: 12,
    o2Min: 30, o2Max: 90, lightMin: 30, lightMax: 70, vegMin: 0.3, vegMax: 0.7,
    schooling: false, appeal: 80,
    diet: 'carnivore', mouthSize: 'medium',
  },
  {
    id: 'mbuna', name: 'Цихлида мбуна', latin: 'Pseudotropheus sp.', color: '#2a6bff', family: 'Цихловые', region: 'Африка',
    buyPrice: 120, sellPrice: 250, sizeCm: 12, minVolume: 80,
    tempMin: 24, tempMax: 28, phMin: 7.5, phMax: 8.5, ghMin: 10, ghMax: 20,
    o2Min: 35, o2Max: 90, lightMin: 20, lightMax: 60, vegMin: 0, vegMax: 0.1,
    schooling: false, appeal: 70,
    diet: 'herbivore', mouthSize: 'medium',
  },
  {
    id: 'discus', name: 'Дискус', latin: 'Symphysodon discus', color: '#3affd0', family: 'Цихловые', region: 'Южная Америка',
    buyPrice: 400, sellPrice: 950, sizeCm: 18, minVolume: 150,
    tempMin: 28, tempMax: 31, phMin: 5.0, phMax: 7.0, ghMin: 1, ghMax: 8,
    o2Min: 35, o2Max: 85, lightMin: 25, lightMax: 55, vegMin: 0.2, vegMax: 0.5,
    schooling: false, appeal: 95,
    diet: 'carnivore', mouthSize: 'medium',
  },
  {
    id: 'shrimp', name: 'Креветка вишнёвая', latin: 'Neocaridina davidi', color: '#ff5b6b', family: 'Ракообразные', region: 'Азия',
    buyPrice: 15, sellPrice: 35, sizeCm: 2.5, minVolume: 5,
    tempMin: 22, tempMax: 27, phMin: 6.5, phMax: 7.8, ghMin: 6, ghMax: 15,
    o2Min: 40, o2Max: 95, lightMin: 20, lightMax: 60, vegMin: 0.3, vegMax: 0.7,
    schooling: true, appeal: 35,
    diet: 'omnivore', mouthSize: 'small',
  },
  {
    id: 'snail', name: 'Ампулярия', latin: 'Pomacea bridgesii', color: '#f2d16b', family: 'Брюхоногие', region: 'Южная Америка',
    buyPrice: 20, sellPrice: 40, sizeCm: 2, minVolume: 5,
    tempMin: 22, tempMax: 28, phMin: 6.5, phMax: 8.0, ghMin: 6, ghMax: 18,
    o2Min: 30, o2Max: 90, lightMin: 15, lightMax: 55, vegMin: 0, vegMax: 0.3,
    schooling: false, appeal: 20,
    diet: 'herbivore', mouthSize: 'small',
  },
]

export const SPECIES_BY_ID: Record<string, FishSpecies> = Object.fromEntries(
  FISH_SPECIES.map((s) => [s.id, s]),
)