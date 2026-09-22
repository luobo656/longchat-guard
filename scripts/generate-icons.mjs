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
  let color = [0, 0, 0, 0]

  if (roundedRectContains(x, y, 10, 10, 108, 108, 25)) {
    color = baseGradient(x, y)
  }

  if (bubbleContains(x, y)) color = [255, 255, 255, 255]

  for (const cx of [39, 61, 83]) {
    if (Math.hypot(x - cx, y - 60) <= 6) color = [8, 114, 101, 255]
  }

  if (shieldContains(x, y, 0)) color = [255, 255, 255, 255]
  if (shieldContains(x, y, 4)) color = shieldGradient(x, y)

  if (
    distanceToSegment(x, y, 79, 91, 88, 100) <= 3.5 ||
    distanceToSegment(x, y, 88, 100, 104, 82) <= 3.5
  ) {
    color = [255, 255, 255, 255]
  }

  return color
}

function bubbleContains(x, y) {
  const body = roundedRectContains(x, y, 14, 31, 95, 58, 14)
  const tail =
    pointInTriangle(x, y, [40, 87], [61, 87], [40, 103]) ||
    pointInTriangle(x, y, [40, 88], [48, 88], [40, 103])
  return body || tail
}

function baseGradient(x, y) {
  const t = clamp((x + y - 30) / 205, 0, 1)
  return [
    Math.round(11 + (5 - 11) * t),
    Math.round(128 + (88 - 128) * t),
    Math.round(111 + (79 - 111) * t),
    255
  ]
}

function shieldGradient(x, y) {
  const t = clamp((x + y - 142) / 92, 0, 1)
  return [
    255,
    Math.round(122 + (75 - 122) * t),
    Math.round(24 + (18 - 24) * t),
    255
  ]
}

function shieldContains(x, y, inset) {
  const topY = 62 + inset * 0.75
  const leftX = 69 + inset
  const rightX = 113 - inset
  const bottomY = 123 - inset
  const polygon = [
    [91, topY],
    [rightX, 72 + inset * 0.5],
    [rightX, 90],
    [rightX - inset * 1.5, 99],
    [104, 111 - inset * 0.4],
    [91, bottomY],
    [78, 111 - inset * 0.4],
    [leftX + inset * 1.5, 99],
    [leftX, 90],
    [leftX, 72 + inset * 0.5]
  ]
  return pointInPolygon(x, y, polygon)
}

function pointInPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  const t =
    lengthSq === 0
      ? 0
      : clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1)
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function pointInTriangle(x, y, a, b, c) {
  const area = (p1, p2, p3) =>
    Math.abs((p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1])) / 2)
  const p = [x, y]
  const total = area(a, b, c)
  const sum = area(p, b, c) + area(a, p, c) + area(a, b, p)
  return Math.abs(total - sum) < 0.5
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
