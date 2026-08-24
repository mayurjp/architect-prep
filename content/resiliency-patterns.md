# Resiliency Patterns — Q&A

## Beginner — Question 1

**Q1: What does "resiliency" mean in the context of a distributed system, and why is it a first-class design concern rather than an edge case?**

Resiliency is a system's ability to keep functioning — fully or in a degraded form — when parts of it fail. In a distributed system, failure isn't a rare exception you handle defensively as an afterthought; it is a **statistically guaranteed, continuous condition**. Networks drop packets, DNS resolution occasionally hangs, a downstream service gets slow under load, a pod gets rescheduled mid-request, a load balancer briefly routes to an instance that's still starting up. Any single call has a small failure probability, but a system makes millions of calls a day across dozens of dependencies, so *something* is always failing somewhere.

**The math that makes this concrete:** if a request fan­s out to 5 downstream services each independently 99.9% reliable, the combined success rate of the whole request is roughly `0.999^5 ≈ 99.5%` — worse than any individual dependency, and that gap widens fast as the call graph grows. At real scale (hundreds of services, thousands of requests/sec), "everything worked" stops being the default outcome unless you engineer for the alternative.

**What resiliency patterns actually do:** they don't prevent failure — you can't prevent a network partition — they shape *how the system behaves when failure happens* so a localized fault stays localized instead of cascading. This is the distinction between a **transient fault** (a blip that resolves itself in milliseconds to seconds — worth retrying) and a **persistent/systemic fault** (a service that is genuinely down or overloaded — retrying makes it worse). The rest of this file is about the vocabulary and .NET tooling (chiefly **Polly**) for telling these apart and responding correctly to each.

**Common pitfall:** treating resiliency as "add try/catch around HTTP calls." Catching an exception without a *policy* (when to retry, how many times, how long to wait, when to give up entirely) just converts a fast failure into a slow one, or silently swallows an error that should have surfaced.

---

## Beginner — Question 2

**Q2: What is the Retry pattern, and why can a naive "retry immediately on failure" implementation make an outage worse instead of better?**

The Retry pattern re-attempts an operation that failed due to a **transient fault** — a condition expected to resolve itself shortly (a dropped TCP connection, a momentary 503, a load balancer mid-rebalance) — instead of surfacing the failure to the caller immediately.

**Why naive retry backfires — the "retry storm":** if every failed call is retried instantly, and the downstream service is failing *because it's overloaded*, immediate retries add load to an already-struggling service at the exact moment it needs load removed. Worse, if many client instances hit the same failure at once (e.g., a deploy, a network blip affecting a whole availability zone), they all retry at the same moment, in near-perfect sync, producing repeated load spikes — the service never gets a chance to recover between spikes. This is called a **retry storm**, and it has taken down production systems that would have self-healed in seconds if clients had simply backed off.

```csharp
// Naive — DO NOT do this
for (int i = 0; i < 3; i++)
{
    try { return await httpClient.GetAsync(url); }
    catch (HttpRequestException) { /* immediately loop and try again */ }
}
```

**The fix, conceptually (detailed in Intermediate Q1–2):** space retries apart with increasing delay (exponential backoff), randomize the delay slightly per client (jitter) so retries don't synchronize, and cap the total number of attempts so a genuinely down service isn't hammered forever.

**Practical guidance:** only retry operations that are safe to repeat — see idempotency (Advanced Q2) — and only retry on transient-looking failures (network errors, timeouts, 429/503) never on errors that indicate the request itself is wrong (400, 401, 404) since retrying those just wastes time and load for a guaranteed-identical failure.

---

## Beginner — Question 3

**Q3: What is the Timeout pattern, and why does every outbound network call need an explicit timeout?**

A timeout is an upper bound on how long a caller will wait for a response before giving up and treating the call as failed, even if the underlying connection is still technically open and might eventually respond.

**Why it's mandatory, not optional:** without an explicit timeout, the effective timeout is "whatever the OS socket default is" (often several minutes) or, in the worst case, "forever" — a connection can hang indefinitely if the server accepted the TCP connection but never sends a response (a common symptom of a downstream service that's alive but deadlocked or overwhelmed). A thread or async task blocked waiting on a hung call ties up resources (thread pool slots, connection pool entries) that the rest of your application needs. Enough hung calls and your service runs out of capacity to serve *anything*, not just the slow dependency — this is the seed of the cascading-failure scenarios covered later (Scenario Q1).

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
var response = await httpClient.GetAsync(url, cts.Token);
// Throws TaskCanceledException if no response within 5s — the caller regains control
// instead of waiting indefinitely.
```

**Choosing a timeout value:** too short causes false failures on slightly slow-but-healthy responses (wasting retries on calls that would have succeeded); too long delays failure detection and lets resources pile up. A common approach is to base it on observed p99 latency for that dependency plus a margin, and to tier timeouts — a fast tolerant one for the outer user-facing request, tighter ones for calls with retries behind them so the full retry budget still fits inside the outer deadline.

**Common pitfall:** setting a timeout on the HttpClient's `Timeout` property globally but then reusing that client for calls with very different latency profiles (a health check vs. a report-generation endpoint) — per-call timeouts (via `CancellationToken`) are more flexible than one client-wide value.

---

## Beginner — Question 4

**Q4: What is Polly, and what does basic usage look like?**

Polly is a .NET resilience and transient-fault-handling library. It provides composable **policies** — retry, timeout, circuit breaker, bulkhead isolation, fallback, and hedging — that wrap a delegate (typically an outbound call) and apply the failure-handling behavior around it, without scattering try/catch and manual loop logic through business code.

Modern Polly (v8+) centers on `ResiliencePipeline`, built via `ResiliencePipelineBuilder`, and integrates directly with `HttpClientFactory` via `Microsoft.Extensions.Http.Resilience`. The older fluent `Policy.Handle<T>().RetryAsync(...)` API (Polly v7) is still widely seen in existing codebases and conceptually the same idea.

```csharp
// Polly v8 style — a simple retry pipeline
var pipeline = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        MaxRetryAttempts = 3,
        Delay = TimeSpan.FromMilliseconds(200),
        BackoffType = DelayBackoffType.Exponential
    })
    .Build();

var result = await pipeline.ExecuteAsync(async token =>
    await httpClient.GetAsync("/api/inventory", token));
```

Registered against `HttpClient` via DI, so every call through that client automatically gets the policy applied:

```csharp
builder.Services.AddHttpClient("InventoryClient")
    .AddResilienceHandler("inventory-pipeline", pipeline =>
    {
        pipeline.AddRetry(new HttpRetryStrategyOptions { MaxRetryAttempts = 3 });
        pipeline.AddTimeout(TimeSpan.FromSeconds(5));
    });
```

**Why use a library instead of hand-rolled retry loops:** Polly's policies are battle-tested for edge cases hand-rolled code usually gets wrong — correctly distinguishing retryable vs. non-retryable exceptions, respecting cancellation tokens, avoiding retrying inside a timeout that's already expired, and composing multiple policies (retry + circuit breaker + timeout) in a well-defined order without each one fighting the others. It also centralizes policy configuration so behavior is consistent and easy to audit across every outbound call in a codebase, rather than reinvented ad hoc per call site.

---

## Intermediate — Question 1

**Q1: Explain the Circuit Breaker pattern in depth — the closed/open/half-open states, what triggers each transition, and why it protects a struggling downstream service.**

A circuit breaker wraps calls to a dependency and tracks recent failures. Once failures cross a threshold, it stops sending calls to the dependency entirely for a cooldown period, instead of continuing to retry a service that has already shown it's failing — protecting the failing service from further load while it recovers, and protecting the caller from wasting resources on calls that are very likely to fail anyway.

**The three states:**

1. **Closed (normal):** Calls pass through to the dependency as usual. The breaker counts failures within a rolling window (e.g., failure ratio over the last N calls or T seconds).
2. **Open (tripped):** Once the failure ratio crosses a configured threshold (e.g., >50% of the last 20 calls failed), the breaker "opens" — it stops calling the dependency at all and immediately fails fast (typically throwing `BrokenCircuitException`) for a configured **break duration**. No load reaches the struggling service during this window, giving it room to recover.
3. **Half-Open (probing):** After the break duration elapses, the breaker allows a small number of trial calls through. If they succeed, the breaker closes again (resumes normal traffic). If they fail, it reopens for another break duration — it does not immediately flood the recovering service with full traffic, which would risk re-tripping it the moment it comes back up.

```csharp
var pipeline = new ResiliencePipelineBuilder()
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions
    {
        FailureRatio = 0.5,                       // trip if >50% of calls in the window fail
        SamplingDuration = TimeSpan.FromSeconds(10),
        MinimumThroughput = 8,                     // need at least 8 calls before evaluating ratio
        BreakDuration = TimeSpan.FromSeconds(30)
    })
    .Build();
```

**Why this matters beyond "saves the caller time":** without a breaker, every upstream instance keeps retrying a down dependency at full rate, which (a) keeps the downstream service under load exactly when it's trying to recover — often *preventing* recovery — and (b) ties up the caller's own resources (threads, connections) waiting on calls that are statistically doomed, which is precisely the mechanism behind the cascading-failure scenario in Scenario Q1.

**Pitfall:** setting `MinimumThroughput` too low trips the breaker on statistical noise (3 failures out of 4 calls looks catastrophic but may just be bad luck); setting the break duration too short causes the breaker to flap open/closed repeatedly during a real outage.

#### Follow-up: How is a circuit breaker different from a simple "if this call failed N times in a row, stop calling it"?

A naive consecutive-failure counter is a crude single-instance version of the same idea, but a proper circuit breaker adds: a *time-windowed* failure ratio (so one old failure doesn't count forever), a *half-open* probing state (avoiding "fully open the floodgates" on recovery), and shared state visibility (Polly can expose the breaker's current state for health checks/telemetry, so you can alert on "circuit X has been open for 5 minutes" as an operational signal, not just a code-path detail).

---

## Intermediate — Question 2

**Q2: What is exponential backoff, why does plain exponential backoff still cause synchronized retry storms across many independent clients, and how does jitter fix it?**

Exponential backoff spaces retries apart with a delay that grows exponentially per attempt (e.g., 200ms, 400ms, 800ms, 1600ms) instead of a fixed interval, so persistent failures back off more aggressively than transient ones and clients don't hammer a struggling dependency at a constant rate.

**Why plain exponential backoff alone isn't enough:** if the delay formula is deterministic (`baseDelay * 2^attempt`, same for every client), then every client instance that started retrying at the same moment — say, 10,000 clients that all got a failure response during the same brief outage — computes the *exact same* delay sequence and therefore retries in near-perfect lockstep: all 10,000 hit the dependency again at t+200ms, then again at t+400ms, then t+800ms. This produces a series of synchronized load spikes against the recovering service instead of a smoothed-out trickle — the aggregate load pattern looks almost as bad as no backoff at all, just spread across fewer, sharper spikes. This is the exact scenario in Scenario Q2.

**Jitter fixes it** by adding randomness to each client's delay so the retry moments spread out across the population instead of clustering:

```csharp
var pipeline = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        MaxRetryAttempts = 5,
        Delay = TimeSpan.FromMilliseconds(200),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true   // Polly applies decorrelated jitter automatically
    })
    .Build();
```

Common jitter strategies: **full jitter** (`delay = random(0, exponentialDelay)`), **equal jitter** (`delay = exponentialDelay/2 + random(0, exponentialDelay/2)`), and **decorrelated jitter** (each delay is randomized relative to the previous one, which spreads retries out even further over successive attempts). Polly's built-in jitter uses a decorrelated approach by default when `UseJitter = true` is set, so you rarely need to hand-roll the randomization.

**Practical guidance:** always enable jitter for any retry policy that could run on many concurrent instances (which is essentially always true in a horizontally scaled service or a fan-out batch job) — backoff without jitter is a partial fix that still leaves the synchronization problem in place.

---

## Intermediate — Question 3

**Q3: What is the Bulkhead pattern, and how does isolating resources protect a system when one dependency fails?**

The Bulkhead pattern partitions a limited shared resource (thread pool slots, HTTP connection pool capacity, a semaphore of concurrent operations) into isolated pools per dependency, so that exhausting the resource for one failing dependency doesn't also starve calls to unrelated, healthy dependencies. The name comes from ship design — a bulkhead is a partition that keeps flooding in one compartment from sinking the whole ship.

**Why this matters:** without isolation, a service that calls Payments, Inventory, and Shipping typically shares one thread pool / one connection pool across all three. If Payments starts timing out slowly (not failing fast — the worst case, since slow failures hold resources longer than fast ones), every request thread that's waiting on a Payments call is unavailable for Inventory or Shipping calls too, even though those services are perfectly healthy. Enough concurrent slow Payments calls and the entire service becomes unresponsive for *everything*, not just Payments-dependent requests — this is a major contributor to cascading failure (Scenario Q1).

```csharp
var paymentsPipeline = new ResiliencePipelineBuilder()
    .AddConcurrencyLimiter(new ConcurrencyLimiterOptions
    {
        PermitLimit = 20,     // at most 20 concurrent calls to Payments
        QueueLimit = 10       // extra calls queue briefly, then reject fast
    })
    .Build();

var inventoryPipeline = new ResiliencePipelineBuilder()
    .AddConcurrencyLimiter(new ConcurrencyLimiterOptions { PermitLimit = 20, QueueLimit = 10 })
    .Build();
// Each dependency gets its own permit pool — Payments exhausting its 20 slots
// has zero effect on Inventory's independent 20 slots.
```

Two common flavors: a **semaphore-based bulkhead** (limits concurrent in-process calls, as above — cheap, single-process) and a **process/container-level bulkhead** (running a dependency's calls through a dedicated connection pool, or even a dedicated set of worker instances/pods, so resource exhaustion is isolated at the infrastructure level too).

**Pitfall:** setting the bulkhead limit too low throttles legitimate healthy traffic during normal peak load; setting it too high defeats the purpose since the "isolated" pool can still grow large enough to starve the process's other shared resources (e.g., total thread count). Size bulkheads based on realistic peak concurrency per dependency, not an arbitrary round number.

---

## Intermediate — Question 4

**Q4: What is the Fallback pattern, and how does it let a system degrade gracefully instead of failing outright?**

A fallback provides an alternate result — a cached value, a sensible default, a simplified response, or a queued-for-later action — when the primary call fails after retries/circuit-breaking have given up, so the caller gets *something* usable rather than a hard error propagating all the way to the end user.

```csharp
var pipeline = new ResiliencePipelineBuilder<ProductPrice>()
    .AddFallback(new FallbackStrategyOptions<ProductPrice>
    {
        ShouldHandle = new PredicateBuilder<ProductPrice>().Handle<BrokenCircuitException>(),
        FallbackAction = args => Outcome.FromResultAsValueTask(
            new ProductPrice { Amount = cache.GetLastKnownPrice(args.Context) ?? 0, IsStale = true })
    })
    .Build();
```

**Where fallback fits vs. failing outright:** not every failure should be masked — a fallback is appropriate when a slightly-stale or simplified answer is still useful to the caller (e.g., showing a cached price with a "prices may be outdated" note beats showing a broken page) and inappropriate when correctness matters more than availability (e.g., you should not "fall back" to a default answer for "does this customer have enough balance to complete this payment" — better to fail the specific operation than silently proceed on a guess).

**Practical guidance:** design fallbacks deliberately per call site, not as a blanket "catch everything, return null" habit — a fallback that silently swallows a serious failure just delays detection of a real outage (nobody notices, dashboards stay green, and the underlying problem festers). Pair fallbacks with logging/metrics so a fallback being triggered is visible to operators even though it's invisible to the end user.

---

## Intermediate — Question 5

**Q5: How do you combine multiple Polly policies (retry, circuit breaker, timeout) together, and what order should they wrap each other in?**

Real resilience configurations layer several policies around the same call, and the **order matters** — each policy wraps the next, and execution flows from outermost to innermost.

A common, well-reasoned ordering for an outbound HTTP call: **Timeout (outer, overall budget) → Retry → Circuit Breaker → Timeout (inner, per-attempt)**. In practice, Polly's `AddStandardResilienceHandler()` extension gives a preconfigured, sensible version of this composition:

```csharp
builder.Services.AddHttpClient("InventoryClient")
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
            SamplingDuration = TimeSpan.FromSeconds(10),
            MinimumThroughput = 8,
            BreakDuration = TimeSpan.FromSeconds(30)
        });
        pipeline.AddTimeout(TimeSpan.FromSeconds(2)); // per-attempt timeout
    });
// Or the batteries-included version: retry + circuit breaker + timeout, tuned defaults:
// .AddStandardResilienceHandler();
```

**Why Retry sits outside Circuit Breaker:** the retry policy needs to see circuit-breaker failures (specifically `BrokenCircuitException`) as a signal to *stop* retrying quickly rather than as just another transient error to retry against — putting the breaker inside the retry means an open circuit fails each retry attempt instantly (good: fast-fail, no wasted waiting) while the breaker's own failure counting still happens on genuine call attempts, not retry-inflated counts.

**Why Timeout sits innermost (per attempt) with a separate overall timeout outermost:** each individual attempt needs its own bounded time budget so a single hung call doesn't consume the entire retry budget, but the *overall* operation (across all retries) also needs a ceiling so a caller with its own deadline (e.g., an ASP.NET Core request with a client-facing timeout) isn't kept waiting indefinitely across many spaced-out retries.

**Common pitfall:** applying an outer timeout shorter than the sum of all inner retry delays plus attempt timeouts — the outer timeout fires mid-retry-sequence, and the caller gets a generic cancellation instead of the more informative underlying failure. Always size the outer budget with the full worst-case retry sequence in mind.

---

## Advanced — Question 1

**Q1: What is the Saga pattern, how do choreography-based and orchestration-based sagas differ, and why doesn't two-phase commit scale across microservices?**

A saga is a way to maintain data consistency across multiple services in a distributed transaction *without* a single ACID transaction spanning all of them — each service commits its own local transaction, and if a later step fails, previously completed steps are undone via explicit **compensating transactions** rather than a database-level rollback.

**Why 2-phase commit (2PC) doesn't work well here:** 2PC requires a coordinator to hold locks across all participating databases until every participant votes to commit — this means services must stay synchronously blocked, holding locks, for the duration of the entire distributed transaction. Across independently deployed, independently scaled microservices (often with different database technologies that may not even support the XA/2PC protocol), this creates tight temporal coupling and long-held locks that destroy throughput and availability — one slow or down participant blocks every other participant's related transaction. Microservices architectures deliberately favor availability and service independence over synchronous cross-service ACID, which pushes toward eventual consistency and sagas instead.

**Choreography-based saga:** each service publishes an event when it completes its local step, and the next service(s) react to that event autonomously — there's no central coordinator. E.g., `OrderCreated` → Inventory service reacts by reserving stock and publishes `StockReserved` → Payment service reacts and publishes `PaymentCharged` → Shipping service reacts and schedules delivery. Simple to start, no single point of control, but as the number of steps grows it becomes hard to see or reason about the overall workflow (the "logic" is smeared across every service's event handlers), and cyclic event dependencies get confusing fast.

**Orchestration-based saga:** a central orchestrator (a dedicated service or a workflow engine) explicitly calls each participant in sequence and tells it what to do next, including which compensating action to invoke on failure. More visible and testable as a single workflow definition, at the cost of a new central component that itself needs to be resilient, and slightly tighter coupling (participants expose commands the orchestrator can call, not just events they emit).

**Practical guidance:** choreography suits a small number of steps with naturally independent reactions; orchestration suits complex multi-step workflows where visibility into "where is this saga right now" and centralized error handling matter more than avoiding a coordinator.

#### Follow-up: What is a compensating transaction, and why can't it just be a database rollback?

A compensating transaction is a business-level action that semantically undoes the effect of a previously committed step — because that step already committed in its own service's database, there is nothing to "roll back" in the ACID sense. E.g., undoing "charge payment" isn't deleting a row, it's issuing a refund; undoing "reserve inventory" is releasing the reserved stock back to available inventory. Compensations must themselves be designed carefully — they can fail too, and they are not always a perfect inverse (a refund might take days to post even though the original charge was instant), which the saga's error handling and idempotency design need to account for.

---

## Advanced — Question 2

**Q2: Why is idempotency a prerequisite for safely retrying operations, and how do idempotency keys solve the problem?**

An operation is idempotent if performing it multiple times has the same effect as performing it once. Retrying a **non-idempotent** operation is dangerous precisely because the failure that triggered the retry is often ambiguous: a client that times out waiting for a response to "charge $50 to this card" genuinely cannot tell whether the charge succeeded and only the *response* was lost (network blip on the way back) or whether the request never reached the server at all. Retrying blindly risks charging the customer twice in the first case, while *not* retrying risks never charging them in the second — you can't tell which situation you're in from the client side alone.

**The fix: idempotency keys.** The client generates a unique key (e.g., a GUID) per logical operation attempt — not per HTTP request, per *intent* — and sends it with every retry of that same logical operation. The server records, per key, whether that operation has already been processed and what the result was.

```csharp
[HttpPost("orders")]
public async Task<IActionResult> CreateOrder(
    [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
    [FromBody] CreateOrderRequest request)
{
    var existing = await _idempotencyStore.TryGetAsync(idempotencyKey);
    if (existing is not null)
        return StatusCode(existing.StatusCode, existing.Body); // replay the original result, don't redo the work

    var result = await _orderService.CreateOrderAsync(request);
    await _idempotencyStore.SaveAsync(idempotencyKey, result); // store atomically with the order creation
    return Ok(result);
}
```

**Mechanism details that matter:** the check-and-store around the idempotency key must be atomic with the underlying operation (typically enforced with a unique constraint on the key column in the same database transaction as the business write) — otherwise two near-simultaneous retries can both pass the "not found" check and both execute the operation, defeating the purpose (a classic TOCTOU race). The store also needs a retention policy — keys can't live forever, but must outlive any realistic client retry window (minutes to low hours is typical).

**Practical guidance:** design idempotency in at the API contract level from the start for any operation with real-world side effects (payments, order creation, sending an email/SMS) — retrofitting it after a duplicate-charge incident is much more painful than requiring an idempotency key header from day one. GET/PUT/DELETE are naturally idempotent by HTTP semantics; POST is not, which is exactly why POST endpoints with side effects are the ones that need this pattern explicitly.

---

## Advanced — Question 3

**Q3: What is "retry amplification," and how does it turn a single slow downstream service into a cascading, system-wide incident?**

Retry amplification is the multiplicative growth of request volume that happens when retries are applied at multiple layers of a call chain simultaneously, so a single slow or partially failing service at the bottom of the chain generates far more load than its own slowness alone would suggest.

**The mechanism:** consider a chain `Gateway → Service A → Service B → Service C`, where each layer independently retries up to 3 times on failure/timeout. If Service C becomes slow (not fully down — the worst case, since slow calls consume resources for longer than fast failures), Service B's calls to C start timing out and Service B retries — up to 3x the calls now reach C. Service A, calling B, sees B taking longer (because B itself is now retrying internally) and *also* times out and retries — up to 3x again, meaning up to 9x the original load now reaches the B→C link. The Gateway, calling A, does the same — up to 27x the original request volume can end up hitting Service C, which was already struggling at 1x load. The retries compound multiplicatively layer by layer instead of adding linearly.

**Why this is worse than it sounds:** the extra load doesn't just fail to help — it actively prevents Service C from recovering, because the retry-amplified load may now exceed what C could handle even when healthy. What started as "C is a bit slow" becomes "C is completely overwhelmed and now A and B are too, because all their resources are tied up waiting on retries that are statistically unlikely to succeed."

**Mitigations, layered:**
- **Circuit breakers at every layer** — once B's circuit to C opens, B stops amplifying load onto C, and fails fast back to A instead of retrying.
- **Retry budgets** — cap the *total* fraction of a service's outbound traffic that's allowed to be retries (e.g., "retries may never exceed 10% of total request volume"), independent of per-call retry counts, so aggregate amplification is bounded regardless of how many layers retry.
- **Don't retry at every layer** — a common rule of thumb is to retry at exactly one layer of the chain (often the outermost, closest to the user, or the layer with the most context about whether a retry is worthwhile) and let intermediate layers propagate failure without retrying, rather than retrying redundantly at every hop.
- **Deadline propagation** — pass the remaining time budget down the call chain so an inner service knows not to bother retrying if the outer caller is about to give up anyway.

---

## Advanced — Question 4

**Q4: How does rate limiting function as a resiliency tool from the provider (server) side, as distinct from the consumer-side patterns (retry, circuit breaker, bulkhead)?**

Everything covered so far — retry, backoff/jitter, circuit breaker, bulkhead, fallback — is a **consumer-side** pattern: a client protecting itself, and indirectly protecting a dependency, by controlling how it calls out. **Rate limiting is the provider-side complement**: a service protecting *itself* by controlling how much inbound traffic it accepts, regardless of how well-behaved or badly-behaved its callers are.

**Why a service needs this even if all its clients implement perfect resilience patterns:** clients can still legitimately generate more traffic than a service can handle — a traffic spike, a misconfigured batch job, a new client integration that wasn't load-tested against your service, or simply organic growth outpacing capacity planning. Without a rate limit, the service tries to serve every request, degrades under the load (getting slower, not just busier), and slow responses trigger the exact retry-amplification cascade from Advanced Q3 in every one of its callers simultaneously — the provider's overload becomes everyone's problem.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("perClientPolicy", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromSeconds(10);
        opt.QueueLimit = 0; // reject immediately over the limit, don't queue and add latency
    });
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});
```

**Why rejecting fast (429) beats accepting and degrading:** a service that refuses excess work at the door stays healthy and responsive for the traffic it *does* accept, and gives the rejected caller an unambiguous, fast signal (`429 Too Many Requests`, often with a `Retry-After` header) it can act on immediately — versus a service that tries to serve everything and becomes uniformly slow for all callers, which is far harder for any single client to diagnose or react to correctly.

**Practical guidance:** rate limit per-client/per-API-key (so one noisy consumer can't starve others) not just globally, and pair it with the consumer-side patterns — a well-behaved client hitting a 429 should treat it like any other transient failure and back off with jitter, not hammer the endpoint harder. The two sides of the pattern reinforce each other: providers cap what they'll accept, consumers respect the signal and space out their demand.

---

## Advanced — Question 5

**Q5: What is a Dead-Letter Queue (DLQ), and how does it function as a resiliency mechanism for message-based systems?**

In message/event-driven systems (queues, topics, service buses), a **poison message** is one that a consumer can never successfully process — a malformed payload, a message referencing data that no longer exists, or a message that consistently triggers a bug in the handler. Without special handling, a naive consumer that fails to process a message and re-queues it for retry will pick that same message up again, fail again, and loop indefinitely — and depending on the broker's semantics, this can block the queue's head-of-line processing, meaning every message *behind* the poison one is also stuck waiting, even though they're perfectly processable.

**A dead-letter queue solves this by isolating the poison message after a bounded number of failed delivery attempts**, moving it to a separate queue instead of leaving it in the main processing path. The main queue keeps flowing (messages behind the poison one get processed normally); the DLQ accumulates the messages that need human investigation or a special reprocessing path.

```csharp
// Azure Service Bus example: configure max delivery attempts, after which
// the broker automatically moves the message to the queue's built-in DLQ.
var options = new ServiceBusProcessorOptions
{
    MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(5)
};
// Queue-level setting (via infra/ARM/Bicep, not code): MaxDeliveryCount = 5
// After 5 failed completions, the broker moves the message to
// <queueName>/$DeadLetterQueue automatically — no consumer code required to detect this.
```

**Why this is a resiliency pattern, not just an error-handling detail:** it converts an unbounded, system-halting failure mode (one bad message blocking an entire pipeline forever) into a bounded, contained one (one bad message sits in a side queue; everything else keeps moving). It also creates a natural place to apply the other patterns in this file — a background job can process the DLQ separately with its own retry/backoff, alert an operator once the DLQ has messages, or support manual reprocessing once the underlying issue (e.g., a downstream schema mismatch) is fixed.

**Common pitfall:** treating the DLQ as "fire and forget" — messages quietly pile up there with no alerting or reprocessing plan, which silently loses business events (an order that never got processed, a payment that never got reconciled). A DLQ without monitoring is just a slower, less visible way to drop data. Alert on DLQ depth and have an explicit runbook or automated job for draining it.

---

## Scenario — Question 1

**Q1: Your OrderService calls a downstream PaymentService synchronously on every checkout request. PaymentService starts returning slow, intermittent 500s due to a database issue on its side. Within minutes, OrderService's thread pool is exhausted and it starts timing out on *all* requests — including ones that have nothing to do with payments, like fetching order history. Diagnose the failure mode and design a fix.**

**Diagnosis — cascading failure via unbounded resource sharing:** OrderService has no circuit breaker on its PaymentService calls, so every checkout request keeps calling PaymentService, waiting the full (probably too generous, or entirely absent) timeout before failing, and likely retrying on top of that. Each of these calls holds a thread (and an HTTP connection pool slot) for the duration. Because OrderService uses one shared thread pool for all incoming request handling, and the Payments-related requests are the ones piling up waiting, they starve the thread pool for *every* request type — order history lookups have nothing to do with Payments but die anyway because there are no threads left to serve them. This is exactly the mechanism described in Intermediate Q3 (Bulkhead) and Advanced Q3 (retry amplification): a slow-not-down dependency is worse than a hard-down one, because slow calls tie up resources far longer than fast failures do, and the damage isn't contained to calls that actually touch the failing dependency.

**The fix — Circuit Breaker + Bulkhead together:**

1. **Circuit breaker on the PaymentService client.** Once PaymentService's failure ratio crosses the threshold, the breaker opens and OrderService fails fast on payment calls (`BrokenCircuitException`) instead of waiting out full timeouts — this immediately stops new payment calls from tying up threads.
2. **Bulkhead (concurrency limiter) isolating PaymentService calls from the rest of OrderService.** Even before the breaker trips, cap the number of concurrent PaymentService calls (e.g., 20 permits) so that even a fully-hung PaymentService can only ever consume 20 threads' worth of capacity — order history and every other endpoint keep their own separate capacity untouched.

```csharp
builder.Services.AddHttpClient("PaymentService")
    .AddResilienceHandler("payment-pipeline", pipeline =>
    {
        pipeline.AddConcurrencyLimiter(new ConcurrencyLimiterOptions
        {
            PermitLimit = 20, QueueLimit = 5
        });
        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            SamplingDuration = TimeSpan.FromSeconds(10),
            MinimumThroughput = 8,
            BreakDuration = TimeSpan.FromSeconds(20)
        });
        pipeline.AddTimeout(TimeSpan.FromSeconds(3));
    });
```

**Why both together, not just one:** the circuit breaker protects against *sustained* failure but still needs a few failed calls to trip (the `MinimumThroughput` sample); the bulkhead protects during that window (and during half-open probing) by capping how many threads can be consumed at once, regardless of breaker state. Combined, checkout failures stay contained to checkout, and everything else in OrderService keeps serving normally throughout the incident.

---

## Scenario — Question 2

**Q2: A nightly batch job calls a third-party API and retries failed calls with plain exponential backoff (no jitter). The job runs as 10,000 parallel worker instances, all kicked off by the same scheduler at the same second. When the third-party API has a brief hiccup, all 10,000 instances fail their calls at once — and then, because they all compute identical backoff delays, they retry in unison, repeatedly re-hammering the API every few seconds until it falls over completely. Diagnose and fix.**

**Diagnosis — synchronized retry storm, the exact failure mode in Intermediate Q2.** Because all 10,000 instances started at the same moment and use a deterministic backoff formula (`baseDelay * 2^attempt`, no randomization), they don't just retry around the same *time* — they retry at the exact same computed delay, every time, in lockstep. The initial hiccup (which might have resolved itself in a second or two under normal, spread-out load) instead gets hit with 10,000 simultaneous requests at t+0, then again with 10,000 at t+200ms, then 10,000 at t+400ms, and so on — a series of sharp synchronized spikes rather than a smoothed trickle. The third-party API, which might have shrugged off a gradually-arriving retry load, gets knocked over repeatedly by each synchronized wave and never gets a clean window to recover.

**The fix — add jitter to the backoff, and consider staggering the job start itself:**

```csharp
var pipeline = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        MaxRetryAttempts = 5,
        Delay = TimeSpan.FromSeconds(1),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true   // decorrelated jitter — each instance's delay sequence diverges from the others
    })
    .Build();
```

With jitter, instance A might retry at 1.3s, 2.9s, 6.1s while instance B retries at 0.7s, 2.2s, 5.4s — across 10,000 instances the retries spread out across the whole backoff window instead of clustering at fixed points, so the API sees a roughly steady trickle of retry traffic instead of periodic tidal waves, and has a real chance to stabilize between the noise.

**Additional mitigation worth considering for this specific scenario:** since the root cause of the synchronization is that all 10,000 instances *start* at the same second (not just that they retry identically), staggering the scheduler-triggered start times over a window (e.g., spread launches across 60 seconds) reduces the odds that all 10,000 hit the API in the same instant even on their *first* attempt, further smoothing the load profile independent of the retry policy.

---

## Scenario — Question 3

**Q3: An order-processing saga runs: (1) reserve inventory, (2) charge payment, (3) confirm order. Step 1 succeeds — inventory is reserved and decremented from available stock. Step 2 fails — the payment gateway declines the card. The saga halts there. A week later, someone notices thousands of units of inventory are reserved but never released, understocking the product for real customers. Diagnose the gap and design the compensating-transaction fix.**

**Diagnosis — a saga with no compensation path for a failed later step.** The workflow only implemented the "happy path forward" steps; nobody wired up what should happen when step 2 fails *after* step 1 already committed. Because Inventory's reservation was its own local transaction in its own service (there's no cross-service rollback available — see Advanced Q1 on why 2PC isn't used here), the reservation is permanent from Inventory's point of view unless something explicitly tells it to undo. If the saga's failure handling just logs an error and stops, the reservation silently lingers forever, slowly bleeding real, sellable inventory into a phantom "reserved" state that nothing ever reclaims.

**The fix — implement the compensating transaction for step 1, triggered explicitly on step 2's failure:**

- **Compensation for "reserve inventory" is "release reservation"** — a dedicated operation, not a raw delete, that increments available stock back up and marks the reservation record as released (so it's auditable, not just silently vanished).
- **The saga orchestrator (or the choreography event chain) must treat "payment failed" as a first-class event that triggers compensation, not just a terminal failure state.** In an orchestrated saga:

```csharp
public async Task RunOrderSagaAsync(OrderRequest request)
{
    var reservation = await _inventoryClient.ReserveAsync(request.Items);
    try
    {
        await _paymentClient.ChargeAsync(request.PaymentDetails, idempotencyKey: request.OrderId);
        await _orderClient.ConfirmAsync(request.OrderId);
    }
    catch (PaymentDeclinedException)
    {
        // Compensating transaction — undo step 1 because step 2 failed.
        await _inventoryClient.ReleaseReservationAsync(reservation.ReservationId);
        await _orderClient.MarkFailedAsync(request.OrderId, reason: "payment_declined");
        throw;
    }
}
```

- **In a choreography-based version**, Inventory would subscribe to a `PaymentDeclined` event (published by Payment service) and react by releasing its own reservation — the same logic, just triggered by an event instead of a caught exception in an orchestrator.

**Hardening beyond the immediate fix:** compensations can themselves fail (e.g., the release call times out) — they need their own retry policy, and ideally a reconciliation job that periodically scans for reservations older than some TTL with no corresponding confirmed order, and force-releases them as a safety net independent of the saga's real-time compensation path. This backstop is what would have caught the bug in this scenario even if the compensation logic itself had a bug.

---

## Scenario — Question 4

**Q4: A mobile client calls `POST /api/orders` to place an order. The request succeeds on the server (the order is created and a confirmation email queued) but the response is lost due to a flaky cell connection before it reaches the client. The client's HTTP layer sees a timeout and automatically retries the exact same request. The server creates a second, duplicate order. Diagnose and fix.**

**Diagnosis — retrying a non-idempotent POST without any way for the server to recognize a retry as "the same intent, already handled."** From the server's point of view, the retried request is indistinguishable from a second, genuine order — there's no information in the request that says "this is attempt #2 of the same logical checkout." The client's timeout-triggered retry is reasonable behavior (the client genuinely can't tell whether the first attempt succeeded), but the endpoint wasn't built to be safely repeatable, so the ambiguity resolves into a duplicate order rather than a safe no-op. This is precisely the gap described in Advanced Q2.

**The fix — require an idempotency key for the create-order operation, generated once per logical checkout attempt and reused across retries of that same attempt:**

```csharp
// Client: generate the key once when the user taps "Place Order," and
// reuse it for any automatic retry of that same submission.
var idempotencyKey = Guid.NewGuid().ToString();
var response = await httpClient.PostAsJsonAsync("/api/orders", request,
    headers: new() { ["Idempotency-Key"] = idempotencyKey });
// If this call times out and the HTTP layer retries automatically,
// it must reuse the SAME idempotencyKey, not generate a new one.
```

```csharp
// Server
[HttpPost("orders")]
public async Task<IActionResult> CreateOrder(
    [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
    [FromBody] CreateOrderRequest request)
{
    // Atomic check-and-reserve on the key, backed by a unique constraint
    // in the same transaction as the order insert to close the race window.
    var existingResult = await _idempotencyStore.TryReserveAsync(idempotencyKey);
    if (existingResult.AlreadyProcessed)
        return StatusCode(existingResult.StatusCode, existingResult.Body); // replay, don't recreate

    var order = await _orderService.CreateOrderAsync(request);
    await _idempotencyStore.CompleteAsync(idempotencyKey, order);
    return Ok(order);
}
```

**Why this specifically fixes the mobile scenario:** on the retry, the server recognizes the same `Idempotency-Key`, sees the first attempt already completed, and returns the original order's confirmation instead of creating a new one — the client gets the response it was originally waiting for (just delayed), and exactly one order exists regardless of how many times the flaky network forces a retry.

**Rollout note:** this requires a client-side change (generating and persistently reusing the key across a retry, not per HTTP attempt) as well as the server-side store — a common gap is implementing the server check correctly but leaving the client generating a fresh GUID on every retry, which silently defeats the whole mechanism.

---

## Beginner — Question 5

**Q5: What specifically makes a fault "transient" as opposed to a permanent failure, and why does that distinction matter before you decide to retry?**

A **transient fault** is a failure whose underlying cause is expected to resolve itself within a short window without any change to the request — a dropped packet, a load balancer momentarily routing to an instance that's still starting up, a brief spike in downstream latency that trips a timeout, a database failing over to a replica. Retrying the exact same request a moment later has a real chance of succeeding because *nothing about the request was wrong* — the environment was just briefly unfavorable.

A **permanent (non-transient) failure** is one where the request itself is the problem, or the failure reflects a durable state that won't change on its own: a `404 Not Found` because the resource genuinely doesn't exist, a `400 Bad Request` because the payload fails validation, a `401/403` because the caller isn't authorized, or a `409 Conflict` because of a genuine business-rule violation. Retrying an identical request against a permanent failure produces the identical failure every time — the request was never going to succeed, no matter how many times you send it.

**Why the distinction matters practically:** retrying a permanent failure is not just wasted effort, it can be actively harmful. It burns retry budget and call volume that should be reserved for faults that might actually resolve (contributing to the retry-amplification problem covered in Advanced Q3), it delays surfacing a real, actionable error to the caller or the user (a validation error should come back immediately, not after 3 retries and a few seconds of backoff), and in some systems it can trigger rate limiting or account lockouts (repeatedly retrying a `401` against an auth endpoint looks like a brute-force attempt).

```csharp
var pipeline = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        // Only retry things that look transient — never blanket-catch every exception/status.
        ShouldHandle = new PredicateBuilder()
            .Handle<HttpRequestException>()
            .Handle<TimeoutRejectedException>()
            .HandleResult<HttpResponseMessage>(r =>
                r.StatusCode == HttpStatusCode.RequestTimeout ||
                r.StatusCode == HttpStatusCode.TooManyRequests ||
                (int)r.StatusCode >= 500),
        MaxRetryAttempts = 3
    })
    .Build();
```

**Common pitfall:** classifying by exception type alone instead of by what actually happened — a `500 Internal Server Error` might be transient (a momentary null-reference from a race condition) or might be permanent (a bug that fires on every request with this payload); when in doubt, a few bounded retries are usually cheap insurance, but 4xx client errors (except 408/429) should essentially never be retried unmodified.

**Practical guidance:** build the transient/permanent classification explicitly into your retry policy's `ShouldHandle` predicate rather than relying on a blanket catch-all — this is the single most important configuration decision in any retry policy, more impactful than tuning the backoff curve itself.

---

## Beginner — Question 6

**Q6: What is the Health Check pattern, and how does it let infrastructure automatically route around an unhealthy instance?**

A health check is an endpoint or mechanism that reports whether a running instance of a service is currently able to do useful work, so that infrastructure components — a load balancer, a Kubernetes readiness/liveness probe, a service mesh — can make automated routing and lifecycle decisions without a human watching dashboards. It is a foundational building block underneath most of the other patterns in this file: a circuit breaker protects one client's calls to one dependency, but a health check protects the *whole fleet* by removing a bad instance from rotation entirely.

**Two flavors that matter:**
- **Liveness** — "is this process alive and not deadlocked?" A failed liveness check typically triggers a restart (e.g., Kubernetes kills and recreates the pod).
- **Readiness** — "is this instance currently able to serve traffic correctly?" A failed readiness check doesn't kill the instance, it just pulls it out of the load balancer's rotation until it reports healthy again — useful during startup (dependencies not yet warmed up), or during a temporary degraded state (e.g., its database connection pool is exhausted).

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy())
    .AddSqlServer(connectionString, name: "sql-db", tags: new[] { "ready" })
    .AddUrlGroup(new Uri("https://payments.internal/health"), name: "payments-dependency", tags: new[] { "ready" });

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }); // liveness: process-only
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") }); // readiness: dependencies too
```

**Why this is a resiliency pattern, not just monitoring:** without health checks, a load balancer keeps sending a fraction of traffic to an instance that's actually unable to serve it correctly (a bad deploy, a corrupted local cache, a lost database connection), and every one of those requests fails from the *caller's* perspective even though other instances in the fleet are perfectly healthy. Health checks make the failure self-correcting at the infrastructure layer — an unhealthy instance stops receiving new traffic within one probe interval, with no code change or manual intervention needed.

**Common pitfall:** making the readiness check too shallow (`return 200 always`) so it doesn't actually reflect dependency health, or too aggressive (checking every downstream dependency transitively, so one flaky non-critical dependency takes a healthy instance out of rotation unnecessarily). A good readiness check verifies the specific dependencies that instance genuinely can't function without, and stays fast (well under the probe's timeout) so the check itself doesn't become a source of false negatives under load.

---

## Intermediate — Question 6

**Q6: What is request hedging, and what's the trade-off it makes to reduce tail latency?**

Hedging sends a duplicate copy of a request to a second replica if the first hasn't responded within some threshold, then races the two — whichever responds first wins, and the other is discarded (or cancelled if the protocol supports it). Unlike retry, hedging doesn't wait for a failure at all; it acts *proactively* on a slow-but-not-yet-failed response, aiming to control p99/p999 tail latency rather than to recover from outright failures.

**Why plain retry-on-timeout doesn't solve the tail-latency problem well enough:** if you only retry after a full timeout expires, you've already paid the full timeout's worth of latency before the retry even starts — for a service where most requests are fast but a small fraction stall (a common real-world pattern caused by GC pauses, noisy-neighbor CPU contention, or a slow disk on one particular node), that "wait the full timeout, then retry" approach means the slow tail is still slow, just eventually successful. Hedging instead says "if this hasn't come back in, say, the p95 latency, assume it might be one of the unlucky slow ones and start a second attempt now, in parallel" — the client gets whichever replica happens to respond first.

```csharp
public async Task<T> HedgedCallAsync<T>(Func<CancellationToken, Task<T>> call, TimeSpan hedgeDelay)
{
    using var cts = new CancellationTokenSource();
    var first = call(cts.Token);
    var hedgeTask = Task.Delay(hedgeDelay).ContinueWith(_ => call(cts.Token), TaskContinuationOptions.OnlyOnRanToCompletion).Unwrap();

    var winner = await Task.WhenAny(first, hedgeTask);
    cts.Cancel(); // cancel whichever call didn't win, if the protocol supports cancellation
    return await winner;
}
```

**The trade-off, explicitly:** hedging trades extra load for reduced tail latency — every hedged request that actually triggers a duplicate call means roughly 2x the work done for that one logical request, against potentially the same backend fleet whose slowness is what triggered the hedge in the first place. This only pays off when (a) the hedge delay is tuned so hedging is rare (triggered only for the genuinely slow tail, not routinely), and (b) the backend has enough spare capacity that doubling a small fraction of requests doesn't itself become a load problem — hedging on an already-saturated backend can make things worse, not better.

**Practical guidance:** set the hedge threshold near a high percentile (p90–p95) of normal latency, not the average — hedging too eagerly multiplies load for little tail-latency benefit; cap how many hedges can be in flight at once. It's most valuable for internal, idempotent, low-cost reads (e.g., fetching from a replicated read store) rather than expensive writes.

---

## Intermediate — Question 7

**Q7: What is the dual-write problem, and how does the Outbox pattern solve it without a distributed transaction?**

The **dual-write problem** arises whenever a single logical operation needs to both update a database *and* publish an event/message about that update (e.g., "save the order" and "publish `OrderCreated` to the message bus"), and those two systems don't share a transaction. Whichever order you do them in, there's a window where one succeeds and the other fails: commit the database write, then crash before publishing — the event is lost and downstream consumers never hear about an order that genuinely exists. Publish the event first, then fail to commit the database write — consumers react to an order that doesn't actually exist. Neither ordering is safe, and there's no way to make a relational database and a message broker commit atomically together without a distributed transaction coordinator (which, per Advanced Q1's discussion of 2PC, doesn't scale well or is often unavailable across the specific technologies involved).

**The Outbox pattern solves it by turning the dual write into a single local write.** Instead of publishing to the message broker directly, the event is written as a row into an `Outbox` table in the **same local database transaction** as the business write — this is now a single-database transaction, fully ACID, no distributed coordination needed. A separate, independent relay process then reads unpublished outbox rows and publishes them to the broker, marking them published once the broker acknowledges.

```csharp
public async Task CreateOrderAsync(Order order)
{
    using var tx = await _dbContext.Database.BeginTransactionAsync();
    _dbContext.Orders.Add(order);
    _dbContext.OutboxMessages.Add(new OutboxMessage
    {
        Type = "OrderCreated",
        Payload = JsonSerializer.Serialize(new { order.Id, order.CustomerId }),
        CreatedAtUtc = DateTime.UtcNow
    }); // same transaction — both commit together, or neither does
    await _dbContext.SaveChangesAsync();
    await tx.CommitAsync();
}

// Separate background relay (polling, or a CDC feed off the outbox table):
// SELECT * FROM OutboxMessages WHERE PublishedAtUtc IS NULL ORDER BY CreatedAtUtc
// -> publish each to the broker -> mark PublishedAtUtc on success
```

**Why this guarantees at-least-once, not exactly-once:** the relay can crash after publishing but before marking the row published, causing a re-publish on restart — so consumers of these events must be idempotent (Advanced Q2), same as any other at-least-once delivery system. What the outbox guarantees is that the event is *never silently lost* relative to the database write — it will eventually be published as long as the row exists, closing the exact gap that makes naive dual-writing unsafe.

**Practical guidance:** use CDC (change-data-capture, e.g., Debezium reading the transaction log) instead of polling for the relay where available — lower latency, no polling overhead — but a simple polling relay is a perfectly reasonable starting point for moderate volume.

---

## Intermediate — Question 8

**Q8: When should a system choose graceful degradation over failing fast when a dependency is unavailable, and when is fail-fast the right call instead?**

These are two different philosophies for the same moment — a dependency you need is down or unreachable — and picking the wrong one for a given operation is a design mistake, not just a tuning knob.

**Graceful degradation** means the system keeps serving a reduced, imperfect, but still useful response instead of failing outright — this is essentially the Fallback pattern (Intermediate Q4) applied as a deliberate product/UX decision rather than just an error-handling detail. Example: a product page's "customers also bought" recommendations service is down — the page still renders fully, just without that section, or with a cached/stale version from an hour ago labeled as such. The user doesn't need real-time-fresh recommendations to complete their real goal (viewing/buying the product); a slightly-stale or missing "nice to have" is strictly better than a broken page.

**Fail-fast** means the system refuses to proceed and surfaces an explicit error immediately rather than guessing or substituting a default, because *correctness matters more than availability* for that specific operation. Example: the payment authorization service is unreachable during checkout — you must not "gracefully degrade" by assuming the payment would have succeeded and completing the order anyway; that's not a UX nicety, it's a financial and correctness risk. The right behavior is to fail the checkout clearly, with a message the user can act on ("payment couldn't be processed, please try again"), not silently proceed on a guess.

```csharp
// Graceful degradation — a "nice to have" enrichment
async Task<ProductPage> BuildProductPageAsync(int id)
{
    var product = await _productService.GetAsync(id); // must succeed — core data
    List<Recommendation> recs;
    try { recs = await _recommendationService.GetAsync(id); }
    catch (Exception) { recs = _cache.GetLastKnownRecommendations(id) ?? new(); } // degrade, don't fail the page
    return new ProductPage(product, recs);
}

// Fail-fast — correctness-critical
async Task<OrderResult> CheckoutAsync(Order order)
{
    var authResult = await _paymentService.AuthorizeAsync(order.Payment); // no fallback — must be real
    if (!authResult.Success) return OrderResult.Failed(authResult.Reason);
    // ...
}
```

**The deciding question to ask per call site:** "if I substitute a default/cached/simplified answer here instead of the real one, could that be wrong in a way that harms the user or the business (money, safety, data integrity), or is it merely less optimal (staleness, reduced personalization)?" The former demands fail-fast; the latter is a strong candidate for graceful degradation.

**Common pitfall:** applying one philosophy uniformly across an entire service instead of deciding per dependency/operation — "always retry and fall back to cache" is as much a bug when applied to payment authorization as "always fail the whole request on any error" is when applied to an optional recommendations widget.

---

## Advanced — Question 6

**Q6: What is the "thundering herd" problem as it relates to cache expiry, and what are the standard mitigations?**

Thundering herd (in this context, also called a "cache stampede") happens when a popular cache key expires and many concurrent requests all miss the cache for that key at the same instant — instead of one request repopulating the cache and everyone else benefiting from it, *every* concurrent request independently sees a cache miss and goes straight to the backing store (database, expensive computation, downstream API) at once. A backing store sized to handle occasional cache-miss traffic gets hit with the full concurrent request volume all at once, which can be enough on its own to cause an outage — the exact scenario in Scenario Q5.

**Why this is worse than steady-state cache-miss traffic:** normally, cache misses are spread out over time as different keys expire at different moments. A stampede concentrates an entire population of concurrent requests for the *same* key into effectively the same instant, because they all expired together and all noticed at once — the backing store sees a spike that looks nothing like its normal cache-miss load profile.

**Mitigations:**

1. **Request coalescing / single-flight** — ensure only one request per key is allowed to actually query the backing store at a time; concurrent requests for the same missing key wait on that one in-flight fetch and share its result once it completes, instead of each issuing their own redundant query.

```csharp
private static readonly ConcurrentDictionary<string, Lazy<Task<Product>>> _inFlight = new();

async Task<Product> GetProductAsync(int id)
{
    var key = $"product:{id}";
    var cached = await _cache.GetAsync<Product>(key);
    if (cached is not null) return cached;

    var lazy = _inFlight.GetOrAdd(key, _ => new Lazy<Task<Product>>(async () =>
    {
        var product = await _db.Products.FindAsync(id); // only the winner reaches the DB
        await _cache.SetAsync(key, product, TimeSpan.FromMinutes(10));
        return product;
    }));
    try { return await lazy.Value; }
    finally { _inFlight.TryRemove(key, out _); }
}
```

2. **Staggered / jittered TTLs** — instead of setting every cache entry's TTL to the exact same duration (which causes mass-simultaneous expiry for entries written around the same time, e.g. after a cache warm-up or deploy), add random jitter to each TTL (`baseTtl ± random(0, jitterWindow)`) so expirations spread out over time instead of clustering.
3. **Probabilistic early expiration** ("XFetch") — have a small, increasing probability of proactively refreshing a soon-to-expire key *before* it actually expires, computed from how close it is to expiry, so refreshes happen ahead of the deadline and spread across the population instead of all waiting until the hard expiry moment.

**Practical guidance:** request coalescing addresses the concurrent-miss problem directly and is the most important single fix; jittered TTLs address the root cause (synchronized expiry) and prevent recurrence; use both together for a genuinely popular key rather than relying on either alone.

---

## Advanced — Question 7

**Q7: What is back-pressure, and how does it differ from simply degrading or crashing under load?**

Back-pressure is a system explicitly signaling "slow down" to its callers when it's approaching or at capacity, instead of either (a) silently accepting all offered work and degrading uniformly (getting slower and slower for everyone as queues grow unbounded) or (b) accepting work until it runs out of resources and crashes outright. It's the resiliency mechanism that makes rate limiting (Advanced Q4) actionable rather than just punitive — a `429` with no further information tells a caller "you were rejected," but back-pressure done well tells the caller *how much* to slow down and *for how long*, so the system as a whole converges toward a sustainable throughput instead of oscillating between overload and idle.

**Common back-pressure mechanisms:**
- **Bounded queues with explicit rejection** — a queue (in-process channel, message broker queue, connection pool) has a hard depth limit; once full, new work is rejected immediately (fail fast) rather than queued indefinitely, which would just convert overload into unbounded latency growth instead of solving it.
- **`429 Too Many Requests` with `Retry-After`** — rather than a bare rejection, the response tells the caller exactly how long to wait before trying again, letting well-behaved clients space out their retries in a way that's calibrated to *this* server's actual recovery time rather than guessing.
- **Credit/window-based flow control** — the receiver grants the sender an explicit "you may send N more units of work" credit (seen in TCP's own flow control, and in protocols like HTTP/2 and gRPC streaming) so the sender is structurally prevented from overwhelming the receiver, rather than relying on the receiver reactively rejecting excess.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("orders", opt =>
    {
        opt.PermitLimit = 50;
        opt.Window = TimeSpan.FromSeconds(1);
        opt.QueueLimit = 0; // no unbounded queueing — reject immediately once at capacity
    });
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "2"; // tell the caller exactly how long to back off
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
    };
});
```

**Why this is distinct from "just degrade gracefully":** graceful degradation (Intermediate Q8) is about *what a caller does when it can't get a full answer* — the caller adapts. Back-pressure is about *the server actively managing its own admission* so it never gets so overloaded that it has to degrade or crash in the first place — it's a producer-side discipline, not a consumer-side coping strategy, though the two work well together (a back-pressured client can gracefully degrade while it waits).

**Common pitfall:** implementing unbounded queues "to avoid dropping requests," which feels safer but actually removes the signal entirely — every request eventually gets served, just after unbounded latency growth, which is often worse for callers (especially ones with their own timeouts) than a fast, explicit rejection they can react to.

---

## Advanced — Question 8

**Q8: Why is chaos engineering necessary to actually validate that your resiliency patterns work, and what does a basic fault-injection experiment look like?**

Every pattern in this file — retry, circuit breaker, bulkhead, fallback, timeout — is code that only executes on a failure path. Normal functional and integration tests almost exclusively exercise the happy path (the dependency responds correctly), so a circuit breaker's trip/half-open/close logic, a bulkhead's isolation under real concurrent saturation, or a fallback's behavior when the primary genuinely times out can sit completely unexercised in production for months — until the day a real outage happens, at which point you discover for the first time whether the resiliency code actually works, under the worst possible conditions to be debugging it.

**Chaos engineering is the discipline of deliberately injecting failure into a system, in a controlled experiment, specifically to verify that its resiliency mechanisms behave as designed** — rather than hoping they do because the code looks right. It reframes failure testing from "something we avoid" to "something we deliberately cause, safely, so we're not finding out for the first time during a real incident."

**Principles of a well-run experiment:**
1. **Form a hypothesis first** — e.g., "if PaymentService's latency increases to 5s, our circuit breaker should trip within 10 seconds and OrderService should keep serving order-history requests normally" — a specific, falsifiable claim about system behavior, not just "let's see what breaks."
2. **Start small and controlled** — inject the fault against a small percentage of traffic or a single non-critical instance first, with a clear rollback/abort mechanism, not against 100% of production on the first run.
3. **Measure the actual blast radius** against the hypothesis — did the circuit breaker trip when expected? Did unrelated endpoints stay healthy (validating the bulkhead)? Did alerts fire?
4. **Run it somewhere safe first** — staging, or production with a tightly scoped blast radius and an immediate kill switch — before trusting it against full production traffic.

```csharp
// A simple fault-injection middleware for a controlled experiment —
// deliberately adds latency or failures to a fraction of requests to one dependency.
app.Use(async (context, next) =>
{
    if (_chaosConfig.IsEnabled("payments-latency-experiment") &&
        Random.Shared.NextDouble() < _chaosConfig.InjectionRate) // e.g. 5% of requests
    {
        await Task.Delay(_chaosConfig.InjectedLatency); // simulate PaymentService being slow
    }
    await next();
});
```

Real-world tooling (Chaos Monkey/Chaos Mesh, Azure Chaos Studio, Gremlin) automates this at the infrastructure level — killing pods, adding network latency, throttling CPU — rather than only at the application-code level shown above.

**Common pitfall:** running chaos experiments only in staging, where traffic patterns, scale, and configuration often differ enough from production that the experiment doesn't actually validate what matters — or running experiments without a clear abort mechanism, turning a controlled test into an actual incident.

**Practical guidance:** treat chaos experiments as a recurring practice (e.g., quarterly "game days") targeting each resiliency mechanism in this file at least once, not a one-time exercise — code and configuration drift over time (someone removes a circuit breaker "temporarily" during a migration and it never comes back), and only repeated verification catches that drift before a real outage does.

---

## Scenario — Question 5

**Q5: A popular product page's cache entry expires during a traffic spike. In the same second, roughly 5,000 concurrent requests all miss the cache for that key and go straight to the database, causing a brief outage. Once the page recovers and the cache repopulates, the team is worried the exact same thing will happen again the next time this key expires. Diagnose and fix, both for the immediate incident and to prevent recurrence.**

**Diagnosis — a textbook thundering herd / cache stampede, the exact mechanism in Advanced Q6.** The cache entry for this product had a single expiry moment; because the page is popular and traffic was already elevated (a spike), thousands of requests happened to be in flight at exactly the moment it expired. Every one of them independently checked the cache, got a miss, and went to the database to fetch and repopulate — there was no coordination preventing 5,000 redundant, identical database queries from firing at once for data that only needed to be fetched *once*. The database, sized for its normal cache-miss trickle, was never going to survive 5,000 simultaneous identical queries arriving in the same second, regardless of how well-indexed or otherwise healthy it was.

**The immediate fix — request coalescing (single-flight) around the cache-repopulation path:** ensure that when a cache miss occurs for a given key, only one request actually queries the database; every other concurrent request for that same key waits on the first request's in-flight result instead of issuing its own redundant query.

```csharp
private static readonly ConcurrentDictionary<string, Lazy<Task<Product>>> _inFlight = new();

async Task<Product> GetProductAsync(int productId)
{
    var key = $"product:{productId}";
    var cached = await _cache.GetAsync<Product>(key);
    if (cached is not null) return cached;

    // Only the FIRST concurrent caller for this key reaches the database;
    // the other 4,999 await the same Lazy<Task> and get the same result once it completes.
    var lazy = _inFlight.GetOrAdd(key, _ => new Lazy<Task<Product>>(async () =>
    {
        var product = await _db.Products.FindAsync(productId);
        await _cache.SetAsync(key, product, TimeSpan.FromMinutes(15) + JitteredTtl());
        return product;
    }));
    try { return await lazy.Value; }
    finally { _inFlight.TryRemove(key, out _); }
}

TimeSpan JitteredTtl() => TimeSpan.FromSeconds(Random.Shared.Next(0, 120)); // spread future expiry
```

In a multi-instance deployment (multiple app servers, not just multiple concurrent requests on one instance), the in-process `ConcurrentDictionary` lock above only coalesces *within one instance* — a distributed lock (e.g., a short-lived Redis `SETNX`-style lock keyed on the cache key) is needed to coalesce across instances too, since each instance would otherwise still independently elect its own "winner" and the database could still see one query per instance.

**Preventing recurrence — jittered TTLs:** the fix above already adds jitter to the new TTL so this specific key won't expire at a perfectly round interval again, but the same jitter should be applied to *all* cache writes for popular keys, not just this one — otherwise a different popular key can hit the identical failure mode the next time its own synchronized expiry lines up with a traffic spike.

**Why both fixes together, not just one:** jittered TTLs reduce the *odds* of synchronized expiry causing a stampede, but don't eliminate the risk entirely (a spike can still coincide with any expiry, jittered or not) — request coalescing eliminates the actual damage mechanism (thousands of redundant simultaneous queries) regardless of why the cache miss happened, making it the more fundamental fix, with jittered TTLs as defense in depth.

---

## Beginner — Question 7

**Q7: What's the difference between applying a resiliency pattern at the network/infrastructure layer (e.g., a service mesh sidecar doing retries and circuit breaking with no application code involved) versus applying it in application code directly (e.g., with Polly)?**

Every pattern discussed so far — retry, timeout, circuit breaker, bulkhead — can be implemented in two fundamentally different places: **inside the application process** (a library like Polly wrapping your outbound calls) or **outside the application process, in the network path** (a sidecar proxy, typically part of a service mesh like Istio or Linkerd, that intercepts every inbound/outbound call transparently).

**Infrastructure-layer (sidecar/mesh) resiliency:** the mesh's sidecar proxy sits next to every service instance and applies retry, timeout, and circuit-breaking policy to the traffic flowing through it — configured centrally (often via YAML applied to the mesh control plane), not in each service's code. The huge advantage is consistency and zero code burden: every service in the mesh gets the same baseline resilience regardless of what language or framework it's written in, and policy changes (tune a timeout, adjust a breaker threshold) roll out without redeploying application code. The downside is that the proxy operates at the network level (HTTP/gRPC semantics) and has no visibility into business logic — it can't know that "this specific call is a payment charge and must never be retried blindly" versus "this is a read that's safe to hedge." It also adds a real hop of latency and operational complexity (running and upgrading the mesh itself is nontrivial).

**Application-layer (Polly) resiliency:** the code that issues the call also decides the policy, with full access to business context — it can choose not to retry a payment call, can attach an idempotency key, can pick a fallback that makes sense for that specific data. It's more precise but the burden (and the risk of inconsistency) falls on every developer to apply it correctly, call site by call site, in every language a polyglot fleet happens to use.

```csharp
// Application-layer: the service itself decides "payments never retry, reads do"
var paymentsPipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(3)) // no retry — see Advanced Q2 on idempotency
    .Build();
```

**Practical guidance:** the two are complementary, not competing — many production systems run a mesh for baseline network-level resilience (uniform timeouts, mTLS, coarse circuit breaking) *and* Polly in-process for business-aware decisions (idempotency-sensitive retries, fallbacks with real cached data). Relying on the mesh alone risks retrying something unsafe; relying on app code alone means reimplementing the same policy in every service.

---

## Intermediate — Question 9

**Q9: What is load shedding, and how does it differ from and complement rate limiting and back-pressure?**

Load shedding is the deliberate, proactive rejection of a portion of incoming requests once a system is at or approaching capacity, choosing to serve the requests it *does* accept well rather than accepting everything and degrading uniformly until it crashes. The guiding principle is that partial availability (serving 80% of traffic well) beats false availability (attempting 100% of traffic and serving all of it badly, or serving none of it once the system falls over entirely).

**How it differs from rate limiting (Advanced Q4) and back-pressure (Advanced Q7):** rate limiting is typically a *per-client, per-key* quota enforced regardless of the server's real-time health ("you get 100 requests per 10 seconds, full stop") — it protects against any single caller's excess, but a server can still be overwhelmed by aggregate traffic from many well-behaved clients all under their individual limits. Back-pressure is about *signaling* — telling callers to slow down and giving them information (a `Retry-After`) to act on. **Load shedding is about the server's own real-time admission decision, driven by its own current load**, not a per-client quota or a signal to the caller — it actively decides "I will not even attempt to serve this request" based on live system health (CPU, queue depth, latency percentiles), often shedding lower-priority traffic first.

```csharp
app.Use(async (context, next) =>
{
    // Shed low-priority traffic when the system is under real load pressure —
    // decided from live health signals, not a fixed per-client quota.
    if (_loadMonitor.IsOverloaded() && context.Request.Headers["X-Priority"] == "low")
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        context.Response.Headers.RetryAfter = "5";
        return;
    }
    await next();
});
```

**Why priority matters here:** effective load shedding is rarely uniform — it typically sheds by priority (drop analytics/logging traffic before checkout traffic), so the system keeps its most important work healthy even under sustained overload rather than randomly failing a mix of critical and non-critical requests.

**How the three work together:** rate limiting caps individual bad actors, back-pressure communicates capacity signals outward, and load shedding is the server's last line of self-preservation when aggregate load — even from well-behaved clients — exceeds what it can handle. A well-designed system layers all three: rate limits at the edge, back-pressure signals throughout, and load shedding as the final safety valve protecting the process itself from falling over.

---

## Intermediate — Question 10

**Q10: What is the Ambassador pattern, and how does it relate to (but differ from) a full service mesh?**

The Ambassador pattern deploys a small, out-of-process helper — typically a sidecar container running alongside the application — that handles cross-cutting network concerns (retries, circuit breaking, TLS termination/origination, request logging, protocol translation) on behalf of the main service, so the application's own code can stay focused on business logic and simply talk to "localhost" instead of implementing that networking logic itself.

**Mechanism:** the application sends its outbound (or receives its inbound) traffic through the local ambassador process rather than directly to the network. The ambassador applies the resilience/networking policy and forwards the (possibly retried, possibly TLS-wrapped) call onward. Because it's a separate process, it can be written, versioned, and upgraded independently of the application, and — crucially — reused across services written in different languages, since the ambassador container is the same regardless of whether the app behind it is C#, Java, or Python.

```yaml
# Simplified sidecar deployment — the ambassador container shares the pod,
# and the app talks to it over localhost instead of the network directly.
containers:
  - name: order-service
    image: order-service:latest
    env:
      - name: PAYMENTS_URL
        value: "http://localhost:9001"  # calls go to the local ambassador, not PaymentService directly
  - name: payments-ambassador
    image: ambassador-retry-proxy:latest
    ports:
      - containerPort: 9001
```

**How it differs from a full service mesh:** a mesh (Istio, Linkerd) is a *fleet-wide, centrally managed* system — every service gets a sidecar, all sidecars are configured from one control plane, and the mesh typically handles service discovery, mTLS across the whole fleet, and global traffic policy (canary routing, global circuit-breaking dashboards) as one coherent system. The Ambassador pattern is a narrower, often per-dependency idea: a lightweight helper solving one specific cross-cutting concern for one service (or one outbound dependency) without necessarily requiring fleet-wide infrastructure, a control plane, or buy-in from the whole organization. In practice, a service mesh's sidecar proxy *is* an implementation of the Ambassador pattern generalized and centrally operated across an entire fleet — the pattern is the underlying idea; the mesh is one large-scale, standardized way to apply it everywhere at once.

**Practical guidance:** reach for a standalone ambassador when you need one service's networking concern solved without adopting mesh infrastructure org-wide; adopt a full mesh when the same need recurs across many services and centralized, consistent policy and observability become worth the added operational complexity.

---

## Advanced — Question 9

**Q9: Why does resiliency testing belong in CI/CD as a deployment gate, distinct from the production chaos-engineering experiments covered in Advanced Q8, and what does that look like concretely?**

Chaos engineering (Advanced Q8) validates resiliency mechanisms against *real* production traffic and infrastructure, on a recurring cadence, to catch drift over time. **CI/CD resiliency testing is different in purpose and timing**: it's a pre-deploy gate that runs automatically on every change, specifically to catch a resiliency regression — someone removing a timeout, changing a retry count to something unsafe, breaking a fallback's error handling — *before* that change ever reaches production, rather than discovering it during the next game day or, worse, during a real incident.

**Two concrete techniques belong here:**

1. **Contract tests for resilience configuration** — assertions that a given HTTP client pipeline still has the policies it's supposed to have, at the values it's supposed to have, so a refactor can't silently drop a circuit breaker or widen a timeout without a test failing.

```csharp
[Fact]
public void PaymentClient_Pipeline_Has_CircuitBreaker_And_Bounded_Timeout()
{
    var pipeline = ResiliencePipelineRegistry.Get("PaymentService");
    Assert.Contains(pipeline.Strategies, s => s is CircuitBreakerStrategy);
    Assert.True(pipeline.GetTimeout() <= TimeSpan.FromSeconds(5));
}
```

2. **Fault-injection integration tests** — a test harness stands up the service against a fake/mocked dependency that's deliberately configured to time out, return 500s, or hang, and asserts the *observable behavior* is correct: does the circuit breaker actually trip after the configured threshold, does the fallback actually return the expected degraded response, does an unrelated endpoint stay responsive while the failing dependency is being hammered.

```csharp
[Fact]
public async Task OrderHistory_Stays_Responsive_When_PaymentService_Times_Out()
{
    _paymentServiceStub.ConfigureToTimeoutOnEveryCall();
    var response = await _client.GetAsync("/api/orders/history"); // unrelated endpoint
    response.EnsureSuccessStatusCode(); // must not be starved by the bulkhead-isolated PaymentService failures
}
```

**Why this can't just be chaos engineering run more often:** chaos experiments require real infrastructure, real traffic, and deliberate scheduling/approval — they're too slow and too risky to run on every pull request. CI fault-injection tests are fast, deterministic, and run in isolation, making them suitable as a hard merge/deploy gate; chaos engineering remains the periodic, higher-fidelity check that the *whole system*, including infrastructure and real traffic patterns, still behaves as these unit-level tests assume.

**Practical guidance:** treat a failing resilience contract test the same as a failing functional test — block the merge. This is what keeps resiliency mechanisms from silently rotting between chaos game days.

---

## Advanced — Question 10

**Q10: What is a system's "blast radius," and how do bulkheads, circuit breakers, and timeouts collectively work together to shrink it?**

Blast radius is the scope of a failure's impact — how much of the system is affected when one component fails, as distinct from the failure itself. The goal of resiliency engineering isn't to prevent every failure (impossible in a distributed system, per Beginner Q1) — it's to make sure a failure's blast radius stays small and contained instead of spreading to unrelated parts of the system. This is the unifying frame an architect actually reasons in: not "which pattern do I add here" but "what is currently able to blow up, and how far would the damage spread."

**How each pattern shrinks blast radius, and why none of them alone is sufficient:**

- **Timeout** bounds *how long* one failing call can hold a resource — without it, a single hung dependency can tie up a thread indefinitely, and blast radius grows unbounded with time.
- **Bulkhead** (Intermediate Q3) bounds *how much shared resource* one dependency's calls can ever consume — without it, even correctly-timed-out calls to a failing dependency can, in high enough volume, exhaust the thread pool that unrelated requests also depend on. This is precisely what contained the OrderService incident in Scenario Q1: the bulkhead put a hard ceiling on how many threads Payments failures could ever consume, no matter how bad Payments got.
- **Circuit breaker** (Intermediate Q1) bounds *how long the system keeps trying* against a dependency that has already shown it's failing — without it, timeouts and bulkheads still let a fixed amount of damage recur on every single request indefinitely; the breaker stops the bleeding entirely once failure is statistically clear.

**Together, they answer three separate questions about the same failure:** timeout answers "how long can one bad call cost me," bulkhead answers "how much of my total capacity can one bad dependency ever consume," and circuit breaker answers "how long do I keep paying that cost before I stop trying." A system missing any one of the three still has an unbounded blast radius along that dimension — e.g., a bulkhead with no timeout still lets each of its limited slots be held forever by one hung call, and a circuit breaker with no bulkhead still lets a burst of calls exhaust shared resources before the breaker has enough samples to trip.

```csharp
builder.Services.AddHttpClient("PaymentService")
    .AddResilienceHandler("payment-pipeline", pipeline =>
    {
        pipeline.AddConcurrencyLimiter(new ConcurrencyLimiterOptions { PermitLimit = 20 }); // caps total consumption
        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions { FailureRatio = 0.5 }); // caps duration
        pipeline.AddTimeout(TimeSpan.FromSeconds(3)); // caps per-call cost
    });
```

**Practical guidance:** when reviewing a new dependency integration, ask all three questions explicitly rather than adding patterns reflexively — "what's the per-call cost cap, what's the total-resource cap, and what's the duration cap" is a more durable design checklist than "did we remember to add Polly."

---

## Advanced — Question 11

**Q11: Why is graceful shutdown a resiliency concern, and what does handling it correctly involve?**

Every pattern so far has addressed a service *receiving* a failure from something else. Graceful shutdown addresses the mirror case: a healthy service instance being deliberately terminated — a rolling deploy replacing pods, a horizontal-scale-down removing instances, a spot/preemptible VM being reclaimed — and what happens to the requests it was actively handling at that exact moment. Handled poorly, the instance's *own* termination becomes the failure the rest of the system has to absorb: in-flight requests get connection-reset errors, a partially-processed message gets neither completed nor safely retried, and a client sees an error that had nothing to do with any real fault, just bad timing against a routine, planned event.

**What graceful shutdown actually requires, as a sequence:**

1. **Receive and handle the termination signal** — in a containerized environment this is `SIGTERM`, sent before the process is forcibly killed (`SIGKILL`) after a grace period.
2. **Stop accepting new work immediately** — flip readiness to unhealthy (so the load balancer/orchestrator stops routing new traffic here) while the process itself keeps running.
3. **Let in-flight work finish, within a bounded grace period** — requests already being processed should be allowed to complete normally rather than being cut off mid-response; the bound matters because some requests may hang, and the process still needs to exit eventually.
4. **Exit cleanly** — close connections, flush any buffers, then terminate.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Host.ConfigureHostOptions(o =>
{
    o.ShutdownTimeout = TimeSpan.FromSeconds(25); // bounded grace period for in-flight work to finish
});
var app = builder.Build();

var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
lifetime.ApplicationStopping.Register(() =>
{
    // Fires on SIGTERM, before shutdown begins — flip readiness so the load
    // balancer stops sending new traffic while in-flight requests still drain normally.
    HealthState.MarkNotReady();
});
```

**How this relates to Kubernetes without duplicating readiness-probe mechanics:** Kubernetes' `preStop` hook is what creates the *safety window* this depends on — it runs (and the pod stays in the endpoint list a moment longer) before `SIGTERM` is even sent, giving the load balancer's already-cached routing table time to catch up and stop sending new connections, so the app-level "stop accepting, finish in-flight" logic above isn't racing against traffic still arriving. The two are complementary layers, not duplicates: `preStop`/endpoint removal is infrastructure buying the app time; `SIGTERM` handling and connection draining above is the app actually using that time correctly.

**Common pitfall:** an app with no `SIGTERM` handler at all gets forcibly killed at the end of the grace period having done nothing to drain — every in-flight request at that instant is simply severed, indistinguishable to the client from a crash.

---

## Scenario — Question 6

**Q6: A service is deployed via a rolling update. During every deployment, roughly 1–2% of in-flight requests fail with connection-reset errors — old pods are being killed before they finish requests already in progress. Diagnose and fix.**

**Diagnosis — a missing graceful-shutdown / connection-draining implementation, the gap described in Advanced Q11.** During a rolling update, Kubernetes terminates old pods as new ones become ready: it removes the pod from the Service's endpoint list and sends `SIGTERM`, then — after a grace period — sends `SIGKILL` if the process hasn't exited. If the application has no `SIGTERM` handler, the default .NET behavior (or an unhandled signal in another runtime) is to terminate essentially immediately, severing any connection that's mid-request at that instant. Separately, there's an unavoidable propagation delay between "pod removed from endpoints" and "every load balancer/proxy in the path has actually stopped routing new traffic there" — during that window, new connections can still arrive at a pod that's already decided to shut down. Both gaps produce the same symptom: requests that were legitimately in flight get cut off mid-response, surfacing to clients as connection resets, entirely disconnected from any real application fault.

**The fix — handle `SIGTERM`, stop accepting new work, drain in-flight requests within a bounded grace period, and coordinate with Kubernetes' `preStop` hook:**

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Host.ConfigureHostOptions(o => o.ShutdownTimeout = TimeSpan.FromSeconds(30));
var app = builder.Build();

var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
lifetime.ApplicationStopping.Register(() => HealthState.MarkNotReady());
// Kestrel + IHostApplicationLifetime already stop accepting new connections
// on ApplicationStopping and let existing requests complete up to ShutdownTimeout.

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = c => c.Tags.Contains("ready") && HealthState.IsReady
});
```

```yaml
# Kubernetes: give the endpoint-removal propagation delay somewhere safe to happen
# BEFORE SIGTERM is sent, so new traffic has already stopped arriving by the
# time the app begins draining what's left.
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 5"]
terminationGracePeriodSeconds: 40   # must exceed preStop sleep + app's own ShutdownTimeout
```

**Why both pieces are needed:** the `preStop` sleep absorbs the endpoint-propagation race so the pod isn't still receiving fresh connections after it's begun shutting down; the app-level `SIGTERM` handling ensures that whatever was already in flight when shutdown began gets to finish instead of being severed. Fixing only one half leaves the other gap open — `preStop` alone doesn't help if the app still terminates in-flight requests immediately on `SIGTERM`, and app-level draining alone doesn't help if new connections keep arriving throughout the drain window because the load balancer hasn't caught up yet.

**Verification:** re-run the rolling update under synthetic sustained load and confirm the connection-reset rate drops to zero — this is also a good candidate for a CI fault-injection test (Advanced Q9) that sends `SIGTERM` mid-request to a test instance and asserts the in-flight response still completes successfully.

---
