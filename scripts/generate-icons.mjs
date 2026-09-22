import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = join(process.cwd(), 'public', 'icons')
mkdirSync(outDir, { recursive: true })

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon${size}.png`), renderPng(size))
}

function renderPng(size) {
  const ss = size <= 32 ? 4 : 3
  const w = size
  const h = size
  const rgba = Buffer.alloc(w * h * 4)

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const samples = ss * ss
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const px = ((x + (sx + 0.5) / ss) / size) * 128
          const py = ((y + (sy + 0.5) / ss) / size) * 128
          const c = sampleIcon(px, py)
          const alpha = c[3] / 255
          r += c[0] * alpha
          g += c[1] * alpha
          b += c[2] * alpha
          a += alpha
        }
      }
      const index = (y * w + x) * 4
      if (a > 0) {
        rgba[index] = Math.round(r / a)
        rgba[index + 1] = Math.round(g / a)
        rgba[index + 2] = Math.round(b / a)
        rgba[index + 3] = Math.round((a / samples) * 255)
      }
    }
  }

  return encodePng(w, h, rgba)
}

function sampleIcon(x, y) {
  if (roundedRectContains(x, y, 12, 12, 104, 104, 24)) {
    let color = baseGradient(x, y)
    if (bubbleContains(x, y)) color = [255, 255, 255, 255]
    color = over(color, roundedRectContains(x, y, 38, 82, 10, 8, 4) ? [248, 194, 74, 255] : [0, 0, 0, 0])
    color = over(color, roundedRectContains(x, y, 52, 82, 10, 8, 4) ? [246, 169, 47, 255] : [0, 0, 0, 0])
    color = over(color, roundedRectContains(x, y, 66, 82, 10, 8, 4) ? [240, 120, 36, 255] : [0, 0, 0, 0])
    color = over(color, roundedRectContains(x, y, 80, 82, 10, 8, 4) ? [224, 82, 45, 255] : [0, 0, 0, 0])
    return color
  }
  return [0, 0, 0, 0]
}

function bubbleContains(x, y) {
  const body = roundedRectContains(x, y, 25, 35, 78, 46, 12)
  const tail =
    pointInTriangle(x, y, [53, 80], [67, 80], [52, 94]) ||
    pointInTriangle(x, y, [52, 81], [57, 81], [52, 94])
  return body || tail
}

function baseGradient(x, y) {
  const t = clamp((x + y - 36) / 192, 0, 1)
  return [
    Math.round(15 + (6 - 15) * t),
    Math.round(118 + (67 - 118) * t),
    Math.round(110 + (62 - 110) * t),
    255
  ]
}

function pointInTriangle(x, y, a, b, c) {
  const area = (p1, p2, p3) =>
    Math.abs((p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1])) / 2)
  const p = [x, y]
  const total = area(a, b, c)
  const sum = area(p, b, c) + area(a, p, c) + area(a, b, p)
  return Math.abs(total - sum) < 0.5
}

function over(base, top) {
  if (top[3] === 0) return base
  return top
}

function roundedRectContains(x, y, rx, ry, rw, rh, rr) {
  const cx = clamp(x, rx + rr, rx + rw - rr)
  const cy = clamp(y, ry + rr, ry + rh - rr)
  return Math.hypot(x - cx, y - cy) <= rr
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function chunk(type, data) {
  const name = Buffer.from(type)
  return Buffer.concat([u32(data.length), name, data, u32(crc32(Buffer.concat([name, data])))])
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0)
  return buffer
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
