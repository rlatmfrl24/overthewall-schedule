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

    if (url.pathname.startsWith("/api/schedules")) {
      if (request.method === "GET") {
        const date = url.searchParams.get("date");
        const startDate = url.searchParams.get("startDate");
        const endDate = url.searchParams.get("endDate");

        if (startDate && endDate) {
          const { results } = await env.otw_db
            .prepare("SELECT * FROM schedules WHERE date BETWEEN ? AND ?")
            .bind(startDate, endDate)
            .all();
          return Response.json(results);
        }

        if (!date) {
          return new Response("Date parameter is required", { status: 400 });
        }
        const { results } = await env.otw_db
          .prepare("SELECT * FROM schedules WHERE date = ?")
          .bind(date)
          .all();
        return Response.json(results);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as any;
        const { member_uid, date, start_time, title, status } = body;

        if (!member_uid || !date || !status) {
          return new Response("Missing required fields", { status: 400 });
        }

        const { success } = await env.otw_db
          .prepare(
            "INSERT INTO schedules (member_uid, date, start_time, title, status) VALUES (?, ?, ?, ?, ?)"
          )
          .bind(member_uid, date, start_time, title, status)
          .run();

        if (success) {
          return new Response("Created", { status: 201 });
        } else {
          return new Response("Failed to create", { status: 500 });
        }
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as any;
        const { id, member_uid, date, start_time, title, status } = body;

        if (!id || !member_uid || !date || !status) {
          return new Response("Missing required fields", { status: 400 });
        }

        const { success } = await env.otw_db
          .prepare(
            "UPDATE schedules SET member_uid = ?, date = ?, start_time = ?, title = ?, status = ? WHERE id = ?"
          )
          .bind(member_uid, date, start_time, title, status, id)
          .run();

        if (success) {
          return new Response("Updated", { status: 200 });
        } else {
          return new Response("Failed to update", { status: 500 });
        }
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) {
          return new Response("ID parameter is required", { status: 400 });
        }
        const { success } = await env.otw_db
          .prepare("DELETE FROM schedules WHERE id = ?")
          .bind(id)
          .run();

        if (success) {
          return new Response("Deleted", { status: 200 });
        } else {
          return new Response("Failed to delete", { status: 500 });
        }
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
