import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./worker.mjs";

test("all OTW pages use the maintenance response without any origin or database access", async () => {
  for (const path of ["/", "/members/bing_hayu", "/admin/operations", "/profile/example.webp", "/feed/"]) {
    const response = await worker.fetch(new Request(`https://otw-schedule.info${path}`));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Retry-After"), "300");
    const body = await response.text();
    assert.match(body, /잠시 점검 중입니다/);
    assert.doesNotMatch(body, /<script|<link|<img|<iframe/);
  }
});

test("API writes fail explicitly, HEAD is empty, and another site is never intercepted", async () => {
  const response = await worker.fetch(new Request("https://otw-schedule.info/api/schedules", { method: "POST" }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SITE_MAINTENANCE");
  const head = await worker.fetch(new Request("https://otw-schedule.info/", { method: "HEAD" }));
  assert.equal(head.status, 503);
  assert.equal(await head.text(), "");
  assert.equal((await worker.fetch(new Request("https://luvdia-schedule.info/"))).status, 404);
});
