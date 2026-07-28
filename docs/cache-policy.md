# 프론트/Worker/D1 캐시 정책

이 문서는 OTW Schedule의 캐시 계층별 역할과 TTL 기준을 정리한다.
Worker TTL의 단일 기준은 `worker/platform/cache-policy.ts`의
`WORKER_CACHE_POLICY`이다. 브라우저 server-state TTL은
`src/shared/query/query-client.ts`가 관리한다.

## 계층별 역할

| 계층 | 위치 | 목적 | 보장하지 않는 것 |
| --- | --- | --- | --- |
| TanStack Query cache | `src/features/*/queries`, `src/shared/query` | 같은 브라우저 세션에서 화면 전환/재렌더링 시 server state를 재사용하고 stale 시 재조회한다. | Worker 재시작 대응, API 쿼터 보호, 여러 사용자 간 공유 |
| Worker memory cache | `worker/features/*/infrastructure` | 동일 Worker isolate 안에서 외부 API 호출과 D1 조회를 줄인다. | isolate 재시작 후 유지, 전체 트래픽 기준 일관성 |
| Worker/D1 persistent cache | `x_api_cache`, `youtube_api_cache` | Worker 재시작 후에도 fresh/stale 데이터를 유지하고 외부 API 실패 시 fallback을 제공한다. | 클라이언트 즉시 반응성, 브라우저별 상태 |
| HTTP response cache | `Cache-Control` 헤더 | public 응답의 CDN/browser 재사용을 제어한다. 관리자/회원/개인화 응답은 `no-store`를 사용한다. | 앱 내부 stale-while-revalidate 동작 |

## 현재 TTL

### 브라우저 query cache

| 대상 | fresh TTL | stale 사용 가능 기간 | 동작 |
| --- | ---: | ---: | --- |
| YouTube videos | 5분 | 10분(gc) | fresh면 Query cache를 사용하고 stale 시 재조회 |
| X posts | 30분 | 10분(gc) | fresh면 Query cache를 사용하고 수동 갱신은 mutation 결과로 같은 cache를 교체 |

### Worker/D1 cache

| 대상 | 저장 위치 | fresh TTL | stale 사용 가능 기간 | 용도 |
| --- | --- | ---: | ---: | --- |
| YouTube uploads playlist ID | memory + D1 | 24시간 | 7일 | 채널별 uploads playlist ID 조회 비용 절감 |
| YouTube channel videos | memory + D1 | 5분 | 6시간 | `/api/youtube/videos` 외부 API 호출 절감 및 장애 fallback |
| X user lookup | memory + D1 | 30일 | 90일 | handle -> user id 조회 비용 절감 |
| X user not found | memory + D1 | 24시간 | 90일 | 존재하지 않는 handle 반복 조회 방지 |
| X posts | memory + D1 | 60분 | 24시간 | 타임라인 조회 비용 절감 및 장애 fallback |
| X linked post lookup | D1 | 7일 | 없음 | 링크된 트윗 상세 조회 비용 절감 |
| Naver Cafe posts | memory | 10분 | 6시간 | 게시판 fetch 실패 시 stale fallback 제공 |

## 변경 원칙

1. Worker TTL은 `worker/platform/cache-policy.ts`, query TTL은
   `src/shared/query/query-client.ts`에서 먼저 바꾼다.
2. 클라이언트 TTL은 UX 지연을 줄이는 값이고, 외부 API 비용/쿼터 보호는 Worker/D1 TTL이 담당한다.
3. Worker/D1 stale TTL은 장애 fallback 기간이므로 fresh TTL보다 길게 둔다.
4. 관리자 모니터링, 설정, 수동 실행, 회원/권한별 응답은 기본적으로 `Cache-Control: no-store`를 유지한다.
5. X `forceRefresh` 경로는 클라이언트/HTTP 캐시를 우회할 수 있으므로 운영 대시보드의 비용/쿼터 모니터링과 함께 확인한다.
