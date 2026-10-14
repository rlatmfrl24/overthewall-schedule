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

34. **공지·프로필 파일의 owning codec과 일반 업로드의 최소 영속 intent·version·reference 상태를 보완한다.** 기존 파일 port는 승인된 operation이 필요한데 해당 producer codec과 일반 업로드의 복구 기록이 없다. 이관 중에는 확정된 기존 port에 연결하고 admission status는 불변으로 유지한다. 가짜 transition·actor나 별도 권한 엔진을 만들지 않는다. 새 migration과 분류·포착·참조 소비자의 일치가 틀리면 수용 전에 다시 수정해야 한다.

35. **미확정·미수신·참조 중인 파일은 시간만으로 보호를 해제하지 않는다.** 실제 미참조·미보호이면서 기존 정리 자격이 확인된 파일에만 기존 15분 유예를 적용하고, ACK·최종 해제·업로드 중 가장 늦은 시각에서 계산한다. 원래 정리 대상이 아니던 보관·legacy·프로필 파일을 새로 자동 삭제하지 않는다. 의도한 redaction도 owning codec·최종 commit으로 연결하며 owner guard를 우회하지 않는다. 보호가 오래 남으면 저장량·한도·비용 확인이 필요하므로 실제 활성화 전 점검 대상에 둔다.

36. **순환을 만드는 전체 기능 index 대신 필요한 순수 command-parser의 좁은 공개 entry를 선언한다.** 검증·broadcast·검색 도메인 행동은 원래 기능에 두고 기존 index export도 유지한다. 실제 경로만 canonical 규칙과 검사기에 명시하고 일반 deep import를 계속 거부하며, application port·app 합성 경계는 유지한다. 규칙 mirror는 정상 sync로 생성한다. module graph나 공개 범위가 잘못되면 구조·허용/거부 검사를 수정해야 한다.

37. **파일 receipt의 DB·bucket 이름은 실제 선택된 Wrangler 선언에서 명시적으로 공급한다.** `SITE_D1_DATABASE_NAME`·`SITE_ASSET_BUCKET_NAME`을 기존 site/resource·local 생성기 검사와 함께 소비하고, 누락·상대 사이트·선언 불일치를 거부한다. 이름 metadata가 운영 DB ID·실제 binding 관측을 대신하지 않는다. config·Env·타입·producer가 어긋나면 수용 전에 수정해야 한다.

38. **파일 삭제 claim과 최종 참조 검사를 같은 D1 권한 조건에 묶는다.** 참조 조회 뒤 R2 삭제까지 새 참조가 들어오는 경쟁을 막고, 미확정 삭제는 실제 관측으로 복구한다. 차단 대상은 해당 version·legacy object이며 다른 새 version·정상 작업을 사이트 전체 정지로 묶지 않는다. 기존 삭제 자격을 넓히지 않는다. claim·참조 조건이 틀리면 참조 중인 bytes 삭제나 잘못된 장기 차단을 막도록 수용 전에 수정해야 한다.

39. **정적 자산은 R2 upload-version 증거와 구분하여 실제 body로 검증한다.** 기존 `FileObservation`은 단일 bucket과 업로드 version을 요구하므로 static ETag나 존재 여부를 그 증거로 넣지 않는다. 최소 static availability 증거를 기존 최종 port에 연결하고 선택된 source·target artifact, site·resource·경로·hash·size와 승인 manifest·현재 포착 참조·transition·generation·fence를 확인한다. 가짜 upload intent·operation·actor는 만들지 않는다. 증거나 참조 조건이 틀리면 수용 전에 수정해야 하며 누락·stale·다른 자원·bytes 불일치는 활성화를 거부한다.

40. **전환 전에 정상 저장된 R2 파일도 가짜 접수 작업 없이 baseline 참조로 검증한다.** 기존 파일에는 transition operation이 없으므로 활성 전환의 `FileIntent`를 억지로 만들지 않는다. 기존 body verifier를 사용한 최소 committed-file receipt를 최종 availability port에 연결하고 승인된 baseline·manifest·포착 참조, exact transition·generation·fence, 각 bucket의 실제 업로드 version·hash·size를 확인한다. source·target 업로드 version의 동일성 대신 실제 bytes의 동일성을 확인한다. 승인된 과거 참조를 현재 행으로 바꾸거나 존재·metadata만으로 복사 완료 처리하지 않는다. receipt·참조 조건이 틀리면 수용 전에 수정해야 하며 기존 데이터·운영을 초기화하지 않는다.

41. **업로드 CLI의 import가 운영 작업을 실행한 사고는 즉시 중단·공개하고 안전한 entry 경계를 먼저 검증한다.** 테스트가 기존 최상위 원격 업로드를 실행했고 완료 6개·완료 여부 미확인 1개를 로컬 로그에서 확인했다. 추가 원격 조회·복구·삭제는 하지 않고 사용자에게 읽기 전용 영향 확인을 별도로 요청했다. 실제 subprocess를 실행하지 않는 import·잘못된 대상 회귀를 먼저 확인하며, 로컬 PASS로 운영 영향이나 원본 동일성을 판정하지 않는다. guard·caller·검증이 틀리면 추가 외부 변경을 막도록 수정해야 하고, 이미 발생한 운영 영향은 별도 확인·필요 조치가 남는다. 상세 범위는 [사고 기록](./operational-upload-incident.md)에 보존한다.

42. **공유 ASSETS storage의 보조 검사를 독립 사이트 binding 증거로 인정하지 않는다.** 설치된 Miniflare의 여러 asset directory가 첫 directory로 해석되는 제한을 발견해 기존 독립 binding 긍정 판정을 철회했다. prefix fixture는 body validator 보조 검사로만 남기고 별도 로컬 runtime마다 한 directory를 사용해 정상 `/profile`·signature 경로의 실제 body와 다른 artifact 거부를 검증한다. 제품 경로·권한을 fixture에 맞춰 바꾸지 않는다. 이 판단이 틀리면 실제 binding 분리·artifact 증거를 다시 확인해야 하며 운영 deployment 관측은 여전히 별도다.

43. **사용자가 허용한 사고 7개 경로의 현재 읽기는 사고 전 동일성·복구 권한으로 확대하지 않는다.** 정확히 7개 GET의 현재 크기·hash는 입력과 일치했고 마지막 파일의18:55:28 수정 기록도 확인했다. GET 응답에는 실제 R2 upload-version이 없어 ETag로 대신하지 않는다. 사고 전 파일·CDN cache·이용자 영향은 미확인으로 남긴다. 현재 값만으로 무해함이나 복구를 판정하면 잘못된 덮어쓰기·손실을 만들 수 있어 추가 운영 조사·조치는 별도로 검토해야 한다. 업로드·삭제·복구는 실행하지 않는다.

44. **공유 music metadata·source-health를 membership만으로 중지하지 않는다.** 실제 caller 조사에서는 source-health의 만료·삭제가 없었고 공유 metadata는 source의 비독점 dependency였다. 불필요한 두 selector를 제거하고 실제 expiry의 보호·최종 조건과 독점 이동 source의 재활성화 차단을 확인한다. 실행행은 source에, target에는 비실행 역사 자료로 남기는 기존 계약을 유지한다. 조사나 판정이 틀리면 누락된 보호 경계를 수정해야 하며 반대로 범위를 넓히면 무관한 정상 공유 작업이 멈출 수 있다.

45. **절대 자산 URL의 origin·bucket 권한은 승인 plan에 명시한다.** 기존 plan에는 bucket 이름만 있어 host를 제거한 path만으로 소유권을 판정할 수 없다. 최소 positive-parsed mapping으로 실제 제공된 site/static·bucket 또는 명시 external-only 처분을 구분하고 relative 참조는 origin 없이 지원한다. own source URL은 target의 승인 상대 경로로 투영하며 원본 봉인 image·expected state는 유지한다. 새 분류는 기존 parent-CAS·append-only 계보로 처리하고 누락은 인계 진행만 막으며 source 저장·수집은 유지한다. 도메인·별칭을 추측하거나 다른 host를 자동 own으로 만들지 않는다. 판정이 틀리면 manifest·parser·SQL·projector를 수용 전에 고쳐야 한다.

46. **정규화 참조 index는 원문·manifest 권한을 대신하지 않는 최소 파생 상태로 둔다.** inline·view 방식이 실제 D1 byte/depth 한도에서 실패해 `asset_file_reference_paths`를 재구축 가능한 검색 보조로 허용했다. 모든 producer의 같은 transaction에서 index→capture 순서를 명시하고 final 참조·claim·access·fence는 현재 원문과 같은 권한을 확인한다. origin·resource 의미를 잃거나 별도 trigger 순서를 가정하지 않는다. target에는 index를 business로 복사하지 않고 실제 재구축·stale/missing·race·scale·읽기/쓰기 비용을 검증한다. 새 미공유111 초안만 재생성하며 기존 applied 기록·봉인 image·private 원문을 유지한다. 잘못된 구조는 권한·정합성·비용을 수용 전에 수정해야 한다.

47. **기존 legacy cleanup 자격에도 실제 마지막 해제 시각을 영속 보존한다.** legacy notice thumbnail에는 관리 version의 `released_at`이 없어 오래된 upload 시각만으로 방금 해제한 파일을 정리할 수 있었다. 최소 `asset_file_retention_releases`를 파생 index와 분리하고 실제 owning reference·hold 해제 transaction에서 단조롭게 기록한다. 참조·보관·미확정 보호 중에는 시간만으로 해제하지 않으며 실제 미참조·미보호·기존 자격 뒤 가장 늦은 upload·최종 ACK·실제 해제에서15분을 계산한다. 동일값 retry·관측 heartbeat는 release 쓰기나 유예 초기화를 만들지 않는다. 기록 없는 과거 객체를 곧바로 적격으로 추정하거나 새 삭제 대상을 만들지 않는다. 판정이 틀리면 timestamp·자격·소비자를 수용 전에 고쳐야 하며 운영 보관량·한도·비용 확인도 남는다.

48. **이관 domain의 파일 분류는 좁은 port로 공급하고 owning validator를 유지한다.** 최종 architecture 검사에서 domain이 다른 capability의 `assets/commands`를 직접 import한 위반을 확인했다. content-transition 내부의 단일 `projectReference(raw)` port에 infrastructure가 승인 plan에 묶인 기존 classifier를 공급한다. 필요한 port가 없으면 원문 반환으로 우회하지 않고 거부하며 callback은 runtime 내부 문맥으로만 사용한다. validator 복제·이동이나 검사 예외를 늘리지 않는다. baseline·replay·origin 의미가 틀리면 adapter·호출자를 수용 전에 고쳐야 하며 wire·manifest에는 callback을 넣지 않는다.

49. **기존 파일은 baseline 전에 명시적으로 보호하고 승인된 inventory를 봉인한다.** 실제 `protect()`는 baseline 생성·scope·capture·seal을 한 D1 batch로 실행하며 이전 R2 목록·본문을 받는 지점이 없었다. 최소 prepared 단계의 별도 명시 arm/hold와 실제 owning raw 참조·정확한3명 prefix 목록·본문/hash/size/source version 관찰 port를 허용했다. 같은 protect transaction이 site/resource/UID/승인 revision·digest·현재 참조와 coverage를 검증해 baseline과 inventory를 함께 봉인하며 prepare/import는 암묵 arm하지 않는다. source 일반 작업과 무관한 멤버는 계속 동작한다. target은 원래 봉인 목록을 자기 실제 body/version으로 검증한다. 가짜 업로드·사후 목록 교체나 R2/D1 분산 원자성을 주장하지 않는다. 틀리면 hold·목록·race·계보를 수용 전에 고쳐야 하며 잘못된 광범위 hold의 정리 지연·비용도 평가해야 한다.

50. **관리자 절대URL은 신뢰된 같은 사이트 resolver로 보호 표현을 얻는다.** source raw·DTO·봉인 값을 유지하기 위해 기존 assets classifier/access 서비스가 선택 site의 제공된 origin 또는 실제 row에 묶인 승인 origin/resource를 해석하는 최소 resolver를 허용했다. verified-admin/site/resource 경계 뒤에만 D1·metadata에 접근하고 외부 fetch·redirect를 하지 않는다. Bearer는 자기 resolver·검증된 상대 Blob 경로에만 보내며 실제 external URL만 원래 img 의미를 유지한다. 미확정·다른 site/resource를 external로 우회하거나 미정 도메인·Host를 권위로 쓰지 않는다. 틀리면 토큰 노출·관리자 이미지 실패를 막도록 계약·소비자·분류를 수용 전에 수정해야 하며 새 요청 비용도 실제 운영 한도 점검 대상이다.

51. **파일 history 검증은 같은 D1 batch의 읽기 guard와 기존 exact CAS로 분리한다.** 실제7116byte history SELECT는 통과했지만 fence UPDATE와 합치거나 별도 NOT NULL assignment로 나눠도 SQLITE_NOMEM이었다. 최소 read-only guard SELECT 뒤 기존 UPDATE를 같은 batch에 두는 후보를 허용했다. 정확한 transition/site/generation/manifest·봉인 history를 검증하며 missing·NULL·0행이 성공으로 처리되면 안 된다. 기존 CAS·rowcount·readback과 conflict 진단을 유지하고 실패 때 fence·frozen sets·control 변경 전체 rollback을 실제 D1에서 확인해야 한다. 별도 선행 조회나 caller bool·관측 쓰기·조건 완화는 허용하지 않는다. 틀리면 transaction·guard·race·진단을 수용 전에 복구해야 하며 통과 전 해결됐다고 표시하지 않는다.

52. **초기 inventory 복사는 원래 seal로, 최종 가용성은 실제 fence로 검증한다.** 실제 port가 최종 fence context만 받아 초기 복사를 source 전환 뒤로 미루는 공백을 확인했다. target `openIngress`의 로컬 수신 준비 뒤 원래 seal·저장 baseline·승인 계보로 inactive baseline/file 복사와 live replay를 진행하고, 최신 compatible readiness를 source가 ACK한 뒤 fence하도록 기존 순서를 유지한다. prepared target의 business 권한을 넓히지 않으며 최종 파일 증거의 실제 fence 조건도 유지한다. 가짜 fence·조기 source ACK·현재 tail 전체 일치 barrier는 만들지 않는다. 틀리면 초기 복사·수신/소유권 구분·port 순서를 수용 전에 고쳐야 하며, 늦은 대량 복사로 무중단 인계가 지연될 위험도 검증해야 한다.

53. **일반 공지의 외부 이미지 표시는 전환 manifest에 의존하지 않는다.** 재검토에서 새 shared hook이 전환 밖 기존 공지와 새 공지 미리보기까지 manifest 없이는 숨기는 회귀를 확인했다. 기존 전체 기능 유지에 따라 정상 공지의 실제 row·draft 문맥을 신뢰된 owning 경계에서 확인하고 외부 HTTP(S) 이미지의 기존 표시 의미를 복원한다. 서버가 실제 notice ID·raw 관계와 draft의 기존 row·실제 member UID·편집 권한을 검증한다. 단지 세 UID에 포함된다는 이유로 전환이 없는 일반 공지를 막지 않으며, draft ID 생략·UID 축소로 실제 보호 raw 참조를 우회하거나 보관 공지에 편집 권한을 주지 않는다. 50번의 미확정·다른 site/resource 거부는 이동·보호·보관 대상에 유지하며 모든 resolver 오류를 external로 처리하지 않는다. Bearer는 자기 resolver·검증된 상대 Blob 경로에만 보내고 raw·봉인 값은 유지한다. 틀리면 일반 관리자 표시 회귀 또는 이동 파일의 권한 우회를 막도록 경계·호출자를 수용 전에 고쳐야 한다.

54. **기존 doctor의 미확정 실행 실패는 schema 증거와 구분하고 Task5에 연결한다.** 최종 doctor는 exit1이었으며 성공 줄만 읽은 최초 요약을 정정한다. 동일한 선택 config·persist의 실제5개 PRAGMA를 한 CLI로 실행해 exit0·필수 열 누락0을 확인했고, 양 사이트의 전체117개 적용과 실제 화면·D1/R2 검증도 별도 통과했다. 기존 doctor가 child 실패의 exit·signal·stderr 대신 stdout 배너만 보여 준 문제와 최초 child 실패의 원인은 별개다. 현재 수정에서 무관한 진단 개선을 추가하지 않고 예정된 Task5 도구 정비에 전달하며 전체 doctor gate는 미완료로 유지한다. 틀리면 실제 schema·도구 실패를 다음 작업 전에 바로잡아야 하며 진단 보완만으로 실행 성공을 주장할 수 없다.
