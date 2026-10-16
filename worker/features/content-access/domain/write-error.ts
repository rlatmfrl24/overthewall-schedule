import type { SiteId } from "@contracts/site-definition";

export class ContentWriteError extends Error {
  readonly operationId = null;
  readonly code: "CONTENT_MOVED" | "CONTENT_CONFLICT";
  readonly targetSite: SiteId;
  constructor(code: "CONTENT_MOVED" | "CONTENT_CONFLICT", targetSite: SiteId) {
    super(code === "CONTENT_MOVED"
      ? "이 자료는 LuvDia Schedule로 이동했습니다. LuvDia에서 로그인한 뒤 편집해 주세요."
      : "내용이 변경되었습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.");
    this.code=code;this.targetSite=targetSite;
  }
}
