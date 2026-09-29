import type { Env } from "./env.js";
import { createApp } from "./routes.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = createApp(env);
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
