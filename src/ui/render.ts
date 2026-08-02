import type { AquariumState, FishInstance, FishSpecies } from '../types'

function drawFish(ctx: CanvasRenderingContext2D, fish: FishInstance, species: FishSpecies): void {
  const t = performance.now() / 1000
  const len = 6 + species.sizeCm * 1.2
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

export function drawDecor(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number): void {
  if (kind === 'plant') {
    ctx.strokeStyle = '#1e7a46'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 6, y - 14, x, y - 28)
    ctx.stroke()
    ctx.fillStyle = '#2c9a55'
    for (let i = 0; i < 3; i++) {
      const ly = y - 4 - i * 9
      ctx.beginPath()
      ctx.ellipse(x + 3, ly, 5, 2.2, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(x - 3, ly + 4, 4, 1.8, -0.3, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (kind === 'stone') {
    ctx.fillStyle = '#5a6b78'
    ctx.beginPath()
    ctx.moveTo(x - 14, y)
    ctx.lineTo(x - 8, y - 14)
    ctx.lineTo(x + 8, y - 16)
    ctx.lineTo(x + 14, y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#78858f'
    ctx.beginPath()
    ctx.arc(x - 4, y - 8, 4, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'substrate') {
    ctx.fillStyle = '#7a5230'
    ctx.beginPath()
    ctx.ellipse(x, y, 15, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#8a6040'
    for (let i = 0; i < 5; i++) {
      const gx = x - 12 + i * 6
      ctx.beginPath()
      ctx.arc(gx, y - 2, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.strokeStyle = '#7a5230'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x - 8, y)
    ctx.quadraticCurveTo(x + 4, y - 10, x + 8, y - 24)
    ctx.lineTo(x + 11, y - 26)
    ctx.stroke()
    ctx.strokeStyle = '#8a6040'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 2, y)
    ctx.quadraticCurveTo(x + 2, y - 8, x, y - 16)
    ctx.stroke()
  }
}

export function renderAquarium(
  canvas: HTMLCanvasElement,
  aq: AquariumState,
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

  for (const d of aq.decor) drawDecor(ctx, d.kind, Math.max(16, d.x * (w - 32)) | 0, h - 16 - Math.max(0, d.y * (h - 40)) | 0)

  for (let i = 0; i < aq.designLevel; i++) {
    const x = 40 + i * 90
    ctx.fillStyle = i % 2 === 0 ? '#5a6b78' : '#4d5c68'
    ctx.beginPath()
    ctx.moveTo(x - 34, h - 16)
    ctx.quadraticCurveTo(x, h - 16 - 48, x + 34, h - 16)
    ctx.closePath()
    ctx.fill()
  }

  for (const fish of aq.fish) {
    const species = speciesById[fish.speciesId]
    if (!species) continue
    drawFish(ctx, fish, species)
  }

  ctx.globalAlpha = 1
}