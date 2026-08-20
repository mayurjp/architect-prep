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
