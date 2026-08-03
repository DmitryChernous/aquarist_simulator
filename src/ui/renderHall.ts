import type { GameState } from '../types'
import { SPECIES_BY_ID } from '../data/fish'
import { shelfUsedLiters, storageCapacity, storageUsed } from '../data/shop'
import { ROOM_BY_ID } from '../data/rooms'

export const HALL_WIDTH = 960
export const HALL_HEIGHT = 420

export interface TankRect {
  shelfId: string
  slabId: string
  aqId: string
  x: number
  y: number
  w: number
  h: number
}

export interface ShelfRect {
  shelfId: string
  name: string
  x: number
  y: number
  w: number
  h: number
  tanks: TankRect[]
}

export interface StorageObjectRect {
  id: 'componentRacks' | 'displayRack'
  label: string
  x: number
  y: number
  w: number
  h: number
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

const PAD = 20
const GAP = 30
const FLOOR_Y = HALL_HEIGHT - 44
const TOP_Y = 76
const STORAGE_BAND_H = 96

function storageBandVisible(state: GameState): boolean {
  return state.viewRoom === 'storage' && (state.shop.componentRacks > 0 || (state.shop.furniture?.displayRack ?? 0) > 0)
}

export function layoutStorageObjects(state: GameState): StorageObjectRect[] {
  const out: StorageObjectRect[] = []
  if (!storageBandVisible(state)) return out
  const y = FLOOR_Y - STORAGE_BAND_H + 24
  const h = STORAGE_BAND_H - 24
  let cursor = PAD
  const mk = (id: StorageObjectRect['id'], label: string): void => {
    const w = 220
    out.push({ id, label, x: cursor, y, w, h })
    cursor += w + GAP
  }
  if (state.shop.componentRacks > 0) mk('componentRacks', `Полка комплектующих ×${state.shop.componentRacks}`)
  const displays = state.shop.furniture?.displayRack ?? 0
  if (displays > 0) mk('displayRack', `Стеллаж-витрина ×${displays}`)
  return out
}

export function layoutHall(state: GameState): { shelves: ShelfRect[] } {
  const shelves: ShelfRect[] = []
  const bottom = FLOOR_Y - (storageBandVisible(state) ? STORAGE_BAND_H : 0)
  const bodyH = bottom - TOP_Y

  const roomShelves = state.shelves.filter((s) => s.roomId === state.viewRoom)

  let total = 0
  for (const shelf of roomShelves) total += Math.max(160, shelf.slabs.length * 66) + GAP
  total -= GAP
  const scale = Math.min(1, (HALL_WIDTH - PAD * 2) / Math.max(1, total))

  let cursor = PAD
  for (const shelf of roomShelves) {
    const w = Math.max(160, shelf.slabs.length * 66) * scale
    const slabH = bodyH / Math.max(1, shelf.slabs.length)

    const tanks: TankRect[] = []
    let cy = bottom
    for (const slab of shelf.slabs) {
      const aq = shelf.aquariums.find((a) => a.slabId === slab.id)
if (aq) {
        const aqH = Math.max(26, slabH - 16)
        tanks.push({
          shelfId: shelf.id,
          slabId: slab.id,
          aqId: aq.id,
          x: cursor + 10,
          y: cy - aqH - 4,
          w: w - 20,
          h: aqH,
        })
      }
      cy -= slabH
    }

    shelves.push({ shelfId: shelf.id, name: shelf.name, x: cursor, y: TOP_Y, w, h: bodyH, tanks })
    cursor += w + GAP
  }

  return { shelves }
}

function drawTank(ctx: CanvasRenderingContext2D, aq: any, r: { x: number; y: number; w: number; h: number }, selected: boolean, time: number): void {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
  g.addColorStop(0, '#1d7a45')
  g.addColorStop(1, '#0f4a2b')
  ctx.fillStyle = g
  ctx.fillRect(r.x, r.y, r.w, r.h)

  ctx.strokeStyle = selected ? '#ffc107' : 'rgba(225,243,255,0.9)'
  ctx.lineWidth = selected ? 3 : 2.5
  const rad = 5
  ctx.beginPath()
  ctx.moveTo(r.x + rad, r.y)
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad)
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad)
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad)
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad)
  ctx.closePath()
  ctx.stroke()

  const n = Math.min(aq.fish.length, 9)
  for (let i = 0; i < n; i++) {
    const fish = aq.fish[i]
    const sp = SPECIES_BY_ID[fish.speciesId]
    const px = r.x + 8 + (hash(fish.id + 'x') % 100) / 100 * (r.w - 16)
    const py = r.y + 8 + (Math.abs(hash(fish.id + 'y') + Math.sin(time * 2.5 + i * 1.7)) % 100) / 100 * (r.h - 16)
    ctx.fillStyle = sp ? sp.color : '#eee'
    ctx.beginPath()
    ctx.ellipse(px, py, Math.max(2.5, r.h * 0.06), Math.max(1.5, r.h * 0.035), 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `bold ${Math.max(8, Math.round(r.h * 0.14))}px system-ui`
  ctx.textAlign = 'center'
  ctx.fillText(aq.name ?? '', r.x + r.w / 2, r.y + r.h - 4)
  ctx.font = `${Math.max(7, Math.round(r.h * 0.11))}px system-ui`
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(`${aq.fish.length}р · ${aq.volume}л`, r.x + r.w / 2, r.y + 12)
}

export function drawHall(ctx: CanvasRenderingContext2D, state: GameState, selectedId: string | null, time: number): void {
  const wall = ctx.createLinearGradient(0, 0, 0, HALL_HEIGHT)
  wall.addColorStop(0, '#efe9dc')
  wall.addColorStop(1, '#d9d0bd')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, HALL_WIDTH, HALL_HEIGHT - 44)

  ctx.fillStyle = '#b7a687'
  ctx.fillRect(0, HALL_HEIGHT - 44, HALL_WIDTH, 44)
  ctx.strokeStyle = 'rgba(90,80,60,0.4)'
  ctx.lineWidth = 1
  for (let i = 0; i < HALL_WIDTH; i += 26) {
    ctx.beginPath()
    ctx.moveTo(i + 2, HALL_HEIGHT - 44)
    ctx.lineTo(i + 2, HALL_HEIGHT)
    ctx.stroke()
  }

  const room = ROOM_BY_ID[state.viewRoom]
  ctx.fillStyle = '#2e2016'
  ctx.font = 'bold 15px system-ui'
  ctx.textAlign = 'left'
  ctx.fillText(`${room.icon} ${room.name} — ${room.desc}`, PAD, 26)

  const { shelves } = layoutHall(state)
  const band = layoutStorageObjects(state)

  if (band.length > 0) {
    ctx.fillStyle = '#7c6145'
    ctx.fillRect(PAD, FLOOR_Y - STORAGE_BAND_H, HALL_WIDTH - PAD * 2, STORAGE_BAND_H)
    ctx.strokeStyle = 'rgba(46,32,22,0.45)'
    ctx.lineWidth = 2
    ctx.strokeRect(PAD, FLOOR_Y - STORAGE_BAND_H, HALL_WIDTH - PAD * 2, STORAGE_BAND_H)
    for (let i = PAD; i < HALL_WIDTH - PAD; i += 22) {
      ctx.beginPath()
      ctx.moveTo(i, FLOOR_Y - STORAGE_BAND_H)
      ctx.lineTo(i, FLOOR_Y)
      ctx.stroke()
    }
    ctx.fillStyle = '#f3e9d2'
    ctx.font = 'bold 12px system-ui'
    ctx.fillText('Место хранения', PAD + 4, FLOOR_Y - STORAGE_BAND_H + 16)

    const used = storageUsed(state.shop)
    const cap = storageCapacity(state.shop)
    for (const obj of band) {
      ctx.fillStyle = '#5b4127'
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h)
      ctx.strokeStyle = '#2e2016'
      ctx.lineWidth = 2
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h)
      ctx.fillStyle = '#f3e9d2'
      ctx.font = 'bold 13px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText(obj.label, obj.x + 10, obj.y + 24)
      ctx.font = '12px system-ui'
      ctx.fillStyle = 'rgba(243,233,210,0.9)'
      ctx.fillText(`занято ${used}/${cap} мест`, obj.x + 10, obj.y + 44)
      ctx.fillStyle = 'rgba(243,233,210,0.65)'
      ctx.fillText('нажмите, чтобы открыть', obj.x + 10, obj.y + obj.h - 10)
    }
  }

  if (shelves.length === 0 && band.length === 0) {
    ctx.fillStyle = 'rgba(46,32,22,0.55)'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('В этом помещении нет стоек. Купите и разместите их ниже.', HALL_WIDTH / 2, HALL_HEIGHT / 2)
  }

  for (const shelf of shelves) {
    ctx.fillStyle = '#4a3424'
    ctx.fillRect(shelf.x, shelf.y, shelf.w, shelf.h)
    ctx.fillStyle = '#5d4330'
    ctx.fillRect(shelf.x + 5, shelf.y + 5, shelf.w - 10, shelf.h - 10)
    ctx.strokeStyle = '#2e2016'
    ctx.lineWidth = 2
    ctx.strokeRect(shelf.x + 5, shelf.y + 5, shelf.w - 10, shelf.h - 10)

    const used = shelfUsedLiters(state.shelves.find((s) => s.id === shelf.shelfId)!)
    const max = state.shelves.find((s) => s.id === shelf.shelfId)?.loadCapacityL ?? 0
    const ratio = max ? used / max : 0
    ctx.fillStyle = ratio < 0.75 ? '#4caf50' : ratio < 1 ? '#ff9800' : '#e53935'
    ctx.fillRect(shelf.x, shelf.y - 7, shelf.w, 4)
    ctx.fillStyle = '#1f1a10'
    ctx.font = '11px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText(`${used}${max ? `/${max}` : ''}л`, shelf.x, shelf.y - 10)

    for (const tank of shelf.tanks) {
      const aq = state.shelves.find((s) => s.id === tank.shelfId)?.aquariums.find((a) => a.id === tank.aqId)
      if (aq) drawTank(ctx, aq, tank, selectedId === aq.id, time)
    }
  }
}