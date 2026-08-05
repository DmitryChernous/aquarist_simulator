import type { FurnitureId, GameState } from '../types'
import { SPECIES_BY_ID } from '../data/fish'
import { shelfUsedLiters, storageCapacity, storageUsed } from '../data/shop'
import { FURNITURE, FURNITURE_IDS } from '../data/furniture'

export const HALL_WIDTH = 960
export const HALL_HEIGHT = 500

// Вместимость помещения по «ячейкам» стеллажей в переднем ряду.
// Стеллаж занимает 2 базовые ячейки + по 1 на полку, плюс зазор между
// соседними стойками. Сумма не должна превышать ширину зала (ROOM_W),
// иначе стойки начнут «уезжать» за пределы видимой области.
export const ROOM_SHELF_CELL_CAPACITY = 18

export function shelfCellSize(spec: { slabs: unknown[] }): number {
  return 2 + spec.slabs.length
}

export function roomShelvesTotalCells(shelves: { slabs: unknown[] }[]): number {
  const cells = shelves.reduce((a, s) => a + shelfCellSize(s), 0)
  return cells + Math.max(0, shelves.length - 1)
}

export interface TankRect {
  shelfId: string
  slabId: string
  aqId: string
  x: number
  y: number
  w: number
  h: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  dSx: number
  dSy: number
  wz: number
  wx: number
}

export interface ShelfRect {
  shelfId: string
  name: string
  box: Box
  x: number
  y: number
  w: number
  h: number
  tanks: TankRect[]
}

export interface StorageObjectRect {
  id: 'storageRacks' | 'displayRack'
  label: string
  box: Box
  x: number
  y: number
  w: number
  h: number
}

export interface FurnitureRect {
  id: FurnitureId
  box: Box
  x: number
  y: number
  w: number
  h: number
}

// --- Проекция «три четверти» (cabinet): глубина уходит вправо-вверх ---
const PAD = 20
const ROOM_W = 18
const DEPTH_SLANT = 24
const DEPTH_LIFT = 20
const FLOOR_DEPTH = 8
const FRONT_Y = HALL_HEIGHT - 24
const CELL_W = (HALL_WIDTH - PAD * 2 - FLOOR_DEPTH * DEPTH_SLANT) / ROOM_W
const SHELF_H = 230
const FURN_FOOTPRINT: Record<FurnitureId, { cells: number; h: number }> = {
  coffeeTable: { cells: 2, h: 50 },
  armchair: { cells: 2, h: 95 },
  sofa: { cells: 3, h: 85 },
  displayRack: { cells: 2, h: 190 },
}
const FURN_ROWS = [3, 5]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function sx(wx: number, wz: number): number {
  return PAD + wx * CELL_W + wz * DEPTH_SLANT
}

function sy(wz: number): number {
  return FRONT_Y - (FLOOR_DEPTH - wz) * DEPTH_LIFT
}

function makeBox(wx0: number, wz0: number, wx1: number, wz1: number, h: number): Box {
  return {
    x: sx(wx0, wz1),
    y: sy(wz1),
    w: (wx1 - wx0) * CELL_W,
    h,
    dSx: (wz0 - wz1) * DEPTH_SLANT,
    dSy: (wz0 - wz1) * DEPTH_LIFT,
    wz: wz1,
    wx: wx0,
  }
}

function drawBox(ctx: CanvasRenderingContext2D, b: Box, colors: { front: string; side: string; top: string; edge: string }): void {
  const { x, y, w, h, dSx, dSy } = b

  ctx.fillStyle = colors.side
  ctx.beginPath()
  ctx.moveTo(x + w, y)
  ctx.lineTo(x + w, y - h)
  ctx.lineTo(x + w + dSx, y - h + dSy)
  ctx.lineTo(x + w + dSx, y + dSy)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = colors.front
  ctx.fillRect(x, y - h, w, h)

  ctx.fillStyle = colors.top
  ctx.beginPath()
  ctx.moveTo(x, y - h)
  ctx.lineTo(x + w, y - h)
  ctx.lineTo(x + w + dSx, y - h + dSy)
  ctx.lineTo(x + dSx, y - h + dSy)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = colors.edge
  ctx.lineWidth = 2
  ctx.strokeRect(x, y - h, w, h)
  ctx.beginPath()
  ctx.moveTo(x + w, y)
  ctx.lineTo(x + w + dSx, y + dSy)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + w, y - h)
  ctx.lineTo(x + w + dSx, y - h + dSy)
  ctx.stroke()
}

export function layoutHall(state: GameState): { shelves: ShelfRect[] } {
  const shelves: ShelfRect[] = []
  const roomShelves = state.shelves.filter((s) => s.roomId === state.viewRoom)
  const cells = roomShelves.map((s) => 2 + s.slabs.length)
  const total = cells.reduce((a, b) => a + b, 0) + Math.max(0, cells.length - 1)
  // Если стоек слишком много (например, из старого сохранения) — масштабируем,
  // чтобы ни одна стойка не вышла за пределы видимой области.
  const scale = total > ROOM_W ? ROOM_W / total : 1
  let cursor = Math.max(0, (ROOM_W - total * scale) / 2)

  for (let i = 0; i < roomShelves.length; i++) {
    const shelf = roomShelves[i]
    const c = cells[i] * scale
    const b = makeBox(cursor, 0, cursor + c, 1, SHELF_H)

    const tanks: TankRect[] = []
    const slabH = b.h / Math.max(1, shelf.slabs.length)
    let cy = b.y
    for (const slab of shelf.slabs) {
      const scl = b.w / slab.width // px на см на этой полке
      const aqs = shelf.aquariums.filter((a) => a.slabId === slab.id)
      for (const aq of aqs) {
        const aqW = aq.w * scl
        const aqX = b.x + (aq.x ?? 0) * scl
        const aqH = Math.max(24, (aq.h / slab.height) * (slabH - 8))
        tanks.push({
          shelfId: shelf.id,
          slabId: slab.id,
          aqId: aq.id,
          x: aqX,
          y: cy - aqH,
          w: aqW,
          h: aqH,
        })
      }
      cy -= slabH
    }

    shelves.push({ shelfId: shelf.id, name: shelf.name, box: b, x: b.x, y: b.y - b.h, w: b.w, h: b.h, tanks })
    cursor += c + scale
  }

  return { shelves }
}

export function layoutFurniture(state: GameState): FurnitureRect[] {
  if (state.viewRoom !== 'hall') return []
  const items: FurnitureId[] = []
  for (const id of FURNITURE_IDS) {
    const n = state.shop.furniture[id] ?? 0
    for (let i = 0; i < n; i++) items.push(id)
  }

  const out: FurnitureRect[] = []
  let row = 0
  let cursor = 1
  for (const id of items) {
    while (row < FURN_ROWS.length) {
      const fp = FURN_FOOTPRINT[id]
      if (cursor + fp.cells <= ROOM_W - 1) break
      row++
      cursor = 1
    }
    if (row >= FURN_ROWS.length) break
    const wz = FURN_ROWS[row]
    const fp = FURN_FOOTPRINT[id]
    const b = makeBox(cursor, wz, cursor + fp.cells, wz + 1, fp.h)
    out.push({ id, box: b, x: b.x, y: b.y - b.h, w: b.w, h: b.h })
    cursor += fp.cells + 1
  }
  return out
}

export function layoutStorageObjects(state: GameState): StorageObjectRect[] {
  const out: StorageObjectRect[] = []
  const racksHere = state.racks.filter((r) => r.roomId === state.viewRoom).length
  if (racksHere === 0) return out
  const b = makeBox(2, 6, 5, 7, 90)
  out.push({ id: 'storageRacks', label: `Стеллаж ×${racksHere}`, box: b, x: b.x, y: b.y - b.h, w: b.w, h: b.h })
  return out
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

function drawShelf(ctx: CanvasRenderingContext2D, state: GameState, s: ShelfRect, selectedId: string | null, time: number): void {
  const b = s.box
  drawBox(ctx, b, { front: '#4a3424', side: '#38281a', top: '#5d4330', edge: '#2e2016' })

  ctx.fillStyle = '#5d4330'
  ctx.fillRect(b.x + 5, b.y - b.h + 5, b.w - 10, b.h - 10)
  ctx.strokeStyle = '#2e2016'
  ctx.lineWidth = 2
  ctx.strokeRect(b.x + 5, b.y - b.h + 5, b.w - 10, b.h - 10)

  const shelfState = state.shelves.find((x) => x.id === s.shelfId)
  if (shelfState) {
    const used = shelfUsedLiters(shelfState)
    const max = shelfState.loadCapacityL
    const ratio = max ? used / max : 0
    const topY = b.y - b.h
    ctx.fillStyle = ratio < 0.75 ? '#4caf50' : ratio < 1 ? '#ff9800' : '#e53935'
    ctx.fillRect(b.x, topY - 6, b.w, 4)
    ctx.fillStyle = '#1f1a10'
    ctx.font = '11px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText(`${used}${max ? `/${max}` : ''}л · ${s.name}`, b.x, topY - 9)
  }

  for (const t of s.tanks) {
    const aq = state.shelves.find((x) => x.id === t.shelfId)?.aquariums.find((a) => a.id === t.aqId)
    if (aq) drawTank(ctx, aq, t, selectedId === aq.id, time)
  }
}

function drawChair(ctx: CanvasRenderingContext2D, b: Box, wide: boolean): void {
  drawBox(ctx, b, { front: '#2f5d7a', side: '#23485f', top: '#3b6f8f', edge: '#1b3a4f' })
  const sep = b.h * 0.55
  ctx.fillStyle = '#23485f'
  ctx.fillRect(b.x, b.y - b.h, b.w, sep)
  const armW = Math.min(11, b.w * 0.16)
  const armH = b.h - 30
  ctx.fillStyle = '#3b6f8f'
  ctx.fillRect(b.x, b.y - b.h + 12, armW, armH)
  ctx.fillRect(b.x + b.w - armW, b.y - b.h + 12, armW, armH)
  if (wide) {
    ctx.strokeStyle = 'rgba(20,40,60,0.5)'
    ctx.lineWidth = 1
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(b.x + b.w * 0.2 + i * b.w * 0.25, b.y - b.h)
      ctx.lineTo(b.x + b.w * 0.2 + i * b.w * 0.25, b.y - sep)
      ctx.stroke()
    }
  }
}

function drawFurniture(ctx: CanvasRenderingContext2D, state: GameState, f: FurnitureRect): void {
  const b = f.box
  const def = FURNITURE[f.id]

  if (f.id === 'coffeeTable') {
    ctx.strokeStyle = '#6b4a2b'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(b.x + 7, b.y)
    ctx.lineTo(b.x + 7, b.y + 12)
    ctx.moveTo(b.x + b.w - 7, b.y)
    ctx.lineTo(b.x + b.w - 7, b.y + 12)
    ctx.stroke()
    drawBox(ctx, { ...b, h: 18 }, { front: '#c8a878', side: '#9c7a4e', top: '#d9bd92', edge: '#6b4a2b' })
    ctx.fillStyle = 'rgba(190,225,255,0.45)'
    ctx.beginPath()
    ctx.moveTo(b.x, b.y - 18)
    ctx.lineTo(b.x + b.w, b.y - 18)
    ctx.lineTo(b.x + b.w + b.dSx, b.y - 18 + b.dSy)
    ctx.lineTo(b.x + b.dSx, b.y - 18 + b.dSy)
    ctx.closePath()
    ctx.fill()
  } else if (f.id === 'armchair') {
    drawChair(ctx, b, false)
  } else if (f.id === 'sofa') {
    drawChair(ctx, b, true)
  } else {
    drawBox(ctx, b, { front: '#5b4127', side: '#3f2c19', top: '#7c6145', edge: '#2e2016' })
    const n = 4
    ctx.strokeStyle = '#2e2016'
    ctx.lineWidth = 1
    for (let i = 1; i < n; i++) {
      const yy = b.y - (b.h / n) * i
      ctx.beginPath()
      ctx.moveTo(b.x, yy)
      ctx.lineTo(b.x + b.w, yy)
      ctx.moveTo(b.x + b.w, yy)
      ctx.lineTo(b.x + b.w + b.dSx, yy + b.dSy)
      ctx.stroke()
    }
    const eqCount = state.shop.rackInventory.length
    const decCount = state.shop.rackDecor.length
    let idx = 0
    for (let i = 0; i < n - 1 && idx < 8; i++) {
      for (let j = 0; j < 2 && idx < 8; j++) {
        const xx = b.x + 8 + j * 22
        const yy = b.y - (b.h / n) * (i + 1) + 6
        ctx.fillStyle = idx < eqCount ? '#ffd54f' : idx < eqCount + decCount ? '#81c784' : 'rgba(255,255,255,0.15)'
        ctx.fillRect(xx, yy - 7, 15, 8)
        idx++
      }
    }
  }

  ctx.fillStyle = 'rgba(46,32,22,0.85)'
  ctx.font = '11px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(def.name, b.x + b.w / 2, b.y - b.h - 9)
}

function drawStorageObject(ctx: CanvasRenderingContext2D, state: GameState, o: StorageObjectRect): void {
  const b = o.box
  drawBox(ctx, b, { front: '#5b4127', side: '#3f2c19', top: '#7c6145', edge: '#2e2016' })
  const used = storageUsed(state.shop)
  const cap = storageCapacity(state.racks.length)
  ctx.fillStyle = '#f3e9d2'
  ctx.font = 'bold 12px system-ui'
  ctx.textAlign = 'left'
  ctx.fillText(o.label, b.x + 8, b.y - 18)
  ctx.font = '11px system-ui'
  ctx.fillStyle = 'rgba(243,233,210,0.85)'
  ctx.fillText(`занято ${used}/${cap}`, b.x + 8, b.y - 4)
  ctx.fillStyle = 'rgba(243,233,210,0.6)'
  ctx.fillText('нажмите, чтобы открыть', b.x + 8, b.y - 38)
}

export function drawHall(ctx: CanvasRenderingContext2D, state: GameState, selectedId: string | null, time: number): void {
  const floorBackY = sy(0)
  const floorFrontY = sy(FLOOR_DEPTH)
  const floorL = sx(0, 0)
  const floorR = sx(ROOM_W, 0)
  const floorFL = sx(0, FLOOR_DEPTH)
  const floorFR = sx(ROOM_W, FLOOR_DEPTH)

  const wall = ctx.createLinearGradient(0, 0, 0, floorFrontY)
  wall.addColorStop(0, '#efe9dc')
  wall.addColorStop(1, '#d9d0bd')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, HALL_WIDTH, floorFrontY)

  ctx.fillStyle = '#cfc5ae'
  ctx.beginPath()
  ctx.moveTo(floorR, 0)
  ctx.lineTo(HALL_WIDTH, 0)
  ctx.lineTo(HALL_WIDTH, floorFrontY)
  ctx.lineTo(floorFR, floorFrontY)
  ctx.lineTo(floorR, floorBackY)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#d4c9b2'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(floorL, 0)
  ctx.lineTo(floorL, floorBackY)
  ctx.lineTo(floorFL, floorFrontY)
  ctx.lineTo(0, floorFrontY)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#b7a687'
  ctx.beginPath()
  ctx.moveTo(floorL, floorBackY)
  ctx.lineTo(floorR, floorBackY)
  ctx.lineTo(floorFR, floorFrontY)
  ctx.lineTo(floorFL, floorFrontY)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(90,80,60,0.3)'
  ctx.lineWidth = 1
  for (let i = 0; i <= ROOM_W; i++) {
    ctx.beginPath()
    ctx.moveTo(sx(i, 0), floorBackY)
    ctx.lineTo(sx(i, FLOOR_DEPTH), floorFrontY)
    ctx.stroke()
  }
  for (let z = 0; z <= FLOOR_DEPTH; z++) {
    ctx.beginPath()
    ctx.moveTo(floorL + z * DEPTH_SLANT, sy(z))
    ctx.lineTo(floorR + z * DEPTH_SLANT, sy(z))
    ctx.stroke()
  }

  const { shelves } = layoutHall(state)
  const furniture = layoutFurniture(state)
  const storage = layoutStorageObjects(state)

  type DrawItem = { wz: number; wx: number; draw: () => void }
  const items: DrawItem[] = []
  for (const s of shelves) items.push({ wz: s.box.wz, wx: s.box.wx, draw: () => drawShelf(ctx, state, s, selectedId, time) })
  for (const f of furniture) items.push({ wz: f.box.wz, wx: f.box.wx, draw: () => drawFurniture(ctx, state, f) })
  for (const o of storage) items.push({ wz: o.box.wz, wx: o.box.wx, draw: () => drawStorageObject(ctx, state, o) })
  items.sort((a, b) => a.wz - b.wz || a.wx - b.wx)
  for (const it of items) it.draw()

  if (shelves.length === 0 && furniture.length === 0 && storage.length === 0) {
    ctx.fillStyle = 'rgba(46,32,22,0.55)'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('В этом помещении нет стоек. Купите и разместите их ниже.', HALL_WIDTH / 2, HALL_HEIGHT / 2 - 40)
  }
}
