import { createServer } from "node:http";
import { createApp } from "../server/_core/index.ts";

const server = createServer(createApp());
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not determine test port");
const baseUrl = `http://127.0.0.1:${address.port}`;
try {
  for (const route of ["/api/trpc/system.health", "/api/trpc/auth.me"]) {
    const response = await fetch(`${baseUrl}${route}`);
    const body = await response.text();
    console.log(JSON.stringify({ route, status: response.status, body: body.slice(0, 300) }));
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}
