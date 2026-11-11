// Isolated native Workflow test boundary: no request can reach the network.
// The production Worker, Workflow step, provider adapter and Queue consumer are
// compiled unchanged; only the task-owned provider responses are supplied here.
const calls: string[] = [];
const channel = "e".repeat(32);
let scenario = "";

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    if (url.origin === "https://fixture.invalid" && url.pathname === "/reset") {
      calls.length = 0;
      scenario = url.searchParams.get("scenario") ?? "";
      return new Response(null, { status: 204 });
    }
    if (url.origin === "https://fixture.invalid" && url.pathname === "/calls") {
      return Response.json(calls);
    }
    if(url.origin === "https://api.cloudflare.com" && request.method === "POST" && url.pathname === "/client/v4/graphql") return Response.json({data:{viewer:{accounts:[{usage:[{sum:{rowsRead:1000}}]}]}}});
    calls.push(`${request.method} ${url.href}`);
    if (request.method === "GET" && url.origin === "https://fxtwitter.com" && url.pathname === "/native_collect/feed.xml") {
      return new Response(`<rss version="2.0"><channel>${(scenario === "rss-shrink" ? [] : [501, 502, 503, 504, 505, 506]).map(id => `<item><guid>https://x.com/native_collect/status/${id}</guid><pubDate>${new Date().toUTCString()}</pubDate></item>`).join("")}</channel></rss>`);
    }
    if (request.method === "GET" && url.origin === "https://api.fxtwitter.com" && /^\/2\/status\/50[1-6]$/.test(url.pathname)) {
      const id = url.pathname.split("/").pop();
      return Response.json({ code: 200, status: { type: "status", id, text: `Native RSS ${id}`, created_at: new Date().toUTCString(), author: { id: "1000000000001", screen_name: "native_collect", protected: false }, media: {} } });
    }
    if (request.method === "GET" && url.origin === "https://api.fxtwitter.com" && url.pathname === "/2/profile/id:1000000000001/statuses") {
      const page = Number((url.searchParams.get("cursor") ?? "fx_0").split("_")[1]);
      return Response.json({ code: 200, results: [{ type: "status", id: scenario === "rss-shrink" ? "151" : "150", text: "Native Fx collection", created_at: new Date().toUTCString(), author: { id: "1000000000001", screen_name: "native_collect", protected: false }, media: {} }], cursor: { bottom: `fx_${page + 1}` } });
    }
    if (request.method === "GET" && url.origin === "https://api.x.com") {
      if (url.pathname === "/2/users/by") return Response.json({ data: [{ id: "1000000000001", username: "native_collect" }] });
      if (url.pathname === "/2/users/1000000000001/tweets") {
        const token = url.searchParams.get("pagination_token");
        const id = token === "native-page-2" ? "190" : "200";
        const since = url.searchParams.get("since_id"), until = url.searchParams.get("until_id");
        if ((since && BigInt(id) <= BigInt(since)) || (until && BigInt(id) >= BigInt(until))) return Response.json({ meta: { result_count: 0 } });
        return Response.json({
          data: [{ id, text: "Native collection", created_at: new Date().toISOString() }],
          meta: { newest_id: id, ...(scenario === "account-budget" && !token ? { next_token: "native-page-2" } : {}) },
        });
      }
      if (url.pathname === "/2/users/1000000000002/tweets") return Response.json({ data: [{ id: "300", text: "Independent peer", created_at: new Date().toISOString() }] });
    }
    if (request.method === "GET" && url.origin === "https://apis.naver.com" && url.pathname === "/cafe-web/cafe-boardlist-api/v1/cafes/98765432/menus/1/articles") {
      return Response.json({ result: { articleList: [{ type: "ARTICLE", item: {
        articleId: 200, cafeId: 98765432, menuId: 1, subject: "Native cafe", summary: "Native collector",
        writeDateTimestamp: Date.now(), commentCount: 0, readCount: 0, likeCount: 0, newArticle: true,
      } }] } });
    }
    if (request.method === "GET" && url.origin === "https://www.googleapis.com") {
      if (url.pathname === "/youtube/v3/playlistItems") return Response.json({ items: [{ snippet: {
        resourceId: { videoId: "NCadence001" }, publishedAt: new Date().toISOString(),
      } }] });
      if (url.pathname === "/youtube/v3/videos") return Response.json({ items: [{
        id: "NCadence001", snippet: { title: "Native short", publishedAt: new Date().toISOString() },
        contentDetails: { duration: "PT30S" }, statistics: { viewCount: "1" },
      }] });
    }
    if (request.method !== "GET" || url.origin !== "https://api.chzzk.naver.com") {
      return new Response("Unexpected native Workflow outbound request", { status: 500 });
    }
    if (url.pathname === `/service/v1/channels/${channel}/videos` &&
      url.search === "?sortType=LATEST&pagingType=PAGE&page=0&size=5") {
      return Response.json({ content: { data: [{
        videoId: "native-workflow-original", videoTitle: "Native Workflow candidate",
        publishDateAt: Date.now() - 86400000, duration: 3600, thumbnailImageUrl: null,
      }] } });
    }
    if (url.pathname === `/polling/v2/channels/${channel}/live-status`) {
      return Response.json({ code: 200, content: { status: "CLOSE", openDate: null } });
    }
    return new Response("Unexpected native Workflow provider path", { status: 500 });
  },
};
