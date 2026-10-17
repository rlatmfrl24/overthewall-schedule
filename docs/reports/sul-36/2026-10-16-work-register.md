# OTW·LuvDia 현재 작업과 D1 보류 목록

기준: 2026-10-16 KST, 작업 트리 `d27f26a4` + 기존 미커밋 변경. 이 문서는 현재 실행 순서의 색인이다. 아래 과거 문서의 미완료 체크박스를 모두 새 구현 의무로 되살리지 않는다. 운영 성공, 로컬 구현, 의도적 중지, 미확인을 구분한다.

후속 실행: 승인된 [스키마·PR·공개 릴리스 계획](../../superpowers/plans/2026-10-16-publication-production-release.md)에 따라 원본 WIP를 보존한 격리 작업 트리에서 진행 중이다. [실행·리뷰 기록](2026-10-16-publication-production-release.md)의 최신 상태를 우선한다. 19일 숨김 D-day는 운영자가 확인한 OTW ID **4, 9, 10, 11**이며 제목 추론이나 가짜 이관 기록을 사용하지 않는다.

추가 최소 의존성0140은 발행 응답 보존에 맞춘 JSON 검증 view 갱신이며 백필은 없다. 로컬 적용·doctor·canonical parity 및 populated 양 사이트 upgrade를 검증한 뒤 양 운영 DB에도 적용했다. [PR160](https://github.com/rlatmfrl24/overthewall-schedule/pull/160)은 병합·운영 반영됐다. 사용자는 LuvDia 이관 완료와 재이관·재복사·대량 백필 금지를 재확인했다. 과거 이관 플랫폼 전체 완성·구형 시험 정리는 공개 선행 조건이 아니며 FAIL 근거를 후속으로 유지한다. 19일00:01 KST 실제 전환 관측 예약 `otw-luvdia-19`는 단일 등록했으며 배포·DB 변경을 수행하지 않는다.

**10/16 15:56 KST 갱신:** PR160 병합037d4252와 최소 운영 schema140 승격, OTW 자동 배포0e140a70/LuvDia 동일 소스 배포16fb230c 완료. 익명 카운트다운·API/파일 차단과 양 사이트 실제 관리자 접근·원본 보존·Queue/Cron 설정 유지 확인. 배포 후 X 정규 실행2310/2311도 총8개 handle 정상 점검·success를 확인했다(최신3행 읽기/0행 쓰기, 신규 저장0건). [운영 증거](2026-10-16-publication-production-release.md#운영-반영-결과)가 위 중간 상태보다 우선한다. 원본 WIP409파일과 X 작업 트리는 보존했다. X 확인 예약은PAUSED로 되돌렸고19일 예약은 유지한다. 실제 정각 관측·고비용 검증·이관 코드 제거 후속은 완료로 올리지 않는다.

## 확정 범위

- **2026-10-19 00:00:00 KST = 2026-10-18T15:00:00Z**: LuvDia 공개, OTW의 `bing_hayu`, `u_lili`, `yang_mei`와 관련 자료 일반 노출·신규 수집 종료. 과거 원본·관리자 열람·다른 멤버 운영은 보존한다.
- 그 전 LuvDia 공개 HTML·콘텐츠 API·파일은 닫고 카운트다운을 표시하며, 정상 관리자 인증과 준비 작업을 유지한다. 메뉴명은 `멀티뷰`다.
- 공개 전환은 요청 시 서버 시간으로 결정한다. Cron이나 에이전트 예약이 실제 전환의 실행 주체가 아니다. 공개 후에도 기존 회원/관리자 권한을 유지한다.
- D1은 계정 합산 한도다. 한도 초기화만으로 이관·전수 검증·재귀 음악 검사·백필을 재개하지 않는다. 운영 관측은 기존 Cloudflare 집계·로그와 인덱스 최소 표본을 우선한다.
- 기존 WIP, 운영 데이터, Queue 메시지와 retry/retention을 보존한다. 섞인 작업 트리 전체를 배포하지 않는다. 요금제 변경·유료 AI 실행·R2 사고 복구는 이 목록 작성만으로 승인되지 않는다.

## 현재 진행·완료

| ID | 상태 | 결과와 남은 판정 |
| --- | --- | --- |
| DONE-RECOVERY | 운영 완료 | 10/16 09:01 점검 해제, OTW Cron·Queue 6개 재개, 실제 API·브라우저 정상 확인. [사고·복구 기록](2026-10-16-otw-d1-incident.md). |
| X-READS | 운영 완료 | 버전 `3a95078a-1ef5-4c44-91d0-9ece742620b2`의 정규 run 2300/2301이 10:53에 8개 handle 전체 갱신·success. 10:55 재조회는 3행 읽기/0행 쓰기, Cron·Queue·API 정상. 기존 `otw-9-d1`는 PAUSED. 배포 당시 로컬 빈 조회 3,075→9행, 운영 selector 11행 읽기/0행 쓰기였다. 공개 정책을 추가한 현재 로컬 코드의 비용은 별도 검증한다. |
| PUB-LOCAL | 로컬 검증·운영 반영 완료, 실제 정각 관측 예정 | 카운트다운·관리자 예외·정각 공개·열린 탭 cache 전환·OTW 관계별 숨김·수집 저장 guard·메뉴명 반영. 기존 Workerd/D1 89건과 추가 공개/보존68건 PASS. 실제 운영 익명17진입점·양 사이트 정상 관리자·LuvDia 미리보기 확인. [이전 증거](2026-10-15-publication-cutover-execution.md), [최종 운영 결과](2026-10-16-publication-production-release.md#운영-반영-결과). |
| PUB-BUILD | 양 사이트 최종 build PASS | root 개발 환경을 보존하고 ignored 사이트 production override로 Clerk issuer/JWKS/party를 분리했다. 모든 이번 코드 수정 뒤 양 사이트를 다시 빌드해 PASS. 비밀 값은 출력하지 않았다. |
| PUB-COLLECTOR | 현 정책 회귀 2건 PASS | 기존 두 시험은 최종 maintenance stop 없이 지속 이관의 신규 접수를 전제했다. 독립 운영의 전체 후보/전역 휴방 batch와 정각 이후 선택 대상 raw 보존으로 교체해 기존 업무 assertion을 유지했다. 운영 보호 조건은 완화하지 않았다. |
| PUB-X-BOUNDARY | 로컬 수정·회귀·독립 검토 완료 | 전역 repair의 사이트 문맥 누락, 정각을 넘긴 quote hydration 저장, LuvDia 일반 feed의 OTW 기본값을 실제 Worker/D1에서 재현했다. 최종 쓰기·ack/cache·결과 카운터까지 정책을 연결했다. 빈 읽기11행, 미래 재시도7행, 숨긴512개 후보는 매회 최대506행 읽기/100후보. |

## 실행할 작업: 우선순위·비용·완료 조건

비용의 `로컬`은 원격 D1을 사용하지 않는다. `최소`는 명시한 대상/상한의 운영 표본이다. `고비용 보류`는 아래 재개 조건을 충족하기 전 실행하지 않는다.

| 순서 / ID | 필요한 작업 | 비용·재개 조건 | 완료를 인정할 증거 / 소유 계획 |
| --- | --- | --- | --- |
| P0 / PUB-VERIFY | 로컬·운영 역할/경계 확인 완료, 실제 정각 관측 남음 | 완료된 검증 재실행 대신19일 관측 | 실패→수정→통과 로그와 정상 Google 관리자 인증을 확인했다. 실제 정각은 PUB-CUTOVER가 소유한다. [공개 Task 1·2](../../superpowers/plans/2026-10-15-site-publication-cutover.md). |
| P0 / PUB-RELEASE | **완료:** 최소 스키마140·단일 PR160·양 사이트 동일 병합037d4252 배포 | 원격 최소 승격/readback 완료 | OTW0102~0136과0139~0140, LuvDia0137~0140 적용. immutable 이력 보존·schema-only doctor·원본3/4/3행·활성 Worker/D1/R2/Clerk/Queue/Cron readback 완료. OTW 자동 배포만 수행했고 LuvDia도 같은 병합 소스다. 상세 [운영 결과](2026-10-16-publication-production-release.md#운영-반영-결과). |
| P0 / PUB-CUTOVER | 19일 실제 시각 이후 LuvDia 정상 공개, OTW 세 멤버 직접 링크/파일/API 차단, 관리자 보관 확인 | 최소; 실제 날짜에 관측 | 실제 진입 → 메뉴 → 콘텐츠, 기존 로그인 역할, 원본 보존 readback. 로컬 fake clock은 실제 정각 증거가 아니다. 관측 예약은 필요할 때 기존 것과 중복 없이 설정. |
| P1 / D1-BUDGET | 계정 전체 읽기와 DB별 쓰기 ledger 구분, 고비용 SQL/원격 doctor/이관 실행의 예산 점검 | 로컬 쿼리 계획·기존 analytics 우선 | 비용 추정과 중지 기준, 빈 작업 반복 읽기 회귀, 관측에 추가 ledger 쓰기 없음. 자기 DB write guard 통과만으로 계정 읽기 여유를 판단하지 않는다. [성능·운영 계획](../../superpowers/plans/2026-10-15-site-performance-operations.md). |
| P1 / PROFILE | LuvDia 프로필 초기 이미지 지연: 권한 조회·중복 Blob·fallback·배경 동시 요청 분리 | 로컬 구현 우선, 운영 3회 등 제한 표본 | 정상 profile 버튼 진입에서 주 이미지가 비선택 이미지/원본 fallback을 기다리지 않음. 동일 조건 median TTFB/요청 수와 권한/304/세션 회귀. 파일 크기만 줄여 해결로 판정하지 않는다. [성능 Task 1](../../superpowers/plans/2026-10-15-site-performance-operations.md). |
| P1 / RESOURCE | D1/R2 통계·사용 경로·실제 참조를 구분하고 자원 누락 여부 확인 | Cloudflare 집계/정확 key HEAD 최소; 전체 list/scan 보류 | R2 object 0 집계만으로 유실 판정 금지. static profile과 R2 background 구분. [성능 Task 2](../../superpowers/plans/2026-10-15-site-performance-operations.md). |
| P1 / SCHEDULED | LuvDia Cron→Workflow→Outbox→Queue→item→결과 readback, 예약·retry·DLQ 검증 | 기존 로그/자연 실행 우선; 대량 수집/소급 재개 보류 | 등록 정상, Queue 길이 0, wrapper 1/1과 업무 성공 구분. 기존 실제 수동 4종 성공은 자연 예약 전체 성공의 대체 증거가 아니다. [성능 Task 3](../../superpowers/plans/2026-10-15-site-performance-operations.md). |
| P1 / AI-STATE | AI·키리누키·Play 채널 감시의 의도적 중지와 실제 오류 구분 | 로컬·설정/기존 결과 최소; 유료 실행은 기존 정책 유지 | LuvDia AI false를 장애로 처리하거나 점검 중 활성화하지 않는다. unknown 외부 효과는 재POST 금지. 기존 관리자 복구 계약 보존. |
| P1 / RELEASE-PARITY | 양 사이트 동일 소스 증명, dirty tree/산출물 hash와 migration/config/issuer 매핑, 자동 배포 주체 확인 | 로컬·Cloudflare 메타데이터 최소 | 동일 HEAD만으로 같다고 하지 않음. 같은 검토 소스에서 각 사이트 artifact를 만들어 정상 readback. Worker Builds/Git 연결 확인 전 새 CI 중복 생성 금지. [공통 배포 Task 1](../../superpowers/plans/2026-10-15-shared-release-architecture.md). |
| P2 / DATA-GAPS | 전체 과거 콘텐츠·파일·공동 관계의 차이 목록 및 필요한 부분 보완 | **고비용 보류**; 계정 읽기/쓰기 여유·산정·범위별 예산 확인 후 | 원본 보존, 차이 목록→선택 복구→소유 경로 readback. 이미 복사된 DB 재복사·개인 계정/playlist 승계 금지. [초기 개통](initial-service-launch.md), [독립 배포 계획](../../superpowers/plans/2026-10-13-luvdia-independent-deployments.md). |
| P2 / MUSIC-INTEGRITY | 재귀 음악 검색 정합성 검사, 전수 doctor, 대량 스캔·과거 백필 | **고비용 보류**; 초기화는 재개 승인 아님 | 로컬 우선, 쿼리 계획/상한·중단 기준·예산 산정 후 필요한 데이터만. 10/15 한도 소진 원인 작업을 무제한 재실행하지 않음. |
| P2 / ARCHITECTURE | 현재 다섯 흐름 책임도 갱신, 임시 이관 결합·구형 writer/test/codec의 keep/replace/remove 대조 | 로컬, 공개 안전성 확보 후 | 현재 호출자·저장된 receipt·retry 책임 확인 후에만 제거. 폴더 전면 재배치·줄 수 목표 금지. maintenance 이전 신규 접수 성공을 전제한 시험은 현 정책에 대조한다. [공통 구조 Task 2](../../superpowers/plans/2026-10-15-shared-release-architecture.md). |
| P2 / TRANSITION-REMOVE | **공개 배포 완료 이후 별도 후속:** 과거 이관 전용 코드·시험 안전 제거 | 호출자·exports·계약·Queue/Cron·DB trigger 의존성 조사, 운영 잔여 작업·복구 책임 없음 readback 이후 | 이관 폴더의 공개 정책(카운트다운/정각 공개/OTW 숨김/수집 차단), 일반 저장·파일 보존, 과거 검토·수집 조회 기능을 담당 기능으로 먼저 분리한다. 기존 데이터·이력·보존 파일 및 X 최적화를 유지한다. 적용 이력은 불변이며 불필요한 DB 규칙은 필요할 때 후속 migration으로 정리한다. 데이터 삭제·DB 전체 재구성·재이관은 승인 범위가 아니다. 공개 선행 조건으로 올리지 않는다. |
| P2 / LEGACY-TESTS | 旧 maintenance stop 시험의 terminal reconciliation 준비를 현 계약에 맞춰 정리 | 로컬 | 별도 기존 시험은 직접 completeItem 후 reconcile outbox를 남겨 `scheduledDispatch=1`로 FAIL. 정상 취소→원래 Queue 마무리→재정지 경로는 기존 `scheduled_finalization_stop`이 소유한다. pending을 직접 지워 PASS로 만들거나 이 FAIL을 전체 통과로 보고하지 않음. |
| 별도 / R2-INCIDENT | 과거 R2 업로드 사고의 이전 상태·upload version·실제 영향 확인 | 추가 조사/복구는 별도 허용 범위 확인 | 현재 7개 bytes 일치만으로 무해·복구 완료 판정 금지. 재업로드/삭제하지 않음. [원 사고 기록](operational-upload-incident.md). |

원격 고비용 작업 재개 시에는 **현재 UTC 일자, 계정 합산 reads/writes, 관측 지연, 작업 예상량, 운영 여유, 작업별 중단 기준**을 함께 기록한다. 숫자가 회복됐다는 이유로 위 보류 항목을 자동 실행하지 않는다. 필요한 공개 배포의 최소 schema 호환 작업과 전체 과거 데이터 검증은 구분하되, 호환성을 희생한 배포를 허용하지 않는다.

현재 repair는 100개 후보를 먼저 materialize한 뒤 숨김을 판정한다. 숨긴 미완료 항목은 pending을 거짓 완료로 만들지 않고 checked_at만 회전하므로 제한된 metadata 쓰기는 남는다. hydration은 기존 handle/기한 인덱스를 사용하며, **다른/숨긴 handle의 due 미완료가 대량 누적되면 후보를 찾는 읽기가 늘 수 있다.** 완료 이력 전수 스캔의 재도입과는 다르지만 전체 pending 비용이 항상 상수라는 주장은 하지 않는다. 현재 운영 selector의 빈 반환, 정상 새 수집, 대량 작업 보류에 비춰 가능성은 낮다. 대량 repair 재개 전 handle별 work 인덱스/중지 상태 설계와 비용 확인을 D1-BUDGET에 포함한다.

## 기존 프로젝트 잔여: 중복 등록 없이 유지

아래는 [기존 개발 상태](../../development-status.md)의 소유 문서와 결정에 따라 진행한다. 이번 공개의 선행 조건으로 추가하지 않는다.

| 기존 항목 | 현재 취급 / 완료 기준 |
| --- | --- |
| 자동 수집·OPS-PLAY-RELEASE | release별 실제 예약 전달→candidate→관리자 검수/draft·재생·역할·source health 확인. 중지 기간 자동 소급 금지. |
| AI-QUALITY | 기존 3영상 비교는 부분 증거. 메들리/듀엣/장시간 정확도와 관리자 적용·실패/예산 확인이 남음. |
| 메타데이터·썸네일 우선 AI 초안 | [10/14 계획](../../superpowers/plans/2026-10-14-otw-play-metadata-first-ai-draft.md)의 이관 완료·구현 재개·키 준비 전제 유지. 원격 모델/가격·키·실사용 비교는 재개 시 재확인. |
| LATER-PIN | 대표곡 최대 5곡, 순서·fallback·재조회. |
| LATER-CORRECTION / BACKLOG-MERGE | 참여 정보 정정의 근거/승인 전 비반영과 관리자 가창 병합의 참조·중복·이력 보존. |
| NEXT-LIBRARY / NEXT-BROADCAST | 좋아요·최근 청취·라디오·공동/공개 목록과 방송 setlist는 별도 정책 확정 후 진행. 기존 개인 비공개 playlist와 구분. |
| OTW 전용 멀티뷰 확장 | 후속 요구로만 유지. 현재 선택→새 탭 Mul.Live·최신 Plus 확장 안내 유지. 명시적 재개 요청 없이 extension package/iframe을 복원하지 않음. |
| OPS-ACCOUNT | 전용 계정 이전은 별도 승인·provisioning 작업. 현재 확정된 같은 Cloudflare 계정 사용의 공개 선행 조건으로 되살리지 않음. |

**종료·범위 제외 유지:** 기존 30일 X 비용 추적 의무, player 원곡 가수 표시, 제작 참여/만든 곡 확장, 외부 공유 배너, 별도 프로젝트인 VOD AI 요약·하이라이트는 이번 작업 목록에 다시 넣지 않는다. Task 4.4 전체·실시간 인계 플랫폼도 초기 개통의 필수 조건에서 해제된 결정을 유지한다. 기존 데이터와 이미 발행한 책임 보존은 계속 필요하다.

## 실행 색인과 갱신 규칙

[10/16 통합 실행 계획](../../superpowers/plans/2026-10-16-release-readiness-and-backlog.md)에서 현재 단계와 검증 명령을 추적한다. 독립 하위 작업은 기존 공개·성능·공통 배포 계획을 소유 문서로 유지한다. 문서 작성이나 로컬 테스트 PASS를 운영 완료로 승격하지 않는다. 상태 변경에는 시각·artifact/소스·정상 진입점·readback·한계를 함께 남긴다.
