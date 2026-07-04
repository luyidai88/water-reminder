// 生成 app 图标(圆角方形蓝色渐变背景 + 居中白色水滴),1024x1024,写到 build/icon.png。
// electron-builder 打包时从这张图生成 macOS 的 .icns。
// 运行:node scripts/gen-app-icon.mjs
import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const S = 1024
const png = new PNG({ width: S, height: S })

const radius = S * 0.225
const top = [124, 196, 255]
const bot = [31, 127, 224]

const cx = S / 2
const R = S * 0.2
const cy = S * 0.6
const d = R * 2.5
const ty = cy - d
const cosT = R / d
const sinT = Math.sqrt(1 - cosT * cosT)
const T = [cx, ty]
const PL = [cx - R * sinT, cy - R * cosT]
const PR = [cx + R * sinT, cy - R * cosT]
const sign = (ax, ay, bx, by, px, py) => (px - bx) * (ay - by) - (ax - bx) * (py - by)
const inTri = (px, py) => {
  const d1 = sign(T[0], T[1], PL[0], PL[1], px, py)
  const d2 = sign(PL[0], PL[1], PR[0], PR[1], px, py)
  const d3 = sign(PR[0], PR[1], T[0], T[1], px, py)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
const inDrop = (px, py) => {
  const dx = px - cx
  const dy = py - cy
  if (dx * dx + dy * dy <= R * R) return true
  if (py <= cy) return inTri(px, py)
  return false
}
const inRoundRect = (px, py) => {
  const rx = radius
  if (px < rx && py < rx) return (px - rx) ** 2 + (py - rx) ** 2 <= rx * rx
  if (px > S - rx && py < rx) return (px - (S - rx)) ** 2 + (py - rx) ** 2 <= rx * rx
  if (px < rx && py > S - rx) return (px - rx) ** 2 + (py - (S - rx)) ** 2 <= rx * rx
  if (px > S - rx && py > S - rx) return (px - (S - rx)) ** 2 + (py - (S - rx)) ** 2 <= rx * rx
  return true
}

const SS = 3
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let bgHit = 0
    let dropHit = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS
        const py = y + (sy + 0.5) / SS
        if (inRoundRect(px, py)) {
          bgHit++
          if (inDrop(px, py)) dropHit++
        }
      }
    }
    const tot = SS * SS
    const bgA = bgHit / tot
    const dropA = dropHit / tot
    const t = y / S
    let r = Math.round(top[0] + (bot[0] - top[0]) * t)
    let g = Math.round(top[1] + (bot[1] - top[1]) * t)
    let b = Math.round(top[2] + (bot[2] - top[2]) * t)
    if (dropA > 0) {
      r = Math.round(r * (1 - dropA) + 255 * dropA)
      g = Math.round(g * (1 - dropA) + 255 * dropA)
      b = Math.round(b * (1 - dropA) + 255 * dropA)
    }
    const idx = (S * y + x) << 2
    png.data[idx] = r
    png.data[idx + 1] = g
    png.data[idx + 2] = b
    png.data[idx + 3] = Math.round(bgA * 255)
  }
}
mkdirSync(resolve(here, '../build'), { recursive: true })
writeFileSync(resolve(here, '../build/icon.png'), PNG.sync.write(png))
console.log('wrote build/icon.png', S, 'x', S)
