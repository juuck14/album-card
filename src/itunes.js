// iTunes Search API via JSONP — no API key, no CORS proxy needed.
// Returns album results with high-res artwork, like topster's search.

let counter = 0

export function searchAlbums(term, limit = 18) {
  return new Promise((resolve, reject) => {
    if (!term || !term.trim()) {
      resolve([])
      return
    }
    const cb = `__itunes_cb_${counter++}`
    const script = document.createElement('script')
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('검색 시간 초과'))
    }, 10000)

    function cleanup() {
      clearTimeout(timeout)
      delete window[cb]
      script.remove()
    }

    window[cb] = (data) => {
      cleanup()
      const items = (data.results || []).map((r) => ({
        id: r.collectionId,
        title: r.collectionName,
        artist: r.artistName,
        // upgrade 100x100 thumbnail to 600x600 for crisp covers
        cover: (r.artworkUrl100 || '').replace('100x100bb', '600x600bb')
      }))
      resolve(items)
    }

    const params = new URLSearchParams({
      term,
      media: 'music',
      entity: 'album',
      limit: String(limit),
      callback: cb
    })
    script.src = `https://itunes.apple.com/search?${params.toString()}`
    script.onerror = () => {
      cleanup()
      reject(new Error('검색 실패'))
    }
    document.body.appendChild(script)
  })
}
