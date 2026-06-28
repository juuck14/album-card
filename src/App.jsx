import React, { useEffect, useMemo, useRef, useState } from 'react'
import { renderToCanvas, STORY_W, STORY_H, THEMES } from './render.js'
import { searchAlbums } from './itunes.js'

let uid = 0
const newId = () => `c${Date.now()}_${uid++}`

const THEME_KEYS = Object.keys(THEMES)
const THEME_LABEL = { dark: '다크', light: '라이트', graphite: '그래파이트', cream: '크림' }

export default function App() {
  const [cards, setCards] = useState([])
  const [cols, setCols] = useState(2)
  const [theme, setTheme] = useState('dark')
  const [header, setHeader] = useState('')

  // manual form
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [cover, setCover] = useState('') // data URL
  const fileRef = useRef(null)

  // search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')

  const previewRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  const opts = useMemo(() => ({ cols, theme, header: header.trim() }), [cols, theme, header])

  // re-render preview whenever state changes
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    let cancelled = false
    document.fonts.ready.then(() => {
      if (!cancelled) renderToCanvas(canvas, cards, opts, 1)
    })
    return () => {
      cancelled = true
    }
  }, [cards, opts])

  // debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearchErr('')
      return
    }
    setSearching(true)
    setSearchErr('')
    const t = setTimeout(async () => {
      try {
        const r = await searchAlbums(query)
        setResults(r)
      } catch (e) {
        setSearchErr('검색에 실패했어요. 잠시 후 다시 시도해 주세요.')
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [query])

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCover(reader.result)
    reader.readAsDataURL(file)
  }

  function addCard() {
    if (!title.trim() && !cover) return
    setCards((cs) => [...cs, { id: newId(), title: title.trim(), artist: artist.trim(), cover }])
    setTitle('')
    setArtist('')
    setCover('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function addFromResult(r) {
    setCards((cs) => [...cs, { id: newId(), title: r.title, artist: r.artist, cover: r.cover }])
  }

  function removeCard(id) {
    setCards((cs) => cs.filter((c) => c.id !== id))
  }

  function move(id, dir) {
    setCards((cs) => {
      const i = cs.findIndex((c) => c.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= cs.length) return cs
      const copy = [...cs]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  async function download() {
    setExporting(true)
    try {
      await document.fonts.ready
      const off = document.createElement('canvas')
      await renderToCanvas(off, cards, opts, 2) // 2160 x 3840, high-res
      const url = off.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `album-story-${Date.now()}.png`
      a.click()
    } catch (e) {
      alert('이미지 저장에 실패했어요. (외부 이미지의 보안 정책 문제일 수 있어요)')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <h1>Album Story</h1>
          <p>인스타 스토리용 앨범 카드 생성기</p>
        </header>

        {/* search */}
        <section className="block">
          <label className="block-label">검색으로 추가</label>
          <input
            className="input"
            placeholder="앨범 · 아티스트 검색 (예: NewJeans)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <div className="hint">검색 중…</div>}
          {searchErr && <div className="hint error">{searchErr}</div>}
          {results.length > 0 && (
            <div className="results">
              {results.map((r) => (
                <button key={r.id} className="result" onClick={() => addFromResult(r)} title="클릭해서 추가">
                  <img src={r.cover} alt="" loading="lazy" />
                  <span className="result-title">{r.title}</span>
                  <span className="result-artist">{r.artist}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="divider"><span>또는 직접 입력</span></div>

        {/* manual form */}
        <section className="block">
          <div className="uploader" onClick={() => fileRef.current?.click()}>
            {cover ? <img src={cover} alt="cover" /> : <span>＋ 앨범 커버 업로드</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <input
            className="input"
            placeholder="곡 / 앨범 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input"
            placeholder="아티스트명"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
          />
          <button className="btn primary" onClick={addCard} disabled={!title.trim() && !cover}>
            카드 추가
          </button>
        </section>

        {/* layout controls */}
        <section className="block">
          <label className="block-label">레이아웃</label>
          <div className="seg">
            {[1, 2, 3].map((n) => (
              <button key={n} className={cols === n ? 'on' : ''} onClick={() => setCols(n)}>
                {n === 1 ? '리스트' : `${n}열`}
              </button>
            ))}
          </div>

          <label className="block-label" style={{ marginTop: 14 }}>테마</label>
          <div className="seg">
            {THEME_KEYS.map((k) => (
              <button key={k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>
                {THEME_LABEL[k]}
              </button>
            ))}
          </div>

          <input
            className="input"
            style={{ marginTop: 14 }}
            placeholder="상단 제목 (선택)"
            value={header}
            onChange={(e) => setHeader(e.target.value)}
          />
        </section>

        {/* card list */}
        {cards.length > 0 && (
          <section className="block">
            <label className="block-label">추가된 카드 ({cards.length})</label>
            <ul className="card-list">
              {cards.map((c, i) => (
                <li key={c.id}>
                  <div className="thumb">{c.cover ? <img src={c.cover} alt="" /> : <span>♪</span>}</div>
                  <div className="meta">
                    <strong>{c.title || '제목 없음'}</strong>
                    <span>{c.artist}</span>
                  </div>
                  <div className="row-actions">
                    <button onClick={() => move(c.id, -1)} disabled={i === 0}>↑</button>
                    <button onClick={() => move(c.id, 1)} disabled={i === cards.length - 1}>↓</button>
                    <button className="del" onClick={() => removeCard(c.id)}>✕</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button className="btn download" onClick={download} disabled={cards.length === 0 || exporting}>
          {exporting ? '저장 중…' : '⤓ 인스타 스토리 이미지 다운로드 (1080×1920)'}
        </button>
      </aside>

      {/* preview */}
      <main className="stage">
        <div className="story-frame">
          <canvas
            ref={previewRef}
            width={STORY_W}
            height={STORY_H}
            className="story-canvas"
          />
          {cards.length === 0 && (
            <div className="empty">
              <p>왼쪽에서 앨범을 추가하면<br />여기 9:16 스토리에 미리보기가 떠요</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
