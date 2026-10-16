import {describe,expect,it} from "vitest";
import {assertD1Row,assertD1String} from "./d1-size-bounds";
describe("actual D1 encoded storage bounds",()=>{
  it("accepts a value above the discarded 1.5MB cap and counts UTF-8 plus stored row metadata",()=>{
    expect(()=>assertD1String("a".repeat(1_700_000))).not.toThrow();
    expect(()=>assertD1Row(["a".repeat(1_700_000),"identity",1])).not.toThrow();
    expect(()=>assertD1String("가".repeat(666_667))).toThrow(/2,000,000/);
    expect(()=>assertD1Row(["a".repeat(1_999_990),"identity",1])).toThrow(/row limit/);
  });
});
