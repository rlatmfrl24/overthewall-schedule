import type { SitePublicationStatus } from "@contracts/site-publication";
import gsapUrl from "gsap/dist/gsap.min.js?url";

/** Public entry stays independent of Clerk and the application bundle. */
export function renderSiteCountdown(status: SitePublicationStatus): string {
  const held = status.phase === "held";
  const seconds = Math.max(0, Math.ceil((Date.parse(status.opensAt) - Date.parse(status.serverNow)) / 1000));
  const values = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  const units = ["일", "시간", "분", "초"];
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark">
<meta name="description" content="러브다이아의 방송 일정과 소식을 한곳에서. 2026년 10월 19일, LuvDia Schedule에서 만나요.">
<title>곧 만나요 | LuvDia Schedule</title>
<link rel="preload" href="/launch/outfit-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/launch/luvdia-members-silhouette.webp" as="image">
<link rel="stylesheet" href="/launch/countdown.css">
<style>body{margin:0}</style>
<script src="${gsapUrl}" defer></script>
</head><body><main class="launch-page"><div class="launch-frame">
<header class="launch-nav"><div class="launch-brand"><img src="/logo_luvdia.webp" alt="러브다이아" width="85" height="43"><span>LuvDia Schedule</span></div><span class="launch-nav-date">2026.10.19 OPEN</span></header>
<section class="launch-hero" aria-labelledby="launch-title">
<div class="launch-copy"><p class="launch-eyebrow">러브다이아를 만나는 새로운 공간</p>
<h1 class="launch-title" id="launch-title"><span>러브다이아의 매일을,</span><span class="launch-emphasis">조금 더 가까이.</span></h1>
<p class="launch-description">방송 일정부터 새로운 소식까지.<br>좋아하는 순간들을 한곳에서 만나요.</p>
<div id="clock" class="launch-clock" role="timer" aria-live="off" aria-label="공개까지 ${values.map((value, i) => `${value}${units[i]}`).join(" ")}"${held ? " hidden" : ""}>
${values.map((value, i) => `<div class="launch-unit" aria-hidden="true"><span class="launch-number-window"><strong class="launch-number">${String(value).padStart(2, "0")}</strong></span><span class="launch-unit-label">${units[i]}</span></div>`).join("")}
</div>
<p class="launch-held" id="held"${held ? "" : " hidden"}>공개 준비를 마무리하고 있습니다.</p>
<p class="launch-opening"><time datetime="2026-10-19T00:00:00+09:00">2026년 10월 19일 오전 0시 공개</time><span class="launch-timezone">한국 시간 기준</span></p>
<p class="launch-error" id="error" hidden role="status">공개 상태를 확인하지 못했습니다. <button id="retry">다시 확인</button></p>
</div>
<figure class="launch-art"><img src="/launch/luvdia-members-silhouette.webp" alt="빙하유, 유리리, 양메이의 합동 실루엣" width="1200" height="900" fetchpriority="high"></figure>
</section>
<footer class="launch-footer"><div class="launch-footer-brand"><strong>LuvDia Schedule</strong><span>비공식 팬 운영 서비스</span></div><a class="launch-admin" href="/admin/operations">관리자 로그인</a></footer>
</div></main><script>
  let state=${JSON.stringify(status)}, received=performance.now(), checking=false, retryAt=0;
  const clock=document.getElementById('clock'), held=document.getElementById('held'), error=document.getElementById('error');
  const digits=Array.from(clock.querySelectorAll('.launch-number')), units=['일','시간','분','초'];
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  async function check(){if(checking)return;checking=true;try{const r=await fetch('/api/publication-status',{cache:'no-store',credentials:'omit'});if(!r.ok)throw Error();state=await r.json();received=performance.now();error.hidden=true;if(state.phase==='open'){location.replace('/');return;}}catch{error.hidden=false;}finally{checking=false;retryAt=performance.now()+30000;render();}}
  function render(){
    const seconds=Math.max(0,Math.ceil((Date.parse(state.opensAt)-Date.parse(state.serverNow)-(performance.now()-received))/1000));
    clock.hidden=state.phase==='held';held.hidden=state.phase!=='held';
    const values=[Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60];
    clock.setAttribute('aria-label','공개까지 '+values.map((value,i)=>value+units[i]).join(' '));
    digits.forEach((digit,i)=>{const next=String(values[i]).padStart(2,'0');if(digit.textContent===next)return;digit.textContent=next;if(!clock.hidden&&!document.hidden&&!reducedMotion.matches&&window.gsap)window.gsap.fromTo(digit,{yPercent:-35,opacity:0},{yPercent:0,opacity:1,duration:.42,ease:'power3.out',overwrite:true});});
    if((!seconds||state.phase==='held')&&performance.now()>=retryAt)void check();
  }
  document.addEventListener('DOMContentLoaded',()=>{if(!window.gsap)return;const media=window.gsap.matchMedia();media.add('(prefers-reduced-motion: no-preference)',()=>{window.gsap.fromTo('.launch-copy',{y:16,opacity:0},{y:0,opacity:1,duration:.7,ease:'power3.out'});window.gsap.fromTo('.launch-art',{scale:.95,opacity:0},{scale:1,opacity:1,duration:.9,ease:'power3.out',delay:.12});});});
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches&&window.gsap){window.gsap.killTweensOf(digits);window.gsap.set(digits,{clearProps:'transform,opacity'});}});
  document.getElementById('retry').addEventListener('click',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});render();setInterval(render,1000);
  </script></body></html>`;
}
