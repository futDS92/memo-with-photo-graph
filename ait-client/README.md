# AIT Client

React + TypeScript 기반 App in Toss 전환용 클라이언트 스캐폴드입니다.

## 실행

```bash
cd /Users/kipyo/memo-with-photo-graph/ait-client
npm install
npm run dev
```

기본적으로 `/api/state`를 `http://127.0.0.1:4180`으로 프록시합니다.
환경에 따라 `VITE_API_ORIGIN` 또는 `VITE_API_STATE_URL`로 바꿀 수 있습니다.

## 현재 상태

- 단어장, 맵, 관계, 상세 시트, 추가 폼 포함
- 로컬 저장과 서버 동기화를 같이 사용
- Toss 런타임 버전 탐지는 안전한 wrapper로 분리
- 실제 TDS Mobile 연결은 이후 SDK 확정 후 붙입니다
- `npm run build`로 생산용 번들을 만들 수 있습니다
