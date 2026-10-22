import { useId, useState } from "react";
import { SignInButton } from "@clerk/clerk-react";
import { Plus } from "lucide-react";
import { MAX_SAVED_MULTIVIEW_CHANNELS } from "@contracts/multiview";
import { site } from "@/shared/config/site";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { usePersonalMultiview } from "../queries/use-personal-multiview";

export function PersonalChannelManager({ personal, returnUrl = "/multiview" }: { personal: ReturnType<typeof usePersonalMultiview>; returnUrl?: string }) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputId = useId();
  const unavailable = personal.loading || Boolean(personal.listError);
  const message = personal.addError?.message ?? (personal.channels.length >= MAX_SAVED_MULTIVIEW_CHANNELS ? "채널은 사이트별로 최대 30개까지 저장할 수 있어요. 기존 채널을 삭제한 뒤 추가해 주세요." : null);
  const listFeedback = <>
    {personal.loading ? <p role="status" className="text-sm text-muted-foreground">저장 목록을 불러오고 있어요.</p> : null}
    {personal.listError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><p>저장 목록을 불러오지 못했어요.</p><Button variant="outline" size="sm" className="min-h-11" onClick={() => { void personal.reload(); }}>목록 다시 불러오기</Button></div> : null}
  </>;

  return <section aria-label="신규 채널 추가하기" className="space-y-3">
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (next) setSaved(false); }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">찾는 방송이 목록에 없나요?</p>
          <p className="text-sm leading-relaxed text-muted-foreground">목록에 없는 치지직 방송도 추가하고, 다음 방문에 다시 선택할 수 있어요.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <DialogTrigger asChild><Button variant="outline" className="min-h-11 w-full sm:w-auto"><Plus aria-hidden="true" />신규 채널 추가하기</Button></DialogTrigger>
          {personal.isSignedIn && !unavailable ? <span role="status" className="text-xs text-muted-foreground">저장 {personal.channels.length}/{MAX_SAVED_MULTIVIEW_CHANNELS}</span> : null}
        </div>
      </div>
      <DialogContent closeLabel="닫기" className="text-foreground [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:size-11">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="leading-snug">신규 채널 추가하기</DialogTitle>
          <DialogDescription className="leading-relaxed">현재 {site.siteName} 멀티뷰 목록에 없는 치지직 방송도 추가할 수 있어요. 이 사이트에 저장해 두면 다음 방문에도 다시 선택할 수 있습니다.</DialogDescription>
        </DialogHeader>
        {!personal.isLoaded ? <p role="status" className="text-sm text-muted-foreground">로그인 상태를 확인하고 있어요.</p> : !personal.isSignedIn ? <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">로그인하면 이 사이트에서 최대 30개 채널을 저장할 수 있어요. 기존 멤버는 로그인 없이 계속 선택할 수 있습니다.</p>
          <SignInButton mode="modal" forceRedirectUrl={returnUrl}><Button className="min-h-11 w-full" onClick={() => setOpen(false)}>로그인</Button></SignInButton>
        </div> : <>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>이 사이트의 내 계정에 저장</span>{!unavailable ? <span>저장 {personal.channels.length}/{MAX_SAVED_MULTIVIEW_CHANNELS}</span> : null}</div>
          {listFeedback}
          {!unavailable ? <form className="space-y-5" onSubmit={async event => {
            event.preventDefault();
            try { await personal.add(input); setInput(""); setSaved(true); setOpen(false); }
            catch { /* Keep failed input in the dialog for retry. */ }
          }}>
            <div className="space-y-2"><Label htmlFor={inputId}>치지직 채널 주소 또는 ID</Label><Input id={inputId} value={input} onChange={event => setInput(event.target.value)} placeholder="https://chzzk.naver.com/…" maxLength={2048} required disabled={personal.addPending} className="min-h-11" aria-describedby={`${inputId}-help${message ? ` ${inputId}-message` : ""}`} /><p id={`${inputId}-help`} className="text-xs leading-relaxed text-muted-foreground">저장한 채널은 멤버 목록에 함께 표시됩니다. 최대 8개까지 선택해 시청할 수 있어요.</p></div>
            {message ? <p id={`${inputId}-message`} role={personal.addError ? "alert" : "status"} className="text-sm text-muted-foreground">{message}</p> : null}
            <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>취소</Button><Button type="submit" className="min-h-11" disabled={personal.addPending || !input.trim()}>{personal.addPending ? "저장 중…" : "추가하고 저장"}</Button></DialogFooter>
          </form> : null}
        </>}
      </DialogContent>
    </Dialog>
    {!open ? <>{listFeedback}{personal.addError ? <p role="alert" className="text-sm text-destructive">{personal.addError.message}</p> : saved ? <p role="status" className="text-sm text-muted-foreground">채널을 저장했어요. 아래 목록에서 선택해 주세요.</p> : null}</> : null}
    {personal.deleteError ? <p role="alert" className="text-sm text-destructive">{personal.deleteError.message}</p> : null}
  </section>;
}
