# Production readiness checklist

Every item from the reviewed list, assessed against what this application
actually is: a single-region app on Vercel serverless functions, one Postgres
database on Supabase, one Redis for rate limiting, and two external APIs
(fal.ai for generation, Supabase for auth and storage). There are no
microservices, no message broker, no cluster, and no second region.

A large part of the list describes distributed-systems problems this shape of
system does not have. Marking those **N/A** is the honest answer; adopting them
would add cost and operational surface without reducing any real risk here. Each
one says why.

Status key: **Done** shipped in this work. **Existing** already in place before
this work. **Todo** needed, not yet built. **N/A** does not apply, with reason.

---

## Traffic and request handling

| Item | Status | Notes |
|---|---|---|
| Rate Limiting | **Done** | Named per-endpoint rules in `server/rateLimit.ts`. Spend-bearing endpoints fail closed. |
| Caching | **Existing** | React Query on the client; signed storage URLs cached for their 1-hour TTL. |
| Load Balancing | **N/A** | Vercel routes and scales functions. There is no origin fleet to balance. |
| Reverse Proxies | **N/A** | Vercel's edge is the proxy. |
| API Gateways | **N/A** | One tRPC router behind one function is the whole API surface. |
| CDN | **Existing** | Vercel serves static assets from its edge network. |
| Edge Caching | **Existing** | Same. Application responses are user-scoped and deliberately uncached. |
| Cache Invalidation | **Existing** | `utils.*.invalidate()` on every mutation that changes what a query returned. |
| Timeouts | **Existing** | `withRetry({ timeoutMs })` in `shared/retry.ts`; staging polls against an explicit budget. |
| Retries | **Existing** | `shared/retry.ts`, used for storage, uploads, and clip downloads. |
| Exponential Backoff | **Existing** | Equal-jitter backoff in `shared/retry.ts`. |
| Backpressure | **Todo** | Rate limits cap arrival, but there is no queue depth to push back on. Revisit if a worker is added. |
| Idempotency | **Done** | Render lock on `video_projects.renderLockedAt`; the UNIQUE `credit_ledger.referenceId` on every credit movement. |
| Circuit Breakers | **Todo** | A sustained fal.ai outage currently burns retries per request. Worth adding if fal.ai proves flaky. |

## Concurrency and correctness

| Item | Status | Notes |
|---|---|---|
| Race Conditions | **Done** | The double-billing race is closed: submission moved out of the polled query and behind a lock. |
| Optimistic Locking | **Done** | Credit spends and the render lock are both conditional UPDATEs; a losing racer matches no rows. |
| Pessimistic Locking | **N/A** | No long transaction needs row locks. The conditional-update pattern covers every contended write. |
| Distributed Locks | **Done** | `renderLockedAt` with a 5-minute TTL, so a caller that dies mid-flight cannot wedge a project. |
| Deadlocks | **N/A** | Single-table writes in a fixed order; no multi-resource acquisition. |
| Thread Safety | **N/A** | Node is single-threaded per invocation and no module-level mutable state survives (the in-memory upload map was deleted for exactly this reason). |
| Memory Leaks | **Done** | The 25 MB-per-session in-memory upload buffer is gone. |
| Garbage Collection | **N/A** | No GC tuning is meaningful inside short-lived serverless invocations. |

## Data

| Item | Status | Notes |
|---|---|---|
| SQL Injection | **Existing** | Drizzle parameterises everything. The one raw template (`getVideoProjectByRequestId`) interpolates via `sql` bindings, not string concatenation. |
| Database Indexing | **Existing** | User index and two GIN indexes on `video_projects`; share token and ledger indexes added here. |
| Query Optimization | **Done** | Approval signs media keys once and shares the array instead of signing twice in series. |
| N+1 Queries | **Done** | `presentSourceUrls` signs in one `Promise.all` rather than per row. |
| Connection Pooling | **Existing** | `postgres()` with `max: 5`, sized for serverless concurrency. |
| Read Replicas | **N/A** | Read volume is trivial. A replica would add lag and cost for no benefit. |
| Sharding / Partitioning | **N/A** | Thousands of rows. Revisit somewhere past tens of millions. |
| Replication | **Existing** | Supabase runs it. |
| Database Migrations | **Done** | Numbered SQL under `drizzle/`. Production was four migrations behind and sign-in was broken as a result; `0012` reconciles it. See DEPLOYMENT.md. |
| Schema Versioning | **Existing** | Same. Note the `drizzle/meta/_journal.json` caveat in DEPLOYMENT.md. |
| Backups | **Todo** | Supabase takes daily backups on Pro. A restore has never been tested; see DEPLOYMENT.md. |
| Eventual Consistency | **N/A** | One primary database, read-your-writes throughout. |
| CAP Theorem | **N/A** | Single-node datastore; there is no partition to trade against. |
| Distributed Transactions / Saga | **N/A** | The one cross-system operation (spend credit, then call fal.ai) is handled with a compensating refund, which is the right size of answer here. |

## Security

| Item | Status | Notes |
|---|---|---|
| Row Level Security | **Done** | Was **off** on `users` and `video_projects` with the anon key public. Revoked and enabled via `drizzle/0010`, applied and verified in production. |
| Authentication | **Existing** | Supabase Auth, verified server-side per request in `server/_core/context.ts`. |
| Authorization | **Existing** | Every project query is scoped to `ctx.user.id`; `adminProcedure` gates the credit grant. |
| IAM | **Existing** | Supabase roles plus the app's own `user`/`admin` role column. |
| OAuth | **Existing** | Manus OAuth path with a `__Host-` nonce cookie and a CSRF check on callback. |
| JWT Rotation | **Existing** | Supabase issues and refreshes access tokens; the client auto-refreshes. |
| CSRF | **Done** | Session cookie moved from `SameSite=None` to `Lax`. |
| XSS | **Existing** | React escapes by default. No `dangerouslySetInnerHTML` anywhere in `client/src`. |
| SSRF | **Done** | The unauthenticated storage proxy, which fetched any key on request, is deleted. |
| CORS | **Existing** | Same-origin only; no cross-origin headers are set, which is the correct default here. |
| TLS | **Existing** | Vercel terminates TLS and redirects HTTP. |
| Encryption in Transit | **Existing** | HTTPS to the app, to Supabase, and to fal.ai. |
| Encryption at Rest | **Existing** | Supabase encrypts database and storage volumes. |
| Secrets Management | **Existing** | Vercel environment variables; nothing secret is committed. `.env*` is gitignored. |
| Webhooks | **Existing** | The fal.ai webhook is treated purely as a "re-check this id" hint and trusts nothing in the body. Documented in `server/_core/webhooks.ts`. |
| WAF / DDoS Protection | **Existing** | Vercel's platform protection, plus the application rate limits. |
| Leaked password protection | **Todo** | Disabled in Supabase Auth. One toggle; see DEPLOYMENT.md. |

## Delivery and deployment

| Item | Status | Notes |
|---|---|---|
| CI/CD | **Done** | `.github/workflows/ci.yml` runs typecheck, tests, and build on every push and pull request. |
| Infrastructure as Code | **Todo** | Vercel and Supabase are configured through their dashboards. DEPLOYMENT.md is the written record until that changes. |
| Rollbacks | **Existing** | Vercel keeps every deployment and can promote any previous one. |
| Blue-Green / Canary / Rolling Deployments | **N/A** | Vercel's atomic deploy-and-swap is already this, without the machinery. |
| Feature Flags | **Todo** | Nothing needs one yet. Worth adding with the first risky feature. |
| Build Caching | **Existing** | Vercel caches pnpm and Vite build output between deploys. |
| Dependency Hell | **Existing** | pnpm with a committed lockfile and an explicit `packageManager` field. |
| Docker / Kubernetes / Helm | **N/A** | Serverless functions. There is no container or cluster to orchestrate. |
| Terraform | **N/A** | See Infrastructure as Code above. |
| Service Discovery / Service Mesh | **N/A** | One service. Nothing to discover. |
| Leader Election | **N/A** | No clustered coordinator. The render lock is a database row, which is simpler and sufficient. |
| Multi-Region Deployments | **N/A** | One region, one database. Multi-region would mean replication lag and split-brain risk for a product with no such requirement. |
| Chaos Engineering | **N/A** | Premature with two users and no redundancy to test. |
| Disaster Recovery | **Todo** | Depends on the untested restore above. |
| Failover | **N/A** | No standby to fail over to. |

## Observability

| Item | Status | Notes |
|---|---|---|
| Logging | **Existing** | Structured console logging with consistent `[Area]` prefixes, visible in Vercel logs. |
| Monitoring | **Todo** | Nothing watches error rate or fal.ai spend. Highest-value remaining gap. |
| Alerting | **Todo** | Same. A spend alert on the fal.ai account is the single most valuable one. |
| Metrics | **Todo** | No counters on renders started, failed, or credits spent. |
| Health Checks | **Existing** | `system.health` exists in `server/_core/systemRouter.ts` but nothing calls it. Point an uptime monitor at it. |
| Distributed Tracing | **N/A** | One service, one hop. Request logs carry the project id already. |
| Liveness / Readiness Probes | **N/A** | Kubernetes concepts. Vercel manages function lifecycle. |
| Observability | **Todo** | Covered by Monitoring and Metrics above. |
| SLOs / SLIs / Error Budgets | **Todo** | Meaningless without the metrics above. Define once they exist. |
| Postmortems | **Todo** | No incidents yet. Worth a template before the first one. |
| On-call | **N/A** | One-person operation. |
| Production Incidents | **Todo** | Covered by alerting and postmortems. |

## Async work and events

| Item | Status | Notes |
|---|---|---|
| Long Polling | **Existing** | The client polls render status every 3 seconds while a project is processing. |
| Webhooks | **Existing** | fal.ai calls back on completion as a latency optimisation over polling. |
| Cron Jobs | **Todo** | Nothing sweeps projects abandoned mid-render. Worth one job. |
| Message Queues / Pub-Sub | **N/A** | fal.ai's own job queue is the queue. Adding a broker would duplicate it. |
| Event-Driven Architecture | **N/A** | Same. |
| Dead Letter Queues | **N/A** | No broker, so no dead letters. Failed renders surface as `renderPhase = failed` on the project row. |
| Server-Sent Events / WebSockets | **N/A** | Polling at 3s is adequate for a multi-minute render and far simpler on serverless. |
| Autoscaling | **Existing** | Vercel scales functions per request. |
| Horizontal / Vertical Scaling | **N/A** | Serverless. Neither is a decision anyone makes here. |
| Cold Starts | **Existing** | A real cost of this architecture, accepted. No module-level state depends on warmth. |
| Serverless Limits | **Existing** | The 10s function budget drove the staging rewrite and the two-clips-per-call persistence limit. |

## Performance

| Item | Status | Notes |
|---|---|---|
| Latency / Throughput | **Existing** | Dominated by fal.ai generation time, which is minutes. Application latency is not the constraint. |
| P99 / Tail Latency | **Todo** | Needs the metrics above before it can be measured. |
| Cost Optimization | **Done** | The 3-second poll now does strictly less work: no submission, and clip persistence is capped per call. |
| Network Partitions | **N/A** | No inter-service network to partition. |
| Clock Skew | **N/A** | All timestamps come from the database's `now()`, not from clients. |
| DNS | **Existing** | Vercel-managed for reel-listing.com. |
| TCP vs UDP / HTTP2 / HTTP3 / gRPC | **N/A** | HTTPS over Vercel's edge. Protocol choice is not ours to make. |

## API and versioning

| Item | Status | Notes |
|---|---|---|
| API Versioning | **N/A** | The tRPC router has exactly one consumer, this app's own client, deployed atomically with it. There is no third-party contract to version. |
| Semantic Versioning | **N/A** | Nothing is published as a package. |

---

## The four things most worth doing next

1. **Get off the Supabase and Vercel free tiers.** The database auto-paused during this
   work, which takes the site down completely and makes the security advisor return an
   empty result that reads as a clean bill of health. Vercel Hobby separately prohibits
   commercial use.
2. **Alerting on fal.ai spend.** Everything else in this repo is now bounded by
   credits, but a bug or an abuse path would still be discovered by reading a
   bill. A spend alert on the fal.ai account catches it in hours instead.
3. **Test a database restore.** Backups nobody has restored are not backups.
4. **A cron sweep for abandoned renders.** Clips are saved now, so a project
   stuck mid-assembly is recoverable, but nothing tells anyone it is stuck.
