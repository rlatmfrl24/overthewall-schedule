import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";

function CountdownNumber({ value }: { value: number }) {
  const ref = useRef<HTMLElement>(null);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (document.documentElement.dataset.animations === "disabled") return;
      gsap.fromTo(ref.current, { yPercent: -35, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .42, ease: "power3.out" });
    });
    return () => media.revert();
  }, [value]);
  return <span className="launch-number-window"><strong className="launch-number" ref={ref}>{String(value).padStart(2, "0")}</strong></span>;
}

export function SiteCountdown({ phase, remainingMs }: { phase: "countdown" | "held"; remainingMs: number }) {
  const root = useRef<HTMLElement>(null);
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const values = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  const units = ["일", "시간", "분", "초"];
  const held = phase === "held";
  useEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (document.documentElement.dataset.animations === "disabled") return;
      gsap.fromTo(".launch-copy", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .7, ease: "power3.out" });
      gsap.fromTo(".launch-art", { scale: .95, opacity: 0 }, { scale: 1, opacity: 1, duration: .9, ease: "power3.out", delay: .12 });
    }, root);
    return () => media.revert();
  }, []);
  return (
    <main className="launch-page" ref={root}>
      <link rel="stylesheet" href="/launch/countdown.css" />
      <div className="launch-frame">
        <header className="launch-nav">
          <div className="launch-brand"><img src="/logo_luvdia.webp" alt="러브다이아" width="85" height="43" /><span>LuvDia Schedule</span></div>
          <span className="launch-nav-date">2026.10.19 OPEN</span>
        </header>
        <section className="launch-hero" aria-labelledby="launch-title">
          <div className="launch-copy">
            <p className="launch-eyebrow">러브다이아를 만나는 새로운 공간</p>
            <h1 className="launch-title" id="launch-title"><span>러브다이아의 매일을,</span><span className="launch-emphasis">조금 더 가까이.</span></h1>
            <p className="launch-description">방송 일정부터 새로운 소식까지.<br />좋아하는 순간들을 한곳에서 만나요.</p>
            {held ? <p className="launch-held">공개 준비를 마무리하고 있습니다.</p> : <div className="launch-clock" role="timer" aria-live="off" aria-label={`공개까지 ${values.map((value, i) => `${value}${units[i]}`).join(" ")}`}>
              {values.map((value, i) => <div className="launch-unit" key={units[i]} aria-hidden="true"><CountdownNumber value={value} /><span className="launch-unit-label">{units[i]}</span></div>)}
            </div>}
            <p className="launch-opening"><time dateTime="2026-10-19T00:00:00+09:00">2026년 10월 19일 오전 0시 공개</time><span className="launch-timezone">한국 시간 기준</span></p>
          </div>
          <figure className="launch-art"><img src="/launch/luvdia-members-silhouette.webp" alt="빙하유, 유리리, 양메이의 합동 실루엣" width="1200" height="900" fetchPriority="high" /></figure>
        </section>
        <footer className="launch-footer">
          <div className="launch-footer-brand"><strong>LuvDia Schedule</strong><span>비공식 팬 운영 서비스</span></div>
          <SignedOut><SignInButton mode="modal"><button className="launch-admin">관리자 로그인</button></SignInButton></SignedOut>
          <SignedIn><span>공개 전에는 관리자만 이용할 수 있습니다.</span></SignedIn>
        </footer>
      </div>
    </main>
  );
}
