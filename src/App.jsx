import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as htmlToImage from 'html-to-image'
import { searchAlbums } from './itunes.js'

// ─── palette constants ──────────────────────────────────────────────────────
const DEFAULT_PAL = {
  accent: 'hsl(276 78% 76%)',
  glow: 'hsl(282 56% 36%)',
  mid: 'hsl(268 46% 15%)',
  base: 'hsl(262 40% 6%)',
  h: 0.765,
  s: 0.5,
}

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (mx + mn) / 2
  const d = mx - mn
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0))
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h, s, l]
}

function buildPaletteHSL(h, s) {
  const H = Math.round(h * 360)
  return {
    accent: `hsl(${H} ${Math.round(Math.min(0.92, s + 0.2) * 100)}% 73%)`,
    glow: `hsl(${H} ${Math.round(s * 100)}% 34%)`,
    mid: `hsl(${H} ${Math.round(s * 72)}% 13%)`,
    base: `hsl(${H} ${Math.round(s * 46)}% 5.5%)`,
    h, s,
  }
}

function extractMeta(src) {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      let pal = DEFAULT_PAL, data = null
      try {
        const N = 40, c = document.createElement('canvas')
        c.width = N; c.height = N
        const x = c.getContext('2d')
        x.drawImage(img, 0, 0, N, N)
        const d = x.getImageData(0, 0, N, N).data
        const NB = 24
        const buckets = Array.from({ length: NB }, () => ({ w: 0, ssum: 0, c: 0 }))
        let ar = 0, ag = 0, ab = 0, n = 0, sSum = 0, energy = 0
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]
          if (a < 200) continue
          ar += r; ag += g; ab += b; n++
          const hsl = rgb2hsl(r, g, b)
          sSum += hsl[1]
          if (hsl[1] > 0.2 && hsl[2] > 0.12 && hsl[2] < 0.9) {
            const w = hsl[1] * hsl[1]
            const bi = Math.round(hsl[0] * NB) % NB
            const e = buckets[bi]
            e.w += w; e.ssum += hsl[1]; e.c++; energy += w
          }
        }
        if (n) {
          const avgS = sSum / n
          if (avgS > 0.16 && energy / n > 0.04) {
            let bi = 0, bw = -1
            for (let k = 0; k < NB; k++) { if (buckets[k].w > bw) { bw = buckets[k].w; bi = k } }
            const e = buckets[bi]
            const hue = bi / NB
            const sat = Math.min(0.85, Math.max(0.32, e.ssum / Math.max(1, e.c)))
            pal = buildPaletteHSL(hue, sat)
          } else {
            const avg = rgb2hsl(ar / n, ag / n, ab / n)
            pal = buildPaletteHSL(avg[0], Math.min(0.08, avg[1]))
          }
        }
        const big = document.createElement('canvas'); big.width = 600; big.height = 600
        big.getContext('2d').drawImage(img, 0, 0, 600, 600)
        data = big.toDataURL('image/jpeg', 0.92)
      } catch (_) {}
      res({ pal, data })
    }
    img.onerror = () => res({ pal: DEFAULT_PAL, data: null })
    img.src = src
  })
}

function buildBg(mode, slots, meta) {
  const pal = (s) => (s && meta[s.id] && meta[s.id].pal) || null
  if (mode === 'one') {
    const p = pal(slots[0]) || DEFAULT_PAL
    return `radial-gradient(125% 88% at 50% 30%, ${p.glow} 0%, ${p.mid} 46%, ${p.base} 82%)`
  }
  const pos = [['24%', '24%'], ['76%', '24%'], ['24%', '70%'], ['76%', '70%']]
  const layers = slots.map((s, i) => {
    const p = pal(s) || DEFAULT_PAL
    return `radial-gradient(58% 44% at ${pos[i][0]} ${pos[i][1]}, ${p.glow} 0%, transparent 70%)`
  })
  const ps = slots.map((s) => pal(s)).filter(Boolean)
  let h = DEFAULT_PAL.h, s = 0.4
  if (ps.length) { h = ps.reduce((a, p) => a + p.h, 0) / ps.length; s = ps.reduce((a, p) => a + p.s, 0) / ps.length }
  const base = `hsl(${Math.round(h * 360)} ${Math.round(Math.max(16, Math.min(42, s * 60)))}% 6%)`
  return layers.join(', ') + ', ' + base
}

function coverFill(url) {
  return url
    ? { position: 'absolute', inset: 0, backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { display: 'none' }
}

function segStyle(active) {
  return {
    flex: 1, border: 0, borderRadius: '8px', padding: '10px 6px',
    fontFamily: "'Pretendard',sans-serif", fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    transition: 'background .2s, color .2s',
    background: active ? 'linear-gradient(135deg,#6d4dff,#a35cff)' : 'transparent',
    color: active ? '#fff' : '#9a9aa6',
  }
}

// ─── component ──────────────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('one')  // 'one' | 'four'
  const [slots, setSlots] = useState([null])
  const [meta, setMeta] = useState({})  // albumId -> { pal, data }
  const [header, setHeader] = useState('')
  const [scale, setScale] = useState(0.42)
  const [saving, setSaving] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [mTitle, setMTitle] = useState('')
  const [mArtist, setMArtist] = useState('')
  const [mCover, setMCover] = useState('')  // data URL

  const stageRef = useRef(null)
  const storyRef = useRef(null)

  // fit scale to stage size
  const fit = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const s = Math.min((r.width - 80) / 1080, (r.height - 80) / 1920)
    if (s > 0) setScale((prev) => Math.abs(s - prev) > 0.002 ? s : prev)
  }, [])

  useEffect(() => {
    window.addEventListener('resize', fit)
    requestAnimationFrame(fit)
    const t1 = setTimeout(fit, 80)
    const t2 = setTimeout(fit, 400)
    return () => { window.removeEventListener('resize', fit); clearTimeout(t1); clearTimeout(t2) }
  }, [fit])

  // mode switch
  function switchMode(m) {
    const n = m === 'four' ? 4 : 1
    setMode(m)
    setSlots((prev) => {
      const filled = prev.filter(Boolean)
      return Array.from({ length: n }, (_, i) => filled[i] || null)
    })
  }

  // debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(''); return }
    setSearching(true); setError('')
    const t = setTimeout(() => {
      searchAlbums(query)
        .then((r) => { setResults(r); setSearching(false) })
        .catch(() => { setResults([]); setSearching(false); setError('검색에 실패했어요. 다시 시도해 주세요.') })
    }, 420)
    return () => clearTimeout(t)
  }, [query])

  function ensureMeta(album) {
    if (!album || meta[album.id]) return
    extractMeta(album.cover).then((m) => setMeta((prev) => ({ ...prev, [album.id]: m })))
  }

  function addAlbum(album) {
    setSlots((prev) => {
      const s = [...prev]
      const idx = s.findIndex((x) => !x)
      if (idx === -1) s[s.length - 1] = album; else s[idx] = album
      return s
    })
    ensureMeta(album)
  }

  function onManualFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setMCover(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  function addManual() {
    if (!mTitle.trim() && !mCover) return
    const album = {
      id: `manual-${Date.now()}`,
      title: mTitle.trim() || '제목 없음',
      artist: mArtist.trim() || '',
      cover: mCover || '',
    }
    addAlbum(album)
    setMTitle(''); setMArtist(''); setMCover(''); setShowManual(false)
  }

  function removeSlot(i) {
    setSlots((prev) => { const s = [...prev]; s[i] = null; return s })
  }

  async function download() {
    if (saving) return
    const node = storyRef.current
    if (!node) return
    setSaving(true)
    try {
      const url = await htmlToImage.toPng(node, {
        width: 1080, height: 1920, pixelRatio: 2, cacheBust: true,
        style: { transform: 'none', transformOrigin: 'top left' },
      })
      const a = document.createElement('a'); a.href = url; a.download = `album-card-${Date.now()}.png`; a.click()
    } catch (_) {
      alert('이미지 저장에 실패했어요. 외부 커버 이미지의 보안 정책 때문일 수 있어요.')
    } finally {
      setSaving(false)
    }
  }

  // derived
  const isOne = mode === 'one'
  const isFour = mode === 'four'
  const bgCss = buildBg(mode, slots, meta)
  const radius = 30
  const displayFont = "'Hanken Grotesk','Pretendard',sans-serif"
  const filledCount = slots.filter(Boolean).length

  const slotsView = slots.map((a, i) => {
    const filled = !!a
    const m = a && meta[a.id]
    const cover = filled ? ((m && m.data) || a.cover) : ''
    return {
      filled, empty: !filled, cover,
      coverStyle: coverFill(cover),
      thumbStyle: coverFill(cover),
      listTitle: filled ? a.title : '비어 있음',
      gridTitle: filled ? a.title : `앨범 ${i + 1}`,
      artist: filled ? a.artist : '',
      artistLine: filled ? a.artist : '검색으로 추가',
      accent: (m && m.pal && m.pal.accent) || DEFAULT_PAL.accent,
      remove: () => removeSlot(i),
    }
  })

  const a0 = slots[0]; const m0 = a0 && meta[a0.id]
  const hero = {
    empty: !a0,
    coverStyle: coverFill(a0 ? ((m0 && m0.data) || a0.cover) : ''),
    title: a0 ? a0.title : 'ESSENCE',
    artistLine: a0 ? a0.artist : 'GLOWCEAN',
  }

  const frameW = Math.round(1080 * scale)
  const frameH = Math.round(1920 * scale)

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#050507', fontFamily: "'Pretendard',-apple-system,system-ui,sans-serif", color: '#e8e8ee' }}>

      {/* ── sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{ width: 372, flexShrink: 0, height: '100vh', overflowY: 'auto', background: '#0c0c10', borderRight: '1px solid rgba(255,255,255,.07)', padding: 26, display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div>
          <div style={{ fontFamily: "'Archivo',sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: '-.3px' }}>Album Card</div>
          <div style={{ fontSize: 12.5, color: '#85858f', marginTop: 5, lineHeight: 1.5 }}>커버에서 색을 뽑아 만드는<br />9:16 앨범 스토리 카드</div>
        </div>

        {/* mode toggle */}
        <div style={{ display: 'flex', gap: 5, background: '#15151b', borderRadius: 12, padding: 5 }}>
          <button onClick={() => switchMode('one')} style={segStyle(isOne)}>앨범 1개</button>
          <button onClick={() => switchMode('four')} style={segStyle(isFour)}>앨범 4개 · 2×2</button>
        </div>

        {/* search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="앨범 · 아티스트 검색 (예: NewJeans)"
            style={{ width: '100%', background: '#16161c', border: '1px solid rgba(255,255,255,.09)', borderRadius: 11, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: "'Pretendard'", outline: 'none' }}
          />
          {searching && <div style={{ fontSize: 12, color: '#85858f' }}>검색 중…</div>}
          {error && <div style={{ fontSize: 12, color: '#ff7a8a' }}>{error}</div>}

          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', padding: 2 }}>
              {results.map((r) => (
                <button key={r.id} onClick={() => addAlbum(r)} title="클릭해서 추가"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#16161c', border: '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: 7, cursor: 'pointer', textAlign: 'left', color: '#e8e8ee', transition: 'background .15s, border-color .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1d1d25'; e.currentTarget.style.borderColor = 'rgba(163,92,255,.4)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#16161c'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)' }}>
                  <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 6, background: '#1c1c22', backgroundImage: `url("${r.cover}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                    <span style={{ fontSize: 11, color: '#85858f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.artist}</span>
                  </div>
                  <span style={{ flexShrink: 0, color: '#a35cff', fontSize: 18, fontWeight: 600, paddingRight: 4 }}>+</span>
                </button>
              ))}
            </div>
          )}

          {/* manual add */}
          <button onClick={() => setShowManual((v) => !v)}
            style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: 0, color: '#a35cff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Pretendard'" }}>
            {showManual ? '× 직접 추가 닫기' : '+ 검색에 없어요? 직접 추가'}
          </button>

          {showManual && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#121218', border: '1px solid rgba(255,255,255,.08)', borderRadius: 11, padding: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ position: 'relative', width: 60, height: 60, flexShrink: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#1c1c22', backgroundImage: mCover ? `url("${mCover}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,.18)' }}>
                  {!mCover && <span style={{ color: '#85858f', fontSize: 22 }}>＋</span>}
                  <input type="file" accept="image/*" onChange={onManualFile} style={{ display: 'none' }} />
                </label>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#85858f', lineHeight: 1.5 }}>
                  커버 이미지를<br />클릭해서 업로드
                </div>
              </div>
              <input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="앨범 제목"
                style={{ width: '100%', background: '#16161c', border: '1px solid rgba(255,255,255,.09)', borderRadius: 9, padding: '10px 12px', color: '#fff', fontSize: 13, fontFamily: "'Pretendard'", outline: 'none' }} />
              <input value={mArtist} onChange={(e) => setMArtist(e.target.value)} placeholder="아티스트"
                style={{ width: '100%', background: '#16161c', border: '1px solid rgba(255,255,255,.09)', borderRadius: 9, padding: '10px 12px', color: '#fff', fontSize: 13, fontFamily: "'Pretendard'", outline: 'none' }} />
              <button onClick={addManual} disabled={!mTitle.trim() && !mCover}
                style={{ border: 0, borderRadius: 9, padding: 11, fontSize: 13, fontWeight: 600, fontFamily: "'Pretendard'", cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#6d4dff,#a35cff)', opacity: (!mTitle.trim() && !mCover) ? 0.45 : 1 }}>
                추가하기
              </button>
            </div>
          )}
        </div>

        {/* 4-album header input */}
        {isFour && (
          <input
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            placeholder="상단 제목 (선택)"
            style={{ width: '100%', background: '#16161c', border: '1px solid rgba(255,255,255,.09)', borderRadius: 11, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: "'Pretendard'", outline: 'none' }}
          />
        )}

        {/* slot list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#85858f', fontWeight: 500 }}>선택된 앨범 · {filledCount}/{slots.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slotsView.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#16161c', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: 8 }}>
                <div style={{ position: 'relative', width: 38, height: 38, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: 'linear-gradient(150deg,#4a2f8f,#241842)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', fontSize: 15 }}>
                  <div style={s.thumbStyle} />
                  {s.empty && <span>♪</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.listTitle}</span>
                  <span style={{ fontSize: 11, color: '#85858f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.artist}</span>
                </div>
                {s.filled && (
                  <button onClick={s.remove} title="제거" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#85858f', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button onClick={download} disabled={saving}
          style={{ marginTop: 'auto', border: 0, borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 600, fontFamily: "'Pretendard'", cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#6d4dff,#a35cff)', opacity: saving ? 0.6 : 1 }}>
          {saving ? '저장 중…' : 'PNG로 저장 (1080×1920)'}
        </button>
      </aside>

      {/* ── stage ───────────────────────────────────────────────────────── */}
      <main ref={stageRef} style={{ flex: 1, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, overflow: 'hidden', background: 'radial-gradient(circle at 50% 38%, #17171c, #050507 72%)' }}>
        <div style={{ width: frameW, height: frameH, borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,.6)', flexShrink: 0 }}>
          <div ref={storyRef} style={{ position: 'relative', width: 1080, height: 1920, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#0a0a0e', overflow: 'hidden' }}>

            {/* dynamic bg */}
            <div style={{ position: 'absolute', inset: 0, background: bgCss }} />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 55% at 50% 6%, rgba(255,255,255,.05), transparent 42%)' }} />

            {/* ── one-album layout ── */}
            {isOne && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 132px' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: radius, overflow: 'hidden', boxShadow: '0 50px 120px rgba(0,0,0,.55)', background: 'linear-gradient(150deg,#5a3aa8,#241842)' }}>
                  <div style={hero.coverStyle} />
                  {hero.empty && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, color: 'rgba(255,255,255,.6)' }}>
                      <div style={{ fontSize: 128, lineHeight: 1 }}>♪</div>
                      <div style={{ fontFamily: "'Archivo',sans-serif", fontSize: 26, letterSpacing: '.5px' }}>검색해서 커버 추가</div>
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 88, lineHeight: 1.02, letterSpacing: '-1.5px', color: '#fff', marginTop: 62, textTransform: 'uppercase', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{hero.title}</div>
                <div style={{ fontFamily: "'Pretendard',sans-serif", fontWeight: 300, fontSize: 36, color: 'rgba(255,255,255,.74)', marginTop: 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hero.artistLine}</div>
              </div>
            )}

            {/* ── four-album layout ── */}
            {isFour && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '96px 90px' }}>
                {header.trim() && (
                  <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 50, color: '#fff', marginBottom: 42, letterSpacing: '-1px' }}>{header}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 54 }}>
                  {slotsView.map((s, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: radius, overflow: 'hidden', boxShadow: '0 26px 60px rgba(0,0,0,.5)', background: 'linear-gradient(150deg,#5a3aa8,#241842)' }}>
                        <div style={s.coverStyle} />
                        {s.empty && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: 'rgba(255,255,255,.5)' }}>♪</div>}
                      </div>
                      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 32, letterSpacing: '-.3px', lineHeight: 1.16, color: '#fff', marginTop: 22, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word', textTransform: 'uppercase' }}>{s.gridTitle}</div>
                      <div style={{ fontFamily: "'Pretendard',sans-serif", fontWeight: 300, fontSize: 24, color: 'rgba(255,255,255,.62)', marginTop: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.artistLine}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
