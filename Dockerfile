# syntax=docker/dockerfile:1

# ---- deps ----------------------------------------------------------------
# Full install (dev included) -- the client build needs vite and its plugins.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---- build ---------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Vite inlines these at build time -- they are NOT readable from the container's runtime
# environment, so they must be passed as build args. Coolify: set them as build variables.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_PADDLE_CLIENT_TOKEN
ARG VITE_PADDLE_ENVIRONMENT=sandbox
ARG VITE_APP_ID
# Unset, client/index.html emits a literal "%VITE_ANALYTICS_ENDPOINT%/umami" script tag
# that 404s on every page load. Defaulted to empty so the tag is at least inert.
ARG VITE_ANALYTICS_ENDPOINT=""
ARG VITE_ANALYTICS_WEBSITE_ID=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_PADDLE_CLIENT_TOKEN=$VITE_PADDLE_CLIENT_TOKEN \
    VITE_PADDLE_ENVIRONMENT=$VITE_PADDLE_ENVIRONMENT \
    VITE_APP_ID=$VITE_APP_ID \
    VITE_ANALYTICS_ENDPOINT=$VITE_ANALYTICS_ENDPOINT \
    VITE_ANALYTICS_WEBSITE_ID=$VITE_ANALYTICS_WEBSITE_ID \
    NODE_ENV=production

RUN pnpm build

# ---- runtime -------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production PORT=3000

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
# Production-only install. This is safe because the server bundle is built from
# server/_core/index.prod.ts, which never imports ./vite -- the dev entrypoint does, and
# esbuild would hoist vite and four other devDependencies into the bundle's top-level
# imports, crashing the container before it ran a line.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
# Migrations are run from the container so the schema travels with the image.
COPY drizzle ./drizzle
COPY scripts ./scripts

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "dist/index.js"]
