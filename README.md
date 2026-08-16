# photo graph

시험 개념을 카드로 만들고, 플래시카드처럼 반복 학습하는 모바일 공부 앱입니다.

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

- 홈: 오늘 복습할 카드, 오답 카드, 과목별 진행률
- 카드 모음: 과목·챕터별 검색과 카드 관리
- 학습: 질문을 보고 답을 떠올린 뒤 정답·난이도 기록
- 오답 노트: 익숙하지 않은 카드만 반복 학습
- 저장: IndexedDB 우선 저장, localStorage 백업, API 동기화
- 사진: 업로드 시 자동 리사이즈·압축

## 구조

프런트엔드는 `ait-client/` 하나만 사용합니다. React + TypeScript + Vite로 빌드하며 GitHub Pages 배포도 이 디렉터리를 기준으로 합니다.

- `ait-client/src/App.tsx`: 카드 학습 화면과 사용자 흐름
- `ait-client/src/lib/storage.ts`: 로컬 저장 및 API 동기화
- `ait-client/src/data/seed.ts`: 첫 실행 샘플 데이터
- `server.mjs`: 개발용 상태 API
- `backend/`: 이후 운영 API로 교체할 수 있는 Kotlin 서버

## 빌드

```bash
npm run build
npm run preview
```
