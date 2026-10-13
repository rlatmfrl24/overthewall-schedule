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
});
