import { describe, expect, it } from "vitest";
import { parsePersonalMultiviewChannelInput } from "./multiview";

const id = "0123456789abcdef0123456789abcdef";
describe("personal multiview channel input", () => {
  it.each([id.toUpperCase(), ` https://chzzk.naver.com/${id} `, `https://chzzk.naver.com/live/${id}/?x=1#chat`, `https://chzzk.naver.com:443/channel/${id}`])("normalizes a supported channel: %s", value => {
    expect(parsePersonalMultiviewChannelInput(value)).toBe(id);
  });
  it.each([null, {}, "", "abc", "f".repeat(33), `http://chzzk.naver.com/${id}`, `https://chzzk.naver.com.evil.test/${id}`, `https://user@chzzk.naver.com/${id}`, `https://chzzk.naver.com:8443/${id}`, `https://chzzk.naver.com/${id}/extra`, `https://chzzk.naver.com/${id}?x=${"a".repeat(2048)}`, `https://chzzk.naver.com//${id}`])("rejects unsafe or unsupported input: %s", value => {
    expect(parsePersonalMultiviewChannelInput(value)).toBeNull();
  });
});
