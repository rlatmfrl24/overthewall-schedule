import type { XActivityStatusDto } from "@contracts/x-activity";
import type { OperationsIssueDto } from "@contracts/operations";
import { ApiError } from "@/shared/api/client";

const modes: Record<NonNullable<XActivityStatusDto["mode"]>, string> = {
  normal: "구독 정상", registering: "구독 등록 중", partial: "웹훅 일부 실패", budget_paused: "웹훅 예산 중지",
  user_paused: "웹훅 사용자 중지", site_paused: "웹훅 사이트 수집 중지", unavailable: "웹훅 연결·장부 확인 필요",
};
export function xActivityErrorMessage(value: unknown) {
  const code=value instanceof ApiError?value.code??value.message:value instanceof Error?value.message:String(value);
  const messages:Record<string,string>={
    budget_exceeded:"공통 예산이 부족합니다. 다음 UTC 날짜에 자동 재개합니다.",
    shared_budget_unavailable:"공통 예산을 확인할 수 없어 유료 조회를 중지했습니다.",
    x_activity_connection_unavailable:"사이트 간 연결 또는 서버 인증 설정을 확인해주세요.",
    x_activity_credentials_missing:"서버의 X API 인증·서명 키 설정을 확인해주세요.",
    x_collection_disabled:"기존 게시물 수집이 켜져 있고 사이트가 공개된 상태에서 적용할 수 있습니다.",
    x_activity_subscription_owned_elsewhere:"같은 계정에 다른 소유자의 구독이 있습니다. 해당 구독은 변경하지 않았습니다.",
    x_activity_user_unavailable:"X 계정을 확인하거나 현재 멤버와 연결할 수 없습니다.",
    x_activity_inventory_incomplete:"X의 전체 구독 목록을 확인하지 못해 등록·해지를 보류했습니다. 잠시 후 상태를 확인해주세요.",
    d1_budget_unavailable:"데이터베이스 예산을 확인할 수 없어 처리를 보류했습니다.",
    post_lookup_unavailable:"X에서 원문을 조회할 수 없습니다.",
    media_details_missing:"조회 결과에 미디어 표시 정보가 부족합니다.",
  };
  if(/^x_activity_provider_\d+$/.test(code))return "X 구독 API 응답 오류("+code.split("_").at(-1)+"). 권한·잔액·요청 한도를 확인해주세요.";
  return messages[code]??"요청을 완료하지 못했습니다. 상태를 새로고침해 실패한 대상을 확인해주세요.";
}
export function xActivityStateLabel(data: XActivityStatusDto) {
  if (!data.configured) return "웹훅 연결·인증 확인 필요";
  const mode = data.mode ?? "unavailable";
  return mode === "normal" && data.events.length === 0 ? "구독 정상 · 신규 수신 대기" : modes[mode];
}
export function xWebhookIssue(data: XActivityStatusDto | undefined, readFailed: boolean): OperationsIssueDto | null {
  if (readFailed || !data) return { code: "x_webhook_status_unavailable", severity: "warning", message: readFailed ? "현재 웹훅 상태를 조회하지 못했습니다. 이전 정보를 현재 정상으로 판단하지 마세요." : "현재 웹훅 상태를 확인하는 중입니다." };
  if (!data.configured || data.mode === "unavailable" || !data.mode) return { code: "x_webhook_unavailable", severity: "critical", message: xActivityStateLabel(data) };
  if (data.mode === "partial" || data.mode === "registering" || data.mode === "budget_paused") return { code: "x_webhook_attention", severity: "warning", message: xActivityStateLabel(data) };
  return null;
}
