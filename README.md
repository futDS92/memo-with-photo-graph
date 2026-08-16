# memo with photo graph

사진을 붙이고, 단어 관계를 맵처럼 탐색하는 모바일 단어장 앱입니다.

이 저장소는 현재 `HTML/CSS/JS` 기반 프로토타입과 Kotlin 백엔드 스캐폴드를 함께 담고 있습니다.
App in Toss용 최종 구조는 별도의 AIT 클라이언트로 옮기는 것이 맞습니다.

## 포함 기능

- 단어 추가
- 사진 첨부
- 뜻, 예문, 메모, 태그 저장
- 단어 편집과 사진 교체
- 상위/하위/관련 관계 연결
- 단어 맵 렌더링
- 검색 및 필터
- 로컬 캐시
- 서버 JSON 저장
- JSON 내보내기

## 로컬 실행

로컬에서는 현재 Node dev 서버로 바로 열 수 있고, 운영용 백엔드는 `backend/`의 Ktor 프로젝트로 분리하는 구성이 기본입니다.

```bash
cd /Users/kipyo/memo-with-photo-graph
npm start
```

AIT 클라이언트 스캐폴드는 `ait-client/`에 있습니다.

```bash
cd /Users/kipyo/memo-with-photo-graph/ait-client
npm install
npm run dev
```

## 아키텍처

### 현재 구현

- 모바일 웹 클라이언트는 `HTML/CSS/JS` 단일 페이지 프로토타입
- Node 서버는 로컬 개발용 정적 서버와 JSON API
- AIT 클라이언트는 `ait-client/` 아래의 React + TypeScript 스캐폴드
- Kotlin 백엔드는 `/api/state` 계약을 기준으로 한 별도 서비스
- `localStorage`와 `data:` URL은 로컬 프로토타입 저장 방식
- 관계는 단방향 데이터로 저장하고, UI에서 방향을 해석
- 맵은 중심 단어를 기준으로 원형 레이아웃과 SVG 연결선으로 렌더링

### App in Toss 목표 구조

- 클라이언트: AIT 앱
- UI: React + TypeScript + TDS Mobile
- 상태: IndexedDB + optimistic update
- 동기화: 별도 API
- 백엔드: Kotlin + Ktor
- DB: PostgreSQL
- 사진 저장: S3 계열 오브젝트 스토리지

### 다음 단계 확장

- `IndexedDB`로 사진과 대용량 데이터를 분리 저장
- `PostgreSQL` + `sync log` 로 서버 동기화
- `S3` 또는 호환 스토리지로 원본 사진 보관
- `Meilisearch` 또는 PostgreSQL FTS로 검색 강화
- 그래프 레이아웃 계산을 Web Worker로 분리
- Toss 앱용 AIT 프런트엔드로 전환
- Kotlin 서버에 인증, 업로드, 동기화 충돌 해결 추가

### 현실적인 진행 순서

1. 현재 프로토타입을 기준으로 데이터 모델과 화면 흐름을 고정한다.
2. AIT 클라이언트를 새로 만든 뒤 현재 화면을 옮긴다.
3. Kotlin API를 붙여 저장, 동기화, 업로드를 분리한다.
4. 검색, 충돌 해결, 사진 처리, 추천 기능을 단계적으로 추가한다.

## 데이터 모델

```ts
type Word = {
  id: string;
  term: string;
  pos?: string;
  definition: string;
  example?: string;
  memo?: string;
  tags: string[];
  photo?: string;
};

type Relation = {
  id: string;
  fromWordId: string;
  toWordId: string;
  type:
    | "hypernym"
    | "hyponym"
    | "part_of"
    | "has_part"
    | "synonym"
    | "antonym"
    | "related"
    | "example";
  label?: string;
};
```

## 설계 메모

- 중심 기능은 "단어 상세"가 아니라 "단어 간 맵"입니다.
- 사진은 장식이 아니라 기억 단서로 취급합니다.
- 관계는 늘릴 수 있지만, 화면에는 한 번에 너무 많이 드러내지 않습니다.
- 모바일에서는 목록보다 그래프가 먼저 보이되, 편집은 아래 시트에서 처리합니다.
