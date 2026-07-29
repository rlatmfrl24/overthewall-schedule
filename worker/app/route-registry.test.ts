import { describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import {
  createRouteRegistry,
  type WorkerRouteDefinition,
} from "./route-registry";

const env = {} as Env;

describe("Worker route registry", () => {
  it("dispatches only exact path patterns", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const registry = createRouteRegistry([
      {
        id: "members.list",
        owner: "members",
        path: "/api/members",
        methods: [
          {
            method: "GET",
            auth: "public",
            cache: "no-store",
            successStatus: 200,
          },
        ],
        handler,
      },
    ]);

    const exact = await registry.dispatch(
      new Request("https://example.com/api/members"),
      env,
    );
    const typo = await registry.dispatch(
      new Request("https://example.com/api/members-typo"),
      env,
    );

    expect(exact?.status).toBe(200);
    expect(typo?.status).toBe(404);
    expect(await typo?.text()).toBe("Not Found");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns null outside the Worker API surface", async () => {
    const registry = createRouteRegistry([]);

    await expect(
      registry.dispatch(
        new Request("https://example.com/client-side-route"),
        env,
      ),
    ).resolves.toBeNull();
  });

  it("returns 405 with every allowed method for a registered path", async () => {
    const definition: WorkerRouteDefinition = {
      id: "notices.collection",
      owner: "notices",
      path: "/api/notices",
      methods: [
        {
          method: "GET",
          auth: "public",
          cache: "no-store",
          successStatus: 200,
        },
        {
          method: "POST",
          auth: "admin",
          cache: "no-store",
          successStatus: 201,
        },
      ],
      handler: () => new Response("ok"),
    };
    const response = await createRouteRegistry([definition]).dispatch(
      new Request("https://example.com/api/notices", { method: "PUT" }),
      env,
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get("Allow")).toBe("GET, POST");
  });

  it("validates numeric path params before invoking a handler", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const registry = createRouteRegistry([
      {
        id: "logs.delete",
        owner: "audit",
        path: "/api/settings/logs/:id",
        numericParams: ["id"],
        methods: [
          {
            method: "DELETE",
            auth: "admin",
            cache: "no-store",
            successStatus: 200,
          },
        ],
        handler,
      },
    ]);

    for (const id of ["0", "-1", "1.2", "12abc", "9007199254740992"]) {
      const response = await registry.dispatch(
        new Request(`https://example.com/api/settings/logs/${id}`, {
          method: "DELETE",
        }),
        env,
      );
      expect(response?.status).toBe(400);
    }
    expect(handler).not.toHaveBeenCalled();

    const valid = await registry.dispatch(
      new Request(
        "https://example.com/api/settings/logs/9007199254740991",
        { method: "DELETE" },
      ),
      env,
    );
    expect(valid?.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("applies exact no-store cache metadata when the handler omits it", async () => {
    const registry = createRouteRegistry([
      {
        id: "settings.run-now",
        owner: "schedules",
        path: "/api/settings/run-now",
        methods: [
          {
            method: "POST",
            auth: "admin",
            cache: "no-store",
            successStatus: 200,
          },
        ],
        handler: () => Response.json({ success: true }),
      },
    ]);

    const response = await registry.dispatch(
      new Request("https://example.com/api/settings/run-now", {
        method: "POST",
      }),
      env,
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toEqual({ success: true });
  });

  it("rejects duplicate method and path contracts during composition", () => {
    const duplicate = {
      owner: "members",
      path: "/api/members",
      methods: [
        {
          method: "GET",
          auth: "public",
          cache: "no-store",
          successStatus: 200,
        },
      ],
      handler: () => new Response("ok"),
    } satisfies Omit<WorkerRouteDefinition, "id">;

    expect(() =>
      createRouteRegistry([
        { ...duplicate, id: "members.one" },
        { ...duplicate, id: "members.two" },
      ]),
    ).toThrow("Duplicate route contract");
  });

  it("rejects duplicate route ids during composition", () => {
    const definition = {
      owner: "members",
      methods: [
        {
          method: "GET",
          auth: "public",
          cache: "no-store",
          successStatus: 200,
        },
      ],
      handler: () => new Response("ok"),
    } satisfies Omit<WorkerRouteDefinition, "id" | "path">;

    expect(() =>
      createRouteRegistry([
        { ...definition, id: "members.read", path: "/api/members" },
        {
          ...definition,
          id: "members.read",
          path: "/api/members/:code",
        },
      ]),
    ).toThrow("Duplicate route id");
  });
});
