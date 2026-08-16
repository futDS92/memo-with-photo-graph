# photo graph

사진과 단어를 연결하고, 관계를 따라 탐색하며, 매일 복습하는 모바일 단어 앱입니다.

## 실행

```bash
npm install --prefix ait-client
npm run dev
```

API 저장소가 필요하면 별도 터미널에서 실행합니다.

```bash
npm run start:api
```

## 제품 흐름

- 홈: 새 단어 기록, 최근 단어, 오늘의 복습
- 단어장: 검색·태그 필터·상세 편집
- 지도: 단어 사이의 관계를 시각적으로 탐색
- 복습: 사진을 단서로 뜻을 떠올리고 기억 여부를 기록
- 저장: IndexedDB 우선 저장, localStorage 백업, API 동기화
- 사진: 업로드 시 자동 리사이즈·압축

## 구조

프런트엔드는 `ait-client/` 하나만 사용합니다. React + TypeScript + Vite로 빌드하며 GitHub Pages 배포도 이 디렉터리를 기준으로 합니다.

- `ait-client/src/App.tsx`: 제품 화면과 사용자 흐름
- `ait-client/src/lib/storage.ts`: 로컬 저장 및 API 동기화
- `ait-client/src/data/seed.ts`: 첫 실행 샘플 데이터
- `server.mjs`: 개발용 상태 API
- `backend/`: 이후 운영 API로 교체할 수 있는 Kotlin 서버

## 빌드

```bash
npm run build
npm run preview
```
