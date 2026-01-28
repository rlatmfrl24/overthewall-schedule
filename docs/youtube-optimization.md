# YouTube API 최적화 및 캐싱 전략

## 개요
YouTube Data API v3의 쿼터 제한(기본 10,000 units/일)을 고려한 최적화 및 캐싱 전략을 적용했습니다.

## Worker API 최적화 (worker/index.ts)

### 1. uploads 플레이리스트 ID 캐싱
- **TTL**: 24시간
- **이유**: 채널의 uploads 플레이리스트 ID는 거의 변하지 않음
- **효과**: API 호출 1회 절약 (채널당 1 unit)

```typescript
const YOUTUBE_PLAYLIST_ID_CACHE = new Map();
const YOUTUBE_PLAYLIST_ID_TTL_MS = 24 * 60 * 60_000;
```

### 2. 채널 동영상 캐싱
- **TTL**: 5분
- **이유**: 동영상 업로드는 자주 발생하지 않음
- **효과**: 중복 요청 방지

```typescript
const YOUTUBE_VIDEOS_CACHE = new Map();
const YOUTUBE_VIDEOS_TTL_MS = 5 * 60_000;
```

### 3. 병렬 처리
- 여러 채널 조회 시 `Promise.all`로 병렬 처리
- 여러 배치의 동영상 조회 시 병렬 처리 (최대 50개씩)

### 4. 에러 핸들링 및 재시도
- **쿼터 초과 (403) 또는 Rate Limit (429)**: 이전 캐시 재사용
- **Rate Limit**: 최대 2회 재시도 (Retry-After 헤더 준수)
- **네트워크 에러**: 이전 캐시 재사용

### 5. 배치 최적화
- 동영상 상세 조회 시 최대 50개씩 배치 처리
- YouTube API 제한(50개/요청)에 맞춘 최적화

## 프론트엔드 API 최적화 (src/lib/api/youtube.ts)

### 1. Stale-While-Revalidate 패턴
- **Fresh TTL**: 5분
- **Stale TTL**: 30분
- **동작**:
  1. 신선한 캐시(5분 이내) → 즉시 반환
  2. stale 캐시(5-30분) → 캐시 먼저 반환 + 백그라운드 갱신
  3. 없거나 만료(30분 이상) → 동기 fetch

```typescript
// 백그라운드 갱신 예시
if (cached && !isCacheFresh(cached.fetchedAt)) {
  void fetchAndCacheYouTubeVideos(...).catch(() => {});
  return cached.content; // stale 데이터 먼저 반환
}
```

### 2. 에러 시 Fallback
- API 에러 발생 시 이전 캐시 재사용
- stale 캐시라도 에러보다 나음

## React Hook 최적화 (src/hooks/use-youtube-videos.ts)

### 1. 불필요한 재조회 방지
- `members` 배열 참조 변경에 영향받지 않도록 `channelIdsKey` 사용
- 채널 ID 문자열로 의존성 관리

```typescript
const channelIdsKey = useMemo(
  () => membersWithYouTube
    .map(m => m.youtube_channel_id)
    .sort()
    .join(','),
  [membersWithYouTube]
);

useEffect(() => {
  void reload();
}, [channelIdsKey, maxResults]); // reload 대신 channelIdsKey
```

### 2. 메모이제이션
- YouTube 채널이 있는 멤버만 `useMemo`로 필터링
- 불필요한 재계산 방지

### 3. 에러 시 데이터 유지
- 에러 발생 시 이전 데이터가 있으면 유지
- 사용자에게 더 나은 UX 제공

## API 호출 비용 분석

### 단일 채널 조회 (20개 동영상)
1. `channels.list` (contentDetails): 1 unit
2. `playlistItems.list` (20개): 1 unit
3. `videos.list` (20개): 1 unit
**총**: 3 units

### 캐싱 효과
- **캐시 없음**: 매 요청마다 3 units × 채널 수
- **캐시 적용**: 
  - 플레이리스트 ID (24시간): 1 unit 절약
  - 전체 데이터 (5분): 3 units 절약
  - **효과**: 5분마다 1회만 호출, 약 **97% 절약** (5분에 30회 요청 시)

### 일일 쿼터 계산 (10개 채널 기준)
- **캐싱 없음**: 10,000 / (3 × 10) = **333회 요청/일**
- **캐싱 적용**: 10,000 / (3 × 10) × 288 = **96,000회 요청/일** (5분 캐시 기준)

## 추가 최적화 권장사항

### 1. 증분 업데이트 (향후 개선)
- `playlistItems.list`에서 `publishedAfter` 파라미터 사용
- 마지막 조회 시간 이후 새 동영상만 조회

### 2. 서버 측 영구 캐싱 (선택적)
- KV Storage나 D1에 캐시 저장
- Worker 재시작 시에도 캐시 유지

### 3. 백그라운드 예열 (선택적)
- Cron Trigger로 주기적으로 캐시 갱신
- 사용자 요청 전에 미리 데이터 준비

## 모니터링

캐시 효율성 모니터링을 위한 메트릭:
- 캐시 히트율
- API 호출 횟수
- 에러율 (쿼터 초과, rate limit)

Console 로그로 확인 가능:
```
YouTube API quota exceeded or rate limited
Using stale cache due to fetch error
```

## 참고 자료
- [YouTube Data API v3 - Quota](https://developers.google.com/youtube/v3/getting-started#quota)
- [YouTube Data API v3 - Costs](https://developers.google.com/youtube/v3/determine_quota_cost)
