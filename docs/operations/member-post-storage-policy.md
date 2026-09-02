# 멤버 게시물 저장·운영 이력 정책

X의 상세 계약은
[`x-member-history-and-archive-design.md`](./x-member-history-and-archive-design.md)를
권위 문서로 사용한다. API 비용·30분 수집 계약은
[`x-api-cost-minimization-design.md`](./x-api-cost-minimization-design.md)를 따른다.

## 수집 범위

- X와 네이버는 소스 활성화 이후의 신규 게시물 피드다. 활성화 이전 게시물을
  소급 수집하지 않는다.
- 공급자 장애는 cursor를 유지하고 재개한다. 관리자 비활성 기간은 소급하지 않고
  재활성화 시각부터 새로 수집한다.
- X는 optimizer 활성 시 30분 간격, 5건 첫 페이지와 25건 영속 continuation을
  사용한다. 70% guard나 공급자 backoff에서는 실효 주기를 1시간으로 완화한다.
- 네이버는 내부 Endpoint의 15개 페이지를 실행당 최대 3페이지 확인한다.

## 장기 보존

- X와 네이버 게시물은 일반 TTL prune 대상에서 제외한다.
- 게시물 ID, 출처, 게시·최초 확인 시각, 숨김 상태는 영구 보존한다.
- X는 원문·미디어 URL·수집 당시 참여 수치를 보존한다. 네이버는 제목·요약·URL·
  썸네일과 표시 수치를 보존한다.
- 이미지 파일은 D1/R2에 복제하지 않고 공급자 URL만 저장한다.
- 실행·검사·API usage 같은 상세 운영 로그를 게시물보다 먼저 30~90일 뒤 정리하고
  일별 집계만 장기 보존한다.

## 원문 제거

- 관리자 확인을 받은 단건만 원문과 미디어 URL을 제거하고 공개에서 숨긴다.
- X는 `DELETE /api/x/posts/{postId}`, 네이버는
  `DELETE /api/naver-cafe/posts?id={postId}`를 사용하며 감사 로그를 남긴다.
- X는 `x_posts.value='{}'`, `hidden_at`, `hidden_reason='admin'`,
  `content_removed_at`과 facts tombstone을 보존한다.
- 숨김 행은 재수집으로 복원하지 않는다. hard delete와 복원 API는 제공하지 않는다.

## 조회와 운영

- 공개 API는 최근 5~20건의 D1 저장 데이터만 반환하고 공급자 API를 호출하지 않는다.
- 전체 X 기록은 관리자 전용 cursor API와 `/admin/member-posts`에서만 제공한다.
- `x_history_analytics_enabled`는 archive 색인 킬스위치이며 X 원본 수집 킬스위치가
  아니다. 재활성화 시 저장 원문에서 100건씩 보충한다.
- D1 용량은 60% 알림, 75% 경고, 85% 위험으로 운영한다.

## 2026-09-02 Closeout

- 운영 기준선: X 게시물 198, facts 127, source 8, watermark 8,
  continuation 0.
- 누락 facts 71건은 invalid JSON·멤버 매핑·작성 시각 오류가 모두 0임을 확인한 뒤
  migration `0078`에서 보충한다.
- 공급자 일괄 삭제 동기화 기능은 반복되는 upload HTTP 404로 최종 제거했다. 관련
  런타임, scheduler, 설정, 비용 이벤트, 전용 원장·테이블과 과거 run/item/outbox는
  운영에서 삭제한다.
- 게시물 원본과 공용 실제 X 비용 집계는 보존한다.
- 최종 Worker `26d325ac-6ab2-41a2-8d36-24e3d1cc53c1`이 100% 배포됐고, 제거 전용
  Queue backlog와 운영 D1 잔여물은 모두 0이다. facts는 198/198로 보충됐다.

공급자 404의 진단 근거와 폐기 결정은
[`../archive/x-provider-upload-404-incident-closeout.md`](../archive/x-provider-upload-404-incident-closeout.md)에
역사 기록으로만 남긴다.
