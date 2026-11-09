import { expect, it, vi } from "vitest";
import { approveSelectedPendingSchedules } from "./pending-schedules";
const apiFetchMock = vi.hoisted(()=>vi.fn());
vi.mock("@/shared/api/client",()=>({apiFetch:apiFetchMock}));

it("sends per-candidate edits in one existing approval request", async () => {
  apiFetchMock.mockResolvedValue({success:true,results:[]});
  const optionsById = {"1":{applyMode:"title" as const,targetMode:"create" as const,timeMode:"nearest_half_hour" as const,changes:{title:"수정 제목"}}};
  await approveSelectedPendingSchedules([1],optionsById);
  expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions",{method:"POST",json:{action:"approve",ids:[1],optionsById}});
});
