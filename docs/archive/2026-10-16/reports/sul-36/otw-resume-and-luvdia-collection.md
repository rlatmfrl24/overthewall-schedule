> 2026-10-16 아카이브: 당시 계획·검증 기록입니다. 미완료 표기를 현재 실행 지시로 사용하지 않습니다. 남은 작업과 중단 조건은 [현재 작업](../../../../current-work.md)을 따릅니다.

# OTW 재개와 LuvDia 수집 활성화

2026-10-15 21:33 KST 기준 OTW 일반 서비스와 원래 수집을 복구했고, LuvDia의 일정·X·카페·공식 YouTube 수집을 활성화했다. 정상 관리자 화면에서 요청한 네 종류의 첫 실행은 모두 종료·성공했다. 두 사이트는 자기 Worker·D1·R2·Queue·Workflow를 사용하며 서로의 Worker에 의존하지 않는다.

## 확정한 운영 조건

- 사용자는 10월 18일까지 이관 멤버의 OTW·LuvDia 동시 수집을 허용하고 LuvDia에서도 세 사람을 수집하도록 지시했다. 기존 중복 수집 금지를 이 기간의 재개 차단 조건으로 적용하지 않는다.
- X 예산은 사이트별 하루 $1, 합산 $2를 허용했다. 양쪽 D1의 `x_collection_daily_budget_cents=100`을 확인했다. UTC 일자 예산이며 실제 청구와 추정 ledger의 차이는 기존 계약을 따른다.
- 다른 배포 채팅에 전달하고 조정하는 것을 명시적으로 승인했다. 최초 복사·배포 담당과 수집 담당을 조정해 중복 배포·최초 수집을 피했다.
- AI·키리누키·Play 음악 채널 감시는 이번에 활성화하지 않았다. LuvDia AI 환경값 false, Play 자동화 paused, 키리누키 채널 0개다. Play 공개·메뉴 1/1은 유지했다.
- 18일 이후 OTW에서 세 멤버의 수집·공개를 제외하는 종료 전환이나 자동 정지 예약은 이번에 만들지 않았다. 원본 동결 백업은 보존하며 재개 후 OTW 자료로 LuvDia의 새 편집을 덮어쓰지 않는다.

## 실제 복구와 활성화

OTW는 원래 코드 version `6435fde3-4cf7-4ed8-9bdd-02ef1ade5022`와 원격 migration 0101을 유지했다. 백업과 정확히 일치하는 임시 쓰기 차단 트리거 258개만 제거하고 임시 점검 route를 해제했다. 원래 6개 Queue delivery와 Cron `3,13,23,33,53 * * * *`을 복구했다. 원래 Worker를 새 작업 코드로 교체하거나 OTW 원격 DB에 0136을 적용하지 않았다.

실제 홈의 8명 일정 화면, 멤버 API와 날짜 범위를 지정한 schedule-board API의 HTTP200을 확인했다. 재개 후 네이티브 예약 카페 실행 `c1c2d041-6176-4bed-afcb-e973ebcbc9ad`은 succeeded 2/2, failed0이었다. 과거 running wrapper 8개는 실제 nonterminal item/Workflow가 없는 기존 불일치이며, 이를 실제 진행 중인 작업으로 간주하거나 일괄 성공 정규화하지 않았다.

LuvDia는 `wrangler.luvdia.jsonc`에 자기 이름의 Queue 6개·producer binding 5개와 `luvdia-scheduled-operations` Workflow를 연결했다. 전용 D1 `ce8eec7f-0922-4119-ab75-f67133b94312`·R2 `luvdia-schedule`, peer Service binding 0개를 재확인했다. 기존 승인된 X credential을 연결하고 정상 설정 UI에서 X 30분·비용 최적화·$1, 카페 수집, 일정 24시간·3일 범위를 저장했다.

기존 `scripts/build-site.mjs --site=luvdia`와 `scripts/deploy-workers.mjs --site=luvdia`로 build·remote doctor·migration 확인 후 version `f4df03db-0692-4506-a736-52857ca60a1d`를 100% 배포했다. LuvDia Cron 생성 시각은 21:22:40 KST다. Queue delivery를 활성화하고 기존 네 rollout flag(`schedule_auto_update`, `naver_cafe_collection`, `x_collection`, `youtube_feed_collection`)만 true로 변경했다. 다른 rollout flag는 false를 유지했다.

## 정상 흐름과 authoritative readback

아래 실행은 실제 LuvDia 관리자 수집 화면의 기존 버튼과 YouTube 확인 dialog를 통해 요청했다. 직접 Queue/Workflow 생성이나 인증 우회 API로 사용자 흐름을 대체하지 않았다. 원격 D1 SELECT에서 wrapper뿐 아니라 item과 내부 결과도 확인했다.

| 종류 | 실제 run ID | 최종 결과 |
| --- | --- | --- |
| 일정 | `5e3780a4-e017-47f5-b471-dee1936e3543` | succeeded 11/11, failed0; 실제 CHZZK scan 완료, 기존 일정 유지 |
| YouTube | `43bfa992-f5e1-4f31-b308-86a41d67af75` | nested attempted3/succeeded3/failed0, backfillFailed0, quotaBlocked=false |
| X | `7d2ecf8f-11fa-40fd-b908-ba6fa26ae903` | 세 계정 refreshed3, calls4, 신규0, 원문 보강 대기·실패0, 추정 $0.03 |
| 카페 | `62ef0849-43bd-4eb1-87ff-a612ac4a612b` | 주기상 due인 양메이·유리리 2개 게시판 성공, 새 글2개 저장 |

21:29:50 KST readback에서 nonterminal/실패 item은 0개였다. 일정1,100개·X1,033개를 유지했고 카페152→154개, YouTube200→450개로 증가했다. YouTube는 본채널3·VOD3 총6개 공식 source이며 세 VOD 초기화 완료·source 오류0이었다. 빙하유 카페는 활성 상태지만 기존 6시간 cadence상 이번 실행 대상이 아니었다. copied cursor의 시각을 지우거나 강제로 재수집하지 않았다.

정상 공개 메뉴 → 멤버 게시글 화면에서 피드 업데이트 21:29:43 KST와 새로 저장한 카페 글 두 건(55043·55029)이 상단에 표시됨을 확인했다. 수집 요청 성공·DB 저장뿐 아니라 실제 회원 콘텐츠 동선의 반영까지 확인했다. 증거는 `luvdia-new-cafe-posts.jpg`다.

최초 배포 담당 채팅은 실제 `/vods` → YouTube 다시보기 UI에서 초기화 빈 화면의 자동 갱신, 세 멤버별20개 표시, 더 보기40개·중복0을 확인했다. public API는 ready이며 VOD별50개, 본채널 합계300개였다. 과거 backfill cursor가 남아 있으므로 전체 과거 영상 수집 완료 판정은 아니다. 자세한 UI 증거는 [최초 개통 기록](initial-service-launch.md)의 후속 절에 있다.

기존 안내 공지34는 정상 관리자 수정 UI로 자동 수집 재개·AI 중지 문구만 정정했다. 공개 `/notice`에서 실제 변경 문구를 확인했다. D1 전후 전체 행 비교에서 본문 이외의 관련 멤버3·4·5, 기간, 공개 상태, 대표 여부, 링크와 이미지 등 모든 필드는 동일했다. 새 공지는 만들지 않았다.

21:33 최종 Cloudflare/D1 readback은 양쪽 예상 version100%·Cron·12개 Queue delivery 활성/retention86,400초·각 사이트 자기 consumer·임시 freeze trigger0·FK 위반0·X 예산100cents를 확인했다. 해당 readback의 rows_written은0이다.

## 검증 범위와 한계

- LuvDia build, 최종 lint, architecture, agent sync, target remote doctor와 migration 목록 확인 PASS. 원격 target은 기존0136까지 완료돼 새 migration을 적용하지 않았다.
- 격리 임시 DB에서 전체 migration chain·FK 검증 PASS. 기존 사용자 로컬 DB는 초기화·이관하지 않았다.
- 수집 관련 unit45개와 실제 Workerd D1 integration30개 PASS. 현행 maintenance/site column을 빠뜨린 기존 fixture를 canonical migration 기반으로 보완했다. 테스트 통과를 실제 수집 성공의 대체 증거로 사용하지 않았다.
- 전체 preflight PASS는 아니다. 광범위 suite는 기존 fixture 누락과 Worker/fork timeout으로 실패·중단했다. 기본 OTW 신규 build는 로컬 Clerk issuer/key 불일치, 기본 로컬 doctor는 오래된 DB와 quota 설정 때문에 실패했다. 원래 OTW code/schema를 유지한 실제 복구 및 별도 LuvDia build/remote 검증과 구분한다.
- LuvDia Cron 등록과 실제 정상 관리자→Queue 실행은 확인했다. LuvDia Cron→Workflow가 새 예약 실행을 생성·완료하는 장기 경로는 이 시점에 아직 관측하지 못했다. 단위/D1 테스트나 Cron 설정 readback을 실제 예약 완료로 보고하지 않는다.
- 커밋·push·PR·병합은 수행하지 않았다. 사용자 기존 대규모 WIP는 보존했다. 동시 운영 중 공유 API 프로젝트의 사용량과 과거 backfill은 계속 기존 제한을 받는다.

증거는 `.tmp/otw-resume-review/`의 `restore-result.json`, `otw-after-resume-jobs.json`, `luvdia-activation-result.json`, `luvdia-collection-readback.json`, `final-audit-before-notice.json`, `final-audit.json`과 실제 화면 이미지에 있다. 선택한 최종 증거와 이 보고서는 scratch 밖 `C:\Users\rlatm\Documents\OTW Backups\SUL-36\2026-10-15-collection-resume`에도 복사했다. 최초 원본 SQL·복구 자료는 기존 `C:\Users\rlatm\Documents\OTW Backups\SUL-36\2026-10-15T085349Z`를 유지한다.
