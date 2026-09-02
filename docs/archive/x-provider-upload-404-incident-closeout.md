# X Compliance 공급자 장애 및 제거 Closeout

이 문서는 더 이상 활성 기능이나 운영 지침이 아니다. 2026-09-02에 폐기한 공급자
Batch Compliance 실험의 역사 기록이다.

- job create는 성공했지만 반환된 `api.x.com/2/compliance/jobs/{id}/upload`에 공식
  `PUT text/plain` 요청을 보내면 독립 job에서 반복해서 HTTP 404가 발생했다.
- 인증 유무, OPTIONS, hostname 대체와 resumable 생략을 확인했으나 upload 단계가
  성공하지 않았다.
- 운영 snapshot에는 실패 job 3, run 14, item/outbox 각 7, usage event 5,
  전용 일별 원장 2가 남아 있었다. 실행 가능한 item/outbox는 0이었다.
- 게시물 삭제·비공개 상태의 일괄 동기화보다 신규 피드와 영구 기록 안정성을 우선해
  기능을 재시도하지 않고 완전 제거하기로 결정했다.
- 이후 게시물 원문 제거는 관리자 단건 redaction만 사용한다.

재도입하려면 새 공급자 계약, 성공 가능한 endpoint, 비용·D1 영향, 전체 상태 전이
canary를 별도 제품 결정으로 다시 승인해야 한다. 이 문서를 구현 근거로 사용하지
않는다.
