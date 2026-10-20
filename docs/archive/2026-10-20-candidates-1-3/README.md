# 후보01~03 완료 자료 아카이브

후보의 확인된 결함은 PR #176에서 수정·병합·양 사이트 운영 검증을 완료했다. [최신 검토 결과](../../architecture-review.md)와 [현재 작업](../../current-work.md)이 현재 판정을 소유한다. 아래 원문의 미커밋·로컬 전용·미배포·수정 제안 표기는 당시 기록이며 새 실행 지시가 아니다.

## 검토·구현 원문

| 자료 | 보관 경로 |
| --- | --- |
| 최초 구조 검토 및 당시 진행 상태 | [HTML](reviews/architecture-review-20261020-161008.html) |
| 후보02 결함 검토 | [원문](reviews/architecture-catalog-query-review-20261020.md) |
| 후보03 결함 검토 | [원문](reviews/architecture-scheduled-phases-review-20261020.md) |
| 후보01 저장·재시도 수정 | [기록](reports/2026-10-20-play-catalog-retry.md) |
| 후보02 조회 수정·읽기 비용 | [기록](reports/2026-10-20-play-catalog-query.md) |
| 후보03 단계·retry 수정 | [기록](reports/2026-10-20-scheduled-auto-update-retry.md) |

## 최종 운영 증거

- [PR #176 최종 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/176#issuecomment-6291519609)
- 카탈로그 저장·검색: [OTW](assets/otw-catalog.jpg), [LuvDia](assets/luvdia-catalog.jpg)
- 실제 Queue 실행 완료: [OTW15/15](assets/otw-production-pass.jpg), [LuvDia11/11](assets/luvdia-production-pass.jpg)
- D1 계측·중지 배너: [OTW](assets/otw-usage.jpg), [LuvDia](assets/luvdia-usage.jpg)
- [문서·화면 이동 manifest](manifest.json): 원래 경로·SHA-256·이동/복사 방식. 원문의 수정 전 사본과 비공개 가능 실행 로그·DB 응답은 아래 로컬 보관소에 별도 보존한다.

전체 로컬 보관소는 Git에서 제외한다. Graphify의 과거 작업 트리 그래프·추적과 완료된 임시 실행 자료를 보관하며 개별 파일 해시로 이동 무결성을 확인했다. 공개용 [manifest](manifest.json)는 저장소 상대 경로·현재 사본의 해시·수집 당시 해시를 구분한다. 민감할 수 있는 실행 JSON·환경 관련 자료를 Git 문서로 복사하지 않는다.

기존 보고서 경로에는 짧은 이동 안내를 남겨 이전 링크를 유지했다. 실행 중인 서버·Node runtime·의존성·환경 파일·Wrangler D1 상태·다른 작업 트리·미완료 제품 문서는 이동하지 않는다. 보관으로 검증 실패·미확인·미실행 제안을 완료 처리하지 않는다.

## 이동 확인

갱신 전 Graphify 묶음344파일과 완료 실행 자료173파일, 총517파일(128,770,411 bytes)을 이동·복사했고 각 SHA-256을 대조했다. 문서·최종 화면의 별도 보존21건은 manifest.json에 기록했다. 스크린샷 호환 사본과 로컬 DB는 원래 위치에도 남겼다. 임시 생성기·정적 추출 중간물·이번 검증 로그는 로컬 보관소의 documentation-update/에 별도 보관한다.
