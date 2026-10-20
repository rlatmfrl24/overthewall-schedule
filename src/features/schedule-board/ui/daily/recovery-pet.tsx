import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Rabbit, X } from "lucide-react";
import type { SiteId } from "@contracts/site-definition";
import { SCHEDULE_MEMBER_END } from "@contracts/schedule-member-policy";
import { useAnimations } from "@/shared/ui/animation-provider";
import { Button } from "@/shared/ui/button";
import {
  getRecoveryPetDays,
  msUntilNextRecoveryPetDay,
  RECOVERY_PET_SCENES,
  RECOVERY_PET_SCENE_MS,
} from "../../model/recovery-pet";

export function RecoveryPet({ siteId, isAdmin = false }: { siteId: SiteId; isAdmin?: boolean }) {
  const [now, setNow] = useState(Date.now);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  const { enabled } = useAnimations();
  const days = getRecoveryPetDays(siteId, now);
  const visible = siteId === SCHEDULE_MEMBER_END.siteId && (isAdmin || days !== null);
  const animate = visible && enabled && !collapsed;

  // Only a user toggle moves focus; the pet's first appearance must not steal it.
  useLayoutEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    toggleButton.current?.focus();
  }, [collapsed]);

  const toggleCollapsed = () => {
    focusAfterToggle.current = true;
    setCollapsed(value => !value);
  };

  useEffect(() => {
    if (siteId !== SCHEDULE_MEMBER_END.siteId) return;
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, msUntilNextRecoveryPetDay(Date.now()));
    };
    const refresh = () => { setNow(Date.now()); schedule(); };
    schedule();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [siteId]);

  useEffect(() => {
    if (!animate) return;
    const timer = window.setInterval(() => {
      setSceneIndex(index => (index + 1) % RECOVERY_PET_SCENES.length);
    }, RECOVERY_PET_SCENE_MS);
    return () => window.clearInterval(timer);
  }, [animate]);

  if (!visible) return null;

  const counter = days === null ? "관리자 미리보기" : `D+${days}`;

  const scene = RECOVERY_PET_SCENES[sceneIndex];
  const [left, top, right, bottom] = scene.bounds;
  const scale = 100 / (bottom - top);
  const source = `/images/luvdia/bing-hayu-pet-v3/${scene.id}${animate ? "" : "-still"}.webp`;

  return (
    <aside
      aria-label="빙하유 응원 펫"
      data-recovery-pet-expanded={!collapsed}
      className="pointer-events-none absolute right-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 w-40 print:hidden sm:right-5 sm:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]"
    >
      {collapsed ? (
        <Button ref={toggleButton} type="button" variant="outline" size="sm" className="pointer-events-auto float-right rounded-full bg-background/95 shadow-sm" aria-label="빙하유 펫 펼치기" onClick={toggleCollapsed}>
          <Rabbit aria-hidden="true" /> {days === null ? "미리보기" : counter}
        </Button>
      ) : (
        <figure className="m-0 grid grid-cols-[1fr_auto_1fr]">
          <Button ref={toggleButton} type="button" variant="ghost" size="icon-sm" className="pointer-events-auto z-10 col-start-2 row-start-1 self-start justify-self-end rounded-full bg-background/90" aria-label="빙하유 펫 접기" onClick={toggleCollapsed}>
            <X aria-hidden="true" />
          </Button>
          <div className="relative col-span-full row-start-1 h-28 w-40 overflow-hidden">
            <img
              src={source}
              alt={`빙하유 · ${scene.title}`}
              width={288}
              height={288}
              draggable={false}
              decoding="async"
              style={{
                position: "absolute", maxWidth: "none", width: 1254 * scale, height: 1254 * scale,
                left: 80 - (left + right) * scale / 2, top: 108 - bottom * scale,
              }}
            />
          </div>
          <figcaption className="col-start-2 row-start-2 rounded-xl border border-border/60 bg-background/95 px-2.5 py-1.5 text-center text-[11px] leading-4 font-medium whitespace-nowrap text-foreground shadow-sm">
            빙하유는 건강 회복 중!
            <span className="block text-sm font-semibold text-primary tabular-nums" aria-label={days === null ? "관리자 미리보기: 11월 16일부터 일반 공개" : `활동 종료 이후 ${days}일`}>{counter}</span>
          </figcaption>
        </figure>
      )}
    </aside>
  );
}
