# SUL-36 구현 중 기술 판단 기록

상태: 코드·로컬 검증 진행 중. 이 기록은 운영 이관·배포·공개 승인이나 전체 구현 완료를 뜻하지 않는다.

사용자가 확정한 공통 코드, 사이트별 자원·회원 분리, 전체 기능·현재 보유 콘텐츠 승계, 무중단 전환 정책을 구현하면서 내린 판단을 시간순으로 기록한다. 각 항목에는 이유와 판단이 틀렸을 때의 재작업을 함께 적었다. 최신 코드 검증 상태는 [로컬 구현·검증 기록](./local-implementation-verification.md)을 따른다.

1. **현재 기능 브랜치와 작업 공간을 재사용한다.** 현재 작업 공간에서 진행하라는 실행 범위를 따른다. 초기에는 기존 변경을 모두 작업 문서로 보았으나, 이후 별도 AI 검수 문서·계획은 무관한 변경으로 확인하여 보존하고 모든 SUL 커밋에서 제외했다. 공간 분리가 필요했다면 미커밋 작업을 옮겨야 한다.

2. **LuvDia의 운영 `publicOrigin`은 도메인 입력 전까지 `null`이다.** 로컬 origin은 선택한 포트에서 공급한다. 임의 도메인을 넣지 않는다. origin 의존 소비자가 이 상태를 처리하지 못하면 해당 소비자를 수정해야 한다.

3. **Task1에서 LuvDia의 최소 로컬 설정을 함께 만든다.** 처음부터 두 번째 사이트의 지원 진입점이 필요하다. 전체 runtime 격리는 Task3에서 완성한다. 설정 형태가 맞지 않으면 후속 연결 전에 수정해야 한다.

4. **작업별 검사는 영향 범위에 맞추고, 전체 공통 검사는 마지막에 한 번 수행한다.** 저장소의 검증 규칙을 따른다. 놓친 공통 영향은 최종 검사에서 해결해야 하며, 부분 검사만으로 전체 완료를 선언하지 않는다.

5. **LuvDia의 기본 로컬 포트는 `5174`이며 Clerk 앱 identity를 명시한다.** 사이트별 `CLERK_ISSUER`는 publishable key가 가리키는 frontend API origin과 일치해야 한다. 일반 fallback은 없다. 입력이 잘못되면 실행이 거부되므로 운영자가 올바른 설정을 공급해야 한다.

6. **환경 파일은 `config/sites/<siteId>`에 둔다.** 기존 OTW 입력은 사이트 identity가 일치하는 명시적 OTW alias에서만 사용한다. 잘못된 파일 배치는 운영자가 수정해야 하며 상대 사이트 설정으로 대신 실행하지 않는다.

7. **SEO 생성 CLI에도 사이트 선택을 처음부터 전달한다.** 임시 wrapper 없이 최종 빌드 parameterization으로 연결한다. 인터페이스가 맞지 않으면 후속 작업의 의존 관계를 수정해야 한다.

8. **기존 LuvDia 로고와 `397love@gmail.com`을 사용하고 커뮤니티 링크는 비워 둔다.** 사용자 확정 입력을 그대로 반영한다. 변경이 필요하면 화면 자산·설정을 수정하며 데이터 변경은 필요하지 않다.

9. **Worker의 `configPath`를 위장하지 않는다.** 지원되는 사이트별 환경 또는 실제 생성된 로컬 설정으로 identity와 상대 경로 해석을 유지한다. 맞지 않으면 환경 준비를 추가로 수정해야 한다.

10. **reset·location·doctor·seed의 최소 사이트 선택 연결을 Task1에서 수행한다.** 두 사이트 모두 정상 지원 명령으로 새 로컬 상태에 접근할 수 있어야 한다. 후속 도구가 이 계약을 따르지 못하면 수정해야 하며 기존 로컬·원격 데이터는 건드리지 않는다.

11. **Task2에서 `getWorkerSiteDefinition(env)`의 최종 경계를 먼저 도입한다.** Worker SEO도 명시적 설정 identity가 필요하다. 자원 격리는 Task3에서 추가한다. 합성이 맞지 않으면 인터페이스를 수정해야 하며 host 기반 임시 선택을 넣지 않는다.

12. **두 사이트의 persistence root는 겹치지 않아야 한다.** 내부 `v3`·자원 alias와 실제 promotion·삭제·rollback 대상을 확인한다. 중첩 배치를 의도한 경우에도 별도 디렉터리로 바꿔야 한다.

13. **PNG 내보내기의 이미지 누락 문제는 정상 공통 흐름에서 최소 수정한다.** fixture에서만 우회하면 요청한 내보내기 기능의 증거가 되지 않는다. 기존 결함 수정이 포함되는 만큼 해당 회귀 검사가 필요하다.

14. **Task4를 다섯 개의 순차 구현·리뷰 범위로 나눈다.** schema·포착 기반, 전체 읽기 경계, 보존·파일, 저장·수집 인계, 도구·통합 검증 순서다. 원래 전체 범위는 유지한다. 분할이 비효율적이면 조정·리뷰 비용이 늘어난다.

15. **source 쓰기 차단 전에 target의 접수·인계 준비를 영속적으로 확인한다.** 인계 ACK와 provider 작업의 최종 결과를 구분하고, 완료 조건은 차단 이전의 유한한 접수 집합만 대상으로 한다. 잘못된 연결은 수집 공백·무기한 대기·늦은 저장 덮어쓰기를 만들 수 있어 수정해야 한다.

16. **세 사람의 식별자는 `bing_hayu`, `u_lili`, `yang_mei`라는 code이며 숫자 UID가 아니다.** 각 code는 source에서 정확히 하나의 `members.uid`로 해석하고 승인된 target UID mapping을 사용한다. 없거나 중복이면 conflict다. 잘못된 원본은 명시적으로 분류해야 하며 roster를 추가하거나 identity를 바꾸지 않는다.

17. **새로 생성하고 아직 적용하지 않은 migration만 안전하게 다시 생성한다.** 자동 rebuild가 기존 FK 관계를 지울 수 있으므로 additive expansion과 constraint·nullable 변환을 나눠 실제 보존·rollback을 확인한다. 안전성 증거가 부족하면 새 산출물을 다시 만들어야 한다. 기존 번호 SQL·applied 기록은 수정하지 않는다.

18. **최종 canonical schema 생성은 유지하되 새 미적용 SQL의 생성기 결함만 교정한다.** FK-safe backup·rebuild·restore, 없는 새 열의 복사, 잘못된 DESC quoting을 교정하고 실제 populated D1과 no-diff snapshot을 확인한다. 불일치가 남으면 새 산출물을 거부하고 다시 생성해야 한다.

19. **`content_access`는 사이트 내부 정책으로 이관 business image에서 제외한다.** 새 LuvDia 자료는 기존 공개·회원·관리자 제한을 유지한 정상 접근 상태로 생성하고 OTW 원본만 `admin_archive`로 바꾼다. 기존 target·재개 자료의 정책을 임의 초기화하지 않는다. mapping이 틀리면 import 전에 고쳐야 한다. 차단 뒤 source의 접근 정책 변경 권한도 business 수정 우회가 될 수 없다.

20. **D1의 실제 compound SELECT 한도에 맞춰 고정 SQL branch를 나눈다.** business 변경·포착·receipt의 단일 transaction은 유지한다. 생성 크기와 canonical closure·cascade·rollback을 검증한다. runtime 한도나 비용이 맞지 않으면 후속 작업 전에 mechanism을 수정해야 한다.

21. **baseline은 승인된 source boundary·digest에 묶인 비활성 staging과 제한된 페이지 설치로 처리한다.** 전체 row·hash·checkpoint의 실제 확인 뒤 영속 receipt를 만든다. 일반 business delta replay는 원자적으로 유지한다. 불완전 staging이나 불일치가 있으면 활성화를 거부하고 복구해야 한다.

22. **45행 같은 임의의 일반 변경 제한을 제품 계약으로 넣지 않는다.** 최종 replay persistence에서 최소 statement grouping을 구현하고 45행을 넘는 실제 committed delta를 확인한다. 지원 runtime·producer 규모가 맞지 않으면 그 한계와 필요한 조치를 밝혀야 한다. 실제 계정 요금제·한도·운영 부하는 별도 확인 대상이다.

23. **차단 전 새 분류 ambiguity는 인계만 막고 source 운영은 계속한다.** 수집·접수·business commit을 일괄 중지하지 않는다. 두 guard가 잘못 결합됐다면 무중단 계약을 지키도록 수정해야 한다.

24. **차단 전 분류 수정은 정확한 parent digest·CAS·target 승인에 묶인 append-only revision으로 허용한다.** 기존 결정·UID·자원·schema·generation과 원래 baseline header·hash는 유지한다. 새 closure 포착·stale readiness 무효화도 원자적이다. lineage가 틀리면 인계를 거부하고 복구해야 하며 차단 뒤 revision이나 일반 manifest 수정은 허용하지 않는다.

25. **파일 관측·최종 disposition·참조 proof의 영속 계약은 Task4.1에서 확정한다.** 실제 R2 byte·hash adapter는 Task4.3, 인증된 전달은 Task4.4에서 연결한다. 계약이 틀리면 누락·stale·mismatch receipt를 거부해야 한다. 파일 포함 활성화의 거부 검사는 성공한 파일 이관의 증거가 아니다.

26. **유효한 원본 행의 증가를 2MB adjacency aggregate로 제한하지 않는다.** relational edge row와 분할 SQL로 aggregate-string 병목을 제거하고 실제 D1에서 확인한다. 영향을 받은 root만 읽고 변경분만 쓰는 원자적 포착을 유지한다. 플랫폼 비용·한도가 맞지 않으면 추가 증거와 수정이 필요하다.

27. **버전이 있는 source shape·reference 선언에서 인계 전용 SQL 검증을 생성한다.** protect·fence와 같은 원자적 boundary에서 검증하며 정책을 따로 중복 작성하지 않는다. 검증과 projector가 다르면 수정해야 한다. target이 항상 source 최신 tail과 같아야 한다는 조건은 추가하지 않는다.

28. **다른 사람의 역사적 identity는 승인된 baseline·이전 committed image의 실제 사실에서 만든다.** 기존 canonical entity를 우선 사용하고 없으면 추적 가능한 비관리 external persona를 같은 projector에서 만든다. 첫 binding은 유지하고 이후 canonical 출현·삭제를 참조와 함께 반영한다. 누락·ambiguity는 인계 conflict이며 이름만으로 merge하거나 네 번째 roster를 만들지 않는다.

29. **전달 command는 명시적 codec ID·version과 owning validator로 검증한다.** source sanitize·projection 뒤 target에서도 positive reparse한다. raw `Record`·type brand·cast를 전달 권한으로 삼지 않는다. 맞지 않으면 receiver가 거부하며 남은 실제 producer 연결은 Task4.4에서 완성한다.

30. **entity·alias unique conflict를 차단 전에 확인한다.** canonical JS Unicode normalization을 SQL로 그대로 재현할 수 없는 값만 내부 source fact receipt를 사용하며 정확한 sealed 입력·protocol·revision·generation·mapping·현재 fact set에 묶는다. stale·위조·누락 proof는 인계를 거부한다. 이름 기반 merge나 business 변경마다의 관측용 쓰기를 추가하지 않는다.

31. **현재 상태뿐 아니라 원래 승인된 baseline과 replay에 필요한 모든 image가 표현 가능해야 한다.** 나중의 이름 수정·필드 삭제로 과거 승인 image를 바꾸지 않는다. 본질적으로 충돌하는 baseline은 정확한 boundary·table·PK·이유를 표시하고 source를 계속 운영한다. 일반 reset·rebaseline·merge API는 넣지 않는다. 해당 경우에는 후속으로 검토된 baseline·identity 처분 결정이 필요하다.

32. **최종 인계 proof는 실제 저장된 source fence와 sequence seal에서 만든다.** 초기에 받은 envelope나 caller flag로 최종 인계를 완료 처리하지 않는다. target의 이미 진행된 operation·file 상태는 단조롭게 보존한다. seal이 틀리면 활성화 전 거부·수정해야 한다. provider·R2의 미확정 결과는 terminal 완료로 꾸미지 않는다.

33. **보관 상태의 cache revision은 기존 원자적 archive receipt를 읽어 사용한다.** 현재 검증된 viewer 권한과 함께 cache 반환 전에 검사하고 stale provider allowlist와 알려진 archived ID의 우회를 차단한다. 추가 관측용 D1 쓰기는 넣지 않는다. 빠진 경계가 있으면 과거 cache가 노출될 수 있어 수용 전에 수정해야 한다. 실제 bytes·static·R2 경계는 Task4.3에서 연결한다.
