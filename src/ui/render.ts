import type { FishInstance, FishSpecies, TankState } from '../types'

const RNG_SEED_OFFSET = 13

function drawFish(ctx: CanvasRenderingContext2D, fish: FishInstance, species: FishSpecies): void {
  const t = performance.now() / 1000
  const len = 6 + species.sizeCm * 1.6
  const th = len * 0.5
  const dir = fish.vx >= 0 ? 1 : -1

  ctx.save()
  ctx.translate(fish.x, fish.y)
  ctx.scale(dir, 1)
  ctx.globalAlpha = 0.35 + 0.65 * (fish.health / 100)

  const wig = Math.sin(t * 6 + (fish.id.charCodeAt(fish.id.length - 1) || 0)) * 0.2
  ctx.beginPath()
  ctx.moveTo(-len / 2, 0)
  ctx.lineTo(-len / 2 - th * 0.8, -th * 0.6 - wig * th)
  ctx.lineTo(-len / 2 - th * 0.8, th * 0.6 - wig * th)
  ctx.closePath()
  ctx.fillStyle = species.color
  ctx.fill()

  ctx.beginPath()
  ctx.ellipse(0, 0, len / 2, th / 2, 0, 0, Math.PI * 2)
  ctx.fillStyle = species.color
  ctx.fill()

  ctx.beginPath()
  ctx.arc(len * 0.22, -th * 0.12, Math.max(1.2, th * 0.1), 0, Math.PI * 2)
  ctx.fillStyle = '#111'
  ctx.fill()

  ctx.restore()
  ctx.globalAlpha = 1
}

function drawPlant(ctx: CanvasRenderingContext2D, index: number, w: number, h: number): void {
  const x = (index * 37 + RNG_SEED_OFFSET) % w
  const height = 26 + ((index * 53) % 40)
  const color = index % 2 === 0 ? '#1e7a46' : '#2c9a55'

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, h - 14)
  ctx.quadraticCurveTo(x + 6, h - 14 - height / 2, x, h - 14 - height)
  ctx.stroke()

  ctx.fillStyle = color
  for (let i = 0; i < 3; i++) {
    const ly = h - 16 - (height * i) / 3
    ctx.beginPath()
    ctx.ellipse(x + 4, ly, 7, 2.5, 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x - 4, ly + 5, 6, 2.2, -0.3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawDecor(ctx: CanvasRenderingContext2D, index: number, h: number): void {
  const x = 60 + index * 150
  ctx.fillStyle = index % 2 === 0 ? '#5a6b78' : '#4d5c68'
  ctx.beginPath()
  ctx.moveTo(x - 34, h - 16)
  ctx.quadraticCurveTo(x, h - 16 - 48, x + 34, h - 16)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#78858f'
  ctx.beginPath()
  ctx.arc(x - 8, h - 22, 8, 0, Math.PI * 2)
  ctx.fill()
}

export function renderTank(
  canvas: HTMLCanvasElement,
  tank: TankState,
  speciesById: Record<string, FishSpecies>,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#0e3357')
  grad.addColorStop(1, '#07203a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#3a4a3f'
  ctx.fillRect(0, h - 16, w, 16)
  ctx.fillStyle = '#2c3830'
  for (let i = 0; i < w; i += 14) {
    ctx.beginPath()
    ctx.arc(i + 7, h - 8, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  const plantCount = Math.round(tank.vegetation * 24)
  for (let i = 0; i < plantCount; i++) drawPlant(ctx, i, w, h)

  for (let d = 0; d < tank.designLevel; d++) drawDecor(ctx, d, h)

  for (const fish of tank.fish) {
    const species = speciesById[fish.speciesId]
    if (!species) continue
    drawFish(ctx, fish, species)
  }
}
