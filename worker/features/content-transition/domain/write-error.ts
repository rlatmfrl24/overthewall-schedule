import type { SiteId } from "../../../../contracts/site-definition";

export class TransitionWriteError extends Error {
  readonly code:"CONTENT_MOVED"|"CONTENT_ACCEPTED"|"CONTENT_CONFLICT";
  readonly targetSite:SiteId;
  readonly operationId:string|null;
  constructor(code: "CONTENT_MOVED" | "CONTENT_ACCEPTED" | "CONTENT_CONFLICT", targetSite: SiteId, operationId: string | null = null) {
    super(code === "CONTENT_MOVED"
      ? "이 자료는 LuvDia Schedule로 이동했습니다. LuvDia에서 로그인한 뒤 편집해 주세요."
      : code==="CONTENT_CONFLICT"?"이 저장 요청과 기존 영수증이 일치하지 않습니다. 변경 내용을 확인해 주세요.":"저장 요청을 접수했습니다. 이관 처리 후 저장 결과를 확인해 주세요.");
    this.code=code;this.targetSite=targetSite;this.operationId=operationId;
  }
}
