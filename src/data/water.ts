import type { WaterParamDef, WaterParamId } from '../types'

export const WATER_PARAMS: Record<WaterParamId, WaterParamDef> = {
  temperature: { id: 'temperature', name: 'Температура', unit: '°C', min: 15, max: 35, step: 0.5, editable: true, derived: false, casual: true },
  ph: { id: 'ph', name: 'Кислотность pH', unit: '', min: 5.0, max: 8.5, step: 0.1, editable: true, derived: false, casual: true },
  gh: { id: 'gh', name: 'Общая жёсткость GH', unit: '°dH', min: 0, max: 20, step: 1, editable: true, derived: false, casual: true },
  o2: { id: 'o2', name: 'Кислород O₂', unit: '%', min: 0, max: 100, step: 1, editable: false, derived: true, casual: true },
  light: { id: 'light', name: 'Освещение', unit: '%', min: 0, max: 100, step: 1, editable: false, derived: true, casual: true },
  // --- будущие (хардкор) ---
  nh3: { id: 'nh3', name: 'Аммиак NH₃', unit: 'мг/л', min: 0, max: 5, step: 0.01, editable: false, derived: false, casual: false },
  no2: { id: 'no2', name: 'Нитриты NO₂', unit: 'мг/л', min: 0, max: 5, step: 0.01, editable: false, derived: false, casual: false },
  no3: { id: 'no3', name: 'Нитраты NO₃', unit: 'мг/л', min: 0, max: 100, step: 1, editable: false, derived: false, casual: false },
  po4: { id: 'po4', name: 'Фосфаты PO₄', unit: 'мг/л', min: 0, max: 5, step: 0.01, editable: false, derived: false, casual: false },
  kh: { id: 'kh', name: 'Карбонатная жёсткость kH', unit: '°dH', min: 0, max: 20, step: 0.5, editable: false, derived: false, casual: false },
  cl: { id: 'cl', name: 'Хлор Cl', unit: 'мг/л', min: 0, max: 2, step: 0.01, editable: false, derived: false, casual: false },
  co2: { id: 'co2', name: 'CO₂', unit: 'мг/л', min: 0, max: 50, step: 0.5, editable: false, derived: false, casual: false },
  fe: { id: 'fe', name: 'Железо Fe', unit: 'мг/л', min: 0, max: 2, step: 0.01, editable: false, derived: false, casual: false },
  k: { id: 'k', name: 'Калий K', unit: 'мг/л', min: 0, max: 50, step: 0.5, editable: false, derived: false, casual: false },
  ca: { id: 'ca', name: 'Кальций Ca', unit: 'мг/л', min: 0, max: 100, step: 1, editable: false, derived: false, casual: false },
  cu: { id: 'cu', name: 'Медь Cu', unit: 'мг/л', min: 0, max: 1, step: 0.01, editable: false, derived: false, casual: false },
  mg: { id: 'mg', name: 'Магний Mg', unit: 'мг/л', min: 0, max: 50, step: 0.5, editable: false, derived: false, casual: false },
}

export function edibleParams(): WaterParamId[] {
  return Object.values(WATER_PARAMS)
    .filter((p) => p.casual && p.editable)
    .map((p) => p.id)
}