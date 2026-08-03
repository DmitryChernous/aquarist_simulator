import type { RoomDef, RoomId } from '../types'

export const ROOMS: RoomDef[] = [
  { id: 'hall', name: 'Зал', icon: '🏪', desc: 'Витрины — сюда приходят покупатели' },
  { id: 'storage', name: 'Склад', icon: '📦', desc: 'Хранение запасов и стоек' },
  { id: 'breeding', name: 'Разводня', icon: '🥚', desc: 'Разведение и выращивание рыб' },
]

export const ROOM_BY_ID: Record<RoomId, RoomDef> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Record<RoomId, RoomDef>
