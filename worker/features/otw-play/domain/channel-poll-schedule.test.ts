import { describe, expect, it } from "vitest";
import { nextChannelPollAt } from "./channel-poll-schedule";
describe("hourly channel polling", () => {
  it("does not miss the next cron slot when completion follows dispatch", () => {
    expect(nextChannelPollAt(Date.UTC(2026, 8, 9, 1, 23, 10)))
      .toBe(Date.UTC(2026, 8, 9, 2, 23));
  });
  it("schedules a manual poll for the next slot across midnight", () => {
    expect(nextChannelPollAt(Date.UTC(2026, 8, 9, 23, 59)))
      .toBe(Date.UTC(2026, 8, 10, 0, 23));
    expect(nextChannelPollAt(Date.UTC(2026, 8, 9, 1, 22, 59)))
      .toBe(Date.UTC(2026, 8, 9, 1, 23));
  });
});
