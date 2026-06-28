# Album Story

YouTube Music 스타일의 미니멀한 **앨범 카드 → 인스타 스토리 이미지** 생성기.
여러 앨범을 9:16 캔버스에 모아 고화질 PNG로 저장합니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
```

빌드: `npm run build` → `dist/`

## 사용법

1. **검색으로 추가** — 앨범/아티스트를 검색해 결과를 클릭 (iTunes API, 키 불필요)
2. **직접 입력** — 커버 업로드 + 제목 + 아티스트 → `카드 추가`
3. **레이아웃** — 리스트 / 2열 / 3열, 테마 4종, 상단 제목(선택)
4. **다운로드** — 9:16 캔버스를 2160×3840 고화질 PNG로 저장

## 기술

- Vite + React 18
- 네이티브 Canvas 렌더링 — 미리보기와 다운로드가 같은 `drawScene()`를 써서 보이는 그대로 저장 (html2canvas 미사용)

| 파일 | 역할 |
|---|---|
| `src/App.jsx` | UI · 상태 |
| `src/render.js` | 레이아웃 · 캔버스 렌더링 |
| `src/itunes.js` | 앨범 검색 (JSONP) |
