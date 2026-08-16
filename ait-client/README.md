# photo graph client

사진 기반 단어 기록, 관계 지도, 일일 복습을 제공하는 React 모바일 앱입니다.

## 실행

```bash
npm install
npm run dev
```

개발 API는 `/api/state`로 연결되며 기본 대상은 `http://127.0.0.1:4180`입니다.

## 주요 기능

- 사진·뜻·예문·메모를 함께 기록
- 태그와 전문 검색으로 단어 탐색
- 관계를 연결하고 그래프로 이동
- 일일 복습 카드와 진행률
- IndexedDB 우선 저장 및 localStorage 백업
- 사진 자동 리사이즈·압축과 API 동기화
- JSON 데이터 가져오기·내보내기
- 단어별 복습 레벨과 다음 복습일

## 명령어

```bash
npm run build
npm run preview
```
