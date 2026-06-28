// Shared canvas renderer.
// The SAME drawScene() is used for the on-screen preview and the final PNG export,
// so "what you see" is exactly "what you download" — just at a different scale.

export const STORY_W = 1080
export const STORY_H = 1920

export const THEMES = {
  dark: { bg: '#0b0b0b', title: '#ffffff', artist: '#b3b3b3' },
  light: { bg: '#ffffff', title: '#111111', artist: '#6b6b6b' },
  graphite: { bg: '#181818', title: '#ffffff', artist: '#aaaaaa' },
  cream: { bg: '#f3efe7', title: '#1c1a17', artist: '#8a8175' }
}

// ---- image loading + cache ---------------------------------------------------

const imgCache = new Map()

export function loadImage(src) {
  if (!src) return Promise.resolve(null)
  if (imgCache.has(src)) return imgCache.get(src)
  const p = new Promise((resolve) => {
    const img = new Image()
    // remote artwork (e.g. iTunes) must be CORS-clean or the canvas gets tainted
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
  imgCache.set(src, p)
  return p
}

// ---- layout maths ------------------------------------------------------------

// Computes every geometry value in 1080x1920 "story units".
// Auto-scales the cover size down so the whole block always fits the frame.
export function computeLayout(cards, opts) {
  const cols = opts.cols
  const pad = 84
  const gapX = 36
  const gapY = 48
  const headerH = opts.header ? 132 : 0

  const availW = STORY_W - pad * 2
  const availH = STORY_H - pad * 2 - headerH

  const rows = Math.max(1, Math.ceil(cards.length / cols))

  // helper: total stacked height for a given cover size
  const cardExtras = (cover) => {
    const titleFs = cover * 0.082
    const artistFs = cover * 0.07
    const padCT = cover * 0.07 // cover -> title
    const gapTA = cover * 0.05 // title -> artist
    const bottom = cover * 0.04
    const textBlock = padCT + titleFs + gapTA + artistFs + bottom
    return { titleFs, artistFs, padCT, gapTA, textBlock, cardH: cover + textBlock }
  }

  let cover = (availW - gapX * (cols - 1)) / cols
  let ex = cardExtras(cover)
  let totalH = rows * ex.cardH + gapY * (rows - 1)

  if (totalH > availH) {
    const k = availH / totalH
    cover *= k
    ex = cardExtras(cover)
    totalH = rows * ex.cardH + gapY * (rows - 1)
  }

  const gridW = cover * cols + gapX * (cols - 1)
  const startX = (STORY_W - gridW) / 2
  const startY = pad + headerH + (availH - totalH) / 2

  return { pad, gapX, gapY, headerH, cols, cover, startX, startY, ...ex }
}

// ---- drawing helpers ---------------------------------------------------------

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// draw image cropped to a centered square (object-fit: cover)
function drawCover(ctx, img, x, y, size, radius) {
  ctx.save()
  roundRectPath(ctx, x, y, size, size, radius)
  ctx.clip()
  if (img) {
    const s = Math.min(img.width, img.height)
    const sx = (img.width - s) / 2
    const sy = (img.height - s) / 2
    ctx.drawImage(img, sx, sy, s, s, x, y, size, size)
  } else {
    // placeholder
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = '#5a5a5a'
    ctx.font = `500 ${size * 0.1}px Roboto, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', x + size / 2, y + size / 2)
  }
  ctx.restore()
}

function ellipsize(ctx, text, maxW) {
  if (!text) return ''
  if (ctx.measureText(text).width <= maxW) return text
  const ell = '…'
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo).trimEnd() + ell
}

// ---- main scene --------------------------------------------------------------

export async function drawScene(ctx, cards, opts) {
  const theme = THEMES[opts.theme] || THEMES.dark
  const bg = opts.bg || theme.bg
  const titleColor = opts.titleColor || theme.title
  const artistColor = opts.artistColor || theme.artist

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, STORY_W, STORY_H)

  const L = computeLayout(cards, { cols: opts.cols, header: !!opts.header })

  // optional header text
  if (opts.header) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = titleColor
    ctx.font = `700 56px Roboto, sans-serif`
    ctx.fillText(ellipsize(ctx, opts.header, STORY_W - L.pad * 2), L.pad, L.pad + 56)
  }

  // preload all images first so draw order is correct
  const imgs = await Promise.all(cards.map((c) => loadImage(c.cover)))

  const radius = L.cover * 0.018

  cards.forEach((card, i) => {
    const col = i % L.cols
    const row = Math.floor(i / L.cols)
    const x = L.startX + col * (L.cover + L.gapX)
    const y = L.startY + row * (L.cardH + L.gapY)

    drawCover(ctx, imgs[i], x, y, L.cover, radius)

    // title (white, medium)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    let ty = y + L.cover + L.padCT + L.titleFs
    ctx.fillStyle = titleColor
    ctx.font = `500 ${L.titleFs}px Roboto, sans-serif`
    ctx.fillText(ellipsize(ctx, card.title || '제목 없음', L.cover), x, ty)

    // artist (grey, regular)
    ty += L.gapTA + L.artistFs
    ctx.fillStyle = artistColor
    ctx.font = `400 ${L.artistFs}px Roboto, sans-serif`
    ctx.fillText(ellipsize(ctx, card.artist || '', L.cover), x, ty)
  })

  return L
}

// render into a target canvas at a given pixel scale (2 = hi-res export)
export async function renderToCanvas(canvas, cards, opts, scale = 1) {
  canvas.width = STORY_W * scale
  canvas.height = STORY_H * scale
  const ctx = canvas.getContext('2d')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  await drawScene(ctx, cards, opts)
}
