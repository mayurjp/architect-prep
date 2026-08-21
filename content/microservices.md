# microservices — Q&A


## Beginner — Question 1

**Q1: How do microservices communicate with each other?**


There are two broad communication styles.

### 1. Synchronous (request/response — caller waits)
The caller sends a request and blocks until it gets a response. Common protocols: **HTTP/REST** and **gRPC**.

```csharp
// OrderService calling InventoryService synchronously via HttpClient
public class InventoryClient
{
    private readonly HttpClient _http;
    public InventoryClient(HttpClient http) => _http = http;

    public async Task<bool> IsInStock(int productId)
    {
        var response = await _http.GetAsync($"/api/inventory/{productId}");
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<StockDto>();
        return result.Available;
    }
}
```

```csharp
// Registered with a typed client in Program.cs
builder.Services.AddHttpClient<InventoryClient>(c =>
    c.BaseAddress = new Uri("https://inventory-service"));
```

### 2. Asynchronous (messaging — caller doesn't wait)
The sender publishes a message to a **broker** (RabbitMQ, Azure Service Bus, Kafka). Receivers consume it whenever they're ready.

```csharp
// OrderService publishing an event after an order is placed
public async Task PlaceOrder(Order order)
{
    await _repository.SaveAsync(order);
    // Fire-and-forget event; PaymentService & InventoryService react later
    await _publisher.Publish(new OrderPlacedEvent(order.Id, order.Total));
}
```

### When to use which?

| Use Synchronous when... | Use Asynchronous when... |
|------------------------|--------------------------|
| You need an immediate answer | The work can happen in the background |
| Simple query (get user, check stock) | Multiple services react to one event |
| Low coupling tolerance is okay | You want loose coupling & resilience |

**Key trade-off:** Synchronous calls are simple but create **temporal coupling** — if `InventoryService` is down, `OrderService` fails too. Asynchronous messaging avoids this but adds complexity (eventual consistency, broker infrastructure).

**Rule of thumb:** Prefer **async messaging for commands/events between services**, and reserve **sync calls for genuine queries** where you need data right now.

---

## Beginner — Question 2

**Q2: What is the "Database-per-Service" pattern, and why does it matter?**


Each microservice owns its **own private database**. No other service reads or writes it directly — they must go through the owning service's API.

- **Forbidden:** `PaymentService` running a SQL query against `OrderDb`.
- **Correct:** `PaymentService` calls `OrderService`'s API (or listens to its events).

### Why it matters
1. **Loose coupling / independent evolution** — change your schema without breaking others.
2. **Independent scaling** — read-heavy vs. write-heavy stores scale differently.
3. **Polyglot persistence** — each service picks the right store:

| Service | Database | Why |
|---------|----------|-----|
| OrderService | SQL Server | Relational, transactional |
| CatalogService | MongoDB | Flexible product documents |
| CartService | Redis | Fast, ephemeral key-value |
| SearchService | Elasticsearch | Full-text search |

```csharp
// OrderService — Program.cs
builder.Services.AddDbContext<OrderDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("OrderDb")));

// PaymentService — Program.cs (completely separate app)
builder.Services.AddDbContext<PaymentDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("PaymentDb")));
```

### The hard part: data that spans services
You can't `JOIN` across databases. Two options:
- **API composition** — the caller queries each service and stitches results together.
- **Data replication via events** — keep a local read-only copy, updated by listening to events (e.g. `ProductUpdated`).

**The big trade-off:** You **lose ACID transactions across services**. This forces **eventual consistency** and patterns like the **Saga** (Q7).

**Key principle:** *A microservice that shares its database with another isn't really independent — it's a distributed monolith, the worst of both worlds.*

---

## Beginner — Question 3

**Q3: How do services find each other? What is Service Discovery?**


Service instances come and go — they scale, crash, restart, get new IPs. **Hardcoding** addresses breaks. Service Discovery answers "where is service X *right now*?"

### Two approaches
- **Client-side discovery** — the client queries a **service registry** (Consul, Eureka), gets healthy instances, and load-balances itself.
- **Server-side discovery** — the client calls a stable name; infrastructure (load balancer/orchestrator) resolves and routes.

### In modern .NET: Kubernetes does it for you
Kubernetes provides discovery built-in **via DNS**. Create a K8s `Service` named `order-service`, and any pod calls it by name:

```csharp
// No registry code needed — K8s DNS resolves "order-service"
builder.Services.AddHttpClient<OrderClient>(c =>
    c.BaseAddress = new Uri("http://order-service"));
```

Kubernetes uses **liveness/readiness probes** to route only to healthy pods. Expose health endpoints:

```csharp
// Program.cs — expose a health check for the orchestrator to probe
builder.Services.AddHealthChecks()
    .AddDbContextCheck<OrderDbContext>();  // is the DB reachable?

var app = builder.Build();
app.MapHealthChecks("/health");
app.Run();
```

```yaml
# Kubernetes probes this endpoint; unhealthy pods get no traffic
readinessProbe:
  httpGet:
    path: /health
    port: 80
```

### .NET Aspire (modern local dev)

```csharp
// AppHost — Aspire orchestration
var inventory = builder.AddProject<Projects.InventoryService>("inventory");
builder.AddProject<Projects.OrderService>("orders")
       .WithReference(inventory);  // OrderService can now resolve "inventory"
```

| Environment | Discovery mechanism |
|-------------|--------------------|
| Local dev | .NET Aspire, docker-compose DNS |
| Kubernetes | Built-in DNS + Services (most common) |
| Classic/VMs | Consul, Eureka + client library |
| Azure | Azure Service Fabric / App Config |

**Key takeaway:** You rarely hand-roll a registry today. **Kubernetes DNS** (prod) and **.NET Aspire** (dev) handle discovery — your job is to expose **health checks** so only healthy instances receive traffic.

---

## Intermediate — Question 1

**Q1: How do you build resilience? (Retry, Timeout, Circuit Breaker)**


In a distributed system, **failure is normal**. If a request touches 5 services each 99% reliable, combined success is only ~95%. In .NET, resilience is implemented with **Polly** (via `Microsoft.Extensions.Http.Resilience`).

### 1. Timeout — never wait forever
```csharp
new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(3));
```

### 2. Retry — handle transient blips (with exponential backoff + jitter)
```csharp
.AddRetry(new RetryStrategyOptions
{
    MaxRetryAttempts = 3,
    BackoffType = DelayBackoffType.Exponential,  // 1s, 2s, 4s...
    UseJitter = true,                             // avoid thundering herd
    ShouldHandle = new PredicateBuilder()
        .Handle<HttpRequestException>()
        .HandleResult(r => r.StatusCode == HttpStatusCode.ServiceUnavailable)
});
```
> ⚠️ **Only retry idempotent operations.** Retrying "charge payment" could double-charge.

### 3. Circuit Breaker — stop beating a dead service

Three states:
```text
CLOSED  ──(failures exceed threshold)──►  OPEN
  ▲                                         │
  │                                    (cooldown elapses)
  │                                         ▼
  └──────(test succeeds)──────────  HALF-OPEN
                                    (lets one trial request through)
```

```csharp
.AddCircuitBreaker(new CircuitBreakerStrategyOptions
{
    FailureRatio = 0.5,                        // trip if 50% fail
    MinimumThroughput = 10,                    // over ≥10 calls
    SamplingDuration = TimeSpan.FromSeconds(30),
    BreakDuration = TimeSpan.FromSeconds(30)   // stay open 30s
});
```

### Putting it together on an HttpClient (order: Retry → Circuit Breaker → Timeout)
```csharp
builder.Services.AddHttpClient<InventoryClient>()
    .AddResilienceHandler("inventory-pipeline", pipeline =>
    {
        pipeline.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true
        });
        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            BreakDuration = TimeSpan.FromSeconds(30)
        });
        pipeline.AddTimeout(TimeSpan.FromSeconds(3));
    });
```

```csharp
// Or the built-in sensible defaults
builder.Services.AddHttpClient<InventoryClient>()
    .AddStandardResilienceHandler();  // retry + CB + timeout preconfigured
```

### 4. Fallback — degrade gracefully
```csharp
.AddFallback(new FallbackStrategyOptions<HttpResponseMessage>
{
    FallbackAction = _ => Outcome.FromResultAsValueTask(CachedResponse())
});
```

### Bulkhead — isolate resources
Limit concurrent calls per dependency so a slow `InventoryService` can't starve calls to `PaymentService`.

| Pattern | Protects against | Analogy |
|---------|-----------------|---------|
| Timeout | Hung/slow calls | Hanging up after ringing too long |
| Retry | Transient blips | Redialing a dropped call |
| Circuit Breaker | A down dependency | A fuse that trips |
| Fallback | Total failure | A backup plan |
| Bulkhead | Resource exhaustion | Ship compartments |

**Key principle:** *Resilience is about failing fast and failing gracefully — not about never failing.*

**Key principle:** In messaging you reason about queue depth, consumer lag, and message fate — not stack traces. Backlog = scale out or DLQ a poison message. "Lost" = ack-timing bug or missing outbox. Duplicates are inevitable → idempotency is the foundation.

---

## Intermediate — Question 2

**Q2: Idempotency & the Saga Pattern**


With database-per-service you can't wrap "create order + charge payment + reserve stock" in one transaction. You need **idempotency** (safe retries) and **sagas** (coordinated multi-step workflows with compensation).

### Part 1: Idempotency
An operation is **idempotent** if doing it many times equals doing it once. Retries, timeouts, and redelivery mean the *same request can arrive twice*. The fix: a unique **idempotency key**.

```csharp
[HttpPost("charge")]
public async Task<IActionResult> Charge(
    [FromHeader(Name = "Idempotency-Key")] string key,
    ChargeRequest request)
{
    var existing = await _db.ProcessedRequests.FindAsync(key);
    if (existing is not null)
        return Ok(existing.Result);      // already processed → don't re-charge

    var result = await _paymentGateway.Charge(request);

    _db.ProcessedRequests.Add(new(key, result));
    await _db.SaveChangesAsync();
    return Ok(result);
}
```
> GET/PUT/DELETE are naturally idempotent; POST usually isn't — protect it with a key.

### Part 2: The Saga Pattern
A **saga** breaks a distributed transaction into a sequence of **local transactions**. If a step fails, run **compensating transactions** (semantic undo).

```text
Step 1: OrderService     → create order (Pending)
Step 2: PaymentService   → charge customer
Step 3: InventoryService → reserve stock
Step 4: OrderService     → mark order Confirmed

If Step 3 fails (out of stock):
   Compensate 2: PaymentService → refund customer
   Compensate 1: OrderService   → mark order Cancelled
```

**1. Choreography** — event-driven, no central coordinator:
```csharp
public async Task Handle(OrderCreatedEvent e)
{
    try
    {
        await _payments.Charge(e.CustomerId, e.Total);
        await _bus.Publish(new PaymentSucceededEvent(e.OrderId));
    }
    catch
    {
        await _bus.Publish(new PaymentFailedEvent(e.OrderId)); // triggers compensation
    }
}
```
✅ Simple, loosely coupled. ❌ Hard to visualize; logic scattered ("event spaghetti").

**2. Orchestration** — a central coordinator directs each step:
```csharp
public async Task Execute(OrderSaga saga)
{
    try
    {
        await _payment.Charge(saga.CustomerId, saga.Total);
        await _inventory.Reserve(saga.ProductId, saga.Qty);
        await _order.Confirm(saga.OrderId);
    }
    catch (InventoryException)
    {
        await _payment.Refund(saga.CustomerId, saga.Total); // compensate
        await _order.Cancel(saga.OrderId);
    }
}
```
✅ Centralized, easy to monitor. ❌ Orchestrator is a component you must build & keep available.

### In .NET: MassTransit state machine
```csharp
public class OrderStateMachine : MassTransitStateMachine<OrderState>
{
    public State AwaitingPayment { get; private set; }
    public State AwaitingStock { get; private set; }

    public OrderStateMachine()
    {
        Initially(
            When(OrderSubmitted)
                .Then(ctx => ctx.Saga.CustomerId = ctx.Message.CustomerId)
                .Send(/* charge payment command */)
                .TransitionTo(AwaitingPayment));

        During(AwaitingPayment,
            When(PaymentSucceeded)
                .Send(/* reserve stock command */)
                .TransitionTo(AwaitingStock),
            When(PaymentFailed)
                .Send(/* cancel order command */)
                .Finalize());
    }
}
```

| | Choreography | Orchestration |
|---|-------------|---------------|
| Coordination | Distributed (events) | Central coordinator |
| Coupling | Looser | Tighter |
| Best for | Simple, few steps (2–4) | Complex, many steps/branches |
| Visibility | Hard to trace | Easy to trace |

**Key principle:** Sagas trade **ACID consistency** for **eventual consistency** with explicit compensation. Every step needs a defined *undo*, and every handler must be *idempotent*.

---

## Intermediate — Question 3

**Q3: Event-Driven Architecture & the Outbox Pattern**


The **dual-write problem**: a service must **update its DB** *and* **publish an event** — two systems with no shared transaction. A crash between them corrupts the system.

```csharp
// ❌ BROKEN — dual write
await _db.SaveChangesAsync();          // ✅ order saved
await _bus.Publish(new OrderCreated()); // 💥 crash here! Event never sent.
```

### Solution: Transactional Outbox
Write the event as a **row in the same database**, in the **same transaction** as the business data. A separate process publishes those rows afterward.

```text
┌─────────────────────────────────────┐
│  SINGLE DB TRANSACTION               │
│  1. INSERT into Orders               │
│  2. INSERT into OutboxMessages       │  ← event stored as data
└─────────────────────────────────────┘
              │ (committed atomically)
              ▼
   [Outbox Processor] polls OutboxMessages
              │
              ▼
   Publishes to broker → marks row as Sent
```

```csharp
// Step 1 — write business data + event in one transaction
public async Task PlaceOrder(Order order)
{
    _db.Orders.Add(order);
    _db.OutboxMessages.Add(new OutboxMessage
    {
        Id = Guid.NewGuid(),
        Type = nameof(OrderCreated),
        Payload = JsonSerializer.Serialize(new OrderCreated(order.Id, order.Total)),
        OccurredAt = DateTime.UtcNow,
        Processed = false
    });
    await _db.SaveChangesAsync();   // ONE transaction — both or neither
}
```

```csharp
// Step 2 — a background worker publishes unsent messages
public class OutboxPublisher : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var pending = await _db.OutboxMessages
                .Where(m => !m.Processed)
                .OrderBy(m => m.OccurredAt)
                .Take(50)
                .ToListAsync(ct);

            foreach (var msg in pending)
            {
                await _bus.Publish(msg.Type, msg.Payload); // publish to broker
                msg.Processed = true;                       // mark done
            }
            await _db.SaveChangesAsync(ct);
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
        }
    }
}
```

**Trade-off: at-least-once delivery.** If the worker crashes after publishing but before marking `Processed`, it republishes → **consumers must be idempotent (Q7)**. The **inbox pattern** (record processed message IDs, skip seen ones) implements idempotent consumers.

### In .NET: MassTransit EF Core Outbox
```csharp
builder.Services.AddMassTransit(x =>
{
    x.AddEntityFrameworkOutbox<OrderDbContext>(o =>
    {
        o.UseSqlServer();
        o.UseBusOutbox();          // Publish() now writes to the outbox
    });
});
```

**Key principle:** *Never do a dual write.* Turn "update DB + send message" into a single local transaction by treating the message as data first, then publishing asynchronously.

---

## Intermediate — Question 4

**Q4: CQRS & Event Sourcing**


Two **separate** patterns often confused. CQRS is broadly useful; Event Sourcing is powerful but niche.

### Part 1: CQRS (Command Query Responsibility Segregation)
Split the model into **writes** (commands) and **reads** (queries), each optimized for its job.

```text
                    ┌──────────────┐
   Commands ───────►│  Write Model │──► Write DB (normalized, transactional)
                    └──────┬───────┘
                           │ (sync via events/projections)
                           ▼
                    ┌──────────────┐
   Queries ────────►│  Read Model  │◄── Read DB (denormalized, fast)
                    └──────────────┘
```

```csharp
// COMMAND — changes state
public record CreateOrderCommand(int CustomerId, List<Item> Items) : IRequest<Guid>;

public class CreateOrderHandler : IRequestHandler<CreateOrderCommand, Guid>
{
    public async Task<Guid> Handle(CreateOrderCommand cmd, CancellationToken ct)
    {
        var order = Order.Create(cmd.CustomerId, cmd.Items); // domain rules run here
        _writeDb.Orders.Add(order);
        await _writeDb.SaveChangesAsync(ct);
        return order.Id;
    }
}

// QUERY — reads state, changes nothing
public record GetOrderSummaryQuery(Guid OrderId) : IRequest<OrderSummaryDto>;

public class GetOrderSummaryHandler : IRequestHandler<GetOrderSummaryQuery, OrderSummaryDto>
{
    public async Task<OrderSummaryDto> Handle(GetOrderSummaryQuery q, CancellationToken ct)
        => await _readDb.OrderSummaries.FindAsync(q.OrderId); // fast denormalized read
}
```

| Level | Write side | Read side |
|-------|-----------|-----------|
| Light | Same DB | Same DB, separate query models/DTOs |
| Medium | Write DB | Read replicas |
| Full | Write DB | Separate read DB, synced via events |

**Use CQRS when:** read/write workloads differ greatly, complex domains, aggregated read shapes. **Not for:** simple CRUD.

### Part 2: Event Sourcing
Store the **sequence of events**, not current state. State is *derived* by replaying events.

```text
Event log for Account 1:
  1. AccountOpened      (balance 0)
  2. Deposited $100     → 100
  3. Deposited $80      → 180
  4. Withdrew $30       → 150   ← current state = replay of all events
```

```csharp
public Account Rehydrate(IEnumerable<IDomainEvent> events)
{
    var account = new Account();
    foreach (var e in events)
        account.Apply(e);   // each event mutates in-memory state
    return account;
}

public void Apply(IDomainEvent e) => _ = e switch
{
    Deposited d => Balance += d.Amount,
    Withdrew w  => Balance -= w.Amount,
    _ => Balance
};
```

**Benefits:** full audit trail, time travel, replay to build new read models.
**Costs:** complexity, event schema evolution, snapshots for performance, querying needs projections.
**In .NET:** use **Marten** (over PostgreSQL) or **EventStoreDB**.

| | CQRS | Event Sourcing |
|---|------|----------------|
| What | Separates read & write models | Stores events instead of state |
| Independent? | ✅ Common alone | ✅ But rare without CQRS |
| Complexity | Moderate | High |
| Use when | Read/write needs diverge | You need full history/audit/replay |

**Key principle:** Reach for CQRS when read and write concerns diverge; reach for Event Sourcing only when the history itself is valuable.

---

## Intermediate — Question 5

**Q5: What is Consumer-Driven Contract Testing (e.g., Pact), and why does it matter more in microservices than in a monolith?**

In a monolith, the compiler catches most breaking changes between modules instantly — rename a method, and every caller fails to build. Across independently-deployed microservices, there's no compiler spanning service boundaries, so a provider service can silently break every one of its consumers by changing its API shape, and nobody finds out until it's already in production.

**The Mechanism (Pact):**
1. **The consumer writes a test** describing exactly what it expects from the provider — not a full integration test, just the specific interactions it relies on.
```csharp
// Consumer-side Pact test (OrderService, consuming InventoryService)
pact.UponReceiving("a request for stock level")
    .Given("product 5 has 10 units in stock")
    .WithRequest(HttpMethod.Get, "/api/inventory/5")
    .WillRespond()
    .WithStatus(200)
    .WithJsonBody(new { productId = 5, available = 10 });
```
2. Running this test generates a **contract file** (a JSON document describing the expected request/response shape) — but crucially, this test runs against a mock, not the real InventoryService.
3. **The contract is published** to a shared Pact Broker.
4. **The provider's CI pipeline verifies the contract** — InventoryService's own build pulls every contract published by its consumers and replays those exact requests against its *real* code, asserting the actual responses still match what consumers expect.

**Why this matters specifically for microservices:**
- It catches breaking changes at the **provider's build time**, before a bad deploy ever reaches production — InventoryService's CI fails loudly if a change breaks OrderService's contract, rather than OrderService discovering it via a 500 error hours after InventoryService shipped.
- It avoids the alternative of slow, flaky, full end-to-end integration tests spanning every service just to catch interface mismatches — contract tests are fast (they don't need every service actually running) and pinpoint exactly which consumer/interaction broke.

**Common Pitfall:** writing contracts that assert on the *entire* response body rigidly (including fields the consumer doesn't actually use) — this makes contracts overly brittle, failing on harmless additive changes (a new optional field) that shouldn't be considered "breaking" at all. Contracts should describe only what the consumer actually depends on.

---

## Advanced — Question 1

**Q1: Security in Microservices**


The governing model is **zero-trust: never trust, always verify** — every service authenticates and authorizes every call.

### AuthN vs. AuthZ
| | Question | Example |
|---|----------|---------|
| **Authentication (AuthN)** | *Who are you?* | Verifying you're Alice via login |
| **Authorization (AuthZ)** | *What may you do?* | Alice can read orders but not refund |

AuthN happens **once at the edge**; AuthZ happens **everywhere**.

### Standards
- **OAuth2** — delegated authorization framework.
- **OIDC** — authentication layer on top of OAuth2.
- **JWT** — token format (`header.payload.signature`). Services verify the IdP's signature with a **public key** — no IdP call per request.

```json
// JWT payload (claims) — Base64, NOT encrypted; never put secrets here
{
  "sub": "alice",
  "roles": ["customer"],
  "scope": "orders.read orders.write",
  "iss": "https://identity.myapp.com",
  "exp": 1735689600
}
```

### Validating JWTs in .NET
```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://identity.myapp.com"; // IdP; fetches public keys
        options.Audience = "orders-api";
        options.TokenValidationParameters = new()
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();  // who are you?
app.UseAuthorization();   // are you allowed?
```

```csharp
// Policy-based authorization on a scope/claim
builder.Services.AddAuthorization(o =>
    o.AddPolicy("CanRefund", p => p.RequireClaim("scope", "orders.refund")));

[Authorize(Policy = "CanRefund")]
[HttpPost("refund")]
public IActionResult Refund(int orderId) { /* ... */ }
```

### Token propagation (across hops)
```csharp
// Forward the incoming bearer token to outgoing calls
public class TokenForwardingHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _ctx;
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage req, CancellationToken ct)
    {
        var token = _ctx.HttpContext?.Request
            .Headers.Authorization.ToString().Replace("Bearer ", "");
        if (!string.IsNullOrEmpty(token))
            req.Headers.Authorization = new("Bearer", token);
        return base.SendAsync(req, ct);
    }
}
```
More secure: **token exchange** — swap for a narrowly-scoped token per downstream call (least privilege). **Service-to-service** auth uses the OAuth2 **client-credentials** flow.

### mTLS + service mesh
**Mutual TLS** proves both ends are trusted and encrypts traffic. A **service mesh** (Istio, Linkerd) injects a **sidecar proxy** that handles mTLS & cert rotation transparently — app code untouched.

### Defense in depth
| Layer | Mechanism |
|-------|-----------|
| Edge | Gateway validates JWT, rate limits (Q3) |
| Identity | OIDC/OAuth2 via IdP (Duende, Keycloak, Entra ID) |
| Per-service AuthN | Each service validates the JWT |
| Per-service AuthZ | Policy/scope/claim checks |
| Transport | mTLS (service mesh) |
| Secrets | Vault / Key Vault — never in config |
| Data | Encrypt at rest + in transit |

**Pitfalls:** trusting the network; secrets in `appsettings.json`; long-lived tokens; AuthZ only at the gateway; secrets in JWT payloads.

**Key principle:** *Authenticate at the edge, but authorize everywhere — and assume the internal network is already hostile.*

---

## Scenario — Question 1

**Q1: A service is running slow — how do you troubleshoot?**


Method: **confirm → isolate → diagnose → fix → verify.**

### Step 1: Confirm & scope
```text
- ALL requests or SOME? ALL instances or one pod?
- Started WHEN? (correlate with deploy / spike / config change)
- Blast radius? (one service or cascading?)
```
Check **RED metrics** (p95/p99, not averages). **Golden question: "What changed?"** — 80% of incidents trace to a recent deploy/config/traffic shift.

### Step 2: Isolate with tracing
```text
Trace: GET /orders/123 — total 2000ms
├─ Gateway              50ms
├─ OrderService        1900ms  ← time is HERE
│  ├─ Auth validation     5ms
│  ├─ DB query         1850ms  ← narrowed to the database
│  └─ serialize          45ms
```

### Step 3: Diagnose by layer
**A) Database (most common):** missing index (full scan), N+1 queries, lock contention, connection pool exhaustion, stale stats.
```csharp
// N+1 problem
var orders = await _db.Orders.ToListAsync();
foreach (var o in orders) Console.WriteLine(o.Items.Count); // 💥 lazy-loads per order
// Fix — eager load
var orders = await _db.Orders.Include(o => o.Items).ToListAsync();
```
**B) Downstream dependency:** slow child span; is the circuit breaker working? retry storm?
**C) Resource saturation:** `kubectl top pod` — CPU at limit (throttling), memory near limit (GC/OOM), thread pool starvation.
**D) Thread pool starvation (.NET killer):**
```csharp
var data = _httpClient.GetAsync(url).Result;   // 💥 blocks a pool thread
var data = await _httpClient.GetAsync(url);     // ✅ async all the way
```
**E) GC pressure:** `dotnet-counters monitor -p <pid> --counters System.Runtime`
**F) Noisy neighbor:** another pod hogging node resources (fix with requests/limits).

### Step 4: Decision tree
```text
Slow service
├─ CPU/mem bound? → scale, find hot path, check starvation/GC
├─ Trace: where's the time?
│   ├─ DB span?        → indexes, N+1, pool, locks
│   ├─ downstream span?→ recurse into that service
│   └─ app code?       → profile (dotnet-trace)
└─ "What changed?" → bad deploy? → rollback first, debug after
```

### Step 5: Mitigate now, fix later
| Immediate | Proper fix |
|-----------|-----------|
| Roll back bad deploy | Fix code/query, redeploy |
| Scale out (HPA) | Add missing index |
| Trip circuit breaker | Fix slow downstream |
| Shed load / rate limit | Right-size resources & pools |

**Key principle:** Troubleshooting is disciplined narrowing, not guessing. Metrics → traces → logs/profilers. Always ask "what changed?" first.

---

## Scenario — Question 2

**Q2: How do you handle distributed transactions across multiple microservices without locking the database?**

In a monolithic application, you can wrap multiple database operations in a single SQL Transaction (`BEGIN TRAN`, `COMMIT`, `ROLLBACK`). In a microservices architecture, where each service owns its own database, traditional ACID transactions across network boundaries (like Two-Phase Commit) are disastrous for performance and availability.

**The Solution: The Saga Pattern**
A Saga is a sequence of local transactions. Each service performs its local transaction and publishes an event. The next service listens to that event and performs its local transaction.

If a local transaction fails at any point in the chain, the Saga executes **Compensating Transactions** — a series of reversal actions to undo the work done by the preceding services.

**Example (E-Commerce Order):**
1. **Order Service** creates an Order (Status: *Pending*) and publishes `OrderCreated`.
2. **Inventory Service** receives `OrderCreated`, deducts stock, and publishes `StockReserved`.
3. **Payment Service** receives `StockReserved`, attempts to charge the credit card. **(FAILS due to insufficient funds)**. It publishes `PaymentFailed`.
4. **Inventory Service** receives `PaymentFailed` and executes its compensating transaction: adding the stock back to the database.
5. **Order Service** receives `PaymentFailed` and executes its compensating transaction: updating the Order status to *Cancelled*.

**Orchestration vs. Choreography:**
- **Choreography:** Services publish events to a message bus (RabbitMQ, Kafka) and react to each other independently. Good for simple workflows (2-3 steps).
- **Orchestration:** A central controller service (the Orchestrator) tells each service what local transaction to execute. If something fails, the Orchestrator explicitly sends commands to trigger the compensations. Better for complex workflows.

---

## Scenario — Question 3

**Q3: You have an e-commerce platform. When a user submits an order, the system must reserve stock in the InventoryService and charge the card in the PaymentService. You decided to use an event-driven architecture, so the OrderService publishes an `OrderPlaced` event. Both Inventory and Payment services listen to this event. Is this a good design?**

No, this is a dangerous anti-pattern known as **Event-Driven Spaghetti** or an implicitly coupled architecture, violating the principles of clear commands vs events.

**The Flaw:**
If both services react to the `OrderPlaced` event independently:
1. What happens if the `InventoryService` succeeds (reserves stock), but the `PaymentService` fails (card declined)?
2. The `OrderService` doesn't inherently know about these failures because it just fired a fire-and-forget event. 
3. The inventory is now locked for an unpaid order, and nobody is orchestrating the rollback (compensation).

**The Solution:**
You must distinguish between **Events** (something that already happened) and **Commands** (a request for something to happen). A checkout process is a workflow, not a series of independent reactions.

You should use the **Orchestrated Saga Pattern**.
1. The `OrderService` acts as the orchestrator. It changes the order status to `Pending`.
2. It sends a direct **Command** (e.g., `ReserveStockCommand`) via the message broker *specifically routed* to the `InventoryService`.
3. The `InventoryService` attempts the reservation and replies with an event (`StockReserved` or `StockReservationFailed`).
4. The `OrderService` listens to this reply. If successful, it sends a `ChargeCardCommand` to the `PaymentService`. 
5. If the payment fails and replies with `PaymentFailed`, the `OrderService` knows exactly what to do: send a `ReleaseStockCommand` back to the `InventoryService` and mark the order as `Failed`.

This centralizes the complex workflow logic in one place (the orchestrator) rather than distributing implicit dependencies across multiple independent services.

---

## Scenario — Question 4

**Q4: A massive traffic spike caused your `OrderService` to crash because its database ran out of connections. Because the `OrderService` was down, the `CartService` and `CatalogService` also started crashing. Soon, the entire application was returning 500 Internal Server Errors. What architectural flaw caused this, and how do you prevent it?**

This is a classic **Cascading Failure**. It occurs when systems are tightly coupled and lack resilience boundaries.

**The Flaw:**
If the `CartService` makes synchronous HTTP calls to the `OrderService` while the user is checking out, and it waits infinitely (or uses a very long default timeout) for a response, its threads become blocked. When the `OrderService` goes down, the `CartService`'s thread pool quickly fills up with blocked threads, causing the `CartService` to crash (Thread Starvation). Any service calling the `CartService` then suffers the exact same fate.

**The Solution:**
You must implement the **Circuit Breaker** and **Bulkhead** patterns.

1.  **Circuit Breaker (Polly):** The `CartService` must monitor its calls to the `OrderService`. If it detects continuous failures or timeouts (e.g., 50% failure rate over 10 seconds), the circuit "trips" (opens). Once open, the `CartService` *immediately* stops making network calls to the `OrderService` and instantly returns a failure (or a fallback response) to its callers. This prevents the `CartService`'s threads from hanging and gives the `OrderService` time to recover.
2.  **Timeouts:** Never use default timeouts. Network calls must fail fast (e.g., 2-3 seconds max) to free up threads.
3.  **Bulkhead Pattern:** Isolate resources. Limit the number of concurrent outbound requests to the `OrderService` to a small pool (e.g., 50 threads). Even if the `OrderService` hangs, only those 50 threads in the `CartService` are blocked. The remaining threads can continue serving requests for completely unrelated operations, keeping the application partially functional rather than entirely dead.

---

## Advanced — Question 2

**Q2: What is the Strangler Fig pattern, and how do you use it to migrate a legacy monolith to microservices without a risky "big bang" rewrite?**

The Strangler Fig pattern (named after the vine that gradually grows around a host tree, eventually replacing it entirely) migrates a monolith incrementally by routing specific pieces of functionality to new microservices one at a time, while the monolith keeps running unchanged for everything not yet migrated.

**The Mechanism:**
```text
Before:  Client → Monolith (handles everything)

During:  Client → API Gateway/Proxy ─┬─→ Monolith (still handles most routes)
                                     └─→ New OrderService (handles /api/orders/*)

After:   Client → API Gateway ─→ OrderService, PaymentService, InventoryService...
                                  (Monolith fully decommissioned)
```
1. Place a routing layer (an API Gateway, or even just reverse-proxy rules) in front of the monolith.
2. Pick one bounded, well-understood capability (e.g., Order management) and rebuild it as a standalone microservice with its own database.
3. Update the routing layer so requests for `/api/orders/*` go to the new service; everything else still goes to the monolith.
4. Repeat for the next capability. The monolith shrinks with each iteration until — like the strangled tree — nothing of the original remains.

**Why this beats a rewrite:**
- **Continuous delivery of value:** the business keeps shipping features throughout the migration; a full rewrite typically freezes feature work for months or years while chasing feature parity with the old system.
- **Bounded risk per step:** if the new `OrderService` has a critical bug, only orders are affected — you can roll the routing rule back to the monolith instantly rather than rolling back an entire system rewrite.
- **Real production validation:** each extracted service is battle-tested with real traffic before the next piece is touched, rather than discovering systemic issues only after the "big bang" cutover.

**Common Pitfall:** extracting services in an order driven by "what's easiest" rather than "what's most valuable to decouple" — teams often strangle low-risk, low-value modules first (because it's comfortable) and never get to the tightly-coupled, high-value core that was the actual reason for migrating away from the monolith in the first place.

---

## Advanced — Question 3

**Q3: What is a Service Mesh, and what problems does it solve that application-level libraries (like Polly) don't?**

A Service Mesh is an infrastructure layer — typically implemented as a sidecar proxy (Envoy is the most common) injected next to every service instance — that handles service-to-service communication concerns (retries, timeouts, mTLS, observability) *outside* the application's own code.

**The Mechanism:**
```text
Without a mesh:
  OrderService code ──(HttpClient + Polly policies baked into C#)──► PaymentService

With a mesh:
  OrderService ──► [Envoy sidecar] ──(mTLS, retry, timeout, tracing)──► [Envoy sidecar] ──► PaymentService
```
Every Pod gets a sidecar container (in Kubernetes, injected automatically via a mutating admission webhook) that intercepts *all* inbound and outbound traffic for that Pod. Retry policies, circuit breakers, timeouts, and mutual TLS are configured centrally (via the mesh's control plane — Istio, Linkerd) and applied uniformly, without a single line of Polly or `HttpClient` configuration in any service's C# code.

**What this solves that Polly-in-code doesn't:**
- **Consistency across languages/teams:** Polly is a .NET library — a Python or Go service in the same system can't share those exact retry/circuit-breaker policies. A mesh applies the same policies regardless of what language a service is written in, since it operates at the network layer, not the application layer.
- **Centralized policy changes without redeploying services:** tightening a timeout from 3s to 1s across 40 services normally means editing and redeploying 40 codebases. With a mesh, it's a configuration change to the control plane that takes effect without touching any service's code.
- **Uniform mTLS and observability:** every hop gets encrypted transport and a trace span automatically, rather than depending on every team remembering to wire up OpenTelemetry instrumentation and certificate handling correctly in their own service.

**Common Pitfall:** adopting a service mesh as the *first* resilience investment for a small number of services (say, under 10) — the operational overhead of running and understanding a mesh's control plane is substantial, and for a small system, in-process libraries like Polly deliver most of the same resilience benefits with far less infrastructure complexity. Meshes earn their cost at genuine multi-team, multi-language, dozens-of-services scale.

---

## Beginner — Question 4

**Q4: What is the "shared library trap" in microservices, and why does sharing a common code library across service boundaries quietly reintroduce coupling?**

Teams naturally want to avoid duplicating code — validation logic, DTOs, utility functions — across multiple microservices, and reach for a shared NuGet package as the obvious fix. This works fine for genuinely stable, low-level utilities, but sharing the wrong kind of code recreates the tight coupling microservices were adopted specifically to avoid.

**The trap — sharing domain models across service boundaries:**
```csharp
// Shared.Contracts NuGet package, referenced by BOTH OrderService and PaymentService
public class Order
{
    public int Id { get; set; }
    public decimal Total { get; set; }
    public OrderStatus Status { get; set; }
}
```
If `OrderService` needs to add a new required field to `Order` for its own internal purposes, that change now ripples into `PaymentService`'s compiled dependency too — `PaymentService` must upgrade the shared package and potentially redeploy, even though nothing about *payments* actually changed. The two services are no longer independently deployable, which was the entire architectural point of splitting them apart.

**What's safe to share versus what isn't:**
- **Safe:** genuinely stable, low-level utilities with no business meaning of their own — a logging wrapper, a retry-policy helper, a base HTTP client configuration.
- **Unsafe:** domain models, DTOs representing a specific service's data, or business rule logic — these are exactly the things that change as each service evolves independently, and sharing them wires services back together at the compile-time dependency level even though they communicate over the network at runtime.

**The alternative for data that genuinely needs to cross service boundaries:** define the contract as a serialization format (a versioned JSON schema, a `.proto` file) rather than a shared compiled class — each service can then have its **own** local representation of "what an order looks like from my perspective," decoupled from any other service's internal model, communicating only through the wire format.

**Common Pitfall:** justifying a shared domain-model library as "DRY" without recognizing that in a microservices context, a small amount of duplication across service boundaries is often the *correct* trade-off for preserving independent deployability — DRY optimizes for one codebase; microservices architecture explicitly optimizes for independently evolvable codebases, and those two goals conflict at exactly this boundary.

---

## Intermediate — Question 6

**Q6: What is the Anti-Corruption Layer (ACL) pattern, and how does it protect a microservice's domain model when integrating with a legacy system or a poorly-designed external API?**

An Anti-Corruption Layer is a translation boundary that converts an external system's data shapes and concepts into your own service's clean domain model — preventing an external system's quirks, legacy naming, or inconsistent conventions from leaking into and polluting your own codebase.

**Without an ACL — the legacy system's shape leaks directly into your domain:**
```csharp
// Legacy system returns this exact awkward shape; your OrderService just uses it as-is
public class LegacyOrderResponse
{
    public string ord_id { get; set; }       // legacy naming convention
    public string cust_ref_no { get; set; }  // meaningless abbreviation from the legacy system
    public int status_cd { get; set; }       // magic numbers: 1=pending, 2=shipped, 3=???
}
// Your OrderService's business logic now has to understand THIS shape everywhere it touches orders
```

**With an ACL — a dedicated translation layer isolates the mess:**
```csharp
public class LegacyOrderAdapter
{
    public Order TranslateToOrder(LegacyOrderResponse legacy)
    {
        return new Order
        {
            Id = legacy.ord_id,
            CustomerReference = legacy.cust_ref_no,
            Status = legacy.status_cd switch
            {
                1 => OrderStatus.Pending,
                2 => OrderStatus.Shipped,
                _ => OrderStatus.Unknown
            }
        };
    }
}
// The REST of your OrderService only ever sees the clean `Order` domain type
```
Every quirk of the legacy system — its naming conventions, magic status codes, awkward nesting — is translated exactly once, inside the ACL, into your own well-designed domain model. If the legacy system changes its API, only the adapter needs updating; the business logic that consumes `Order` throughout the rest of the service remains completely untouched.

**Why this matters beyond just tidiness:** without an ACL, a legacy system's poor design decisions (inconsistent naming, magic numbers, awkward nesting) gradually spread throughout your own codebase as developers copy the external shape into more and more places for convenience — the ACL contains that "corruption" to one deliberate boundary instead of letting it metastasize.

**Common Pitfall:** building an ACL that just renames fields 1:1 without actually re-modeling the concepts to fit your domain properly — a genuine ACL should translate *concepts*, not just field names; if the legacy system's `status_cd = 1` means something subtly different from your own domain's notion of "Pending," a shallow rename-only translation still lets a mismatched concept leak through.

---

## Advanced — Question 4

**Q4: What is the Sidecar pattern, and how does it relate to (but differ from) a Service Mesh?**

A Sidecar is a helper container deployed alongside a main application container within the same Pod, sharing its network namespace and lifecycle, handling a cross-cutting concern the main application doesn't need to implement itself — the Service Mesh's sidecar proxy (covered earlier) is one specific, widely-known application of this more general pattern, not a synonym for it.

**The general Sidecar pattern — any auxiliary container solving a cross-cutting concern:**
```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: order-service          # the main application container
      image: myregistry/order-service:1.4.2
    - name: log-shipper             # a SIDECAR -- ships logs, unrelated to the mesh
      image: fluent-bit:latest
      volumeMounts:
        - { name: logs, mountPath: /var/log/app }
```
Here, `log-shipper` is a sidecar that tails the main container's log files and ships them to a centralized logging system — the application code itself doesn't need any logging-shipment logic; it just writes logs to a shared volume, and the sidecar handles getting them where they need to go.

**How the Service Mesh's proxy is a *specific* sidecar:**
```yaml
containers:
  - name: order-service
    image: myregistry/order-service:1.4.2
  - name: envoy-proxy               # ALSO a sidecar -- but specifically intercepts network traffic
    image: envoyproxy/envoy:latest
```
The mesh's Envoy sidecar is architecturally identical in shape (an auxiliary container in the same Pod) to the log-shipper example — it just happens to solve a different cross-cutting concern (network traffic interception for mTLS/retries/observability) rather than log shipping.

**Why the distinction matters:** "Sidecar" describes the deployment *shape* (a helper container co-located with the main one); "Service Mesh" describes a *specific, comprehensive system* built using that shape, dedicated entirely to service-to-service network concerns. Not every sidecar is part of a service mesh — log shippers, secret-fetching init-adjacent sidecars, and local metrics collectors are all legitimate sidecars that have nothing to do with mesh networking.

**Common Pitfall:** conflating "using sidecars" with "running a service mesh" — a team might adopt sidecar containers for logging or secrets injection without any mesh at all, and conversely, adopting a full service mesh is a much larger operational commitment (a control plane, cert rotation, mesh-wide configuration) than simply "adding a sidecar container" for one narrow purpose.

---

## Beginner — Question 5

**Q5: What is the "Database per Service" pattern's practical consequence for reporting, and why can't you just run a cross-service SQL JOIN the way a monolith could?**

In a monolith, generating a report joining Order data with Customer data is trivial — one SQL query, one database, a `JOIN` across tables. Once Orders and Customers live in genuinely separate microservices (each with its own private database, per the earlier Database-per-Service discussion), that same report can no longer be a single SQL query at all — the two pieces of data simply aren't in the same database anymore.

**What no longer works once services are properly separated:**
```sql
-- This is now IMPOSSIBLE -- OrderDb and CustomerDb are separate physical databases,
-- likely different database ENGINES entirely (SQL Server vs MongoDB), on different servers
SELECT o.OrderId, o.Total, c.Name
FROM OrderDb.dbo.Orders o
JOIN CustomerDb.dbo.Customers c ON c.Id = o.CustomerId;
```

**The realistic alternatives:**
1. **API Composition** — a reporting service calls both `OrderService`'s API and `CustomerService`'s API separately, then joins the results *in application code*, not in SQL. Simple to reason about, but means N+1-style network calls for anything beyond a small, simple report.
2. **A dedicated read model, kept in sync via events** — a reporting service subscribes to `OrderCreated` and `CustomerUpdated` events (per the earlier CQRS/event-driven discussions) and maintains its **own** denormalized copy of exactly the data it needs for reporting, already joined and shaped the way reports need it — trading storage duplication and eventual consistency for genuinely fast, SQL-JOIN-like reporting queries against data that's actually local to the reporting service.

**Why this is a real, often underestimated cost of adopting microservices:** teams migrating from a monolith frequently underestimate how much of their existing reporting/analytics tooling assumed "everything is in one database, one JOIN away" — that assumption breaks completely once services genuinely own separate databases, and building the event-driven read-model alternative (option 2) is real, non-trivial engineering work that has to be planned for, not an incidental side effect of decomposition.

**Common Pitfall:** "solving" this by quietly granting the reporting service direct read access to every other service's database, bypassing their APIs entirely — this recreates the shared-database coupling problem the Database-per-Service pattern exists specifically to avoid (any service's schema change now risks silently breaking the reporting service, since there's no API contract mediating the relationship anymore), even though it superficially "solves" the reporting problem in the short term.

---

## Intermediate — Question 7

**Q7: What is the Saga pattern's "Pivot Transaction," and why does identifying it matter for deciding which steps need compensation logic and which don't?**

In a multi-step Saga (covered earlier), not every step is equally risky to reverse — the Pivot Transaction is the specific step in the sequence after which the Saga is committed to **succeeding** (no further compensation is possible or necessary), splitting the Saga into a "can still be safely rolled back" phase before it, and a "must be pushed forward to completion, retrying if needed" phase after it.

**A concrete Saga with its pivot identified:**
```text
Step 1: OrderService     -> create order (Pending)              [COMPENSATABLE -- can cancel]
Step 2: InventoryService -> reserve stock                        [COMPENSATABLE -- can release]
Step 3: PaymentService   -> charge customer's card                [THE PIVOT TRANSACTION]
Step 4: InventoryService -> confirm stock allocation permanently  [RETRIABLE -- must eventually succeed]
Step 5: OrderService     -> mark order Confirmed                  [RETRIABLE -- must eventually succeed]
```
Steps 1-2, before the pivot, can be cleanly compensated (cancel the order, release the reserved stock) if something later fails — nothing irreversible has happened yet. Step 3 (charging the customer) is the pivot: once the charge succeeds, you generally **do not** want to compensate by refunding just because a later, comparatively minor step (like updating an internal allocation record) happens to fail — instead, steps after the pivot should be designed to **retry until they succeed**, rather than triggering a full rollback/refund for what's often a transient, recoverable failure.

**Why treating every step as equally "compensatable or retriable" is a design mistake:** if Step 4 (updating an internal stock allocation) fails right after the customer was successfully charged in Step 3, compensating by refunding the customer is usually the *wrong* response — the customer already legitimately paid, and the actual problem (an internal record needing an update) is something the system should keep retrying in the background, not something that should trigger undoing a payment that itself succeeded correctly.

**Practical implication for implementation:** steps before the pivot need genuine compensating transactions written and tested (refund logic, stock-release logic); steps after the pivot need robust **retry-with-backoff** logic instead (since they must eventually succeed, and failure there is a transient problem to push through, not a reason to unwind the whole saga) — conflating the two categories, or writing compensation logic uniformly for every step regardless of position relative to the pivot, leads to either overly aggressive rollbacks (refunding customers unnecessarily) or missing retry logic where it's actually needed.

**Common Pitfall:** writing a "one-size-fits-all" compensation strategy that treats every single Saga step identically, without explicitly identifying which specific step is the pivot — this often results in the exact wrong failure response for post-pivot steps (rolling back a payment that already succeeded) when a retry loop was the actually-correct response all along.

---

## Advanced — Question 5

**Q5: What is the Strangler Fig pattern's companion technique, "Branch by Abstraction," and how does it let you migrate a piece of internal logic incrementally without a long-lived feature branch?**

Branch by Abstraction addresses a narrower, more tactical version of the Strangler Fig migration problem (covered earlier at the service level): how do you replace a piece of logic **within a single codebase** (not necessarily extracting a whole new microservice) incrementally, while the team keeps merging to the main branch continuously, rather than working on a long-lived feature branch that risks painful merge conflicts later?

**The mechanism — introduce an abstraction layer BEFORE starting the actual replacement:**
```csharp
// Step 1: introduce an interface wrapping the EXISTING implementation, no behavior change yet
public interface IPricingEngine { decimal CalculatePrice(Order order); }

public class LegacyPricingEngine : IPricingEngine
{
    public decimal CalculatePrice(Order order) => /* existing, unchanged logic */;
}

// Application code now depends on IPricingEngine, wired to LegacyPricingEngine -- committed and deployed
```
```csharp
// Step 2: build the NEW implementation alongside the old one, behind the SAME interface
public class NewPricingEngine : IPricingEngine
{
    public decimal CalculatePrice(Order order) => /* new logic, built incrementally, over many small commits */;
}
// NewPricingEngine can be merged to main INCOMPLETE and untested in production,
// as long as it's not yet the one actually wired up via DI
```
```csharp
// Step 3: once NewPricingEngine is complete and verified (perhaps behind a feature flag first),
// flip the DI registration -- a ONE-LINE change, no merge conflicts, no long-lived branch
builder.Services.AddScoped<IPricingEngine, NewPricingEngine>(); // was LegacyPricingEngine
```

**Why this avoids the pain of a long-lived feature branch:** every step above is a small, independently mergeable, independently deployable commit to the main branch — the new implementation can be built incrementally over days or weeks of ordinary commits, without ever diverging from `main` the way a long-lived feature branch would, and without the team needing to eventually reconcile a large, conflict-prone merge once the replacement is "done."

**How this relates to the earlier Strangler Fig pattern:** Strangler Fig operates at the *architectural* level (routing traffic between an old monolith and a new extracted service); Branch by Abstraction operates at the *code* level (swapping one class's implementation for another within the same codebase/service) — both share the same underlying philosophy of incremental, reversible, continuously-integrated replacement rather than a risky all-at-once cutover, just applied at different scales.

**Common Pitfall:** introducing the abstraction interface but then building the *entire* new implementation on a separate long-lived branch anyway "to keep it clean until it's done" — this defeats the whole point of the technique, which is specifically to enable continuous integration of incomplete, in-progress new code by hiding it behind an interface that isn't yet wired up, rather than isolating it on a branch that still needs a large, risky merge eventually.

---

## Beginner — Question 6

**Q6: What is the difference between "Orchestration" and "Choreography" at the organizational/team-ownership level (beyond the technical Saga-pattern distinction covered earlier), and why does a choice that seems purely technical actually reflect a team-structure decision?**

Covered earlier purely as a technical Saga implementation choice (a central coordinator vs. independent event reactions) — the same choice has a less obvious but equally important organizational dimension: it determines which team is responsible for understanding and maintaining the *overall* business process end-to-end.

**Orchestration — ONE team/service owns the entire workflow's logic, in one place:**
```csharp
public class OrderSagaOrchestrator // ONE team (say, the Orders team) owns this ENTIRE class
{
    public async Task Execute(OrderSaga saga)
    {
        await _payment.Charge(saga.CustomerId, saga.Total);   // Orders team's code CALLS Payment's API
        await _inventory.Reserve(saga.ProductId, saga.Qty);    // and Inventory's API
        await _order.Confirm(saga.OrderId);
    }
}
```
The Orders team can read this ONE file and understand the *entire* checkout process end-to-end — but they've also taken on the responsibility of knowing about, and coordinating calls to, other teams' services directly, meaning changes to the overall *process* require the Orders team specifically, even if the change is really about how Payment and Inventory should interact.

**Choreography — EACH team owns only ITS OWN piece, with no one team seeing the whole picture in one place:**
```csharp
// In InventoryService's OWN codebase, owned by the Inventory team
public async Task Handle(OrderCreatedEvent e) { await _payments.Charge(...); await _bus.Publish(new PaymentSucceededEvent()); }

// In PaymentService's OWN codebase, owned by the Payments team, REACTING independently
public async Task Handle(PaymentSucceededEvent e) { /* ... */ }
```
No single file or team owns the "whole" checkout process — understanding the complete flow requires reading code spread across multiple teams' independently-owned repositories, but each team has full autonomy over their own specific piece without needing another team's central orchestrator to change.

**Why this is genuinely a team-structure decision, not purely a technical one:** Orchestration concentrates cross-service process knowledge (and the coordination burden) in one team; Choreography distributes it, trading "any one person can read one file to understand the whole flow" for "each team is fully autonomous over their own piece, with no central coordinator to become a bottleneck for cross-team changes" — this is a direct instance of Conway's Law (system architecture tends to mirror the communication structure of the organization building it) playing out in a very concrete, practical way.

**Common Pitfall:** choosing Choreography purely for its technical decoupling benefits without considering that "who do I even ask to understand this end-to-end business process" becomes a genuinely harder organizational question once no single team/codebase owns the full picture — for a process with real business-criticality and complexity (the earlier checkout Saga example), some teams deliberately choose Orchestration specifically to preserve a single, readable source of truth for the overall process, accepting the coordination cost as worthwhile for that specific process's complexity.

---

## Intermediate — Question 8

**Q8: What is the "Saga Choreography Event Chain Depth" problem, and how does a seemingly simple choreographed Saga become nearly impossible to reason about once event chains grow beyond 3-4 hops?**

Building directly on the Choreography vs. Orchestration trade-off (covered in the previous question and earlier under the Saga pattern) — Choreography's "no central coordinator" benefit has a specific, well-known failure mode as the *number of steps* in a business process grows: the event chain becomes long enough that literally no single person can hold the entire flow in their head, and debugging a stuck process requires manually tracing through many independently-owned services' event handlers.

**A SHORT choreographed chain — manageable, easy to reason about:**
```text
OrderCreated -> (Inventory reacts) -> StockReserved -> (Payment reacts) -> PaymentCompleted
-- 3 services, 2 event hops -- a developer can trace this by reading 3 codebases
```

**A LONGER choreographed chain — the same pattern, but now genuinely hard to reason about:**
```text
OrderCreated -> StockReserved -> PaymentCompleted -> ShippingLabelGenerated ->
WarehouseNotified -> CarrierPickupScheduled -> CustomerNotified -> LoyaltyPointsAwarded ->
InvoiceGenerated -> AccountingRecordCreated
-- 10 services, 9 event hops -- understanding "what happens when an order is placed"
   now requires reading code across TEN independently-owned, independently-deployed codebases
```
At this depth, there's no single place to look to answer "what's the complete sequence of things that happen when a customer places an order" — the actual business process only exists implicitly, scattered as a chain of independent event-reaction pairs across ten different teams' codebases, discoverable only by manually tracing published/subscribed event types through each one.

**Why this specifically makes debugging a stuck process painful:** if an order gets "stuck" somewhere in this ten-hop chain, diagnosing *where* requires checking each service in the chain individually (does `WarehouseNotified` show up in the logs? did `CarrierPickupScheduled` ever fire?) — there's no single orchestrator's state machine you could inspect to immediately see "we're stuck at step 6 of 10"; distributed tracing (covered earlier, correlation IDs across the whole chain) becomes not just helpful but close to mandatory once chains grow this long, since it's the only practical way to reconstruct the actual sequence of what happened for one specific order.

**The practical mitigation — reaching for Orchestration once chain depth crosses a complexity threshold:** teams that start with Choreography for a simple, short process often deliberately migrate to an Orchestrator once the process has organically grown to this kind of depth over time — not because Choreography is "wrong," but because the trade-off that favored it (simplicity, autonomy) at 3 hops inverts once the same process has organically grown to 10 hops, and centralizing the coordination logic (even at the cost of the earlier-covered team-ownership trade-off) becomes the more maintainable choice.

**Common Pitfall:** letting a choreographed process's event chain grow organically, one new event-reaction pair at a time, without ever stepping back to assess the *overall* chain's depth and complexity — since each individual addition (one more service reacting to one more event) looks like a small, contained change from the perspective of the team making it, the *cumulative* complexity of the entire chain can silently cross the point where Choreography's benefits still outweigh its debugging/comprehension costs, without any single change feeling like the "problem."

---

## Advanced — Question 6

**Q6: What is the "Distributed Monolith" anti-pattern, and how can a system that's technically split into many separate services still fail to deliver microservices' actual promised benefits?**

A Distributed Monolith has all the *operational* complexity of microservices (many separately-deployed services, network calls between them, distributed tracing needed to debug) while retaining the *coupling* of a monolith (services can't actually be deployed independently, because they're too tightly coupled to each other's internal details) — arguably the worst of both worlds, rather than a genuine microservices architecture.

**The telltale sign — deploying ONE service requires ALSO deploying others, in lockstep:**
```text
"We need to deploy OrderService v2.3, but it requires InventoryService v1.8 to already be
deployed first, and PaymentService needs a coordinated schema migration at the SAME TIME,
so we always deploy all three together as one coordinated release"
```
If services can't genuinely be deployed independently — if deploying one *requires* coordinating deployment of others in a specific order or at the same time — the fundamental promise of microservices (independent deployability, covered as the very first principle in this topic) has already been lost, regardless of how many separate services/repositories/deployment pipelines technically exist.

**Common root causes producing this anti-pattern:**
- **Shared database** (the earlier Database-per-Service violation) — services aren't genuinely independent if they share tables, since a schema change to one can silently break another.
- **Synchronous call chains with no resilience** (the earlier cascading-failure scenario) — if Service A always calls B, which always calls C, synchronously, with no timeouts/circuit breakers, the services are operationally coupled even if their code lives in separate repositories.
- **Shared domain-model libraries** (covered earlier as the "shared library trap") — compile-time coupling through a shared NuGet package recreates deployment coordination requirements even across "separate" services.
- **Overly chatty, tightly-sequenced APIs** — if completing one business operation requires Service A to call B, which must complete before calling C, which must complete before calling D, all synchronously and in a rigid sequence, the services are behaviorally coupled into what's functionally a distributed function call chain, not autonomous services.

**Why this matters as a diagnosis, not just a definition:** a team that has "done microservices" (split a monolith into 15 separate deployable services) but still can't deploy any single one independently without coordinating with several others hasn't actually achieved the architectural benefits microservices are meant to provide — they've paid the full *operational* cost (network calls, distributed debugging, more infrastructure to manage) without receiving the actual payoff (independent, autonomous team ownership and deployment), which is a worse outcome than either a well-structured monolith or genuine microservices.

**Common Pitfall:** measuring "microservices success" purely by counting the number of separately-deployable-looking services that exist, without actually verifying whether any of them can be deployed genuinely independently in practice — the actual test of whether a system has achieved microservices' core benefit isn't "how many services do we have," it's "can Team X deploy their service on Tuesday afternoon without needing Team Y or Team Z to coordinate anything at all."

---

## Beginner — Question 7

**Q7: What is a "Service Registry," and how does it let one microservice discover the current network location of another WITHOUT hardcoding IP addresses anywhere?**

A Service Registry is a directory that tracks the current, live network location (IP + port) of every running instance of every service — services register themselves with it on startup (and deregister on shutdown), and other services query it to discover where to actually send a request, rather than any service ever hardcoding another's address.

```text
1. OrderService instance starts up -> registers itself: "OrderService is at 10.0.1.15:8080"
2. PaymentService needs to call OrderService -> queries the registry: "where is OrderService right now?"
3. Registry responds: "10.0.1.15:8080, 10.0.1.22:8080" (TWO currently-running instances)
4. PaymentService picks one (often via a load-balancing strategy) and sends its request there
```
Because instances register/deregister dynamically, the registry always reflects the *current* reality — if an instance crashes, scales down, or a new one is added, the registry's contents change automatically, and every other service querying it sees the updated set of available locations, without any service's own configuration needing to be manually updated.

**Why this matters specifically in containerized/cloud environments:** a container's IP address is essentially unpredictable and constantly changing (scaling events, deployments, node rescheduling) — hardcoding IPs anywhere would break the moment any instance restarts at a new address; a Service Registry (Kubernetes' own built-in Service/DNS mechanism, or a dedicated tool like Consul/Eureka) is what makes dynamic, elastic infrastructure workable at all for inter-service communication.

**Common Pitfall:** treating a Service Registry as something application code must explicitly query via its own API calls in every codebase — in most modern setups (particularly Kubernetes), service discovery is handled transparently via DNS (calling `http://payment-service` resolves automatically to the current instances) rather than requiring explicit registry-lookup code scattered throughout the application; understanding that a registry exists underneath is valuable, but application code rarely needs to interact with it directly in a Kubernetes-based deployment.

---

## Intermediate — Question 9

**Q9: What is the "Strangler Fig Pattern" for incrementally migrating a monolith to microservices, and why is it favored over a "big bang" full rewrite?**

The Strangler Fig Pattern (named after the strangler fig vine, which gradually grows around and eventually replaces its host tree) incrementally routes specific pieces of functionality away from an existing monolith to new microservices, one capability at a time, while the monolith continues handling everything not yet migrated — rather than attempting a complete, all-at-once rewrite.

```text
Phase 1: A routing layer (reverse proxy/API gateway) sits in front of the monolith,
         initially routing 100% of traffic to it, unchanged.

Phase 2: The "Inventory" capability is extracted into a new InventoryService.
         The routing layer now sends /api/inventory/* requests to InventoryService,
         and everything else still goes to the monolith.

Phase 3: "Orders" gets extracted next. Routing updated again.
         ... repeat, one capability at a time ...

Eventually: the monolith has been "strangled" down to nothing (or a small remaining core),
            having been gradually replaced piece by piece, with the system remaining
            fully functional and deployable at every single intermediate step.
```
At every phase, the overall system remains fully working and independently deployable — unlike a big-bang rewrite (build the entire new system in parallel, then cut over all at once), the Strangler Fig approach never has a long period where neither the old nor the new system is fully functional, and each individual extraction can be validated in production before moving to the next.

**Why big-bang rewrites are specifically risky, and why this pattern avoids that risk:** a full parallel rewrite typically takes far longer than estimated, accumulates its own new bugs the old system doesn't have, and requires a single, high-stakes cutover moment where everything switches at once — if that cutover reveals a serious problem, there's often no easy way back, since the old system has been neglected (no bug fixes, no feature parity) throughout the rewrite. The Strangler Fig Pattern's incremental extractions each carry much lower individual risk, with the monolith remaining a safe fallback for everything not yet migrated.

**Common Pitfall:** starting a Strangler Fig migration with the *hardest*, most deeply-coupled capability first (attempting to prove the approach on the riskiest possible piece) — the pattern's actual risk-reduction benefit comes from validating the approach (routing layer, new service's operational maturity, team's unfamiliarity with the new stack) on a lower-risk, more isolated capability first, building confidence and infrastructure before tackling the monolith's most deeply entangled, highest-risk pieces.

---

## Advanced — Question 7

**Q7: What is the "Backends for Frontends" (BFF) pattern's relationship to API Gateway "sprawl," and how does having ONE gateway per client type (rather than one shared gateway for all clients) avoid a specific coordination bottleneck?**

A single, shared API Gateway serving every client type (web, mobile, third-party partners) inevitably accumulates client-specific logic for each of them, all mixed together in one codebase — every client team needing a gateway change must coordinate through whichever team owns the shared gateway, which becomes an organizational bottleneck as the number of distinct client types grows. The BFF pattern instead gives each client type its *own*, dedicated gateway/aggregation layer, owned by (or closely aligned with) that client's own team.

```text
WITHOUT BFF -- one shared gateway, serving every client type:
  Mobile team needs endpoint change -> must coordinate with the Gateway team
  Web team needs different response shaping -> ALSO must coordinate with the Gateway team
  Partner API team needs their own versioning scheme -> ALSO the Gateway team
  -> the shared Gateway team becomes a bottleneck every other team must funnel through

WITH BFF -- one gateway PER client type, owned closer to that client's own team:
  Mobile-BFF (owned by/aligned with the mobile team) -- changes independently
  Web-BFF (owned by/aligned with the web team) -- changes independently
  Partner-BFF (owned by/aligned with the partner integrations team) -- changes independently
  -> each client type's team can evolve ITS OWN gateway without coordinating with the others
```
Because each BFF is scoped to exactly one client type's specific needs, a mobile-specific optimization (the aggregation example covered under the Web API topic) lives entirely within Mobile-BFF's codebase, changeable by the mobile team without needing sign-off from whoever owns the web-facing BFF — this mirrors microservices' core promise of independent team ownership, applied specifically to the gateway/aggregation layer rather than just the backend services themselves.

**The trade-off this pattern accepts:** multiple BFFs mean more services to operate, deploy, and monitor than a single shared gateway would require — genuinely worthwhile specifically when different client types have meaningfully divergent needs (a mobile app's aggressive response-shaping/bandwidth needs are legitimately different from a partner API's versioning and stability requirements); for an organization with only one client type, or clients with near-identical needs, a single shared gateway avoids this multiplication of operational surface without losing much.

**Common Pitfall:** adopting BFFs merely because "it's a recognized pattern," in an organization where client needs are actually quite similar across client types — this multiplies the number of deployable services and operational surface area for a coordination problem that, in that specific context, wasn't actually severe enough to justify the added complexity; BFF earns its keep specifically when a single shared gateway has become a demonstrated, real coordination bottleneck, not as a default architectural choice applied preemptively.

---

## Beginner — Question 8

**Q8: What is a "Health Check Endpoint," and how does distinguishing between "Liveness" (is the process alive) and "Readiness" (is the service ready to receive traffic) let an orchestrator make two genuinely different decisions?**

A health check endpoint lets an orchestrator (or load balancer) query a service's own self-reported status — but a single, generic "health" check conflates two genuinely different questions: Liveness ("is this process still running/responsive at all, or should it be restarted?") and Readiness ("is this instance currently able to correctly serve traffic right now, or should it be temporarily removed from the load balancer's rotation?").

```csharp
app.MapGet("/health/live", () => Results.Ok("Alive"));   // LIVENESS -- is the process itself responsive?

app.MapGet("/health/ready", async (IDbConnection db, IMessageQueueClient mq) =>
{
    if (!await db.CanConnectAsync()) return Results.StatusCode(503);      // NOT ready -- DB unreachable
    if (!await mq.CanConnectAsync()) return Results.StatusCode(503);      // NOT ready -- queue unreachable
    return Results.Ok("Ready");                                          // genuinely ready for traffic
});
```
A service instance might be perfectly *alive* (the process is running, responding to requests) while temporarily *not ready* (its database connection just dropped, or it's still warming up a cache after startup) — an orchestrator seeing a failing Liveness check restarts the Pod/container entirely; an orchestrator seeing a failing Readiness check instead simply removes that instance from load-balancer rotation temporarily, without restarting anything, since restarting wouldn't actually fix "the database is temporarily unreachable."

**Why conflating these into one check produces the WRONG remediation action:** if Readiness-style logic (checking database connectivity) were used as the Liveness check instead, a temporary database outage would cause the orchestrator to repeatedly restart perfectly healthy application processes — restarting doesn't fix an external database being down, so this produces a pointless, potentially harmful restart loop instead of the correct response (simply routing traffic away until the dependency recovers).

**Common Pitfall:** implementing only a single, combined "health" endpoint that checks everything (process health AND all downstream dependencies) and wiring it to BOTH Liveness and Readiness probes identically — this is exactly the conflation described above, risking unnecessary restart loops during a transient downstream dependency outage that should have been handled by traffic-routing (Readiness) alone, not process restarts (Liveness).

---

## Intermediate — Question 10

**Q10: What is "Consumer-Driven Contract Testing," and how does having each CONSUMER service publish its own expectations of a producer's API let a producer verify compatibility without needing full end-to-end integration tests spun up for every consumer?**

Consumer-Driven Contract Testing has each consumer of a service publish a "contract" — a concrete, executable specification of exactly what fields/behavior it actually relies on from that producer's API — the producer then runs these contracts as part of its own test suite, verifying it hasn't broken any consumer's actual, real-world usage, without needing to spin up every consumer's full application in an end-to-end test environment.

```text
Consumer (OrderService) publishes a CONTRACT describing what it actually needs from PaymentService:
  "When I call GET /payments/{id}, I expect a response containing AT LEAST:
   { status: string, amount: number } -- these specific fields, this specific shape"

Producer (PaymentService)'s OWN test suite runs THIS EXACT CONTRACT against its real implementation:
  -> if PaymentService's team later renames "status" to "paymentStatus", the CONTRACT TEST FAILS
     immediately, in PaymentService's OWN CI pipeline -- BEFORE it's ever deployed and breaks OrderService
```
Because the contract is executable and runs directly against the producer's own test suite, a producer team gets fast, automated, pre-deployment feedback the moment their change would break a specific consumer's actual documented expectations — without needing OrderService's full application running anywhere, and without waiting for the breakage to be discovered only after both services are deployed together in a shared environment.

**Why this specifically solves what full end-to-end integration testing struggles with at microservices scale:** spinning up every consumer's entire application just to verify one producer's change is compatible becomes increasingly impractical as the number of services and consumers grows — Consumer-Driven Contracts instead let each producer verify compatibility against a lightweight, focused *specification* of what consumers actually need, rather than the consumers' entire running applications, making this kind of cross-service compatibility verification practical even at significant scale.

**Common Pitfall:** consumer teams writing contracts that assert far more than they actually rely on (asserting the presence and exact values of every field in a response, rather than just the specific fields the consumer's own code actually reads) — an overly broad contract makes the producer's contract tests fail for changes that wouldn't have actually broken the consumer at all (adding a new, unrelated field, for instance), creating unnecessary friction; a well-written contract should assert only what the consumer genuinely depends on, not the producer's entire response shape.

---

## Advanced — Question 8

**Q8: What is the "Sidecar Pattern" for extending a service's capabilities (as distinct from a Service Mesh's sidecar proxy specifically), and how does deploying a helper process ALONGSIDE the main application container let cross-cutting functionality be added without modifying the application's own code?**

The Sidecar Pattern deploys a separate, helper container alongside a service's main application container, within the same Pod (sharing network namespace and, optionally, storage volumes) — the sidecar handles some cross-cutting concern (log shipping, configuration reloading, a service mesh proxy) entirely independently of the main application's own code, which remains completely unaware the sidecar even exists.

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: app                     # the MAIN application -- completely UNAWARE any sidecar exists
      image: myapp:latest
      volumeMounts:
        - { name: logs, mountPath: /var/log/app }

    - name: log-shipper              # the SIDECAR -- ships logs to a central aggregator
      image: fluentbit:latest
      volumeMounts:
        - { name: logs, mountPath: /var/log/app }   # reads the SAME shared volume the app writes to

  volumes:
    - name: logs
      emptyDir: {}
```
The main `app` container simply writes its logs to a local file, exactly as it always would, with zero code or configuration aware that anything else is watching that directory — the `log-shipper` sidecar, running as a completely separate process/container within the same Pod, independently reads and ships those same log files to a central aggregation system, entirely decoupled from the main application's own implementation.

**Why this is the SAME general pattern underlying a Service Mesh's proxy sidecar (covered under system design):** a Service Mesh's per-Pod proxy (Envoy, in Istio's case) is really just one specific, widely-adopted application of this same general Sidecar Pattern — intercepting network traffic transparently, without the main application needing any code changes at all to gain mTLS, retries, or observability; recognizing the Sidecar Pattern as the underlying general concept helps understand why service mesh proxies are architected the way they are, rather than treating service mesh as an entirely separate, unrelated mechanism.

**Common Pitfall:** using a sidecar for functionality that's actually tightly coupled to the main application's own request-handling logic (rather than a genuinely independent, cross-cutting concern like log shipping or a network proxy) — the Sidecar Pattern works best for concerns the main application can remain entirely oblivious to; forcing a sidecar to handle logic requiring tight, synchronous coordination with the main application's own request-processing defeats the pattern's core benefit of clean, code-free decoupling.

---

## Beginner — Question 9

**Q9: What is "API Gateway" pattern, and how does it let external clients interact with a SINGLE entry point rather than needing to know the individual network locations of every backend microservice?**

An API Gateway sits between external clients and the internal collection of microservices, providing one single, unified entry point — clients only ever need to know the gateway's address, never the individual internal addresses of the many separate services actually handling requests behind it.

```text
WITHOUT an API Gateway -- clients must know EVERY individual service's address:
  Mobile app calls Orders Service DIRECTLY at orders.internal:8081
  Mobile app calls Inventory Service DIRECTLY at inventory.internal:8082
  Mobile app calls Payments Service DIRECTLY at payments.internal:8083
  -- client needs to know THREE separate addresses, and update ALL of them if any service MOVES --

WITH an API Gateway -- ONE single entry point, routing internally:
  Mobile app calls gateway.example.com/orders -> Gateway ROUTES internally to Orders Service
  Mobile app calls gateway.example.com/inventory -> Gateway ROUTES internally to Inventory Service
  Mobile app calls gateway.example.com/payments -> Gateway ROUTES internally to Payments Service
  -- client only EVER needs to know ONE address: gateway.example.com --
```
The Gateway internally routes each incoming request to whichever specific backend service actually handles it — if `Orders Service`'s internal address changes (a redeployment, a service moving to a different cluster), only the Gateway's own internal routing configuration needs updating, with zero changes required to any client application at all.

**Why this also creates a natural, centralized place for genuinely cross-cutting concerns:** beyond routing, an API Gateway is also a natural place to apply concerns that would otherwise need to be duplicated across every individual service (authentication, rate limiting, request logging) — rather than every microservice implementing its own copy of these cross-cutting concerns, the Gateway can apply them once, centrally, for every request passing through it.

**Common Pitfall:** exposing every individual microservice's address directly to external clients, without any Gateway layer at all — this couples clients tightly to the current internal service topology, meaning any internal restructuring (splitting, merging, or relocating services) directly breaks or requires updating every client application, rather than being absorbed transparently by a Gateway's internal routing configuration.

---

## Intermediate — Question 11

**Q11: What is a "Domain Event" (as distinct from an Integration Event, covered elsewhere), and how does keeping it scoped to WITHIN a single service's own boundary (never published externally) differ from an event meant for OTHER services to consume?**

A Domain Event represents something significant that happened *within* a service's own internal domain logic (an `OrderConfirmed` event raised internally when an order transitions state) — critically, a Domain Event is scoped to that service's own internal boundary, used to trigger internal side effects (updating related internal state, triggering internal workflows) WITHOUT necessarily being published externally for other services to consume at all.

```csharp
public class Order
{
    private readonly List<object> _domainEvents = new();
    public void Confirm()
    {
        Status = "Confirmed";
        _domainEvents.Add(new OrderConfirmedDomainEvent(Id)); // INTERNAL event -- NOT necessarily published externally
    }
}

// Internally, WITHIN this SAME service, other internal handlers react to this DOMAIN event:
public class UpdateInventoryReservationHandler // an INTERNAL handler, in the SAME service/process
{
    public void Handle(OrderConfirmedDomainEvent e) { /* internal side effect, WITHIN this service */ }
}

// SEPARATELY, an INTEGRATION EVENT (covered elsewhere) is EXPLICITLY published externally,
// for OTHER services to consume -- a DELIBERATE, SEPARATE decision from the internal Domain Event above:
await _eventBus.PublishAsync(new OrderConfirmedIntegrationEvent(Id)); // NOW other services CAN see this
```
The internal Domain Event and the externally-published Integration Event are deliberately kept as two separate concepts, even though they might represent conceptually the same underlying business occurrence — a service's internal domain events can freely change shape, be added, or removed as its internal implementation evolves, without needing to worry about breaking any external consumer, since domain events were never a promise made to anyone outside the service's own boundary.

**Why conflating these two concepts creates a coupling risk:** if a service's *internal* domain events were directly and automatically published externally without deliberate curation, any change to the service's internal domain model (adding a new internal event, changing an existing one's shape) would risk silently breaking external consumers who happened to be relying on what was only ever meant to be an internal implementation detail — keeping Domain Events and Integration Events as deliberately separate concepts (even when one triggers the creation of the other) preserves the service's freedom to evolve its internal implementation independently of its external, published contract.

**Common Pitfall:** directly publishing a service's internal domain events onto an external message bus without deliberate curation, treating "internal event" and "external contract" as the same thing — this couples the service's internal implementation details directly to external consumers, removing the internal flexibility that keeping these two concepts separate is specifically meant to preserve; a deliberate, curated translation step between "what happened internally" and "what we're willing to promise externally" is what maintains that flexibility.

---

## Advanced — Question 9

**Q9: What is the "Anti-Corruption Layer" (ACL) pattern, and how does it protect a service's own clean internal domain model from being CONTAMINATED by an external system's (or legacy system's) awkward, poorly-designed concepts?**

An Anti-Corruption Layer is a deliberate translation boundary between a service's own clean internal domain model and an external system (often legacy, or simply designed with different, incompatible concepts) — the ACL translates between the two, ensuring the external system's awkward or poorly-designed concepts never leak directly into and "corrupt" the service's own internal domain model.

```csharp
// The EXTERNAL legacy system's awkward, poorly-designed representation:
public class LegacyCustomerRecord
{
    public string CustFlag1 { get; set; }  // "Y"/"N"/"P" -- an ancient, poorly-documented legacy encoding
    public int CustTypeCode { get; set; }  // a numeric code with meaning ONLY documented in a 15-YEAR-OLD wiki page
}

// The ANTI-CORRUPTION LAYER -- translates the AWKWARD external shape into a CLEAN internal domain concept
public class LegacyCustomerAdapter
{
    public Customer TranslateToInternalDomain(LegacyCustomerRecord legacy) => new Customer
    {
        IsActive = legacy.CustFlag1 == "Y",                     // translates the CRYPTIC flag into a CLEAR bool
        Tier = legacy.CustTypeCode switch { 1 => "Standard", 2 => "Premium", _ => "Unknown" } // translates the CODE
    };
}

// The service's OWN internal domain model NEVER sees "CustFlag1" or "CustTypeCode" AT ALL --
// it only EVER works with the CLEAN "Customer" model the ACL produces
```
The service's internal business logic operates exclusively on the clean `Customer` model, with `IsActive`/`Tier` as clearly-named, self-documenting concepts — none of the legacy system's cryptic flags, numeric codes, or historical quirks ever directly reach the service's own domain logic, since the ACL absorbs and translates all of that awkwardness at the boundary.

**Why this specifically protects long-term maintainability, not just initial code cleanliness:** without an ACL, a service's internal domain logic would need to directly understand and work with the external system's awkward concepts throughout its own codebase — as the service's internal logic grows, this awkwardness spreads and compounds throughout an increasingly large amount of code; an ACL confines this awkwardness to one deliberate, isolated translation boundary, keeping the service's own internal domain model clean and expressive regardless of how awkward the external system it integrates with happens to be.

**Common Pitfall:** integrating directly with an external/legacy system's awkward data model throughout a service's own business logic, without a dedicated translation layer — this spreads the external system's poorly-designed concepts (cryptic flags, undocumented codes) throughout the service's own codebase, making the internal domain logic itself harder to understand and more tightly coupled to the external system's specific quirks than necessary; an Anti-Corruption Layer specifically isolates and contains this awkwardness at one well-defined boundary instead.

---
