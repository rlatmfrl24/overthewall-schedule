> 2026-10-16 아카이브: 당시 계획·검증 기록입니다. 미완료 표기를 현재 실행 지시로 사용하지 않습니다. 남은 작업과 중단 조건은 [현재 작업](../../../../current-work.md)을 따릅니다.

# OTW 임시 점검 페이지 적용 기록

2026-10-16 07:59 KST에 `https://otw-schedule.info/` 앞에 점검 전용 Worker를 적용했다. 메인 페이지와 직접 접근 경로에서 실제 점검 화면을 확인했으며, 공개 API는 점검 JSON을 반환한다. D1 연결이나 원본 앱 요청 없이 응답한다.

## 배포 식별 정보

| 항목 | 값 |
| --- | --- |
| 점검 Worker | `otw-schedule-maintenance` |
| 점검 버전 | `7cd576ea-5c48-4d49-a66b-407a24292c0d` |
| 점검 배포 | `9bfb72cf-a6c8-41fc-9133-844dbf9cfaa5` |
| Zone | `829450bafe9bc14f8acd9dd24705e8be` |
| 추가한 Route | `otw-schedule.info/*` |
| Route ID | `5147fcaab23246cc9fcfed8003546f78` |
| 기존 원본 Worker | `overthewall-schedule` |
| 유지된 원본 버전 | `6435fde3-4cf7-4ed8-9bdd-02ef1ade5022` |

Cloudflare API 재조회에서 점검 버전 100% 배포, Route 연결, 점검 Worker의 빈 bindings를 확인했다. 기존 Custom Domain의 원본 Worker 연결과 원본 배포 버전은 변경되지 않았다. LuvDia 경로, 데이터, 기존 미커밋 작업, Cron 및 Queue 설정은 변경하지 않았다.

## 검증

- 적용 전 `/api/members`는 HTTP 500이었다. D1 한도 초과는 사용자가 보고한 원인이며, 원인 확인을 위한 추가 D1 조회는 하지 않았다.
- 적용 후 `/`, `/members/bing_hayu`, `/admin/operations`는 HTTP 503과 점검 HTML을 반환했다. 관리자 경로도 임시 점검 대상이다.
- `/api/members`는 HTTP 503과 `SITE_MAINTENANCE` JSON을 반환했다. HEAD 본문은 비어 있다.
- 위 응답의 `Cache-Control: no-store`, `Retry-After: 300`, `X-Robots-Tag: noindex`를 확인했다. 300초는 재시도 권고이며 복구 시각을 약속하지 않는다.
- 운영 URL을 브라우저로 열어 실제 제목과 점검 안내, 다시 확인 링크가 표시되는 것을 확인했다.
- 독립 Worker 테스트 2개, 해당 소스 ESLint, Wrangler dry-run이 통과했다. 새 Worker에는 bindings가 없다.
- 앱 전체 빌드·preflight·마이그레이션은 실행하지 않았다. 이번 배포는 기존 앱의 미커밋 코드를 포함하지 않는 독립 정적 Worker 배포다.

원시 증거는 로컬 `.tmp/otw-maintenance-20261016/`의 `before.json`, `routes-before.json`, `deploy.log`, `after-config.json`, `after-http.json`, `production-maintenance.png`에 보관했다.

## 점검 해제

D1 사용량 및 원본 서비스의 복구 가능 상태를 확인한 뒤, 위 Route ID의 현재 pattern과 script가 각각 `otw-schedule.info/*`, `otw-schedule-maintenance`인지 다시 확인하고 **이 Route만 제거**한다. 기존 Custom Domain과 원본 Worker는 유지한다. 그 후 운영 URL과 공개 API의 정상 응답을 확인한다.

자동 해제는 설정하지 않았다. 점검 페이지는 공개 요청의 추가 D1 접근을 차단하지만 기존 Cron·Queue 실행까지 중단하지는 않는다. D1 사용량 원인 해결과 공개 전환 구현의 배포는 별도 작업으로 남아 있다.

## 08:03 KST follow-up

The user subsequently authorized pausing OTW background work and scheduling recovery at 09:00 KST. The OTW Cron and six queues are now paused, and a one-time recovery heartbeat is active. The earlier paragraph describes the initial 07:59 deployment only. Current incident evidence and the recovery procedure are in [the D1 incident report](../../../../reports/sul-36/2026-10-16-otw-d1-incident.md).
