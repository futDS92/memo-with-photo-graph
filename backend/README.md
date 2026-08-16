# Backend

Kotlin + Ktor 기반 API 백엔드 스캐폴드입니다.

## 역할

- 앱 상태 저장
- 단어/관계 JSON 제공
- 추후 PostgreSQL 전환
- 이미지 업로드와 검색 분리

## 현재 상태

- 기본은 파일 기반 저장소, `STATE_STORAGE=memory`면 메모리 저장소
- `/api/state`, `/api/health` 제공
- App in Toss 클라이언트와 같은 JSON 계약 사용
- `updatedAt`은 서버가 저장 시점에 채움
- 관계 타입은 `hypernym`, `hyponym` 같은 소문자 문자열로 직렬화
- CORS 허용과 원자적 파일 저장을 넣어 로컬 동기화가 끊기지 않게 했습니다.

## 환경 변수

- `PORT`
- `HOST`
- `STATE_STORAGE`
- `STATE_FILE`

## 다음 단계

- PostgreSQL 저장소 구현
- 사진 업로드용 S3 presigned URL
- 인증/세션 연결
- 동기화 충돌 처리
