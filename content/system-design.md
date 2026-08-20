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

---

## Intermediate — Question 1

**Q1: What is the CAP Theorem, and how does it force a concrete trade-off when designing a distributed system?**

CAP states a distributed data store can only guarantee two of three properties at once: **C**onsistency (every read sees the latest write), **A**vailability (every request gets a non-error response), and **P**artition Tolerance (the system keeps working despite network failures between nodes).

**Why this isn't really a 3-way choice in practice:**
Network partitions *will* happen eventually in any real distributed system — so Partition Tolerance isn't optional, it's a given. That collapses the real-world decision down to: when a partition occurs, do you choose **Consistency** or **Availability**?

```text
Network partition between Region A and Region B:

CP choice: Region B refuses writes/reads until it can confirm
           it has the latest data from Region A (sacrifices Availability)

AP choice: Region B keeps serving reads/writes using its local data
           (sacrifices Consistency — may be stale until partition heals)
```

**Applying it to a real design (e-commerce checkout):**
- **Payment & Inventory (CP):** you cannot let two regions independently decide "yes, we have stock" during a partition and both sell the last unit — refusing to serve (or routing to a single authoritative region) until consistency is restored is the safer failure mode.
- **Product Catalog & Reviews (AP):** if a partition happens, showing a slightly stale product description or review count is a far better user experience than showing an error page — staleness here is an acceptable, recoverable cost.

**Common Pitfall:** treating CAP as an all-or-nothing property of "the database" rather than a per-operation, per-service decision — modern systems (and even single databases like Cosmos DB) let you tune consistency level per query, meaning the *same* physical system can behave CP for checkout and AP for browsing simultaneously, as this platform's design does across its Payment vs. Catalog services.

---

## Intermediate — Question 2

**Q2: How do you decide between a SQL read replica, a cache (Redis), and a fully separate read-optimized store (CQRS) for scaling reads?**

All three attack the same problem — reads vastly outnumber writes — but at increasing levels of architectural commitment, and picking the wrong one either under-solves the problem or adds unjustified complexity.

**Read Replicas — the lightest-weight option:**
```text
Primary (handles writes) ──replicates──► Replica 1, Replica 2, ...
Application routes SELECT queries to replicas, INSERT/UPDATE/DELETE to primary
```
- Same schema, same query language as the primary — no application rewrite needed, just a connection-routing change.
- Replication lag (typically milliseconds to low seconds) means replicas can serve *slightly* stale data — acceptable for a product listing page, not for "did my payment just succeed."
- Scales read *throughput* but every replica still runs the same relatively expensive relational queries — doesn't help if the problem is query *shape*, not just volume.

**A Cache (Redis) — trades a network hop for near-zero backend load:**
```text
Request → Check Redis (cache hit? return in ~1ms) 
            └─ miss → query DB → populate Redis → return
```
- Dramatically reduces load on the primary datastore for hot, frequently-repeated reads (product detail pages).
- Introduces **cache invalidation** as a genuinely hard problem — stale cached data after an update is now a class of bug you didn't have before.
- Best when the *same* data is read far more often than it changes (read:write ratio like the 100:1 seen on this platform's catalog).

**CQRS with a separate read model — the heaviest but most powerful option:**
```text
Write side: normalized SQL Server (Order, OrderLine tables, enforces invariants)
Read side:  denormalized document in MongoDB/Elasticsearch
            { orderId, customerName, items: [...], totalWithTax, status }
            -- pre-joined and pre-computed, updated asynchronously via events
```
- Solves problems replicas and caches can't: when the *query shape* itself is fundamentally different from the write model (e.g., a dashboard needing data joined across five normalized tables), no amount of replication or caching of the *same* normalized schema fixes that — you need a genuinely different, purpose-built representation.
- Highest complexity: a whole separate datastore, an event pipeline keeping it in sync, and genuine eventual consistency to reason about.

**Decision guide:** start with read replicas (cheapest, least architectural change) → add caching for specific hot, repeatedly-read keys → reach for full CQRS only when the read *shape* itself diverges so much from the write model that neither of the first two options can close the gap, regardless of how much hardware you throw at them.

---

## Intermediate — Question 3

**Q3: What is Database Sharding, and how do you choose a shard key?**

Sharding splits one logical database's data horizontally across multiple physical database instances, each holding a distinct subset of rows — used when a single database server's storage or throughput ceiling is the actual bottleneck, not just read load (which replicas/caching already solve more cheaply).

**The Mechanism:**
```text
Shard Key: CustomerId

Shard 1 (CustomerId 1-1,000,000):   physical SQL Server instance A
Shard 2 (CustomerId 1,000,001-2M):  physical SQL Server instance B
Shard 3 (CustomerId 2,000,001-3M):  physical SQL Server instance C

Application/routing layer inspects CustomerId and sends the query to the correct shard
```
Unlike a read replica (every replica has a *full copy* of the same data), each shard holds a genuinely *different, non-overlapping* subset — this is how sharding scales storage capacity and write throughput, not just read throughput.

**Choosing a shard key — the single hardest decision in this design:**
- **Even distribution:** sharding by `SignupDate` sounds reasonable but concentrates all of today's active, high-traffic customers on the newest (and likely least-provisioned) shard — a hot-shard problem identical in spirit to a bad NoSQL partition key.
- **Query alignment:** if the vast majority of queries are "get everything for CustomerId X," sharding by `CustomerId` keeps those queries single-shard and fast. Sharding by `OrderId` instead would scatter one customer's order history across every shard, turning a common query into an expensive fan-out across all of them.
- **Cross-shard queries are expensive or impossible:** "find all orders over $10,000 across all customers" (a query that doesn't align with the shard key) must fan out to every shard and merge results in the application — exactly the same fan-out penalty as a badly-chosen NoSQL partition key, and `JOIN`s across shards aren't possible at the database level at all.

**Common Pitfall:** sharding prematurely, before actually hitting a genuine storage/throughput ceiling that read replicas and caching can't solve — sharding is difficult to reverse (re-sharding a live system to change the key or add shards is one of the hardest operational migrations in distributed systems), so it should be the last lever pulled, not the first.

---

## Beginner — Question 3

**Q3: What is a Load Balancer, and what's the difference between Layer 4 (transport-level) and Layer 7 (application-level) load balancing?**

A load balancer distributes incoming traffic across multiple backend servers so no single instance is overwhelmed — but *how* it decides where to route each request depends on which layer of the network stack it operates at.

**Layer 4 (Transport) — routes based on IP address and port, without looking at the actual HTTP content:**
```text
Client -> L4 Load Balancer -> picks a backend based on TCP connection info alone
                            -> forwards raw TCP packets, doesn't parse HTTP at all
```
Extremely fast (no need to parse the request), but genuinely "blind" to what's inside — it can't route based on a URL path, a header, or cookie-based session affinity, since it never looks past the TCP/IP layer.

**Layer 7 (Application) — routes based on actual HTTP content:**
```text
Client -> L7 Load Balancer -> reads the HTTP request (path, headers, cookies)
                            -> routes /api/* to the API backend pool,
                               /images/* to a static-content pool,
                               based on a "session" cookie for sticky sessions
```
Slower per-request (must parse HTTP), but enables intelligent routing decisions — path-based routing, weighted traffic splitting for canary releases, and SSL/TLS termination all require understanding the actual HTTP request, which only an L7 balancer can do.

**Why this distinction matters for architecture decisions:** a simple, high-throughput internal service-to-service load balancer might deliberately choose L4 for raw speed when routing logic is trivial (round-robin across identical instances); a public-facing API gateway almost always needs L7, since path-based routing, header inspection for auth, and canary traffic splitting all require application-layer awareness.

**Common Pitfall:** assuming any "load balancer" provides the same routing capabilities — deploying an L4 load balancer in front of a system that needs path-based routing or sticky sessions will simply not support those features, requiring a swap to an L7 balancer (or an additional L7 layer behind the L4 one) rather than a configuration tweak.

---

## Intermediate — Question 4

**Q4: What is the difference between horizontal and vertical scaling, and why does horizontal scaling require the application itself to be designed for it?**

**Vertical scaling** ("scale up") means giving a single server more resources — more CPU, more RAM, a faster disk. **Horizontal scaling** ("scale out") means adding more servers running the same application, splitting load across them. They sound like two flavors of the same idea, but horizontal scaling has an architectural prerequisite vertical scaling doesn't.

**Vertical scaling — no application changes needed, but has a hard ceiling:**
```text
Before: 1 server, 4 CPU cores, 16GB RAM
After:  1 server, 32 CPU cores, 256GB RAM  -- same application code, just bigger hardware
```
Simple, but bounded by the largest single machine available, and represents a single point of failure — if that one (now very expensive) server goes down, the entire application is down.

**Horizontal scaling — requires the application to not depend on server-local state:**
```text
Before: 1 server handling all requests
After:  5 identical servers behind a load balancer, EACH capable of handling ANY request
```
This only works correctly if **any** of the 5 servers can handle **any** incoming request — which requires the application to be effectively **stateless** at the server level. If a server keeps session data in its own local memory (an in-memory `IMemoryCache` storing "is this user logged in"), a request routed to a *different* server than the one that handled the user's login has no idea who they are.

**What "designing for horizontal scaling" actually requires:**
- **Externalizing session/state** — moving session data to a shared store (Redis, a database) that every server instance can read, rather than keeping it in one server's local memory.
- **Sticky sessions as a partial workaround** — configuring the load balancer to always route a given user to the *same* server (based on a cookie) sidesteps the problem without externalizing state, but reintroduces a single point of failure for that user (if their assigned server goes down, their session is lost) and complicates even traffic distribution.
- **Idempotent, side-effect-aware request handling** — since requests from the same logical operation might not always land on the same server (especially with retries), handlers need to tolerate that reality rather than assuming continuity across requests.

**Common Pitfall:** adding more server instances behind a load balancer as a scaling fix, without first checking whether the application holds any server-local state — this doesn't scale throughput at all if requests requiring that local state keep failing or behaving inconsistently on servers that don't have it, and simply reveals the statelessness gap as intermittent, confusing bugs rather than raw capacity.

---

## Advanced — Question 4

**Q4: What is a Bloom Filter, and how does it let a system check "might this exist?" using a tiny fraction of the memory a full lookup structure would require?**

A Bloom Filter is a probabilistic data structure that can tell you **definitely not present** or **possibly present** for a given item — trading a small, tunable false-positive rate for dramatically lower memory usage than storing the actual set of items would require, useful when you need to cheaply rule out the vast majority of "definitely not there" cases before paying for an expensive lookup.

**The Mechanism (conceptually):**
```text
A Bloom Filter is a bit array + several hash functions.
Adding "user123": hash it with 3 different hash functions -> set 3 corresponding bits to 1
Checking "user456": hash it the same 3 ways -> check those 3 bit positions
    - If ANY of the 3 bits is 0 -> DEFINITELY not in the set
    - If ALL 3 bits are 1 -> POSSIBLY in the set (could be a false positive from bit overlap)
```
Because multiple different inputs can happen to set overlapping bits, a Bloom Filter can produce **false positives** (says "maybe present" for something never actually added) but **never false negatives** (if it says "definitely not present," that's always correct) — this asymmetry is exactly what makes it useful as a cheap pre-filter, not a replacement for the real lookup.

**A concrete use case — avoiding wasted disk reads in a database engine:**
```text
Cassandra/RocksDB-style LSM-tree storage engines keep a Bloom Filter per on-disk data file.
Before doing an expensive disk read to check "does key X exist in this file?",
the engine checks the file's Bloom Filter first.
  - Filter says "definitely not" -> skip this file entirely, saving a disk read
  - Filter says "maybe" -> do the actual (more expensive) disk read to confirm
```
Since a single logical read might otherwise need to check dozens of on-disk files for a key that only actually exists in one (or none) of them, a Bloom Filter per file lets the engine skip the vast majority of files with zero disk I/O, only paying the real read cost for files that might actually contain the key.

**Other common use cases:** checking whether a URL has already been crawled (web crawlers), checking whether a username is already taken before hitting the database (accepting a small false-positive rate that just triggers one extra confirming query), and detecting duplicate items in a stream without storing every item seen so far.

**Common Pitfall:** using a Bloom Filter where false positives are unacceptable — e.g., using one alone as a security check ("has this token been revoked?") without a confirming lookup for "maybe" results would incorrectly treat some *not-actually-revoked* items as revoked; a Bloom Filter is only safe to use as a cheap **pre-filter** before an authoritative check, never as the sole source of truth for a decision where false positives cause real harm.

---

## Beginner — Question 4

**Q4: What is a Content Delivery Network (CDN), and how does it reduce latency for users far from your primary servers without you having to deploy your own servers everywhere?**

A CDN is a globally distributed network of caching servers (edge nodes) operated by a third party (Cloudflare, Akamai, Azure CDN) — you configure your CDN to cache your static content, and it automatically serves that content to users from whichever edge location is geographically closest to them, without you needing to run any infrastructure in those locations yourself.

**Without a CDN — every user, everywhere, hits your one origin server directly:**
```text
User in Sydney -> requests image.jpg -> travels all the way to your origin server in Virginia
                                       -> full round-trip latency for every single request
```

**With a CDN — most requests never reach your origin server at all:**
```text
User in Sydney -> requests image.jpg -> nearest CDN edge node (Sydney)
                                       -> cache HIT: served instantly from Sydney, origin never contacted
                                       -> cache MISS (first request ever): edge fetches from origin ONCE,
                                          caches it, then serves every SUBSEQUENT Sydney request from cache
```
The very first request for a given piece of content from a given region might still need to reach your origin server — but every subsequent request from users near that same edge node is served entirely from the CDN's local cache, without touching your origin server at all.

**Why this matters beyond just "faster for users":** it also protects your origin server from load — instead of every user worldwide hitting your servers directly, the vast majority of traffic for static/cacheable content (images, CSS, JS, even entire cacheable API responses) is absorbed by the CDN's edge layer, meaning your origin infrastructure only needs to handle cache misses and genuinely dynamic, non-cacheable requests.

**Common Pitfall:** assuming a CDN automatically speeds up *everything*, including highly personalized or frequently-changing dynamic content (a user's own shopping cart, a live stock price) — CDNs excel specifically at content that's the same for many users and doesn't change every request; genuinely per-user dynamic data still needs to go to your origin server (or a properly-designed caching strategy with very short TTLs and careful invalidation) since caching it at the edge risks serving one user's private data to another.

---

## Intermediate — Question 5

**Q5: What is a Message Queue's role in "Backpressure," and how does an unbounded queue actually make a system's failure mode worse rather than better under sustained overload?**

Backpressure is the general principle that a system under more load than it can handle should signal that fact *upstream*, rather than silently absorbing unlimited work until it catastrophically fails — a message queue, when used naively without bounds, can actually mask an overload condition until it becomes far more severe than if the system had simply pushed back earlier.

**The naive assumption — "the queue absorbs the spike, so we're protected":**
```text
Producer sends 10,000 messages/second
Consumer can only process 2,000 messages/second
-- the queue happily accepts everything, growing by 8,000 messages/second, unbounded
```
For a genuinely temporary spike, this is exactly the load-leveling benefit queues provide (covered earlier). But if the producer's rate *permanently* exceeds the consumer's processing capacity (not just a brief spike), an unbounded queue doesn't protect the system — it just delays and obscures the problem, growing indefinitely while consumers fall further and further behind, until the queue itself runs out of memory/disk, or the backlog becomes so large that by the time messages are finally processed, their data is hopelessly stale and no longer useful.

**Backpressure — the system explicitly signals "slow down" back to the producer instead of endlessly absorbing:**
```csharp
// A bounded, backpressure-aware channel -- producers BLOCK (or get rejected) once the buffer is full,
// rather than growing without limit
var channel = Channel.CreateBounded<Order>(new BoundedChannelOptions(1000)
{
    FullMode = BoundedChannelFullMode.Wait // producer's WriteAsync() call itself slows down/waits
});
```
When the bounded buffer fills up, the producer's attempt to add more work explicitly slows down (or is rejected, depending on configuration) — this pushes the signal "we're overloaded" back to whoever is generating the work, potentially all the way back to an upstream system or even the original client, rather than the queue silently absorbing an ever-growing backlog that eventually fails catastrophically instead of failing early and visibly.

**Why "fail fast and visibly" is often better than "absorb everything invisibly":** a producer that gets pushed back on immediately can react (retry later, shed load, alert an operator) — a producer that's told "sure, I'll take it" by an unbounded queue has no signal anything is wrong until the eventual, much larger, harder-to-diagnose failure occurs (an out-of-memory crash, or a consumer processing hours-stale data).

**Common Pitfall:** treating "we have a message queue" as sufficient protection against overload without ever considering the queue's own bounds — an unbounded queue in front of an underpowered consumer doesn't solve a sustained (not just spiky) capacity mismatch, it just delays and amplifies the eventual failure.

---

## Advanced — Question 5

**Q5: What is the "Two Generals' Problem," and how does it explain why truly guaranteed, acknowledged agreement between two nodes over an unreliable network is provably impossible?**

The Two Generals' Problem is a classic thought experiment in distributed systems theory demonstrating that two parties communicating **only** over a network that might lose messages can never achieve *perfectly certain, mutually-confirmed* agreement — no amount of additional acknowledgment messages fixes this fundamentally, which is why real distributed systems settle for practical, probabilistic guarantees instead of theoretically perfect ones.

**The thought experiment:**
```text
General A and General B must attack a city SIMULTANEOUSLY to win, or both retreat.
They can only communicate via messengers who might be captured (message lost) crossing enemy territory.

A sends: "Attack at dawn" -> B receives it, but A doesn't know if the message arrived
B sends back: "Confirmed, attacking at dawn" -> A receives it, but B doesn't know if THIS arrived
A would need to send: "Got your confirmation" -> but now A doesn't know if THAT arrived either
... this chain of acknowledgments can continue FOREVER, and neither general can
ever have PERFECT certainty the other is really going to attack
```
No matter how many rounds of acknowledgment are added, the *very last* message in the chain is never itself acknowledged — there's always one final message whose successful delivery is uncertain, meaning perfect, mutually-known-with-certainty agreement is mathematically impossible over a network where messages can be lost.

**Why this isn't just an academic curiosity — it's exactly the TCP handshake / distributed transaction problem in disguise:** TCP's three-way handshake (covered earlier) doesn't actually solve the Two Generals' Problem — it can't, since the problem is provably unsolvable — it just makes message loss *unlikely enough in practice* (via retransmission and timeouts) that applications built on top of TCP can reasonably proceed as if agreement were certain, accepting a small residual risk rather than eliminating it entirely.

**The practical implication for distributed systems design:** this is the deep theoretical reason systems favor **idempotency and at-least-once delivery with retries** (covered extensively for messaging/Sagas) over trying to achieve theoretically perfect exactly-once semantics — since perfect, certain agreement between two nodes over an unreliable network is provably impossible, practical systems instead design for "it's fine if this happens more than once, as long as repeating it is harmless" rather than chasing an unattainable guarantee.

**Common Pitfall:** designing a critical distributed workflow assuming that "enough" retries and acknowledgments will eventually achieve perfectly certain agreement between two services — the Two Generals' Problem shows this is a category error; the correct response is designing the *operations themselves* to be safe under uncertainty (idempotent, tolerant of duplicates or ambiguous outcomes) rather than trying to engineer away the underlying, provably unavoidable uncertainty.

---
