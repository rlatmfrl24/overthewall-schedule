import { expect, it } from "vitest";
import { getSitePublication } from "@contracts/site-publication";
import { renderSiteCountdown } from "./site-countdown";

it("includes readable remaining time before JavaScript or animation assets load", () => {
  const html = renderSiteCountdown(getSitePublication("luvdia", Date.parse("2026-10-17T14:59:59Z"), false));
  expect(html).toContain('aria-label="공개까지 1일 0시간 0분 1초"');
  expect(html).toContain('role="timer" aria-live="off"');
  expect(html).not.toContain("공개 일정 저장");
  expect(html).not.toContain("calendar");
  expect(html).toContain('src="/launch/luvdia-members-silhouette.webp" alt="빙하유, 유리리, 양메이의 합동 실루엣"');
  expect(html).toContain('class="launch-number">01</strong>');
});

it("hides the timer at an operational hold, including before JavaScript", () => {
  const html = renderSiteCountdown(getSitePublication("luvdia", Date.parse("2026-10-19T00:00:00Z"), true));
  expect(html).toMatch(/role="timer"[^>]+ hidden>/);
  expect(html).not.toContain("공개 일정 저장");
  expect(html).toContain('id="held">공개 준비를 마무리하고 있습니다.');
});
