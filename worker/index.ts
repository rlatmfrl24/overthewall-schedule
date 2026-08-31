import { handleWorkerFetch } from "./app/fetch";
import type { Env } from "./platform/types";

export default {
  fetch(request, env, ctx) {
    return handleWorkerFetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
