// 生成托盘图标(水滴形状),编码为 base64 写入 src/main/tray-icon.ts。
// 画成黑色 + alpha 的模板图标,Mac 上 setTemplateImage 后会自动适配明暗菜单栏(单色,跟系统图标一致)。
// 留足白边,使其在菜单栏里显示得小而精致。
// 运行:node scripts/gen-tray-icon.mjs
import { PNG } from 'pngjs'
import { writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))

// 水滴 = 下方圆 + 上方由两条切线收拢成的尖顶
function makeDroplet(size) {
  const png = new PNG({ width: size, height: size })
  const cx = size / 2
  const R = size * 0.22
  const cy = size * 0.675
  const d = R * 2.6
  const ty = cy - d
  const cosT = R / d
  const sinT = Math.sqrt(1 - cosT * cosT)
  const T = [cx, ty]
  const PL = [cx - R * sinT, cy - R * cosT]
  const PR = [cx + R * sinT, cy - R * cosT]

  const sign = (ax, ay, bx, by, px, py) =>
    (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const inTri = (px, py) => {
    const d1 = sign(T[0], T[1], PL[0], PL[1], px, py)
    const d2 = sign(PL[0], PL[1], PR[0], PR[1], px, py)
    const d3 = sign(PR[0], PR[1], T[0], T[1], px, py)
    const neg = d1 < 0 || d2 < 0 || d3 < 0
    const pos = d1 > 0 || d2 > 0 || d3 > 0
    return !(neg && pos)
  }
  const inside = (px, py) => {
    const dx = px - cx
    const dy = py - cy
    if (dx * dx + dy * dy <= R * R) return true
    if (py <= cy) return inTri(px, py)
    return false
  }

  const SS = 4
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hit++
        }
      }
      const idx = (size * y + x) << 2
      png.data[idx] = 0
      png.data[idx + 1] = 0
      png.data[idx + 2] = 0
      png.data[idx + 3] = Math.round((hit / (SS * SS)) * 255)
    }
  }
  return PNG.sync.write(png)
}

const buf = makeDroplet(64)
const b64 = buf.toString('base64')
const out = `// 自动生成,勿手改。来源 scripts/gen-tray-icon.mjs。
export const trayIconDataUrl = 'data:image/png;base64,${b64}'
`
writeFileSync(resolve(here, '../src/main/tray-icon.ts'), out)
console.log('wrote tray-icon.ts', buf.length, 'bytes png')
