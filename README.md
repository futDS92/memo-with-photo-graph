# memo with photo graph

사진을 붙이고, 단어 관계를 맵처럼 탐색하는 모바일 단어장 앱입니다.

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

Node 서버를 실행하면 됩니다.

```bash
cd /Users/kipyo/vocab-map
npm start
```

## 아키텍처

### 현재 구현

- `HTML/CSS/JS` 단일 페이지
- Node 서버가 정적 파일과 `/api/state` JSON API를 제공
- `localStorage`는 캐시, 서버 JSON 파일이 주 저장소
- 사진은 `FileReader`로 `data:` URL로 저장
- 관계는 단방향 데이터로 저장하고, UI에서 방향을 해석
- 맵은 중심 단어를 기준으로 원형 레이아웃과 SVG 연결선으로 렌더링

### 다음 단계 확장

- `IndexedDB`로 사진과 대용량 데이터를 분리 저장
- `PostgreSQL` + `sync log` 로 서버 동기화
- `S3` 또는 호환 스토리지로 원본 사진 보관
- `Meilisearch` 또는 PostgreSQL FTS로 검색 강화
- 그래프 레이아웃 계산을 Web Worker로 분리

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

