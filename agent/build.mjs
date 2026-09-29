import { build } from "esbuild";

// Bundle the agent + all dependencies (hono, @hono/node-server, zod,
// workspace packages) into a single self-contained ESM file, so the runtime
// Docker image only needs `node` + `dist/index.js` (no node_modules).
// Node built-ins (fs, http, crypto, ...) stay external automatically.
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/index.js",
  logLevel: "info",
});