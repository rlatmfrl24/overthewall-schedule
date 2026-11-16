import { expect, it, vi } from "vitest";
import { readScheduleImage } from "./read-schedule-image";
import type { ScheduleImageBudget, ScheduleImageReader } from "./ports/schedule-image-reader";

const image = { bytes: new Uint8Array([1]), mediaType: "image/png", members: [] };
const signal = new AbortController().signal;
function setup() {
  const reader: ScheduleImageReader = { count: vi.fn().mockResolvedValue(3000), read: vi.fn().mockRejectedValue(new Error("timeout")) };
  const budget: ScheduleImageBudget = { reserve: vi.fn().mockResolvedValue("reservation"), start: vi.fn(), settle: vi.fn(), releaseUnstarted: vi.fn(), finishUnknown: vi.fn() };
  return { reader, budget };
}
it("retains_uncertain_cost_after_timeout and does_not_auto_switch_model_on_timeout", async () => {
  const { reader, budget } = setup();
  await expect(readScheduleImage(reader, budget, image, "user", signal)).rejects.toThrow("timeout");
  expect(reader.read).toHaveBeenCalledTimes(1);
  expect(budget.finishUnknown).toHaveBeenCalledWith("reservation");
  expect(budget.releaseUnstarted).not.toHaveBeenCalled();
});
it("denies_unapproved_paid_request_before_provider_call", async () => {
  const { reader, budget } = setup(); vi.mocked(budget.reserve).mockResolvedValue(null);
  await expect(readScheduleImage(reader, budget, image, "user", signal)).rejects.toMatchObject({ status: 429 });
  expect(reader.count).not.toHaveBeenCalled(); expect(reader.read).not.toHaveBeenCalled();
});
it("rejects excessive input before inference without consuming daily inference count", async () => {
  const { reader, budget } = setup(); vi.mocked(reader.count).mockResolvedValue(50001);
  await expect(readScheduleImage(reader, budget, image, "user", signal)).rejects.toThrow("입력량");
  expect(reader.read).not.toHaveBeenCalled(); expect(budget.start).not.toHaveBeenCalled();
  expect(budget.releaseUnstarted).toHaveBeenCalled();
});
