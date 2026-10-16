// Isolated native Workflow test boundary: no request can reach the network.
// The production Worker, Workflow step, provider adapter and Queue consumer are
// compiled unchanged; only these two external GET responses are supplied here.
const calls: string[] = [];
const channel = "e".repeat(32);

export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    if (url.origin === "https://fixture.invalid" && url.pathname === "/calls") {
      return Response.json(calls);
    }
    calls.push(`${request.method} ${url.href}`);
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
