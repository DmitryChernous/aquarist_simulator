import type { FishSpecies } from '../types'

// Реалистично-стилизованные SVG-модели рыб. Каждая рыба нарисована отдельными
// простыми фигурами (овы/полигоны), силуэты различаются по виду.

const c = (hex: string, n: number, light: boolean): string => {
  const h = hex.replace('#', '')
  const [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((x) => parseInt(x, 16))
  const t = (v: number): string => {
    const out = light ? Math.round(v + (255 - v) * n) : Math.round(v * (1 - n))
    return Math.max(0, Math.min(255, out)).toString(16).padStart(2, '0')
  }
  return `#${t(r)}${t(g)}${t(b)}`
}

const E = (cx: number, cy: number, rx: number, ry: number, fill: string, o = 1): string =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${o}"/>`
const C = (cx: number, cy: number, r: number, fill: string, o = 1): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${o}"/>`
const P = (pts: string, fill: string, o = 1): string =>
  `<polygon points="${pts}" fill="${fill}" opacity="${o}"/>`
const eye = (cx: number, cy: number, r: number): string =>
  `${C(cx, cy, r, '#ffffff')}${C(cx + r * 0.3, cy, r * 0.5, '#141c28')}`
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, o = 1): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" opacity="${o}"/>`
const fin = (pts: string, fill: string, o = 0.6): string => P(pts, fill, o)

// Простая рыба-основа: голова справа, хвост слева.
function baseFish(color: string, tailGray: string, rx: number, ry: number, cx: number, cy: number): string {
  return `
    ${P(`0,${cy} 34,${cy - 20} 52,${cy} 34,${cy + 20}`, tailGray, 0.9)}
    ${E(cx - rx * 0.4, cy, rx, ry, color)}
    ${eye(cx + rx * 0.42, cy - ry * 0.18, rx * 0.12)}
  `
}

export function fishArt(species: FishSpecies): string {
  const body = species.color
  const dark = c(body, 0.55, false)
  const light = c(body, 0.6, true)

  let svg = ''

  switch (species.id) {
    case 'neon':
      svg = `
        <linearGradient id="nb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>
        </linearGradient>
        ${P(`0,50 30,30 52,52 30,80`, dark)}
        ${E(95, 52, 52, 24, 'url(#nb)')}
        ${rect(52, 46, 44, 12, '#28d8ff')}
        ${rect(52, 62, 36, 9, '#ff4d6d')}
        ${fin(`56,32 88,20 92,44`, light)}
        ${eye(140, 48, 6)}`
      break
    case 'guppy':
      svg = `
        <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/>
        </linearGradient>
        <path d="M28,54 Q14,20 42,44 M28,54 Q14,88 42,64 Z" fill="${dark}" opacity="0.85"/>
        ${fin(`48,20 70,4 78,34`, light)}
        ${E(92, 54, 34, 20, 'url(#gb)')}
        ${eye(108, 50, 5)}`
      break
    case 'danio':
      svg = `
        ${P(`6,50 40,36 62,50 40,66`, dark)}
        ${E(108, 50, 56, 22, body)}
        <path d="M62,50 q40,-4 84,0 q-40,4 -84,0" fill="${light}" opacity="0.75"/>
        ${fin(`64,24 92,6 100,34`, light)}
        ${eye(132, 42, 5)}
        ${C(60, 52, 8, c(body, 0.4, true), 0.5)}`
      break
    case 'swordtail':
      svg = `
        ${P(`-2,70 40,50 66,64 52,86`, dark)}
        <line x1="46" y1="76" x2="14" y2="118" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
        ${E(96, 62, 46, 28, body)}
        <path d="M60,40 q10,-18 40,-10 l-6,20 Z" fill="${light}"/>
        ${eye(128, 54, 5)}`
      break
    case 'goldfish':
      svg = `
        <path d="M40,70 q10,-40 60,-40 q50,0 54,52 q-20,26 -46,24 q-44,2 -52,-16 q-8,-8 -16,-20 Z" fill="${body}"/>
        <path d="M40,70 q4,-30 16,-52 q26,-6 44,6" fill="${light}" opacity="0.4"/>
        <path d="M112,48 q34,-24 70,0 q-34,20 -70,0 Z" fill="${body}" opacity="0.8"/>
        ${eye(92, 62, 6)}
        ${rect(86, 64, 26, 4, dark, 2)}`
      break
    case 'angelfish':
      svg = `
        ${P(`110,92 40,10 74,14 84,6`, body)}
        ${P(`110,122 34,150 84,150 102,142`, body)}
        ${E(108, 92, 44, 40, body)}
        <rect x="70" y="56" width="8" height="72" fill="${dark}" opacity="0.5"/>
        <rect x="84" y="52" width="9" height="76" fill="${dark}" opacity="0.5"/>
        ${eye(142, 78, 6)}`
      break
    case 'mbuna':
      svg = `
        ${P(`20,44 70,22 108,52 56,78`, dark)}
        ${E(122, 60, 52, 34, body)}
        <rect x="66" y="40" width="9" height="46" fill="${light}" opacity="0.7"/>
        <rect x="82" y="38" width="9" height="48" fill="${light}" opacity="0.5"/>
        <rect x="98" y="40" width="9" height="44" fill="${light}" opacity="0.3"/>
        <path d="M150,44 q14,10 0,24 q-14,-10 0,-24 Z" fill="${light}"/>
        ${eye(152, 50, 6)}`
      break
    case 'discus':
      svg = `
        ${P(`0,78 30,50 56,78 30,106`, dark)}
        ${C(118, 80, 62, body)}
        <rect x="68" y="34" width="11" height="92" fill="${light}" opacity="0.6"/>
        <rect x="88" y="28" width="11" height="104" fill="${light}" opacity="0.45"/>
        <rect x="108" y="26" width="11" height="108" fill="${light}" opacity="0.3"/>
        ${eye(166, 74, 8)}`
      break
    case 'shrimp':
      svg = `
        ${P(`30,88 80,64 96,86 70,98`, body)}
        <path d="M96,86 q34,-26 60,-16 q16,16 6,30 q-40,20 -52,6 Z" fill="${c(body, 0.3, true)}"/>
        ${P(`98,114 110,128 120,112`, body)}
        <polyline points="120,70 166,44 178,58" fill="none" stroke="${c(body, 0.25, true)}" stroke-width="2"/>
        <polyline points="120,76 168,68 176,82" fill="none" stroke="${c(body, 0.25, true)}" stroke-width="2"/>
        ${C(150, 86, 6, body)}
        ${C(154, 84, 2, '#000')}`
      break
    case 'snail':
      svg = `
        ${E(120, 108, 56, 22, body)}
        <path d="M156,108 q0,-44 44,-44 q12,0 12,14 q0,34 -40,42 q-10,4 -16,-2 Z" fill="${c(body, 0.2, true)}"/>
        <path d="M180,74 q24,-4 24,14 q-6,16 -26,12" fill="${c(body, 0.4, true)}" opacity="0.6"/>
        <path d="M176,88 q30,2 30,-8 q-2,-12 -26,-12" fill="none" stroke="${c(body, 0.35, true)}" stroke-width="3"/>
        <path d="M64,112 q6,14 18,18 q-4,6 -14,4 q-10,-4 -14,-16 q-2,-10 8,-6 Z" fill="#caa46a"/>
        ${eye(86, 100, 5)}${eye(96, 102, 5)}`
      break
    default:
      svg = baseFish(body, dark, 60, 30, 100, 62)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 160" class="fish-art" role="img" aria-label="${species.name}">
    <rect x="2" y="2" width="336" height="156" rx="20" fill="#0a3a66" opacity="0.18"/>
    <rect x="0" y="0" width="340" height="160" fill="url(#fish-water)" opacity="0.35"/>
    <defs>
      <radialGradient id="fish-water" cx="0.5" cy="0.32" r="0.85">
        <stop offset="0" stop-color="#46d6ff" stop-opacity="0.28"/>
        <stop offset="1" stop-color="#083052" stop-opacity="0.15"/>
      </radialGradient>
    </defs>
    ${svg}
  </svg>`
}