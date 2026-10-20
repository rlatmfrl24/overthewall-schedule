# 아키텍처 후보01~03 최종 검토

**확인된 결함 수정·PR 검토·병합·양 사이트 운영 검증 완료.** [PR #176](https://github.com/rlatmfrl24/overthewall-schedule/pull/176)의 최종 head는 `689538d6ba42ec396e8fdf864546fef1a69bb20c`, merge는 `b0818c0da5858b888aede8e3cbbf52ca488378f5`다. 두 commit의 tree는 `86616c53795a83b75a86433234e6a59f6e0a9ff1`로 동일하다. 아래 운영 상태는 **2026-10-20 22:03 KST 관측**이며 이후 배포를 실시간으로 나타내지 않는다.

최신 승인과 중지 조건은 [현재 작업](current-work.md), 실제 소유 경로는 [아키텍처](architecture.md)가 소유한다. Graphify의 정적 관계와 운영 실행 증거를 구분한다. 원래 큰 모듈 분할·새 추상화 제안 전체를 구현했다고 판정하지 않는다.

[Graphify 구조도·군집 탐색·압축 원본](diagrams/pr176/README.md)은 저장소 상대 경로로 열 수 있다. 입력 hash는 당시 정적 추출 스냅샷이며 이후 문서 PR HEAD의 hash라고 인증하지 않는다.

| 후보 | 수정된 책임·동작 | 검증과 최종 상태 |
| --- | --- | --- |
| 01 저장·재시도 | 인증된 site/admin/request key와 intent hash로 성공 snapshot을 재전송한다. 업무 쓰기·revision·이벤트·`music_admin_command_results`를 같은 D1 batch로 커밋한다. 실제 stale 충돌은 입력을 보존하고 재검토한다. 미사용 보조 함수6개 제거 | 로컬 HTTP 인증→D1의 재전송·동시 요청·의도 충돌·롤백 회귀. 운영 양 사이트 정상 저장과 HTTP200 완료 기록 각각1건 확인. migration0148 적용 완료 |
| 02 카탈로그 조회 | `useOtwPlayAdminCatalogPages`가 목록·페이지 밖 선택·실패 재시도를 소유한다. 높은 version/최신 revision을 채택하되 최초 행 순서는 유지한다. 검색은 제한된 SQL 묶음과 제목·별칭 정확 조회를 사용한다 | 선택 조회503·오래된 캐시·다음 페이지 정렬 회귀. 5,000곡 로컬 fixture에서 검색10,607→659행, 선택5,254→283행. 운영 양 사이트 검색 및25곡 추가 후 기존 순서 유지 |
| 03 일정 단계·재시도 | 현재 설정·run/item/lease·단계 조건을 업무 쓰기와 같은 D1 batch에서 검사한다. `summary_json.autoUpdatePhases`로 재전달과 실제 retry를 구분한다. retry의 오래된 결과를 비우고 새 scan에서 제외된 match·outbox를 원자 종료한다 | 지적1~5, 늦은 하위 메시지, 자동 리뷰 P2의 과거 대상 잔존·롤백 회귀. 실제 로컬 Queue/D1 및 운영 양 사이트 scan→match→finalize 완료 |

## 병합 전 검토·검증

독립 검토와 자동 리뷰를 거쳤다. 자동 리뷰의 P2(새 scan 계획에서 사라진 이전 match가 재실행됨)는 먼저 실제 D1 회귀로 재현하고 최종 head에서 수정·재검토했다. 병합 시 미해결 review thread는0건이었다.

공식 preflight 첫 실행은 2,990개 중2,988개 통과, UI 시간초과2건과 별도 Worker pool 시작 실패가 남았다. 같은 기본 시간 제한의 UI2건 재실행, 최종 D1 회귀32건, 공식 Worker pool의 archive·Queue·native Workflow 97건을 통과했다. 타입·전체 lint·구조·mirror·양 사이트 빌드·격리 clean DB doctor도 통과했다. **구성 요소 합성 검증이며 단일 전체 preflight 명령 PASS는 아니다.** 중복 실행 수를 별도 성공 사례로 더하지 않는다.

## 실제 운영 결과

| 항목 | OTW | LuvDia |
| --- | --- | --- |
| Worker 버전·트래픽 | `d5763ac9-ede5-433f-854e-1183ba69ea75` ·100% | `82776027-d87a-4679-99b6-0c97fef91ecc` ·100% |
| 배포 | master 연결 Workers Build SUCCESS | 동일 merge의 정상 `pnpm deploy:luvdia`, 종료0 |
| 기존 곡 무변경 저장 | Adrena version0→1, revision1101→1102 | Bunny Girl version0→1, revision2→3 |
| 완료 기록 | HTTP200 snapshot1건 | HTTP200 snapshot1건 |
| 새 일정 run | `5d7cf4c0-1da2-41fe-a025-c969fb9fe336` | `713b97bd-e41e-42b0-94cb-eaa2708c6730` |
| Queue·D1·화면 | scan3→match11→finalize1, **15/15 성공** | scan2→match8→finalize1, **11/11 성공** |
| 업무 이력 | 277 success, checked10, 새 후보0 | 6 success, checked7, 새 후보0 |
| 미해결 outbox | 0 | 0 |

대표 관리자는 정상 Clerk 로그인→관리자 메뉴에서 기존 곡을 그대로 저장하고 검색·페이지 이동을 수행했다. 곡·별칭·태그·원곡 가수는 전후 동일했다. 일정은 사이트마다 기존 정상 `지금 수집`을 한 번 실행해 HTTP→실제 Queue→D1→운영 이력 화면까지 확인했다. 수집 범위·24시간 주기는 유지했고 마지막 실행 시각만 정상 완료 시각으로 갱신됐다. 공개 승인·새 후보 생성은 없었다.

두 DB의 enabled/paused 설정은 전후 동일하다. 양 사이트 `otw_play_automation_paused=true`, AI 바인딩 OTW 기존 true/LuvDia false를 유지했고 유료 AI를 호출하거나 재개하지 않았다. 양 사이트 D1 계측도 정상 표시됐다. 22:02 KST 계정 읽기499,935/5,000,000(10.0%), 쓰기 OTW381/LuvDia718은 집계 지연이 있는 당시 관측값이다.

[최종 운영 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/176#issuecomment-6291519609) · [검토·구현 원문과 화면 증거](archive/2026-10-20-candidates-1-3/README.md).

## 남은 한계와 보류

- 운영에서는 응답 유실·lease 경합·retry 장애를 인위적으로 만들지 않았다. 해당 실패 조건은 로컬 실제 D1/Queue 회귀가 소유하며 운영 정상 경로 성공으로 대체하지 않는다.
- 이번 배포 후 자연 Cron 실행과 장기간 부하·모든 검색어의 읽기 상한은 미검증이다. 수동 검증 완료를 자연 실행 관측으로 해석하지 않는다.
- 배포 전에 열린 LuvDia 탭의 구형 동적 chunk 오류는 새로고침 후 회복했다. 이후 관리자 저장·검색·실행 화면은 정상이다.
- 대규모 repository 분할이나 별도 phase 엔진은 도입하지 않았다. 남은 개선 후보일 뿐 새 구현 승인이나 필수 미완료 작업이 아니다. 중지된 자동화·유료 AI·대량 작업은 재개하지 않는다.
