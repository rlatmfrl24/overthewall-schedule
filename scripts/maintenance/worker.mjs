const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>점검 중 | OTW Schedule</title>
  <style>
    :root { color-scheme: light dark; --bg:#f8f6f4; --text:#292625; --muted:#706a67; --line:#e5ded9; --accent:#9d534b; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
    main { min-height:100svh; display:grid; place-items:center; padding:48px 24px; }
    article { width:min(100%,520px); }
    .brand { margin:0 0 72px; font-size:15px; font-weight:650; letter-spacing:.02em; }
    .brand span { color:var(--muted); font-weight:400; }
    .label { margin:0 0 20px; color:var(--accent); font-size:13px; font-weight:650; }
    h1 { margin:0; font-size:clamp(30px,6vw,42px); font-weight:650; letter-spacing:-.045em; line-height:1.4; word-break:keep-all; }
    .description { margin:24px 0 36px; color:var(--muted); font-size:16px; line-height:1.85; word-break:keep-all; }
    a { display:inline-flex; align-items:center; gap:16px; color:var(--text); text-decoration:none; border:1px solid var(--line); border-radius:8px; padding:13px 18px; font-size:14px; font-weight:600; }
    a:hover { border-color:var(--muted); }
    a:focus-visible { outline:3px solid var(--accent); outline-offset:5px; }
    footer { margin-top:72px; border-top:1px solid var(--line); padding-top:20px; font-size:12px; color:var(--muted); }
    @media (prefers-color-scheme:dark) { :root { --bg:#1a1817; --text:#f2ece7; --muted:#b0a59d; --line:#39332f; --accent:#dfa59b; } }
  </style>
</head>
<body>
  <main><article aria-labelledby="title">
    <p class="brand">OTW <span>Schedule</span></p>
    <p class="label">서비스 점검</p>
    <h1 id="title">잠시 점검 중입니다</h1>
    <p class="description">안정적인 서비스 제공을 위해 점검하고 있습니다.<br>잠시 후 다시 방문해 주세요.</p>
    <a href="/">다시 확인 <span aria-hidden="true">↗</span></a>
    <footer>이용에 불편을 드려 죄송합니다.</footer>
  </article></main>
</body>
</html>`;

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== "otw-schedule.info") return new Response(null, { status: 404 });
    const api = url.pathname.startsWith("/api/");
    return new Response(request.method === "HEAD" ? null : api
      ? JSON.stringify({ error: { code: "SITE_MAINTENANCE", message: "잠시 점검 중입니다. 잠시 후 다시 시도해 주세요." } })
      : html, {
      status: 503,
      headers: {
        "Content-Type": api ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Robots-Tag": "noindex",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      },
    });
  },
};
