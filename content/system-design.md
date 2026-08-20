# system-design — Q&A


## Beginner — Question 1

**Q1: What is a Microservice, and how does it differ from a Monolith?**


A **monolith** is a single deployable unit where all features (UI, business logic, data access) live in one codebase and process. A **microservice** architecture splits the application into small, independent services, each owning a specific business capability and deployable on its own.

| Aspect | Monolith | Microservices |
|--------|----------|---------------|
| Deployment | One unit | Many independent units |
| Scaling | Whole app | Per-service |
| Tech stack | Uniform | Can vary per service |
| Failure blast radius | Whole app | Isolated to a service |
| Database | Usually shared | One per service (ideally) |

**In .NET terms:**
- A monolith might be a single ASP.NET Core Web API project with `Controllers`, `Services`, and `Repositories` all together.
- Microservices are *separate* ASP.NET Core projects, e.g., `OrderService`, `PaymentService`, `InventoryService` — each with its own `Program.cs`, its own database, communicating over HTTP/gRPC/message queues.

```csharp
// OrderService — Program.cs (its own independent app)
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddDbContext<OrderDbContext>(); // OWN database
var app = builder.Build();
app.MapControllers();
app.Run();
```

**Key principle:** *Each service should be independently deployable without redeploying the others.*

---

## Beginner — Question 2

**Q2: What is an API Gateway, and why do microservices need one?**


An **API Gateway** is a single entry point between clients (web, mobile) and your microservices. Clients call the gateway, which routes to the right service.

**Without a gateway** — the client must know every service address (fragile, tightly coupled). **With a gateway** — the client knows only one address:

```text
                    ┌─→ OrderService
Client → Gateway ───┼─→ PaymentService
                    └─→ InventoryService
```

### Responsibilities
Routing, Authentication/Authorization (validate JWT once at the edge), Rate limiting & throttling, Load balancing, Aggregation (combine responses), SSL termination, logging, caching.

### In .NET: YARP (Yet Another Reverse Proxy)

```csharp
// Gateway — Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
var app = builder.Build();
app.MapReverseProxy();
app.Run();
```

```json
// appsettings.json
{
  "ReverseProxy": {
    "Routes": {
      "orders-route": {
        "ClusterId": "orders-cluster",
        "Match": { "Path": "/orders/{**catch-all}" }
      }
    },
    "Clusters": {
      "orders-cluster": {
        "Destinations": {
          "d1": { "Address": "https://order-service:5001" }
        }
      }
    }
  }
}
```

### The BFF pattern
For different clients (mobile vs. web), teams often use **Backend for Frontend (BFF)** — a dedicated gateway per client type, so each gets tailored responses.

**Key trade-off:** A gateway centralizes cross-cutting concerns but can become a **single point of failure** and a **bottleneck** if not highly available. Keep gateway logic thin — routing and cross-cutting only, *never business logic*.

---

## Advanced — Question 1

**Q1: Distributed Observability & OpenTelemetry**


In microservices, one request becomes dozens of calls — there is no single stack trace. Observability rests on **three pillars**, unified by **correlation**.

| Pillar | Answers | Example |
|--------|---------|---------|
| **Logs** | *What happened?* | "Order 123 validation failed" |
| **Metrics** | *How much / how often?* | "p99 latency = 800ms, 5% error rate" |
| **Traces** | *Where did the time go?* | "Request spent 600ms in InventoryService" |

*Metrics tell you something's wrong → traces tell you where → logs tell you why.*

### Distributed Tracing
A **trace** follows one request end-to-end via **spans** sharing a **trace ID**:
```text
Trace ID: abc-123
├─ Span: Gateway            [██████████████████] 850ms
│  ├─ Span: OrderService    [████████]           400ms
│  │  └─ Span: SQL query    [██]                 100ms
│  └─ Span: InventoryService[██████████]         600ms  ← THE BOTTLENECK
```
The trace ID travels via **W3C Trace Context** (`traceparent` header), added automatically.

### OpenTelemetry (OTel) — the vendor-neutral standard
```csharp
// Program.cs
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("OrderService"))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()   // auto-trace incoming requests
        .AddHttpClientInstrumentation()   // auto-trace outgoing HTTP calls
        .AddEntityFrameworkCoreInstrumentation() // auto-trace DB queries
        .AddOtlpExporter())               // export to collector/Jaeger
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()      // GC, thread pool, etc.
        .AddOtlpExporter());
```

```csharp
// Adding a custom span for business logic
private static readonly ActivitySource Source = new("OrderService");

public async Task<Order> ProcessOrder(int id)
{
    using var activity = Source.StartActivity("ProcessOrder");
    activity?.SetTag("order.id", id);          // searchable dimension
    var order = await _repository.GetAsync(id);
    return order;
}
```

### Structured Metrics (the RED method)
```csharp
private static readonly Meter Meter = new("OrderService");
private static readonly Counter<int> OrdersPlaced =
    Meter.CreateCounter<int>("orders.placed");

public void PlaceOrder(Order o) =>
    OrdersPlaced.Add(1, new KeyValuePair<string, object>("region", o.Region));
```
Track **R**ate, **E**rrors, **D**uration — always p95/p99, *never averages* (they hide tail latency).

### Structured Logging + Correlation (Serilog)
```csharp
Log.Information("Order {OrderId} placed for {Amount:C}", order.Id, order.Total);
// → { "OrderId": 123, "Amount": 99.50, "TraceId": "abc-123", ... }
```
OTel stamps the current `TraceId` onto logs → filter `TraceId = abc-123` to see every log line from every service for one request.

### The debugging flow
```text
1. Metric shows p99 latency spiked to 2s
2. Tracing UI (Jaeger): filter slow traces
3. See InventoryService span = 1.8s
4. Click span → jump to logs (same TraceId)
5. Log: "Redis connection pool exhausted"
6. Root cause found — in minutes
```

**Key principle:** *You can't step through distributed code — design for observability up front.* Correlation via a propagated trace ID turns three data streams into one story.

---

## Advanced — Question 2

**Q2: Kubernetes & Deployment Strategies**


### Step 1: Containerize (multi-stage build)
```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
USER $APP_UID                         # run as non-root (security)
ENTRYPOINT ["dotnet", "OrderService.dll"]
```
> Even simpler: `dotnet publish -t:PublishContainer` (no Dockerfile). Use **chiseled** images for a minimal attack surface.

### Step 2: Kubernetes objects
| Object | Role |
|--------|------|
| **Pod** | Smallest unit — one (or few) containers |
| **Deployment** | Manages replica pods, handles rollouts |
| **Service** | Stable DNS + load balancing (Q5) |
| **Ingress** | External HTTP routing (Q3) |
| **ConfigMap / Secret** | Externalized config & credentials |
| **HPA** | Horizontal Pod Autoscaler |

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: order-service }
spec:
  replicas: 3
  selector: { matchLabels: { app: order-service } }
  template:
    metadata: { labels: { app: order-service } }
    spec:
      containers:
      - name: order-service
        image: myregistry/order-service:1.4.2
        ports: [{ containerPort: 8080 }]
        readinessProbe:
          httpGet: { path: /health/ready, port: 8080 }
        livenessProbe:
          httpGet: { path: /health/live, port: 8080 }
        resources:
          requests: { cpu: "100m", memory: "128Mi" }
          limits:   { cpu: "500m", memory: "256Mi" }
```

**Two probes:** *Liveness* — "is it hung?" fail → **restart**. *Readiness* — "can it serve now?" fail → **stop routing** (no restart).

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddDbContextCheck<OrderDbContext>(tags: ["ready"]); // ready only if DB reachable

app.MapHealthChecks("/health/live",  new() { Predicate = c => c.Tags.Contains("live") });
app.MapHealthChecks("/health/ready", new() { Predicate = c => c.Tags.Contains("ready") });
```

### Step 3: Deployment strategies
**Rolling Update (default):** replace pods gradually; old & new coexist. ✅ Zero downtime. ❌ Mixed versions; slow rollback.
```yaml
strategy:
  type: RollingUpdate
  rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
```
**Blue-Green:** two full environments; flip all traffic at once. ✅ Instant switch & rollback. ❌ Doubles infra.
**Canary:** route a small % to the new version, watch metrics, ramp up. ✅ Lowest risk. ❌ Most complex (needs mesh/Argo Rollouts + observability).

| Strategy | Downtime | Rollback | Cost | Risk control |
|----------|----------|----------|------|-------------|
| Rolling | None | Slow | Low | Low |
| Blue-Green | None | Instant | High (2×) | Medium |
| Canary | None | Fast | Medium | Highest |

### The hidden trap: database migrations (expand/contract)
Code rolls back in seconds; the database cannot. During rolling/canary, old & new code hit the same DB. Use **expand/contract (parallel change)**:
```text
Rename column `Name` → `FullName`:
1. EXPAND:   add new `FullName` column (both exist). Deploy.
2. MIGRATE:  code writes BOTH; backfill old rows.
3. SWITCH:   new code reads `FullName`. Deploy & verify.
4. CONTRACT: once no code uses `Name`, drop it. Deploy.
```
Never rename/drop a column in the same release that stops using it.

**Key principle:** Zero-downtime deployment is the compound result of immutable containers, health probes that gate traffic, a strategy matched to risk, and backward-compatible changes (especially schema). The database usually dictates how you deploy.

---

## Advanced — Question 3

**Q3: Design a complete e-commerce platform end-to-end**


Method: **Requirements → Estimation → High-level design → Decomposition → Deep dives → Trade-offs.**

### Step 1: Requirements
Functional: browse, search, cart, order, pay, track, reviews. Non-functional drives architecture:

| Requirement | Target | Drives |
|-------------|--------|--------|
| Availability | 99.99% | Redundancy, no SPOF |
| Read:write | ~100:1 | Caching, CQRS, read replicas |
| Consistency | Strong for payment/stock; eventual for reviews/search | Sagas, per-service choice |
| Latency | Catalog < 200ms; checkout < 1s | Caching, async work |
| Scale | Black Friday spikes | Autoscaling, queues |

### Step 2: Capacity estimation
```text
10M DAU × 20 pages = 200M reads/day ≈ 2,300/sec avg → peak ~23,000/sec
Writes (100:1) ≈ 23 orders/sec avg → ~230/sec peak
Storage: 10M orders/day × 2KB ≈ 20 GB/day ≈ 7 TB/year
```
→ 23k reads/sec ⇒ **must cache**; bursty peaks ⇒ **queues absorb spikes**.

### Step 3: High-level architecture
```text
   Web/Mobile → CDN → API Gateway (YARP: JWT, rate limit)
                          │
   ┌──────────┬──────────┼──────────┬───────────┐
 Catalog    Search      Cart      Order       Payment
 MongoDB   Elastic     Redis    SQL Server   SQL Server
                                    │
                        Message Broker (RabbitMQ/Kafka)
                          │                   │
                     Inventory           Notification
```

### Step 4: Decomposition (by business capability)
| Service | Owns | Database | Why |
|---------|------|----------|-----|
| Catalog | Products, pricing | MongoDB | Flexible, read-heavy |
| Search | Search index | Elasticsearch | Full-text/faceted |
| Cart | Active carts | Redis | Fast, ephemeral |
| Order | Orders, state | SQL Server | Transactional |
| Payment | Payments | SQL Server | Strong consistency, audit |
| Inventory | Stock | SQL Server | Consistency for reservations |
| Notification | Emails/SMS | — | Reacts to events |

### Step 5: Checkout flow (Saga — Q7, outbox — Q8, resilience — Q6)
```text
1. Order:     create order (Pending)   ── local txn + OUTBOX event
2. Payment:   charge card              ── idempotent, Polly retries
3. Inventory: reserve stock            ── idempotent
4. Order:     mark Confirmed
5. Notification: send (async event)

If step 3 fails: Payment.Refund → Order.Cancel (semantic undo)
```

### Step 6: Read path (CQRS — Q9 + caching)
```text
1. CDN            → static/images (edge)
2. Redis cache    → product JSON (~95% hit)
3. Catalog read model (denormalized: product+reviews+rating)
4. MongoDB        → only on cache miss
```
Cache invalidation: on `ProductUpdated` event, evict/refresh Redis + short TTL. Search stays consistent via events → updates Elasticsearch (eventual).

### Step 7: Scaling & resilience
```text
- Stateless services → HPA on CPU/RPS
- Spikes → queue orders (Kafka), process at sustainable rate (load leveling)
- Circuit breakers → payment gateway down? fail fast, queue retry
- Read replicas + Redis → absorb 23k reads/sec
- Bulkheads → slow Search can't starve Checkout
- Multi-AZ → survive zone failure (99.99%)
```

### Step 8: Cross-cutting
Observability (Q10): OTel traces every checkout; RED metrics; correlated logs. Security (Q12): JWT + zero-trust, mTLS, Key Vault, PCI-scoped Payment. Deployment (Q11): canary for checkout, rolling for catalog, expand/contract schemas.

### Step 9: Trade-offs
| Decision | Chose | Traded away |
|----------|-------|-------------|
| Microservices | Independent scaling, autonomy | Operational complexity |
| DB-per-service | Loose coupling | Lost cross-service ACID → sagas |
| Eventual consistency (search) | Availability, performance | Momentary staleness |
| Strong consistency (payment) | Correctness | Lower throughput |
| Caching | Read performance | Invalidation complexity |
| Async queues | Spike absorption | Harder debugging |

**CAP lens:** during a partition, pick C or A **per service** — **CP** for payment/inventory, **AP** for catalog/search/reviews.

**Senior mindset:** There's no perfect design, only trade-offs; start simple (monolith first is often right); consistency is a spectrum; design for failure; data boundaries are the hardest part.

---

## Scenario — Question 1

**Q1: A pod is unhealthy / crash-looping / OOMKilled**


Method: **observe status → read events → read logs → inspect resources → exec in.**

### Step 1: `kubectl get pods` — the failure class
| STATUS | Likely cause |
|--------|-------------|
| `CrashLoopBackOff` | App throws on startup, failed liveness, OOM |
| `OOMKilled` | Memory leak or limit too low |
| `ImagePullBackOff` | Bad tag, registry auth |
| `Pending` | Can't be scheduled (resources) |
| `CreateContainerConfigError` | Missing ConfigMap/Secret |
| `Running` 0/1 READY | Readiness probe failing |

### Step 2: `kubectl describe pod` — events + exit code
```text
Last State:  Terminated
  Reason:    OOMKilled          ← memory limit exceeded
  Exit Code: 137                ← 137 = 128+9 = SIGKILL (OOM)
```
| Exit code | Meaning |
|-----------|---------|
| 1 | App exception on startup |
| 137 | SIGKILL — OOMKilled |
| 139 | SIGSEGV — segfault |
| 143 | SIGTERM — graceful shutdown timed out |

### Step 3: Logs — including the previous dead container
```bash
kubectl logs pod-xxx --previous     # ← the crash BEFORE restart (critical!)
```

### Step 4: Diagnose by class
**A) CrashLoopBackOff:** startup dependency/config failure (bad connection string, missing secret, failed migration). Don't fail hard at startup for transient blips — use readiness + retry.
**B) OOMKilled (137):** `kubectl top pod` — limit too low (raise it) or real leak (`dotnet-gcdump collect -p 1`). .NET GC sizes from cgroup limit — **always set memory limits**.
**C) Failing liveness → needless restarts:** liveness must be **cheap, self-only** (no DB/downstream). Use `startupProbe` for slow boots.
```yaml
startupProbe:
  httpGet: { path: /health/live, port: 8080 }
  failureThreshold: 30
  periodSeconds: 10
livenessProbe:
  httpGet: { path: /health/live, port: 8080 }   # cheap, no dependencies
readinessProbe:
  httpGet: { path: /health/ready, port: 8080 }  # checks DB/deps
```
**D) Pending:** `describe` → resource requests exceed node capacity / affinity / no PV.
**E) ImagePullBackOff:** wrong tag, missing imagePullSecret, registry unreachable.

### Step 5: Exec in
```bash
kubectl exec -it pod-xxx -- /bin/sh
nslookup order-db          # can it resolve the DB service?
env | grep ConnectionString
# For crash-loopers: kubectl debug -it pod-xxx --image=busybox --target=svc
```

### Decision tree
```text
Pod unhealthy → kubectl get pods → STATUS?
├─ CrashLoopBackOff → logs --previous → startup error
├─ OOMKilled (137)  → top pod → leak (gcdump) or low limit
├─ Pending          → describe → scheduling
├─ ImagePullBackOff → fix tag / registry auth
└─ Running 0/1 READY→ readiness failing → which dependency is down?
```

**Key principle:** Kubernetes already tells you what's wrong — read it in order: `get` → `describe` → `logs --previous` → `top` → `exec`. The two deadliest .NET traps: **OOMKills from missing memory limits** and **liveness probes that check dependencies and restart healthy pods**.

---

## Scenario — Question 2

**Q2: Adding a new requirement to a running system**


The core decision: **extend an existing service, or create a new one?**

| Extend existing when... | New service when... |
|-------------------------|---------------------|
| Same business capability | Distinct capability, own lifecycle |
| Uses data that service owns | Own data & storage |
| Tightly coupled to existing logic | Scales/deploys independently |
| Small cohesive change | Different team could own it |

> ⚠️ Avoid nano-service sprawl **and** mini-monoliths. Follow the data and the capability boundary.

### Example A — "Add gift-wrapping (with a fee)"
Same capability, uses order data → **extend OrderService.** Expand/contract schema:
```csharp
migrationBuilder.AddColumn<bool>("GiftWrap", "Orders",
    nullable: false, defaultValue: false);       // additive & safe
migrationBuilder.AddColumn<decimal>("GiftWrapFee", "Orders",
    nullable: false, defaultValue: 0m);
```
```csharp
// Adding an OPTIONAL field is backward compatible
public record CreateOrderRequest(int CustomerId, List<Item> Items,
    bool GiftWrap = false);   // optional → non-breaking
// A breaking change → version it: /api/v1/orders + /api/v2/orders
```
The fee flows into the existing checkout saga — no new service.

### Example B — "Add product recommendations"
Distinct capability, own data/scaling → **new RecommendationService.** It **subscribes** to events already published (`OrderPlaced`, `ProductViewed`) and builds its own read model — **existing services are untouched:**
```csharp
public async Task Handle(ProductViewedEvent e)
{
    await _recoStore.RecordView(e.UserId, e.ProductId);  // own DB, no coupling back
}
```
This is the payoff of event-driven architecture (Q8): **new capabilities attach by listening, not by editing.** Expose via a new gateway route; callers use a resilient client (Q6) with a fallback.

### Universal rollout playbook
```text
1. Design    → extend vs. new service (data + capability boundary)
2. Contract  → additive API (optional fields) or a new version
3. Schema    → expand/contract, deploy DB change FIRST
4. Build     → behind a FEATURE FLAG (dark launch)
5. Test      → contract tests (Pact) so you don't break consumers
6. Deploy    → canary: 5% → 50% → 100%, watch metrics
7. Enable    → flip flag gradually; instant off-switch
8. Observe   → traces/metrics/logs on the new path
9. Contract  → later, remove old columns/versions
```
```csharp
if (await _featureManager.IsEnabledAsync("GiftWrapping"))
    order.ApplyGiftWrap(request.GiftWrap);   // gated new path
```

**Key principle:** Adding capability is a boundary decision first, a coding task second. Extend for the same capability; create a new service (ideally an event subscriber) for a distinct one. Evolve safely: additive contracts, expand/contract schemas, feature flags, canary, contract tests. Never make a breaking change in an independently-deployed system.

---

## Scenario — Question 3

**Q3: Troubleshooting a message-driven system**


Diagnose by **queue depth, consumer lag, and message fate** (no stack trace across the broker).

### Step 1: Broker vital signs
```text
Queue depth / backlog · Consumer lag (Kafka) · Publish vs. consume rate
DLQ depth · Unacked messages · Redelivery counts
```
**Master equation:** if publish rate > consume rate, backlog grows unbounded.

### Mode A — Queue backing up
Causes: slow/too-few consumers, spike, crashed consumers, slow downstream.
```csharp
// Competing consumers — scale out; MassTransit prefetch + concurrency
cfg.ReceiveEndpoint("orders", e =>
{
    e.PrefetchCount = 32;
    e.ConcurrentMessageLimit = 16;
    e.ConfigureConsumer<OrderConsumer>(context);
});
```
```yaml
# KEDA — autoscale consumers on queue depth
triggers:
- type: rabbitmq
  metadata: { queueName: orders, queueLength: "50" }
```
> ⚠️ A growing queue isn't always bad — it may be absorbing a spike (load leveling). Alarm when it grows and never drains.

### Mode B — Poison message (one message keeps failing)
Retry a bounded number of times, then **dead-letter** it so good messages flow.
```csharp
cfg.ReceiveEndpoint("orders", e =>
{
    e.UseMessageRetry(r => r.Exponential(5,
        TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(2)));
    // after retries → auto-moves to "orders_error" DLQ
    e.ConfigureConsumer<OrderConsumer>(context);
});
```
| Fault type | Example | Response |
|-----------|---------|----------|
| Transient | DB timeout, 503 | Retry with backoff |
| Permanent (poison) | Malformed JSON | Straight to DLQ |

Operate the DLQ: alert on depth > 0, inspect, fix root cause, **replay**.

### Mode C — Messages "lost" (usually not truly lost)
```text
1. Publisher never sent → dual-write bug → use the OUTBOX (Q8)
2. ACKed BEFORE processing → crash = gone → ack AFTER success
3. Went to the DLQ → check there first
4. Wrong routing key → published where nobody consumes
5. Non-durable queue + broker restart → use durable + persistent
6. TTL expired → dropped before consumed
```
```csharp
// ✅ Process first, ack only on success (at-least-once)
await ProcessMessage(message);
Ack(message);   // crash before this → broker redelivers → safe
```

### Mode D — Duplicates / out-of-order
At-least-once **guarantees** duplicates. Handle with **idempotent consumers (inbox pattern)**:
```csharp
public async Task Handle(OrderPlacedEvent e)
{
    if (await _inbox.AlreadyProcessed(e.MessageId)) return;  // skip duplicate
    await _repo.Process(e);
    await _inbox.MarkProcessed(e.MessageId);
}
```
Out-of-order: Kafka orders *within a partition key*; don't assume "OrderCreated arrives before OrderPaid."

### Prevention
| Practice | Prevents |
|----------|----------|
| Outbox (Q8) | Lost messages on publish |
| Idempotent consumers (Q7) | Damage from duplicates |
| DLQ + bounded retry | Poison messages blocking the queue |
| Ack after processing | Loss on consumer crash |
| Durable queues | Loss on broker restart |
| Autoscale on queue depth (KEDA) | Backlogs under load |

**Key principle:** In messaging you reason about queue depth, consumer lag, and message fate — not stack traces. Backlog = scale out or DLQ a poison message. "Lost" = ack-timing bug or missing outbox. Duplicates are inevitable → idempotency is the foundation.

---

*End of guide — Q1–Q17. Study track: Beginner (1–5) → Mid (6–9) → Advanced (10–12) → System Design (13) → Troubleshooting Scenarios (14–17).*

---

## Scenario — Question 4

**Q4: Design a Rate Limiter for a public API.**

**Requirements:**
- Limit users to 100 requests per minute based on their IP address or API Key.
- High availability, extremely low latency.
- Distributed across multiple API Gateway servers.

**Storage:**
Because we need shared state across multiple gateway servers with extremely fast read/write speeds, an In-Memory Distributed Cache like **Redis** is the only viable option.

**Algorithm: The Sliding Window Counter**
While Token Bucket and Fixed Window are common, Sliding Window Counter offers the best balance of accuracy and memory usage.
1. Each incoming request gets a timestamp (e.g., Redis Sorted Set).
2. The key is the user's API Key (e.g., `rate:key_123`).
3. When a request arrives, we remove all timestamps in the set that are older than 1 minute (the window size).
4. We count the remaining elements in the set.
5. If the count is < 100, we add the current timestamp to the set and allow the request.
6. If the count is >= 100, we reject the request with HTTP `429 Too Many Requests`.

**Optimization:**
Executing steps 3, 4, and 5 requires multiple round trips to Redis, which introduces latency and race conditions if multiple requests hit concurrently. To solve this, we can wrap the logic in a **Lua Script** and send it to Redis. Redis guarantees that Lua scripts execute atomically, solving both the race condition and the network overhead.

---

## Scenario — Question 5

**Q5: Design a globally distributed leaderboard for a popular mobile game with 50 million daily active users.**

**Requirements:**
- Players gain points constantly and the leaderboard must reflect updates in near real-time.
- Players can view the top 100 players globally.
- Players can view their own rank and the players immediately above and below them.

**Storage:**
A traditional relational database (`SELECT COUNT(*) FROM Users WHERE Score > MyScore`) is completely unviable at this scale. It would require locking and scanning millions of rows per second.

The perfect data structure for this is a **Redis Sorted Set (ZSET)**.
- A ZSET stores elements with a unique string (PlayerID) and a floating-point score.
- Redis keeps the set perfectly sorted in memory using a Skip List data structure.

**The Mechanism:**
1. **Update Score:** When a player scores points, the game servers send an async message. A worker processes the message and issues a `ZINCRBY leaderboard_global 50 {player_id}` command to Redis. This is an $O(\log N)$ operation.
2. **Get Top 100:** To display the global top 100, the API issues `ZREVRANGE leaderboard_global 0 99 WITHSCORES`. This operates in $O(\log(N) + M)$ time and returns instantly.
3. **Get Player Rank:** To find a specific player's exact rank, the API issues `ZREVRANK leaderboard_global {player_id}`.
4. **Get Surrounding Players:** Once the player's rank is known (e.g., Rank 5000), the API issues `ZREVRANGE leaderboard_global 4995 5005` to fetch the players above and below them.

**Scaling & Global Distribution:**
Because the game is global, routing all players to a single Redis instance in the US would cause latency for players in Asia. 
- You would utilize **Active-Active Redis Enterprise** or **Azure Cosmos DB (with Redis API)**.
- Players connect to their local regional API server and read from the local regional Redis replica (extremely fast reads).
- Writes (score updates) are made to the local replica and asynchronously synchronized globally using CRDTs (Conflict-free Replicated Data Types) to ensure eventual consistency without write conflicts.

---

## Scenario — Question 6

**Q6: You have a scheduled microservice that runs a billing batch job every night at midnight. To ensure high availability, the microservice is deployed across 3 identical instances in Kubernetes. At midnight, all 3 instances wake up and run the job simultaneously, charging customers three times. How do you ensure the job only runs exactly once across the entire distributed cluster?**

This is the classic **Distributed Concurrency** problem. Because the instances do not share memory, traditional locking mechanisms (like `lock (object)`) do not work.

**The Solution: Distributed Locking**
You need an external, centralized system to coordinate the lock. A Distributed Cache (like **Redis**) or a Relational Database (like **SQL Server**) are the standard solutions.

**The Mechanism (Using Redis and Redlock):**
1. At exactly midnight, all 3 instances attempt to acquire a specific lock key in Redis: `SET lock:billing_job "instance_id" NX PX 300000`.
   - `NX`: Only set the key if it does **Not eXist**. (This makes the operation atomic).
   - `PX 300000`: Set a TTL of 5 minutes so the lock automatically expires if the instance crashes while holding it.
2. Because Redis is single-threaded, it guarantees that only one instance's `SET NX` command will succeed.
3. The instance that succeeded (e.g., Instance 2) holds the lock. It executes the billing job.
4. The other instances (Instance 1 and 3) receive a failure response from Redis. They simply exit and go back to sleep.
5. Once Instance 2 finishes the job, it deletes the lock key in Redis.

*(Note: In the .NET ecosystem, libraries like **Hangfire** or **Quartz.NET** implement these distributed locking patterns automatically using SQL Server or Redis under the hood).*

---

## Scenario — Question 7

**Q7: Your application relies on a third-party payment gateway. During Black Friday, the payment gateway starts timing out on 50% of requests. Your checkout service blindly retries every failed request 3 times immediately. Soon, all threads in your checkout service are blocked waiting for timeouts, and your entire application crashes. How do you prevent a failing external dependency from taking down your system?**

This is a classic cascading failure caused by synchronous network blocking and aggressive retries.

**The Solution: The Circuit Breaker Pattern**

You must implement a Circuit Breaker (using a library like **Polly** in .NET) to protect your application from the failing third-party service.

**The Mechanism:**
The Circuit Breaker acts like an electrical switch wrapped around your HTTP calls.

1. **Closed State (Normal):** Traffic flows freely. The Circuit Breaker monitors the responses.
2. **Open State (Tripped):** If the failure rate exceeds a certain threshold (e.g., 50% of requests fail within 10 seconds), the circuit "trips" and opens. 
   - While open, *all subsequent calls to the payment gateway fail instantly* without ever actually making the network request. This immediately frees up your threads, saving your checkout service from thread pool starvation.
   - You can return a fallback response to the user, like "Payment is currently unavailable, please try again later."
3. **Half-Open State (Testing):** After a cooldown period (e.g., 30 seconds), the circuit enters a Half-Open state. It allows *one* test request through to the payment gateway.
   - If the test request succeeds, the gateway is deemed healthy, and the circuit closes (normal operation).
   - If the test request fails, the circuit immediately opens again for another 30 seconds.

By combining Circuit Breakers with **Exponential Backoff and Jitter** (adding randomness to retry delays), you ensure your application remains responsive during third-party outages and avoids contributing to the third-party's overload (the "thundering herd" problem).
