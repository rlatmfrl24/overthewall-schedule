export default {
  async fetch(request, env) {
    console.log("Worker Env:", env);
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/members")) {
      const { results } = await env.otw_db
        .prepare("SELECT * FROM members")
        .all();
      return Response.json(results);
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
