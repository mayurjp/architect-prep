# Microservices & System Design — Q&A

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

**Q2: How do microservices communicate with each other?**


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

## Beginner — Question 3

**Q3: What is an API Gateway, and why do microservices need one?**


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

## Beginner — Question 4

**Q4: What is the "Database-per-Service" pattern, and why does it matter?**


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

## Beginner — Question 5

**Q5: How do services find each other? What is Service Discovery?**


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

**Q3: Security in Microservices**


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

## Advanced — Question 4

**Q4: Design a complete e-commerce platform end-to-end**


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

**Q2: A pod is unhealthy / crash-looping / OOMKilled**


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

## Scenario — Question 3

**Q3: Adding a new requirement to a running system**


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

## Scenario — Question 4

**Q4: Troubleshooting a message-driven system**


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
