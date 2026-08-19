import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("private query keys", () => {
  it("isolates OTW Play member submissions by signed-in user", () => {
    expect(queryKeys.otwPlay.memberSubmissions("user-a"))
      .not.toEqual(queryKeys.otwPlay.memberSubmissions("user-b"));
    expect(queryKeys.otwPlay.memberSubmission("user-a", "proposal-1"))
      .not.toEqual(queryKeys.otwPlay.memberSubmission("user-b", "proposal-1"));
  });
});
