// The client typechecks the server's AppRouter type (for tRPC) without loading the
// Workers runtime types, which clash with the DOM lib. Server code only reaches the
// runtime through this module, so stubbing it here is enough for the client build.
declare module "cloudflare:workers" {
  export const env: any;
  export function waitUntil(promise: Promise<unknown>): void;
}
