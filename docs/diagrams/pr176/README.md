# Graphify · PR176 구조 스냅샷

[프로젝트 구조도](project-structure.html) · [군집 관계 탐색](graph.html) · [최종 검토](../../architecture-review.md) · [분석 보고서](GRAPH_REPORT.md) · [진단](GRAPH_HEALTH.md) · [입력 범위·해시](scope.json).

코드 기준 `b0818c0da5858b888aede8e3cbbf52ca488378f5`, 운영 관측은 **2026-10-20 22:03 KST**다. 이번 문서 PR의 HEAD나 현재 운영 상태와 혼동하지 않는다. 정적 분석은 코드·설정1,010개와 핵심 문서·Wrangler28개, 노드8,373개·관계28,655개다. 군집 HTML은272개 묶음을 표시하며 검색·선택·확대가 가능하다. Mermaid·vis-network CDN에는 인터넷 연결이 필요하다.

저장소 루트에서 `python -m http.server 8799 --bind 127.0.0.1`을 실행하고 `/docs/diagrams/pr176/project-structure.html`을 열면 문서와 화면 증거를 함께 볼 수 있다. GitHub의 HTML 소스 보기와 렌더된 HTML을 구분한다. 이 미리보기는 운영 API·자동화·AI를 호출하지 않는다.

전체 [graph.json.gz](graph.json.gz)와 방향·병렬 관계를 보존한 [extraction-evidence.json.gz](extraction-evidence.json.gz)는 Python 표준 라이브러리 `gzip`과 `json`으로 읽는다. 압축은 재현 가능한 mtime0으로 생성했다. [SOURCE_EVIDENCE.json](SOURCE_EVIDENCE.json)은 병합 소스의 실제 파일·행을 연결하고 [release-evidence.json](release-evidence.json)은 당시 Worker·run identity를 보존한다.

scope.json의 문서 hash는 10/20 수집 당시 미커밋 문서를 포함한다. 이후 문서 정리 HEAD의 hash라고 인증하지 않는다. 코드·문서의 정적 관계는 HTTP/Queue의 실행 성공을 증명하지 않는다. 미해결 참조212건·자기 참조23건·병렬 관계 병합12,141건과 YouTube TSX 부분 파싱1파일은 진단에 남겼다. 호스트 의미 추출 토큰은 미측정이고 외부 유료 AI 호출은0이다.

[아카이브 색인](../../archive/2026-10-20-candidates-1-3/README.md)에서 검토 원문과 운영 화면을 찾는다. 캐시·비공개 가능 운영 응답·개인 경로가 포함된 전체 로컬 manifest는 Git에서 제외한다.

군집 관계선은 **무방향 집계**다. 원래 호출 방향이나 실행 순서를 나타내지 않는다. 수동 구조도의 화살표는 별도의 소스·실행 근거를 따른다. scope의 수집 해시는 당시 파일 바이트(Windows CRLF 포함)이며 Git blob 해시와 다를 수 있다. 공개 archive manifest의 sha256·bytes는 Git에 저장되는 바이트(텍스트 LF)를 기준으로 하며 capturedSha256은 공개 준비 전 작업 사본의 체크섬이다. 첫 세 보고서는 아카이브 머리말·링크를 편집한 공개 준비 사본(Windows CRLF)이며 원본 소스 커밋의 해시가 아니다. 원본 출처는 별도 로컬 아카이브 manifest에 보존한다.
