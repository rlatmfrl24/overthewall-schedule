// Isolated native Workflow test boundary: no request can reach the network.
// The production Worker, Workflow step, provider adapter and Queue consumer are
// compiled unchanged; only the task-owned provider responses are supplied here.
const calls: string[] = [];
const channel = "e".repeat(32);

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    if (url.origin === "https://fixture.invalid" && url.pathname === "/reset") {
      calls.length = 0;
      return new Response(null, { status: 204 });
    }
    if (url.origin === "https://fixture.invalid" && url.pathname === "/calls") {
      return Response.json(calls);
    }
    if(url.origin === "https://api.cloudflare.com" && request.method === "POST" && url.pathname === "/client/v4/graphql") return Response.json({data:{viewer:{accounts:[{usage:[{sum:{rowsRead:1000}}]}]}}});
    calls.push(`${request.method} ${url.href}`);
    if (request.method === "GET" && url.origin === "https://api.x.com") {
      if (url.pathname === "/2/users/by") return Response.json({ data: [{ id: "native-collector-user", username: "native_collect" }] });
      if (url.pathname === "/2/users/native-collector-user/tweets") return Response.json({
        data: [{ id: "200", text: "Native collection", created_at: new Date().toISOString() }], meta: { newest_id: "200" },
      });
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
