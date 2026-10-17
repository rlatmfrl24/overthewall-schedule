# 2026-10-16 미커밋 코드 추가 독립 리뷰

## 결론과 범위

앞선 리뷰에서 독립 검토하지 않았던 변경을 별도 리뷰어가 확인했다. **396개 코드·설정·스키마 관측 항목(고유 경로386개), 누락0개**다. 이미 운영 blob과 같거나 퇴역한 코드도 실제 변경 hunk와 현재 호출자·담당 기능을 대조했다. 현재에도 남는 결함3종을 발견해 PR162에 수정과 회귀 사례를 준비했다. **D1 중단·Draft·병합 대기는 유지한다.**

모든 변경 hunk와 연결 기능의 검토이며, 변경과 무관한 기존 대형 파일의 모든 줄이나 생성 JSON/SQL의 모든 문자를 사람이 다시 읽었다는 주장은 아니다. 생성물은 정규화한 논리 변경·객체 정의·제약조건·연결을 검토했고 DB에서 실행하지 않았다.

파일별 기준 HEAD·WIP 해시·담당 리뷰·방법·호출자·발견 연결은 [정적 리뷰 목록 CSV](2026-10-16-uncommitted-review-coverage.csv)에 있다. 당시 코드 검토 기록이며 자동 감시나 테스트 실행 결과가 아니다.

| 범위 | 항목 수 | 독립 검토 방법 |
| --- | ---: | --- |
| 클라이언트·공유 계약 | 71 | 모든 변경 hunk, DTO/API 소비자·UI 상태·권한·오류 처리 |
| Play·AI·일반 저장 | 75 | 변경 함수·ports/writers·actor/CAS/감사/lease/재시도·현재 owner |
| 일반 Worker·Queue/Cron·X·파일 | 121 | 모든 hunk, 공개/저장/보존·동시 실행·복구 흐름 |
| 과거 이관 실행부·전용 시험 | 63 | repository 2,910 diff줄·시험 4,256 diff줄 포함. 현재 owner와 대조, 퇴역 기능 복원 금지 |
| 배포·SEO·테스트 도구·설정 | 17 | 모든 변경 hunk와 실제 호출자·사이트별 산출물/리소스 |
| 스키마·SQL·metadata | 49 | source/생성물 semantic delta, 22 snapshot의 UUID chain·PK/FK, journal·DDL 객체 교체·현재 수명 |

원본 기준은 `d27f26a4628dff34b9eb06628b957b26c3b3aa11`, 별도 X 기준은 `bf0c8159412d283996e04c6d6147de52dbd10ba5`의 미커밋 diff와 untracked다. 시작 시 PR162 HEAD는 `51221883c179d05d373c39ec193c4048a2ee4801`, 운영 기준은 `462779cf1db6b7e06fadc46d0dc3f878762e241b`다. 최종 수정 HEAD는 PR ledger에서 대조한다.

## Standards

신규 문서화 규칙 위반이나 TEST DRIFT는 확정하지 않았다. 이관 전용 시험 제거가 일반 권한·원자성·과거 조회 시험을 없애지 않았는지 현재 owner의 유효 사례와 대조했다.

아래 결함의 수정에서 상태·소유권 판정을 담당 기능 안에서 통일했다. 새 설정·수집 주기 연장·기능 중지로 대체하지 않았다. 추가 Standards 확정 위반0건이며, 정적 검토를 운영/통합 시험 PASS로 올리지 않는다.

## Spec

**R2 / P2 — 전송된 후처리를 완료로 오판한다.** “실제 미완료·오류·재시도 대기 항목이 없으면 succeeded로 정규화하고, 진짜 partial은 보존”해야 한다. 기존 조회가 pending/failed/dispatching만 세어 `dispatched`이면서 `reconciled_at IS NULL`인 창을 놓쳤다. refreshRun 뒤 finalizer/ACK 전 중단되면 잘못된 succeeded가 DB에 남을 수도 있다.

수정: claim·복구와 같은 unresolved 조건을 증거 조회에 공유한다. YouTube DTO, partial/succeeded 목록, 마지막 성공 시각도 과거 raw succeeded의 partial 증거를 재판정한다. 일반 성공 작업·X run status를 일괄 partial로 바꾸지 않는다. 전달→조회→ACK, 구형 성공 상태, X 재시도 표시 회귀를 보강했다. 방치하면 운영자가 미완료 복구를 성공으로 읽는다.

**R3 / P2 — 정상 공유 채널까지 정각에 차단한다.** “원본 보관·관리자 접근·비대상 멤버와 정당한 공유 자료는 보존”해야 한다. 채널 정책은 정상 공동 owner를 허용하지만 monitor/candidate/feed의 raw 멤버 판정은 다시 막았다. 중첩 channel alias는 무관한 후보를 숨길 수도 있었다.

수정: 채널·monitor·후보의 채널 유래 조건·feed source/video가 같은 공유 정책을 쓴다. 후보의 직접 숨김 멤버·공연, 비활성/보관/미승인 owner 차단과 archive/fence는 유지한다. 수집 허용과 원본 source 보관을 분리해 sub/catalog 공유만 남더라도 registry가 source/video를 삭제하지 않게 한다. 정상 main/VOD registry 재선택과 보존을 함께 시험한다. 실제 공유 설정은 조회하지 않았고 Play 자동화도 의도적 중지여서 당장 발생 가능성은 낮지만 19일 전 검증이 필요하다.

**R4 / P2 — 없어진 X 관계의 파생 작업이 반복된다.** “신규·수정 게시물, 참조 재시도, 동시 실행, 장애 후 복구의 누락이 없게” 하면서 완료 이력을 반복 읽지 않아야 한다. 정상 재응답/편집이 quote/reply를 null·부재로 바꿔도 이전 reference와 quote-body work가 남아 반복 처리될 수 있었다.

수정: 현재 원문 id/handle/value·generation·공개/보관 상태가 맞고 관계가 명시적 null·부재인 파생 reference만 정리한다. 두 키를 MATERIALIZED CTE로 먼저 고정해 삭제 trigger의 generation 증가가 두 번째 삭제를 건너뛰지 않게 한다. 반환 행수만 ACK generation에 더하고 다른 동시 수정은 pending으로 남긴다. 원문·facts·tombstone·불명확한 JSON·보관 자료는 지우지 않는다. 인용/답글/동시 제거·중간 편집·정각·미확인/숨김/보관 회귀를 준비했다. 방치하면 불필요한 읽기와 외부 조회가 재발할 수 있다.

추가 Spec 발견3종 모두 코드 수정·독립 재검토를 마쳤다. **실제 D1 회귀는 보류이므로 운영 해결·릴리스 준비 완료 판정은 하지 않는다.**

## Ponytail와 검증 한계

위 세 항목은 병합 전에 수정·검증해야 할 실패 경로다. 수정은 일반 owner에 한정하며 과거 이관 실행부·relay·전용 writer·트리거는 복원하지 않는다. X pending index·빈 selector·재시도 기한·site/generation 보호와0102~0141 이력은 보존했다.

일반 AI 네트워크/429/5xx 재요청은 원본부터 존재하며 현행 문서의 명시적 재시도 계약이다. 이관의 unknown 발행 방지와 구분했고 신규 회귀로 잘못 분류하거나 정책 확인 없이 일반 기능을 끄지 않았다. CHZZK9004 수정은 여전히 별도 미구현 후속 작업이다.

- Node24.20.0에서 D1을 호출하지 않는 관련 순수 단위5파일·33사례 PASS: Queue·공개 gate·YouTube 소비자·X 정책/이력 경로.
- 변경 코드 ESLint, 테스트 타입, architecture와 diff 검사 PASS. 최종 수정 HEAD의 검사 결과는 PR ledger에도 기록한다.
- 실제 D1 회귀 **26사례 추가·보강(공유13, X11, outbox2)**은 실행하지 않았다. red/green을 보지 않았으며 단위 시험을 SQL 정합성·동시 실행·비용 증거로 대체하지 않는다.
- X 빈 작업11행·미래 재시도7행은 기존 기준이다. 해당 selector를 바꾸지 않았지만 이번 수정의 실제 rows_read·쿼리 계획은 재측정하지 않았다. 재개 후 기존 시험으로 확인해야 한다.
- 생성 schema 최종 snapshot은120 tables/91 FKs였다. FK 대상·PK/unique, journal/UUID chain과 DDL 객체 교체를 정적으로 확인했다. 기존 idx10 공백은 기준 이력에도 있어 고치지 않았다. 마이그레이션 적용·데이터 검사는 하지 않았다.
- 원본409개 WIP·별도 X 작업 트리·기존 보고서3개와 적용 이력은 보존한다. 현재 PR에만 수정하며 자연 X·19일 관측 예약, production 설정·데이터·버전은 이번 작업에서 변경하지 않는다.

판정: **수정은 PR 반영, 병합·배포 대기.** D1·SQLite 실행, 통합 시험, 전체 preflight, 실제 도메인/관리자/provider 및 예약 결과는 확인하지 않는다. 사용자의 재개 지시와 예산 확인 뒤 필요한 회귀와 릴리스 검사를 마쳐야 한다.
