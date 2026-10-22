import { useId, useState } from "react";
import { SignInButton } from "@clerk/clerk-react";
import { MAX_SAVED_MULTIVIEW_CHANNELS } from "@contracts/multiview";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { usePersonalMultiview } from "../queries/use-personal-multiview";

export function PersonalChannelManager({ personal }: { personal: ReturnType<typeof usePersonalMultiview> }) {
  const [input, setInput] = useState("");
  const inputId = useId();
  if (!personal.isLoaded) return <section aria-label="내 채널" role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">로그인 상태를 확인하고 있어요.</section>;
  if (!personal.isSignedIn) return <section aria-label="내 채널" className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm">
    <p className="mr-auto text-muted-foreground">로그인하면 원하는 치지직 채널을 저장할 수 있어요.</p>
    <SignInButton mode="modal" forceRedirectUrl={typeof window === "undefined" ? "/multiview" : window.location.href}><Button variant="outline" className="min-h-11">로그인</Button></SignInButton>
  </section>;
  const unavailable = personal.loading || Boolean(personal.listError);
  const message = personal.addError?.message ?? (personal.channels.length >= MAX_SAVED_MULTIVIEW_CHANNELS ? "채널은 사이트별로 최대 30개까지 저장할 수 있어요. 기존 채널을 삭제한 뒤 추가해 주세요." : null);
  return <section aria-label="내 채널" className="space-y-3 rounded-xl border p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">내 채널</h2>{!unavailable ? <span role="status" className="text-sm text-muted-foreground">저장 {personal.channels.length}/{MAX_SAVED_MULTIVIEW_CHANNELS}</span> : null}</div>
    {personal.loading ? <p role="status" className="text-sm text-muted-foreground">저장 목록을 불러오고 있어요.</p> : null}
    {personal.listError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><p>저장 목록을 불러오지 못했어요.</p><Button variant="outline" size="sm" onClick={() => { void personal.reload(); }}>목록 다시 불러오기</Button></div> : null}
    {!unavailable ? <form className="flex flex-wrap items-end gap-2" onSubmit={async event => { event.preventDefault(); try { await personal.add(input); setInput(""); } catch { /* Keep the input beside the request error. */ } }}>
      <div className="min-w-0 flex-1 basis-64 space-y-2"><Label htmlFor={inputId}>치지직 채널 주소 또는 ID</Label><Input id={inputId} value={input} onChange={event => setInput(event.target.value)} placeholder="https://chzzk.naver.com/…" maxLength={2048} required disabled={personal.addPending || unavailable} className="min-h-11" aria-describedby={message ? `${inputId}-message` : undefined} /></div>
      <Button type="submit" className="min-h-11" disabled={personal.addPending || unavailable || !input.trim()}>{personal.addPending ? "추가 중…" : "추가"}</Button>
    </form> : null}
    {message ? <p id={`${inputId}-message`} role={personal.addError ? "alert" : "status"} className="text-sm text-muted-foreground">{message}</p> : null}
    {personal.deleteError ? <p role="alert" className="text-sm text-destructive">{personal.deleteError.message}</p> : null}
    <p className="text-xs text-muted-foreground">이 사이트에 저장한 채널은 아래에서 멤버와 함께 선택할 수 있어요. 저장 목록에서 삭제해도 현재 시청 선택은 유지됩니다.</p>
  </section>;
}
