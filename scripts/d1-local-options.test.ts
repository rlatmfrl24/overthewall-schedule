import { describe, expect, it } from "vitest";
import { resolveLocalD1Options } from "./d1-local-options.mjs";

describe("selected local D1 target", () => {
  it("shares dev persistence and canonical config for both sites", () => {
    expect(resolveLocalD1Options(["--site=luvdia"], {})).toMatchObject({ siteId: "luvdia", configPath: "wrangler.luvdia.jsonc", persistTo: ".wrangler/state/luvdia" });
    expect(resolveLocalD1Options(["--site=otw"], {})).toMatchObject({ siteId: "otw", configPath: "wrangler.jsonc", persistTo: ".wrangler/state/otw" });
    expect(resolveLocalD1Options(["--site=luvdia", "--persist-to=C:/isolated"], {}).persistTo).toBe("C:/isolated");
    expect(() => resolveLocalD1Options([], {})).toThrow(/--site/);
    expect(() => resolveLocalD1Options(["--site=luvdia", "--persist-to=.wrangler/state/otw"], {})).toThrow(/different persistence/);
  });
  it.runIf(process.platform === "win32")("rejects a case-alias CLI override before D1/reset", () => {
    expect(() => resolveLocalD1Options(["--site=luvdia", "--persist-to=.wrangler/state/OTW"], {})).toThrow(/persistence/);
  });
  it.each([
    [{ OTW_D1_PERSIST_TO: ".tmp/otw-state/v3/d1/child", LUVDIA_D1_PERSIST_TO: ".tmp/luvdia-state" }, ".tmp/otw-state"],
    [{ OTW_D1_PERSIST_TO: ".tmp/otw-state", LUVDIA_D1_PERSIST_TO: ".tmp/luvdia-state" }, ".tmp/otw-state/v3/d1/child"],
    [{ OTW_D1_PERSIST_TO: ".wrangler/state/v3/d1/otw-local", LUVDIA_D1_PERSIST_TO: ".tmp/luvdia-state" }, ".wrangler/state"],
  ])("rejects ancestor/descendant CLI overrides", (environment, persistTo) => {
    expect(() => resolveLocalD1Options(["--site=luvdia", `--persist-to=${persistTo}`], environment)).toThrow(/legacy|persistence/);
  });
  it("rejects overlapping configured roots even when the CLI override is disjoint", () => {
    expect(() => resolveLocalD1Options(["--site=luvdia", "--persist-to=.tmp/separate"], { OTW_D1_PERSIST_TO: ".tmp/state", LUVDIA_D1_PERSIST_TO: ".tmp/state/child" })).toThrow(/persistence/);
  });
});
