# Domain-Driven Design — Q&A

## Beginner — Question 1

**Q1: What is Domain-Driven Design, and what problem does it actually solve?**

Domain-Driven Design (DDD) is a set of practices — a mindset and vocabulary, not a framework, library, or specific architecture — for building software whose structure and language are shaped directly by the business domain it serves. It comes from Eric Evans' 2003 book *Domain-Driven Design: Tackling Complexity in the Heart of Software*.

**The problem it solves:**
In most non-trivial systems, there's a translation gap. A domain expert (say, an underwriter, a warehouse manager, a logistics planner) describes the business in terms like "a policy lapses if premium isn't paid within the grace period" or "a shipment can't be released until customs clearance and the carrier manifest both confirm." Developers then translate that into code — but the translation is lossy and one-directional. The code ends up organized around database tables, CRUD operations, or technical layers, and the business concepts get smeared across services, DTOs, and utility classes. Six months later, nobody — not the developer, not the domain expert — can look at the code and see the business rule it's supposed to enforce.

DDD's core claim: complexity in software is usually complexity *in the domain itself* (real business rules, real exceptions, real edge cases), not accidental technical complexity. So instead of hiding that complexity behind generic data-access code, DDD says model it explicitly — give the business's own concepts, rules, and vocabulary first-class representation in the code.

**What DDD is not:**
- It is not Clean Architecture, hexagonal architecture, or any layering scheme — those are compatible *implementation* choices, not DDD itself.
- It is not CQRS or event sourcing — again, complementary patterns often paired with DDD's tactical patterns, but independent of it.
- It is not "always model everything as rich objects" — DDD explicitly says to apply its heavier tactical patterns only in the parts of the system with real domain complexity (the "core domain"), and to keep supporting/generic subdomains simple, even CRUD-ish.

**Practical guidance:** DDD pays off most in domains with genuine, non-trivial business rules — insurance, banking, logistics, healthcare billing. Applying its full tactical toolkit (aggregates, domain events, repositories per aggregate) to a simple settings-management CRUD screen is over-engineering; DDD itself calls that subdomain "generic" and says to keep it boring.

---

## Beginner — Question 2

**Q2: What is the Ubiquitous Language, and why does Evans treat it as DDD's most important idea?**

The Ubiquitous Language is a shared vocabulary — deliberately and continuously built by developers and domain experts together — that is used consistently in conversation, documentation, *and directly in the code itself* (class names, method names, even variable names). The word a domain expert uses in a sentence should be the same word that appears as a class or method name in the codebase; there should be no separate "business language" and "technical language" requiring mental translation.

**Why it matters:**
Without it, translation happens ad hoc, every time, by whichever developer wrote that piece of code — and translations drift. One developer calls it `Client`, another calls the same concept `Account`, a database table calls it `tbl_Cust`. A domain expert reading a bug report about "the `AccountStatus` enum" has no idea it means what they call a policy's "in force" status. Evans considered this the foundation DDD's tactical patterns sit on: get the language wrong, and even a perfectly layered, perfectly tested codebase will misrepresent the business.

**How it shows up in code:**

```csharp
// Vague, technical vocabulary — no domain expert would recognize this
public class Record
{
    public int Status { get; set; }
    public void Process() { /* ... */ }
}

// Ubiquitous Language reflected directly in naming
public class InsurancePolicy
{
    public PolicyStatus Status { get; private set; }
    public void Lapse(LapseReason reason) { /* ... */ }
    public void Reinstate(ReinstatementRequest request) { /* ... */ }
}
```

`Lapse` and `Reinstate` are verbs an underwriter actually uses. A generic `Process()` method tells nobody — developer or domain expert — what actually happens.

**Practical guidance:** The Ubiquitous Language isn't fixed at project kickoff; it evolves through ongoing conversation (Evans calls the modeling activity itself "knowledge crunching"). When a developer and a domain expert discover a term is ambiguous or missing, that's a modeling event — refactor the code's names to match, don't just note it and move on. It also isn't global: the same word can (and often should) mean different things in different Bounded Contexts (covered in Intermediate Q4) — the Ubiquitous Language is scoped *per context*, not project-wide.

---

## Beginner — Question 3

**Q3: What's the difference between an Entity and a Value Object?**

This distinction is one of DDD's two foundational tactical building blocks, and getting it right shapes almost everything downstream (equality, mutability, persistence design).

**Entity:** Defined by a persistent, unique **identity** that survives over time and through state changes — not by its attribute values. Two entities with identical attributes are still different entities if their identities differ; the same entity is still "the same" even after every attribute changes.

**Value Object:** Defined entirely by its **attribute values** — it has no conceptual identity of its own. Two value objects with the same attributes *are* the same value object, and are interchangeable. Value Objects should be immutable: instead of mutating one in place, you replace it wholesale with a new instance.

```csharp
// Entity: identity matters, not the attribute values
public class Order
{
    public OrderId Id { get; }          // identity — never changes, defines equality
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; }

    public Order(OrderId id, Money total)
    {
        Id = id;
        Status = OrderStatus.Draft;
        Total = total;
    }

    public override bool Equals(object obj) =>
        obj is Order other && Id.Equals(other.Id);   // equality by identity only

    public override int GetHashCode() => Id.GetHashCode();
}

// Value Object: no identity, defined and compared entirely by its values
public readonly record struct Money(decimal Amount, string Currency)
{
    public static Money operator +(Money a, Money b)
    {
        if (a.Currency != b.Currency)
            throw new InvalidOperationException("Cannot add different currencies.");
        return new Money(a.Amount + b.Amount, a.Currency);
    }
}

// Money(100, "USD") == Money(100, "USD")  -> true, by value, regardless of which
// object was created where. There is no "identity" to compare.
```

`OrderId` itself is typically modeled as a small Value Object wrapping a `Guid` or `int` (a "strongly-typed ID") — it's a value used *to identify* the `Order` entity, but the ID's own equality is structural (two `OrderId`s wrapping the same GUID are equal), which is exactly what identity comparison for the Entity needs underneath.

**Common pitfall:** Modeling something like `Address` as a mutable class with a database-generated primary key (because "everything gets an ID column" in the ORM) turns a Value Object into an accidental Entity, which then invites incorrect reference-sharing and aliasing bugs — two orders "sharing" the same `Address` row means mutating one silently changes the other.

**Practical guidance:** Default to Value Object unless the domain genuinely needs to track something's identity and lifecycle independently of its current attributes (a `Customer`, an `Order`, a `Product`) — Value Objects are simpler, safer, and push validation into the constructor itself (a `Money` amount can never be negative if the constructor forbids it), rather than needing external validation code.

---

## Beginner — Question 4

**Q4: What is an "anemic domain model," and why does DDD consider it an anti-pattern?**

An anemic domain model is a codebase where domain classes (entities) are reduced to plain data bags — public getters/setters and no behavior — while all the actual business logic lives elsewhere, in "service" classes that operate *on* those data bags from the outside.

```csharp
// Anemic: Order is just a data container, all logic lives in a separate service
public class Order
{
    public int Id { get; set; }
    public decimal Total { get; set; }
    public string Status { get; set; }
    public List<OrderLine> Lines { get; set; }
}

public class OrderService
{
    public void AddLine(Order order, Product product, int quantity)
    {
        if (order.Status != "Draft")
            throw new InvalidOperationException("Cannot modify a submitted order.");
        order.Lines.Add(new OrderLine(product, quantity));
        order.Total = order.Lines.Sum(l => l.LineTotal);
    }
}
```

**Why it's a problem:** the invariant ("can't modify a submitted order") only holds if every caller remembers to go through `OrderService.AddLine`. Nothing stops a different piece of code from doing `order.Lines.Add(...)` directly and leaving `Total` stale, or from setting `order.Status = "Submitted"` without validating the order actually has any lines. The object can never protect its own consistency because it has public setters and no behavior — it's a struct wearing a class's clothes. Martin Fowler called this pattern out explicitly: it looks object-oriented (there are classes!) but is really procedural code with an OO paint job, and it forfeits OO's main benefit — encapsulating data with the operations that keep it valid.

**A rich domain model, by contrast**, keeps behavior *and* data together, exposes only intention-revealing methods, and makes invalid states unrepresentable:

```csharp
public class Order
{
    public OrderStatus Status { get; private set; }
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyList<OrderLine> Lines => _lines;
    public Money Total => _lines.Aggregate(Money.Zero, (sum, l) => sum + l.LineTotal);

    public void AddLine(Product product, int quantity)
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException("Cannot modify a submitted order.");
        _lines.Add(new OrderLine(product, quantity));
    }
}
```

Now `AddLine` is the *only* way to add a line, the status check can never be bypassed, and `Total` can never drift out of sync because it's computed, not stored.

**Practical guidance:** An anemic model isn't always wrong — for a genuinely simple, low-invariant subdomain (a CRUD settings page), it's an acceptable, honest choice. DDD's objection is specifically to using it for the *core domain*, where real business rules exist and need a home; when they don't get one in the entity, they either get duplicated across every service that touches the entity, or they get skipped.

---

## Intermediate — Question 1

**Q1: What is an Aggregate, and what role does the Aggregate Root play?**

An Aggregate is a cluster of associated Entities and Value Objects that DDD treats as a single unit for the purpose of data changes — a consistency boundary. Within an aggregate, one Entity is designated the **Aggregate Root**: the only object external code is allowed to hold a direct reference to or invoke methods on. Everything else inside the aggregate (child entities, value objects) is reached only by navigating through the root, never addressed directly from outside.

```csharp
public class Order   // Aggregate Root
{
    public OrderId Id { get; }
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyList<OrderLine> Lines => _lines;   // read-only exposure — no external mutation
    public OrderStatus Status { get; private set; }

    public void AddLine(ProductId productId, int quantity, Money unitPrice)
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException("Cannot add lines to a submitted order.");
        if (quantity <= 0)
            throw new DomainException("Quantity must be positive.");

        _lines.Add(new OrderLine(productId, quantity, unitPrice));
    }

    public void Submit()
    {
        if (!_lines.Any())
            throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;
    }
}

// OrderLine is an entity local to this aggregate — never referenced from outside directly
public class OrderLine
{
    public ProductId ProductId { get; }
    public int Quantity { get; }
    public Money UnitPrice { get; }
    public Money LineTotal => UnitPrice * Quantity;

    internal OrderLine(ProductId productId, int quantity, Money unitPrice)
    { ProductId = productId; Quantity = quantity; UnitPrice = unitPrice; }
}
```

External code never does `order.Lines[0].Quantity = 5` (in fact `Lines` is exposed as `IReadOnlyList<T>` precisely to prevent that) — it calls `order.AddLine(...)`, and the root enforces every invariant that spans the aggregate ("no lines on a submitted order," "quantity must be positive") on every mutation path, because there is exactly one path.

**Why this matters:** invariants that span multiple objects can only be reliably enforced if there's a single choke point that every mutation must pass through. If `OrderLine` were independently addressable and persistable, two concurrent operations could each add a line to the same order through different code paths, both individually "valid" from `OrderLine`'s perspective, but together violating a rule only the `Order` as a whole can see (e.g., a maximum order value). The aggregate root closes that gap by making itself the sole entry point.

**Practical guidance:** this is also why a Command Handler in a CQRS setup (see `clean-architecture.md` for the CQRS/MediatR mechanics) almost always targets an aggregate root by ID, loads the whole aggregate, calls a behavior method on it, and persists it as one unit — the aggregate root is the natural "target" of a write operation, and the transaction boundary should align with the aggregate boundary (one transaction, one aggregate — see Advanced Q5 on aggregate boundaries in `clean-architecture.md` for the transactional-consistency angle).

---

## Intermediate — Question 2

**Q2: How should Repositories be scoped in a DDD design, and why "one repository per Aggregate Root, not per table"?**

A Repository is an abstraction that mediates between the domain model and a persistence mechanism, giving the illusion of an in-memory collection of aggregates (`Add`, `GetById`, `Remove`) while hiding the actual database access underneath. In DDD, repositories exist **only for Aggregate Roots** — never for the entities or value objects living inside an aggregate.

```csharp
public interface IOrderRepository
{
    Task<Order> GetByIdAsync(OrderId id);
    Task AddAsync(Order order);
    void Remove(Order order);
    // Note: no IOrderLineRepository — OrderLine is not independently addressable.
}
```

**Why not one repository per table:** a table-per-repository design (`IOrderRepository`, `IOrderLineRepository`, `ICustomerAddressRepository`, ...) mirrors the *database schema*, not the *domain model*'s consistency boundaries. It re-opens exactly the hole aggregates are meant to close: if `OrderLine` has its own repository, nothing stops application code from loading and modifying an `OrderLine` directly, bypassing every invariant `Order.AddLine` was supposed to guarantee. The aggregate boundary is meaningless if persistence doesn't respect it.

A repository's `GetByIdAsync` loads the *entire* aggregate graph (root plus all its internal entities/value objects) as one consistent unit, and `AddAsync`/`SaveChanges` persists the entire graph as one transaction — matching the "one transaction touches at most one aggregate" guideline. In EF Core terms, this usually means the `DbContext` maps `OrderLine` as an owned/dependent type reachable only via `Order`, with no `DbSet<OrderLine>` exposed at all.

**Common pitfall:** exposing `IQueryable<T>` or a generic `IRepository<T>` from a repository defeats the purpose — it lets callers compose arbitrary queries and pull out internal entities directly, again bypassing the aggregate root. (`clean-architecture.md`'s Intermediate Q2 covers why a generic `IRepository<T>` is considered an anti-pattern in more depth — the aggregate-scoping argument here is the DDD half of that same objection.)

**Practical guidance:** for read-heavy scenarios (dashboards, list views, reports), don't force them through aggregate-scoped repositories at all — query the database directly with a dedicated read path (a raw query, a Dapper query, an EF `Select` projection to a DTO) that never touches the domain model. Repositories exist to protect *writes* through the aggregate; reads that don't need the aggregate's behavior shouldn't pay its cost.

---

## Intermediate — Question 3

**Q3: What is a Domain Event, and how does it enable decoupled side effects?**

A Domain Event represents something significant that happened in the domain — a fact, stated in the past tense, that other parts of the system might care about, even though the aggregate where it happened doesn't know or care who's listening. Naming convention matters here and is itself part of the Ubiquitous Language: `OrderPlaced`, `PaymentReceived`, `PolicyLapsed` — not `OrderPlacedEvent` handlers with generic verbs.

```csharp
public sealed record OrderPlaced(OrderId OrderId, CustomerId CustomerId, Money Total, DateTime OccurredOn)
    : IDomainEvent;

public class Order
{
    private readonly List<IDomainEvent> _domainEvents = new();
    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents;

    public void Submit()
    {
        if (!Lines.Any())
            throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;

        _domainEvents.Add(new OrderPlaced(Id, CustomerId, Total, DateTime.UtcNow));
    }

    public void ClearDomainEvents() => _domainEvents.Clear();
}
```

**How decoupling works:** `Order.Submit()` raises `OrderPlaced` but has zero knowledge of what happens next — it doesn't inject `IEmailService`, doesn't know an email even exists as a concept. Separately, an infrastructure-level dispatcher (commonly wired through an EF Core `SaveChanges` interceptor, so events fire only *after* the transaction actually commits — never on a change that gets rolled back) publishes the event, and one or more independent handlers react:

```csharp
public class SendOrderConfirmationEmail : INotificationHandler<OrderPlaced>
{
    public Task Handle(OrderPlaced notification, CancellationToken ct) =>
        _emailService.SendOrderConfirmation(notification.CustomerId, notification.OrderId);
}
```

Tomorrow, adding a second reaction (updating a sales dashboard, notifying a fulfillment service) means adding a second handler — the `Order` aggregate and its `Submit()` method never change. This is the same "raised but not dispatched until after `SaveChanges` succeeds" lifecycle detail covered under Clean Architecture's Intermediate Q5, and the same publish/subscribe mechanics MediatR's `INotification` provides (see `clean-architecture.md` Beginner Q14) — DDD's contribution is specifically the *modeling* discipline: deciding what counts as a meaningful domain event and where in the aggregate's behavior it belongs, not the dispatch plumbing itself.

**Practical guidance:** keep domain events named for what happened, not what should happen next (`OrderPlaced`, not `SendEmailRequested`) — that framing is what keeps the aggregate ignorant of its consumers and lets new reactions be added without touching domain code.

---

## Intermediate — Question 4

**Q4: What is a Bounded Context, and why should the same term mean different things in different ones?**

A Bounded Context is an explicit boundary — usually corresponding to a subsystem, module, or in a microservices world, a whole service — within which a particular domain model and its Ubiquitous Language apply consistently. Outside that boundary, the same term is not guaranteed to mean the same thing, and DDD says that's not a defect to fix but a reality to make explicit.

**Concrete example — "Customer" in Sales vs. Support:**

```csharp
// Sales Bounded Context: a Customer is a sales target with commercial attributes
namespace Sales.Domain
{
    public class Customer
    {
        public CustomerId Id { get; }
        public CreditLimit CreditLimit { get; private set; }
        public IReadOnlyList<Opportunity> OpenOpportunities { get; }
        public SalesTier Tier { get; private set; }
    }
}

// Support Bounded Context: a Customer is a ticket-raiser with entitlement attributes
namespace Support.Domain
{
    public class Customer
    {
        public CustomerId Id { get; }
        public SupportPlan Plan { get; private set; }
        public IReadOnlyList<Ticket> OpenTickets { get; }
        public DateTime? EscalationEligibleSince { get; private set; }
    }
}
```

Both are legitimately "the same customer" from a whole-business point of view, and they likely share a stable identifier (a `CustomerId`) for correlation — but forcing them into one shared `Customer` class with every attribute either domain might ever need produces exactly the kind of bloated, tightly-coupled model DDD is trying to avoid: a change to how Support tracks entitlements now risks breaking Sales code that has nothing to do with support tickets, and the "one true Customer class" becomes a god object nobody can safely change.

**Why explicit boundaries matter:** without them, teams either (a) silently build divergent, undocumented models under the same name and get burned by the mismatch later, or (b) fight to keep one shared model "consistent" across teams with genuinely different concerns, which is slow and produces a model that serves nobody well. A Bounded Context says: draw the line explicitly, let the model and language differ freely on each side, and define deliberately how information crosses the boundary (see Context Mapping, next question) rather than pretending there's no boundary at all.

**Practical guidance:** identifying Bounded Contexts is a strategic design activity — usually done through "Event Storming" or similar collaborative sessions with domain experts, looking for places where the same word is used with different meaning or where a team boundary/deployment boundary naturally wants to exist. It's the single highest-leverage decision in a DDD-informed system, because it determines where the hard seams are — getting it wrong is expensive to walk back later (see Advanced Q1 and Scenario Q1).

---

## Intermediate — Question 5

**Q5: What is Context Mapping, and what are the main patterns for how Bounded Contexts relate?**

Context Mapping is the practice of explicitly documenting and designing the relationships *between* Bounded Contexts — because contexts rarely exist in total isolation; they need to exchange data and coordinate behavior, and how that happens has real architectural and organizational consequences. Evans' original patterns include:

**Shared Kernel:** two contexts (and the teams owning them) deliberately share a small, jointly-owned subset of the domain model — typically Value Objects like `Money` or `Address` that are genuinely identical in meaning everywhere. Requires tight coordination: a breaking change to the shared code affects both teams, and neither can change it unilaterally. High coupling, high coordination cost — used sparingly, only where the shared concept truly is identical, not merely similar.

**Customer-Supplier:** one context (the Supplier, e.g., an `Inventory` service) provides data or functionality that a downstream context (the Customer, e.g., `Ordering`) depends on. The Customer's needs have real influence over the Supplier's roadmap/API — it's a planned, negotiated relationship, not an afterthought.

**Conformist:** downstream context has no leverage over the upstream (e.g., a third-party payment gateway's API) and simply conforms to whatever model the upstream provides, translating minimally. Pragmatic when there's no realistic way to negotiate.

**Anti-Corruption Layer (ACL):** the downstream context builds a translation layer that converts the upstream model into its own clean domain model at the boundary, so upstream concepts never leak into the downstream domain. This is the pattern of choice when the upstream model is messy, legacy, or simply conceptually foreign to the downstream domain — covered in depth in Advanced Q4 and Scenario Q3.

**Open Host Service / Published Language:** a context exposes a well-defined, versioned protocol (a REST API with an OpenAPI contract, an event schema) meant for consumption by many other contexts, rather than negotiating one-off integrations per consumer.

```text
[ Sales Context ] --Customer-Supplier--> [ Inventory Context ]
[ Ordering Context ] --ACL--> [ Legacy Mainframe (Shipping status codes) ]
[ Ordering Context ] <--Shared Kernel--> [ Billing Context ]   (shared Money, Address value objects)
```

**Practical guidance:** a Context Map is a living architectural artifact, not a one-time diagram — it should be revisited as the system evolves, and it makes integration *decisions* visible (who's upstream, who conforms, where translation happens) instead of leaving them implicit in whatever ad hoc HTTP calls or shared database tables happened to accumulate. In a microservices architecture, the context map is effectively the service dependency graph annotated with *why* each dependency exists and *how* the coupling is managed.

---

## Advanced — Question 1

**Q1: What's the difference between Strategic and Tactical DDD, and why does strategic design matter more for microservice boundaries?**

DDD splits into two levels of concern:

**Strategic DDD** operates at the scale of the whole system/organization: identifying Bounded Contexts, mapping relationships between them (Context Mapping), distinguishing the **Core Domain** (where the business's real competitive differentiation and complexity live — worth the heaviest investment) from **Supporting Subdomains** (necessary but not differentiating — e.g., notification sending) and **Generic Subdomains** (solved problems better bought than built — e.g., authentication). Strategic design answers: *where are the seams, and where should engineering effort concentrate?*

**Tactical DDD** operates inside a single Bounded Context: Entities, Value Objects, Aggregates, Domain Events, Repositories, Domain Services — the building blocks used to *implement* a model once you've decided what that context's model should cover.

**Why strategic design matters more for microservice boundaries:** a microservice boundary is fundamentally a strategic-design decision — it's a question of "where does one consistent, independently-evolvable domain model end and another begin," which is exactly what a Bounded Context answers. Getting tactical patterns wrong inside a service (say, using an anemic model instead of a rich one) produces a service that's *unpleasant to work in* but still basically correct and independently deployable. Getting the strategic boundary wrong — splitting a microservice down the middle of what should have been one Bounded Context, or merging two genuinely distinct contexts into one service — produces a *distributed monolith*: services that must be deployed together, that chatily call each other for every operation, and where a single business transaction requires synchronous calls across three services because no one service owns a complete-enough model to act alone. That failure mode is expensive to fix after the fact (it usually means a service split/merge and a data migration), whereas a tactical mistake inside one service is a local refactor.

This is precisely the trap in Scenario Q1: splitting services by technical layer (a "database service," a "validation service") isn't a strategic DDD decision at all — it's organizing by *implementation concern*, not by *domain boundary*, and it guarantees every real business operation needs to hop across multiple services just to complete one meaningful unit of work.

**Practical guidance:** do strategic design first, collaboratively, with domain experts (Event Storming, domain-expert interviews, Context Mapping) — draw the Bounded Context boundaries before writing service-boundary code. Only once boundaries are settled does it make sense to reach for tactical patterns inside each one, and even then, only for contexts identified as Core or Supporting-with-real-complexity; a Generic subdomain often doesn't need aggregates or domain events at all.

---

## Advanced — Question 2

**Q2: How do you size an Aggregate correctly — what goes wrong when aggregates are too large, and what goes wrong when they're too small?**

Aggregate boundaries are a design decision with real consistency and performance consequences, and both directions of getting it wrong are common.

**Too large — the "everything Order touches" mistake:**

```csharp
// Too large: Order pulls in full Customer, full Product catalog data, and shipping
// as owned sub-objects rather than references.
public class Order
{
    public Customer Customer { get; private set; }          // entire Customer entity, embedded
    public List<Product> Products { get; private set; }      // full catalog entries, embedded
    public ShippingDetails Shipping { get; private set; }
    public List<OrderLine> Lines { get; private set; }
}
```

Because a repository loads and a transaction commits an entire aggregate as one unit, this design means: updating a customer's phone number, or a product's price, or an order's shipping status all contend for the *same row-level locks* if they route through the `Order` aggregate — even though "update customer phone number" has nothing to do with an in-flight order. Every write to any of these concerns now competes with every other order's writes for the same lock, and every load of an `Order` drags in data that most operations don't need. This is exactly the contention scenario in Scenario Q2.

**Too small — the "each entity guards nothing" mistake:** the opposite failure is splitting an aggregate so finely that it can no longer enforce a real invariant. Example: modeling `OrderLine` as its own independently-addressable aggregate root (with its own repository) instead of a child entity inside `Order`. Now nothing can enforce "an order's total must not exceed the customer's credit limit" or "an order must have at least one line before it can be submitted," because no single aggregate load ever sees the whole picture — those checks would require loading multiple aggregates and hoping no concurrent write slips in between, defeating the entire purpose of an aggregate as a consistency boundary.

**Correct sizing example:** `Order` should own `OrderLine`s (a true parent/invariant relationship — lines can't exist without their order, and order-level invariants span all lines) but should reference `Customer` and `Product` **by ID only**, not by embedding:

```csharp
public class Order
{
    public OrderId Id { get; }
    public CustomerId CustomerId { get; }      // reference by ID, not embedded Customer
    private readonly List<OrderLine> _lines = new();   // owned — true consistency boundary
    public IReadOnlyList<OrderLine> Lines => _lines;
    public ShippingAddress ShippingAddress { get; private set; }  // small value object snapshot, not the full ShippingDetails aggregate
}
```

If a rule genuinely needs both a customer's credit limit and an order's total (e.g., "reject if order total exceeds credit limit"), that check is either (a) done by a Domain Service or Application-layer handler that loads both aggregates read-only and coordinates without needing atomic cross-aggregate consistency, or (b) enforced eventually, via a domain event, if strict same-transaction consistency isn't actually required by the business.

**Practical guidance:** the rule of thumb is "reference other aggregates by ID, keep aggregates small, and design around the true invariants that must be enforced atomically" — anything that can tolerate eventual consistency (most cross-aggregate relationships) should be modeled as a reference plus an eventual-consistency mechanism (a domain event handler), not embedded for convenience.

---

## Advanced — Question 3

**Q3: What is a Domain Service, and when does logic belong there instead of on an Entity or Value Object?**

A Domain Service is a stateless operation that represents a meaningful domain concept but doesn't naturally belong to any single Entity or Value Object — because the operation's meaning genuinely spans multiple aggregates, and forcing it onto one of them would be arbitrary and would leak knowledge of one aggregate into another.

**Canonical example — transferring funds between two accounts:**

```csharp
public interface IFundsTransferService
{
    void Transfer(Account from, Account to, Money amount);
}

public class FundsTransferService : IFundsTransferService
{
    public void Transfer(Account from, Account to, Money amount)
    {
        from.Withdraw(amount);   // each aggregate still enforces its own invariant
        to.Deposit(amount);      // (e.g., "cannot withdraw below zero balance")
    }
}
```

Why not put `Transfer` on `Account` itself? Because "transfer" is not something one `Account` does *to* another — an `Account.TransferTo(otherAccount, amount)` method would require one `Account` aggregate to hold a reference to and directly mutate a second `Account` aggregate, violating the "reference other aggregates by ID only" guideline from Advanced Q2 and blurring which aggregate's invariants are whose. Instead, the Domain Service coordinates two aggregates, each of which still independently guards its own invariant (`Withdraw` still refuses to take a balance negative; `Deposit` still validates the currency matches) — the Domain Service only supplies the *coordination*, not the *validation logic itself*, which stays where it belongs, on each aggregate.

**Distinguishing from an Application Service:** a Domain Service contains domain logic and domain vocabulary (`Transfer`, in the Ubiquitous Language, is something the business itself talks about) and has no knowledge of infrastructure concerns (no `DbContext`, no HTTP, no logging). An Application Service/Use Case handler, by contrast, orchestrates a whole use case including infrastructure — loading the two `Account` aggregates via their repositories, invoking the Domain Service, and calling `SaveChanges` — but contains no business rule of its own. (`clean-architecture.md`'s Advanced Q2 covers this same entity-vs-domain-service placement decision in more depth from the Clean Architecture layering angle.)

**Common pitfall:** overusing Domain Services becomes a relapse into an anemic model — if every operation ends up as a `XyzService.DoThing(entity)` call, the entities have quietly become data bags again. Reach for a Domain Service only when the operation truly can't be attributed to a single aggregate; a Domain Service that only ever takes one entity as a parameter is almost always really a method that belongs on that entity.

**Practical guidance:** Domain Services should be interface-defined in the domain layer (so the domain layer can depend on the *abstraction* of coordination logic it needs) with any infrastructure-touching implementation detail pushed to the outer layers — they remain part of the domain model conceptually, even though the C# interface/implementation split may span layers physically.

---

## Advanced — Question 4

**Q4: What is the Anti-Corruption Layer pattern in depth, and what specifically does it protect against?**

An Anti-Corruption Layer (ACL) is a translation boundary placed between your Bounded Context and an external or legacy system, whose entire purpose is to prevent that external system's model — its vocabulary, its data shapes, its quirks and historical baggage — from leaking into your clean domain model. It's a specific instance of the Conformist-vs-ACL choice from Context Mapping (Intermediate Q5): rather than conforming your model to the external system's, you build a translation seam and keep your model clean on your side of it.

**Why "corruption" is the right word:** without an ACL, the natural failure mode is that the external system's model creeps in gradually — a legacy status code (`"A"`, `"P"`, `"X"`) gets stored verbatim in your domain, a field named after the external system's internal jargon gets used directly in your business logic, a null-means-something-different-here convention from the legacy system silently propagates into your invariants. Each individual leak feels harmless; cumulatively, your "clean" domain model becomes an unwitting mirror of a 20-year-old system's design decisions, and every future change has to account for both models at once.

**Structure of an ACL:**

```csharp
// The legacy system's model — cryptic, cheaply named, exactly as the mainframe emits it
public class LegacyShipmentRecord
{
    public string ShpStatCd { get; set; }   // "A", "P", "X", "H", "D" — undocumented mainframe codes
    public string CustNo { get; set; }
    public DateTime? DtRcvd { get; set; }
}

// Translator: the only place that knows both models exist
public class LegacyShipmentTranslator
{
    public ShippingStatus Translate(LegacyShipmentRecord legacy) => legacy.ShpStatCd switch
    {
        "A" => ShippingStatus.AwaitingDispatch,
        "P" => ShippingStatus.InTransit,
        "X" => ShippingStatus.Cancelled,
        "H" => ShippingStatus.OnHold,
        "D" => ShippingStatus.Delivered,
        _ => throw new InvalidLegacyDataException($"Unknown legacy status code: {legacy.ShpStatCd}")
    };
}

// Facade/adapter: the only entry point the domain talks to; internally calls the legacy
// system and the translator, and exposes a clean domain-facing interface.
public interface IShipmentStatusProvider
{
    Task<ShippingStatus> GetStatusAsync(ShipmentId id);
}

public class LegacyShipmentStatusProvider : IShipmentStatusProvider
{
    public async Task<ShippingStatus> GetStatusAsync(ShipmentId id)
    {
        var legacyRecord = await _legacyClient.FetchRecordAsync(id.ToLegacyFormat());
        return _translator.Translate(legacyRecord);
    }
}
```

Everything domain code sees is `ShippingStatus.InTransit` — a clean, Ubiquitous-Language-conformant enum. Nothing outside `LegacyShipmentStatusProvider` and `LegacyShipmentTranslator` ever sees `"ShpStatCd"` or the letter codes; if the mainframe adds a new code or changes its meaning, exactly one file needs to change.

**Practical guidance:** an ACL is worth its cost (an extra translation layer, extra types, ongoing maintenance as the external system evolves) specifically when the external system is messy, poorly documented, outside your control, or conceptually foreign to your domain — a legacy mainframe, a third-party vendor API, an old system slated for eventual replacement. For a well-designed internal system you fully control, a lighter Conformist or Open-Host-Service relationship may be cheaper; reserve the full ACL for boundaries where corruption risk is real. See Scenario Q3 for a full worked design.

---

## Advanced — Question 5

**Q5: How do Bounded Contexts map onto microservice boundaries, and what's the common mistake in drawing those boundaries?**

A Bounded Context is a strong, natural candidate for a microservice boundary: each context already has its own consistent model, its own Ubiquitous Language, and (per DDD's own guidance) is meant to evolve independently of other contexts — which is exactly what a microservice's independent deployability requires. This is why DDD's strategic patterns and microservice architecture are so often discussed together: a well-identified Bounded Context gives you a *principled* answer to "where should this service's boundary be," instead of an arbitrary one.

**The common mistake — slicing by technical layer or table instead of by capability:**

```text
WRONG (technical-layer slicing):
  - "Database Service"      (owns all the tables, exposes generic CRUD)
  - "Validation Service"    (validates data before it's saved anywhere)
  - "Notification Service"  (sends anything to anyone, for any reason)

RIGHT (Bounded-Context / business-capability slicing):
  - Catalog Service      (owns Product, Category, Pricing — its own model, its own DB)
  - Ordering Service      (owns Order, OrderLine — its own model, its own DB)
  - Shipping Service      (owns Shipment, Carrier — its own model, its own DB)
```

Slicing by technical layer produces services with no coherent domain model of their own — the "Database Service" has to expose a generic, schema-shaped API because it has no domain concept to organize around, and now *every* business operation (placing an order, updating a product) requires a synchronous call chain across the Database Service, the Validation Service, and whatever triggered the operation, just to do one meaningful unit of work. This is the distributed-monolith failure mode from Advanced Q1: high inter-service chatter, tight coupling, no independent deployability in practice (a schema change in the "Database Service" ripples to every consumer), and none of the actual benefit microservices are supposed to provide.

Slicing by Bounded Context, by contrast, gives each service a genuine reason to exist independently: `Catalog` can change its pricing model without `Ordering` needing to know how, because `Ordering` only depends on `Catalog`'s stable, published product/price data (an Open Host Service relationship, from Intermediate Q5), not on `Catalog`'s internal schema.

**Practical guidance:** identify Bounded Contexts through business-capability analysis (often via Event Storming with domain experts, tracing which business capability each cluster of commands/events belongs to — "place order," "adjust inventory," "arrange shipping" — rather than which database table they touch), *then* decide which contexts warrant becoming separate microservices (not every Bounded Context needs its own service — a small one might stay a module inside a larger service, especially early on, and be extracted later if it proves it needs independent scaling or deployment).

---

## Scenario — Question 1

**Q1: A team is designing microservice boundaries for a new e-commerce platform. Their initial proposal splits services by technical concern: a "Database Service" that owns all persistence and exposes generic CRUD endpoints, a "Validation Service" that checks business rules before anything is saved, and a "Notification Service" that sends any kind of message to anyone. Why is this wrong, and how would Bounded Context analysis produce a better set of boundaries?**

This proposal slices the system along *implementation layers*, not *domain boundaries* — it's essentially a three-tier architecture wearing microservice clothing, and it inherits none of microservices' real benefits while paying their full operational cost.

**Why it fails in practice:**
1. **No service has a coherent domain model.** The "Database Service" can't meaningfully validate or enforce invariants — it just persists whatever shape of data it's handed, for every kind of business entity at once (products, orders, shipments, customers). It ends up with a schema-shaped, lowest-common-denominator API, because it has no domain concept to organize its behavior around.
2. **Every real business operation becomes a distributed transaction.** "Place an order" now means: call the Validation Service to check the order is valid, call the Database Service to persist it, call the Database Service again to decrement inventory, call the Notification Service to email a confirmation — four synchronous network calls for one business operation that a single well-bounded `Ordering` service could have handled as one local transaction plus one published event.
3. **Coupling is actually *higher* than a monolith's.** A schema change to how orders are stored (the "Database Service"'s internal concern) ripples out to every service that ever reads or writes order data, because none of them own the model — they're all clients of the same generic store. Nothing is actually decoupled; it's a monolith's shared database, now with extra network hops.
4. **Ownership and team boundaries are meaningless.** Whichever team owns the "Validation Service" has to understand *every* business rule for *every* domain concept in the system, because validation isn't scoped to a business capability — it's a horizontal slice across all of them.

**Better boundaries via Bounded Context analysis:**
Run an Event Storming session (or equivalent) with domain experts from sales, fulfillment, and catalog management, and look for where the business's own vocabulary and processes naturally cluster and where the same word means different things:

```text
Catalog Service     — owns Product, Category, Price, Inventory levels
                       Ubiquitous Language: SKU, Listing, Price Tier

Ordering Service     — owns Order, OrderLine, Customer's order history
                       Ubiquitous Language: Order, Cart, Checkout

Shipping Service      — owns Shipment, Carrier, Tracking
                       Ubiquitous Language: Shipment, Manifest, Delivery Window
```

Each service now owns a full vertical slice — its own model, its own persistence, its own validation logic, all consistent with its own Ubiquitous Language — and cross-service coordination happens deliberately, via published domain events (`OrderPlaced` triggers `Shipping` to create a shipment, `Ordering` calls `Catalog`'s published API to check stock before confirming) rather than every operation needing to touch a shared generic layer. "Place an order" becomes: `Ordering` validates and persists the order as one local transaction, then publishes `OrderPlaced` — `Shipping` and `Notification` react independently and asynchronously.

**Practical guidance:** the giveaway that boundaries are wrong is almost always "does this service have its own domain vocabulary and its own real business rules, or is it just a technical utility used by everything else?" A true Bounded Context should be describable to a domain expert in the business's own terms; "the Validation Service" isn't a business capability anyone outside engineering would recognize.

---

## Scenario — Question 2

**Q2: An `Order` aggregate has grown over time to include the full `Customer` entity (name, address, credit history, marketing preferences), the full `Product` catalog entry for every line item (name, description, images, category tree), and a full `ShippingDetails` sub-object (carrier options, rate tables, tracking history). Every order update now causes massive lock contention — updating a customer's email address blocks in-flight order submissions, and vice versa. How do you redesign this aggregate?**

This is the "aggregate too large" failure from Advanced Q2, playing out concretely. The root cause: the team modeled *object composition convenience* ("I need the customer's name when I render an order confirmation, so I'll just embed the whole Customer") rather than *consistency boundaries* ("what must be atomically consistent with what, and what can tolerate being slightly stale or fetched separately").

**Diagnosis — walk through what's actually contended:**
- Updating `Customer.Email` has no business reason to be blocked by, or to block, `Order.Submit()` — they don't share an invariant. The only reason they're contending is that both paths route through the same `Order` aggregate's row-level locks, because `Customer` is embedded inside it.
- Similarly, a `Product`'s description or images changing has zero bearing on an already-placed order's correctness — an order should capture a *snapshot* of what the product was at time of purchase (price, name), not a live reference to the mutable catalog entry.
- `ShippingDetails` with carrier rate tables is worse: rate tables are reference data shared across *all* orders, not order-specific data at all — embedding it means every order row effectively holds a copy of shared configuration.

**Redesign:**

```csharp
public class Order   // Aggregate Root — now genuinely small
{
    public OrderId Id { get; }
    public CustomerId CustomerId { get; }                 // reference by ID only

    private readonly List<OrderLine> _lines = new();       // owned — true invariant boundary
    public IReadOnlyList<OrderLine> Lines => _lines;

    public OrderStatus Status { get; private set; }
    public ShippingAddress ShippingAddress { get; private set; }  // small immutable snapshot VO, not the full ShippingDetails aggregate

    public void Submit()
    {
        if (!_lines.Any()) throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;
    }
}

// Snapshot captured at order time — a Value Object, immutable, order-line-scoped
public class OrderLine
{
    public ProductId ProductId { get; }     // reference by ID
    public string ProductNameSnapshot { get; }  // captured at purchase time — doesn't change if catalog changes
    public Money UnitPriceSnapshot { get; }     // price at time of purchase, not a live catalog lookup
    public int Quantity { get; }
}
```

**What moved out, and why each is safe to reference by ID:**
- `Customer` → referenced by `CustomerId`. Rendering an order confirmation with the customer's current name/email is a *read-side* concern — a query that joins `Order` and `Customer` read models (or calls the `Customer` service) for display purposes, entirely separate from the `Order` aggregate's write-side consistency boundary.
- `Product` catalog data → referenced by `ProductId`, with `ProductNameSnapshot`/`UnitPriceSnapshot` captured into the `OrderLine` at the moment of purchase (which is *correct* domain behavior anyway — an order should reflect the price the customer actually agreed to pay, immune to later catalog price changes, not a live join).
- `ShippingDetails`/carrier rate tables → not part of `Order` at all; it's reference/configuration data, or belongs to a separate `Shipment` aggregate created later (via an `OrderPlaced` domain event handler), referencing the order by ID.

**Result:** updating a customer's email now touches only the `Customer` aggregate's row; updating catalog data touches only `Product`'s; submitting an order touches only that one `Order` row and its owned `OrderLine`s. Lock contention drops because each aggregate's write scope now matches its actual consistency requirement, not an accidental convenience-driven object graph.

---

## Scenario — Question 3

**Q3: A 20-year-old mainframe system is the system of record for shipment tracking. It exposes shipment data with cryptic, undocumented status codes (`"A"`, `"P"`, `"X"`, `"H"`, `"D"`), inconsistent null handling (a missing `DtRcvd` sometimes means "not yet received" and sometimes means "data was never migrated for pre-2010 records"), and field names abbreviated to 8 characters from an old COBOL copybook. You need to build a new, cleanly-modeled Shipping Bounded Context that consumes this data without importing any of that legacy baggage into your domain model. Design an Anti-Corruption Layer.**

The goal is that no code inside the new `Shipping` domain model ever sees a mainframe field name, a raw status code, or has to reason about the mainframe's null-handling quirks — all of that is quarantined behind a translation boundary, with exactly one place responsible for understanding both models.

**Step 1 — define the clean domain-side model first, independent of the legacy shape:**

```csharp
public enum ShippingStatus { AwaitingDispatch, InTransit, OnHold, Delivered, Cancelled, Unknown }

public class Shipment   // Aggregate Root in the new Shipping Bounded Context
{
    public ShipmentId Id { get; }
    public ShippingStatus Status { get; private set; }
    public DateTime? ReceivedAt { get; private set; }   // null genuinely means "not received" — one meaning only

    public void UpdateFromExternalSource(ShippingStatus status, DateTime? receivedAt)
    {
        Status = status;
        ReceivedAt = receivedAt;
    }
}
```

**Step 2 — isolate the legacy shape entirely within an Infrastructure-layer type that never crosses into the domain:**

```csharp
internal class LegacyShipmentRecord   // internal: cannot leak outside this project/layer
{
    public string ShpStatCd { get; set; }
    public string DtRcvdRaw { get; set; }     // string, not DateTime — mainframe emits "00000000" for "no data", not a real null
    public bool IsPreMigrationRecord { get; set; }
}
```

**Step 3 — the translator resolves every legacy ambiguity explicitly, once, in one place:**

```csharp
internal class LegacyShipmentTranslator
{
    public (ShippingStatus Status, DateTime? ReceivedAt) Translate(LegacyShipmentRecord legacy)
    {
        var status = legacy.ShpStatCd switch
        {
            "A" => ShippingStatus.AwaitingDispatch,
            "P" => ShippingStatus.InTransit,
            "H" => ShippingStatus.OnHold,
            "D" => ShippingStatus.Delivered,
            "X" => ShippingStatus.Cancelled,
            _   => ShippingStatus.Unknown       // never throw for an unmapped code in a translator that runs
                                                  // against live legacy data — log it and degrade gracefully
        };

        DateTime? receivedAt = (legacy.DtRcvdRaw == "00000000")
            ? (legacy.IsPreMigrationRecord ? null : null)   // both cases resolve to "not received" for THIS field,
                                                              // but see note below on why they're handled separately
            : DateTime.ParseExact(legacy.DtRcvdRaw, "yyyyMMdd", CultureInfo.InvariantCulture);

        return (status, receivedAt);
    }
}
```

**Step 4 — a facade/adapter exposes only the clean interface the domain depends on:**

```csharp
public interface IShipmentSyncGateway
{
    Task SyncAsync(ShipmentId id, Shipment shipment);
}

internal class LegacyShipmentSyncGateway : IShipmentSyncGateway
{
    public async Task SyncAsync(ShipmentId id, Shipment shipment)
    {
        var legacyRecord = await _mainframeClient.FetchAsync(id.ToLegacyKey());
        var (status, receivedAt) = _translator.Translate(legacyRecord);
        shipment.UpdateFromExternalSource(status, receivedAt);
    }
}
```

**Why the ambiguous null case (Step 3) is handled explicitly rather than glossed over:** this is exactly the kind of legacy quirk an ACL exists to absorb. `IsPreMigrationRecord` is domain knowledge *about the mainframe*, not about shipping — it should never appear as a concept in the `Shipment` aggregate. The translator resolves it to a single, unambiguous domain value (`null` = not received) and the distinction dies at the boundary; if a future requirement needs to distinguish "genuinely not received" from "data never migrated," that's a new, explicitly-named field the translator populates deliberately, not a leak of the mainframe's internal null convention.

**Practical guidance:** treat unmapped/unexpected legacy codes (the `_ => Unknown` branch) as a first-class case, not an exception path — legacy systems drift, and a translator that throws on any unrecognized code turns every mainframe surprise into a production incident. Log it, surface it via monitoring, and let the domain model represent "we got data we don't understand yet" as a real status rather than crashing the integration.

---

## Scenario — Question 4

**Q4: Two teams — `Sales` and `Support` — both need a concept of "Customer." Sales wants credit limits, sales tier, and open opportunities; Support wants support plan, open tickets, and escalation eligibility. A junior architect proposes one shared `Customer` microservice that both teams call, with a single `Customer` table containing every field either team might need. Six months in, Sales can't add a field without Support's team reviewing the migration, deployments are coupled, and a bug in Support's escalation logic corrupted a Sales-only field via a shared update endpoint. What went wrong, and how do you fix it?**

What went wrong is a Shared Kernel that was never actually chosen as a Shared Kernel — it was arrived at by default, by assuming "there's only one Customer" without asking whether Sales's and Support's concepts of a customer are actually the *same* concept, modeled identically, evolving at the same pace, worth the coordination cost. They're not: Sales's `SalesTier` and Support's `EscalationEligibleSince` have nothing to do with each other, are computed from unrelated data, and change on unrelated schedules — exactly the situation Intermediate Q4 describes, where the same word legitimately means different things in different Bounded Contexts.

**The specific damage a false Shared Kernel causes, visible in the symptoms given:**
- **Coupled deployments:** because both teams' data lives in one schema behind one service, any migration risks breaking the other team's fields, so both must review every change — the coordination tax of a *true* Shared Kernel, paid without ever having decided the sharing was worth it.
- **Cross-contamination bug:** Support's update endpoint touching a Sales-only field is only possible because there's one table and (implicitly) one write path shared by both concerns — there's no boundary enforcing that Support's logic can only ever affect Support's own data.

**The fix — split into two Bounded Contexts, each with its own `Customer` model, correlated by a shared identifier:**

```csharp
// Sales Bounded Context — its own service/module, its own database
namespace Sales.Domain
{
    public class Customer   // Aggregate Root, Sales' own model
    {
        public CustomerId Id { get; }             // shared identifier — the only thing both contexts agree on
        public CreditLimit CreditLimit { get; private set; }
        public SalesTier Tier { get; private set; }
        public IReadOnlyList<Opportunity> OpenOpportunities { get; }
    }
}

// Support Bounded Context — its own service/module, its own database
namespace Support.Domain
{
    public class Customer   // Aggregate Root, Support's own model — same name, deliberately different shape
    {
        public CustomerId Id { get; }
        public SupportPlan Plan { get; private set; }
        public IReadOnlyList<Ticket> OpenTickets { get; }
        public DateTime? EscalationEligibleSince { get; private set; }
    }
}
```

`CustomerId` is the only thing genuinely shared — a stable identifier used to correlate the two views of "the same underlying business customer" when needed (e.g., a support agent's screen might display both the support-relevant fields from `Support.Customer` and a read-only summary pulled from `Sales`'s published API for context). If truly nothing besides the ID is common, this could even be argued as no Shared Kernel at all, just two independent contexts referencing a shared identity scheme.

If genuinely identical, rarely-changing Value Objects exist across both (e.g., `Address` formatted identically everywhere), *those specific types* — not the whole `Customer` entity — can be a deliberately small, explicitly-agreed Shared Kernel, with both teams consciously accepting the coordination cost for that narrow slice.

**Practical guidance:** the tell that a "shared" concept should actually be split is exactly what happened here — two teams needing to coordinate on changes that don't semantically overlap. Default to separate Bounded Contexts with ID-based correlation; only fall back to a Shared Kernel for a genuinely small, stable, identically-meaning piece of the model, and treat that as an explicit, costly decision both teams sign up for — not an assumption nobody questioned.

---

## Beginner — Question 5

**Q5: What is an Invariant in DDD, and why do Aggregates exist specifically to enforce them?**

An invariant is a business rule that must be true at all times — not just "usually true" or "true after validation runs," but true at every moment the system considers the data consistent. "An order's total must equal the sum of its lines," "an account balance can never go negative," "a submitted order must have at least one line" are all invariants: statements the domain expert would consider *broken data* if violated, not merely unusual data.

**Why invariants need a designated enforcer:** an invariant that spans more than one field, or more than one object, can only be reliably protected if there's exactly one code path every change must pass through. If validation is scattered — one check in a controller, another in a service, a third assumed but never actually written — it's only a matter of time before some code path skips one of them, because nothing structural forces every path to agree.

```csharp
public class Order
{
    public OrderStatus Status { get; private set; }
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyList<OrderLine> Lines => _lines;

    // The invariant "a submitted order must have at least one line" is enforced
    // in exactly one place — there is no other way to change Status.
    public void Submit()
    {
        if (!_lines.Any())
            throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;
    }
}
```

This is exactly why Aggregates exist (see Intermediate Q1): an Aggregate Root is the single choke point every mutation of the objects inside it must go through, which makes it the natural home for enforcing invariants that span multiple fields or multiple child objects. Without an aggregate root funneling every write through one method, `_lines.Add(...)` and `Status = OrderStatus.Submitted` could each be set independently from outside, and the invariant linking them would only hold by accident.

**Common pitfall:** treating invariant enforcement as something that happens in a validation layer *after* an object is already in an invalid state (e.g., a `Validate()` method called before saving) rather than making the invalid state impossible to construct in the first place. A constructor or method that simply refuses to produce an inconsistent object is stronger than a validator that checks for inconsistency after the fact and hopes every caller remembers to call it.

**Practical guidance:** when identifying invariants during modeling, ask "what would the domain expert call *broken* if I saw it in the database?" — that phrasing tends to separate real invariants (must always hold) from mere formatting or presentation rules (which don't need aggregate-level protection). Every invariant you find is a strong signal for where an aggregate boundary should sit.

---

## Beginner — Question 6

**Q6: What is a Factory in DDD, and when does object creation deserve its own dedicated component instead of a plain constructor?**

A Factory encapsulates the logic for creating a complex object or aggregate — especially when construction itself has invariants to satisfy, requires choosing between several valid initial states, or needs information from more than one source to produce a valid object. The goal is the same as tactical DDD generally: keep invalid states unrepresentable, this time specifically at the moment of birth rather than during later mutation.

**When a plain constructor is enough:** if creating the object is a single, obvious step with no meaningful decision-making, a constructor (or a simple static factory method on the entity itself) is sufficient — reaching for a separate Factory class every time is over-engineering.

**When a dedicated Factory earns its place:**

```csharp
// Creating an Order isn't just "new Order()" — it has to be seeded from a Cart,
// validate the cart isn't empty, snapshot prices, and assign a fresh identity.
public class OrderFactory
{
    public Order CreateFromCart(Cart cart, CustomerId customerId)
    {
        if (!cart.Items.Any())
            throw new DomainException("Cannot create an order from an empty cart.");

        var order = new Order(OrderId.NewId(), customerId);

        foreach (var item in cart.Items)
        {
            // Price is snapshotted at creation time, not looked up later —
            // this is exactly the kind of construction-time invariant a
            // factory exists to get right, consistently, every time.
            order.AddLine(item.ProductId, item.Quantity, item.PriceAtAddTime);
        }

        return order;
    }
}
```

Without the factory, this logic (empty-cart check, price-snapshotting, line-by-line reconstruction) would either be duplicated at every call site that creates an `Order` from a `Cart`, or would leak into a controller/application service that has no business knowing these domain rules.

**Factories for aggregate reconstruction:** the same pattern shows up on the read side of persistence — reconstituting an aggregate from stored data (e.g., mapping database rows back into an `Order` with its `OrderLine`s) is also "complex creation with invariants" and often goes through a factory method rather than a public constructor that any code could call with arbitrary, possibly-invalid arguments.

**Common pitfall:** confusing a DDD Factory with the Gang-of-Four Factory Method/Abstract Factory patterns from `design-patterns.md` — they're related in spirit (both hide creation complexity behind a method) but DDD's version is specifically about protecting *domain invariants* at creation time, not about decoupling from a concrete type for polymorphism's sake.

**Practical guidance:** put simple creation on the entity itself as a static factory method (`Order.CreateDraft(customerId)`) when it only needs the entity's own inputs; reach for a separate Factory class when creation needs to coordinate multiple sources (a `Cart`, a pricing snapshot, a customer's tier) or produce different aggregate shapes depending on context.

---

## Intermediate — Question 6

**Q6: What is the Specification pattern, and how does it let a business rule be reused as both a query predicate and a validation check?**

A Specification encapsulates a single, named business rule — "is this order overdue," "is this customer eligible for free shipping" — as an object with a method that evaluates whether a given candidate satisfies it. Instead of scattering the same boolean condition across a LINQ query in one place and an `if` statement in another (and letting the two drift out of sync), the rule is written once, given a name from the Ubiquitous Language, and reused everywhere it's needed.

```csharp
public interface ISpecification<T>
{
    Expression<Func<T, bool>> ToExpression();
    bool IsSatisfiedBy(T candidate) => ToExpression().Compile()(candidate);
}

public class OverdueOrderSpecification : ISpecification<Order>
{
    private readonly DateTime _now;
    public OverdueOrderSpecification(DateTime now) => _now = now;

    public Expression<Func<Order, bool>> ToExpression() =>
        order => order.Status == OrderStatus.Submitted
                 && order.SubmittedAt < _now.AddDays(-3);
}
```

Because the rule is expressed as an `Expression<Func<T, bool>>`, it can be composed and translated in two different ways from the same source: passed to EF Core (`_dbContext.Orders.Where(spec.ToExpression())`) to become part of a SQL `WHERE` clause for a query, or compiled and evaluated in-memory (`spec.IsSatisfiedBy(order)`) inside a domain method that needs to check the same rule against an aggregate already loaded in memory. Either way, "overdue" is defined exactly once.

Specifications also compose: `AND`, `OR`, and `NOT` combinators let you build `new OverdueOrderSpecification(now).And(new HighValueOrderSpecification(threshold))` instead of duplicating the combined condition wherever it's needed.

**Common pitfall:** using Specifications for every trivial one-line condition adds indirection without earning it — the pattern pays off specifically when a rule (a) has a name the business actually uses, (b) needs to be evaluated in more than one place, or (c) needs to be composed with other rules. A single `if (order.Status == OrderStatus.Draft)` check used exactly once doesn't need a `DraftOrderSpecification` class.

**Practical guidance:** Specifications are a natural fit for repository query methods (`_repository.FindAsync(new OverdueOrderSpecification(DateTime.UtcNow))` instead of a repository method per query shape) and for validation rules an aggregate needs to check against itself (e.g., inside `Submit()`) — in both cases the win is the same rule, named once in the Ubiquitous Language, never re-derived or re-typed.

---

## Intermediate — Question 7

**Q7: What's the difference between an Application Service and a Domain Service, and how does that map onto a CQRS command handler?**

An **Application Service** orchestrates a single use case: it receives a request, loads whatever aggregates the use case needs (via repositories), calls behavior methods on them, and persists the result — but it contains no business rule of its own. A **Domain Service** (Advanced Q3) holds actual domain logic that doesn't naturally belong to any single aggregate, expressed in the Ubiquitous Language, with no knowledge of infrastructure (no `DbContext`, no HTTP, no logging).

```csharp
// Application Service (here, a CQRS command handler) — orchestration only, no business rule
public class SubmitOrderCommandHandler : IRequestHandler<SubmitOrderCommand, Unit>
{
    private readonly IOrderRepository _orders;

    public async Task<Unit> Handle(SubmitOrderCommand cmd, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(cmd.OrderId);   // load
        order.Submit();                                         // delegate to the aggregate — no rule lives here
        await _orders.SaveChangesAsync(ct);                     // persist
        return Unit.Value;
    }
}

// Domain rule lives on the aggregate itself, not the handler
public class Order
{
    public void Submit()
    {
        if (!Lines.Any())
            throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;
    }
}
```

Notice the handler never contains the "must have at least one line" check — if it did, that rule would only be enforced when *this specific handler* runs, and any other code path that mutates `Order.Status` could bypass it. The rule belongs on `Order` precisely because `Order` is the aggregate that must always be internally consistent, handler or no handler.

**Mapping onto CQRS precisely:** a command handler *is* an Application Service in a CQRS-shaped codebase — one command, one use case, one orchestration method. When the use case genuinely needs cross-aggregate coordination (Advanced Q3's funds-transfer example), the handler calls a Domain Service, which itself still contains no infrastructure concerns; the handler is the only layer allowed to talk to repositories, `DbContext`, or external services (see `clean-architecture.md`'s coverage of the MediatR pipeline for how the handler fits the broader request-processing chain).

**Common pitfall:** letting business rules creep into the handler "just this once" because it's convenient — a credit-limit check written inline in `SubmitOrderCommandHandler` instead of on `Order` or a Domain Service means the rule only fires when that command runs, not when the aggregate is mutated some other way (a background job, a different handler, a test fixture calling `Order` directly).

**Practical guidance:** a good litmus test — if you can explain what a piece of code does using only infrastructure verbs ("load," "save," "call," "return"), it's an Application Service concern; if explaining it requires domain vocabulary ("can't submit," "must transfer," "is overdue"), it belongs on the aggregate or a Domain Service.

---

## Intermediate — Question 8

**Q8: What is Event Storming, and how does it help a team discover Bounded Contexts and Domain Events collaboratively?**

Event Storming is a workshop-style modeling technique (created by Alberto Brandolini) that gets developers and domain experts into the same room — physically or on a virtual whiteboard — to build a model of a business process together, using nothing more sophisticated than sticky notes, before a line of code is written. It's the practical "how" behind the strategic-design advice repeated throughout this file ("identify Bounded Contexts through Event Storming with domain experts").

**How a session runs, roughly:**
1. **Domain Events first.** Participants write every significant business event, in past tense, on orange stickies — `OrderPlaced`, `PaymentReceived`, `ShipmentDispatched`, `PolicyLapsed` — and arrange them in a rough timeline. This deliberately starts from *what happens*, not from data models or UI screens, which keeps the conversation in business language from the very first sticky.
2. **Commands and actors.** Blue stickies (commands — `PlaceOrder`, `ReceivePayment`) and yellow stickies (actors/roles who trigger them) get attached to the events they cause, surfacing who does what and when.
3. **Aggregates emerge.** As the timeline fills in, participants notice clusters of commands and events that clearly belong to the same "thing" being changed — that cluster is a candidate Aggregate (a `PurchaseOrder` aggregate handling `PlaceOrder` → `OrderPlaced`, `CancelOrder` → `OrderCancelled`).
4. **Bounded Contexts emerge from the seams.** Zooming out, the timeline reveals places where vocabulary shifts, ownership shifts, or a natural "pivotal event" hands off from one part of the business to another (e.g., `OrderPlaced` is where `Ordering`'s concern ends and `Shipping`'s concern begins) — those seams are candidate Bounded Context boundaries, the same boundaries discussed in Intermediate Q4 and Advanced Q5.

**Why it works better than a developer modeling alone:** a developer inventing domain events from a requirements doc is still translating secondhand, and gaps only surface once code is written and a domain expert eventually notices something's wrong. Event Storming puts the domain expert's own words directly onto the model in real time — disagreements about what an event should be called, or whether two things are really the same process, surface as a conversation in the room, not as a bug six months later.

**Common pitfall:** treating Event Storming as a one-time kickoff exercise whose output becomes a fixed spec. The timeline is a snapshot of current understanding, not a contract — as the team learns more (often *because* they started building), the model should be revisited, not treated as frozen.

**Practical guidance:** run Event Storming before committing to service or aggregate boundaries, not after — it's far cheaper to move a sticky note than to split a microservice or re-shape a database schema once the "wrong" boundary is already in production (Scenario Q1's Database/Validation/Notification split is exactly the kind of mistake an Event Storming session tends to surface early).

---

## Intermediate — Question 9

**Q9: Why must consistency between separate Aggregates be eventual rather than enforced by a single ACID transaction, and how do Domain Events provide that coordination?**

An Aggregate boundary is, by definition, also a transactional consistency boundary (Intermediate Q1): the guideline "one transaction touches at most one aggregate" isn't a performance optimization bolted on afterward — it's the direct consequence of what an aggregate *is*. If two aggregates could only ever be kept consistent by wrapping both in one ACID transaction, they wouldn't really be two aggregates; they'd be one aggregate that was incorrectly split (the "too small" failure from Advanced Q2).

**Why this matters in practice:** consider "when an order is placed, decrement inventory." `Order` and `InventoryItem` are separate aggregates (each has its own true invariants — `Order`'s is "can't submit with no lines," `InventoryItem`'s is "stock can't go negative"). Wrapping both in one transaction means every order placement takes a lock on the inventory row too, so two orders for different products can't even be processed concurrently without unrelated contention — the exact lock-contention failure mode from Scenario Q2, just recreated across aggregates instead of within one bloated one.

**The eventual-consistency alternative, coordinated via a Domain Event:**

```csharp
public class Order
{
    public void Submit()
    {
        if (!Lines.Any()) throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;
        _domainEvents.Add(new OrderPlaced(Id, Lines.Select(l => (l.ProductId, l.Quantity)).ToList()));
    }
}

// Separate transaction, separate aggregate, triggered after OrderPlaced commits
public class DecrementInventoryOnOrderPlaced : INotificationHandler<OrderPlaced>
{
    private readonly IInventoryRepository _inventory;

    public async Task Handle(OrderPlaced e, CancellationToken ct)
    {
        foreach (var (productId, qty) in e.Lines)
        {
            var item = await _inventory.GetByIdAsync(productId);
            item.Decrement(qty);              // InventoryItem's own invariant enforced here, in its own transaction
        }
        await _inventory.SaveChangesAsync(ct);
    }
}
```

`Order.Submit()` commits on its own; `InventoryItem.Decrement()` commits separately, moments later, when the event handler runs. Between those two commits there's a brief window where the order exists as placed but inventory hasn't yet reflected it — that window is the cost of eventual consistency, and the business has to be able to tolerate it (or compensate for it, e.g. an oversell-detection process) for this design to be acceptable.

**Common pitfall:** assuming eventual consistency means "eventually, maybe" — in practice it requires the same reliability guarantees as the rest of the domain-event pipeline (Intermediate Q3): events dispatched only after the originating transaction commits, with an outbox pattern or equivalent ensuring the event is never silently lost if the process crashes between commit and dispatch.

**Practical guidance:** the question to ask when tempted to span two aggregates in one transaction is "does the business actually require this to be atomic, or would a brief, bounded delay be acceptable and even normal?" Most cross-aggregate relationships tolerate the latter; reserve same-transaction atomicity for the rare case where the business genuinely cannot allow any intermediate state to exist, which is usually a sign the two "aggregates" should be reconsidered as one.

---

## Advanced — Question 6

**Q6: Martin Fowler describes three patterns for organizing business logic — Transaction Script, Active Record, and Domain Model. What distinguishes them, and when is DDD's rich Domain Model not worth its complexity cost?**

**Transaction Script:** organizes business logic as a single procedure per use case/transaction — a top-to-bottom sequence of steps (validate, compute, write to the database) with little or no reuse of behavior between procedures. Data and behavior are entirely separate; the "script" reads and writes rows directly.

```csharp
// Transaction Script — one procedure, does everything, minimal object structure
public class PlaceOrderScript
{
    public void Execute(int customerId, List<(int productId, int qty)> items)
    {
        var customer = _db.QuerySingle<CustomerRow>("SELECT * FROM Customers WHERE Id = @id", customerId);
        if (customer.CreditHold) throw new InvalidOperationException("Customer on credit hold.");
        decimal total = 0;
        foreach (var (productId, qty) in items)
        {
            var price = _db.QuerySingle<decimal>("SELECT Price FROM Products WHERE Id = @id", productId);
            total += price * qty;
            _db.Execute("INSERT INTO OrderLines ...", productId, qty, price);
        }
        _db.Execute("INSERT INTO Orders (CustomerId, Total) VALUES (@c, @t)", customerId, total);
    }
}
```

**Active Record:** wraps each database row in an object with data *and* behavior, but the behavior is largely persistence-shaped (`Save()`, `Delete()`, validation tied to a single table) rather than modeling rich domain concepts or invariants spanning multiple related objects. It's a step up from Transaction Script's total data/behavior separation, but the object's shape still mirrors the schema.

**Domain Model (DDD's rich model):** objects organized around domain concepts and behavior, independent of how they're persisted, with invariants actively protected (this file's `Order.Submit()` throughout). Worth it when business rules are numerous, change often, interact with each other, and genuinely benefit from being expressed once as reusable, protected behavior rather than re-derived per use case.

**When the rich Domain Model is *not* worth it:** a CRUD-heavy or low-complexity subdomain — a settings page, a reference-data lookup table, an admin tool for editing static content — has few or no real invariants. Building an aggregate, a domain event, and a dedicated repository for "update the site's maintenance-mode banner text" adds ceremony (extra types, extra layers, extra indirection to trace through) that buys nothing, because there's no meaningful business rule to protect. A Transaction Script or Active Record approach is not a lesser choice here — it's the *correct* one, and DDD itself says so explicitly via the Generic/Supporting-subdomain classification (Advanced Q7).

**Common pitfall:** applying the same tactical pattern uniformly across an entire codebase regardless of subdomain, either "everything is rich domain model" (over-engineering the boring 80%) or "everything is Active Record" (under-protecting the complex 20% where it matters, which is how invariants silently erode into scattered validation — Beginner Q4's anemic-model failure).

**Practical guidance:** decide per subdomain, not per project — use the Core-vs-Supporting-vs-Generic classification (Advanced Q7) as the deciding input: Core domain logic with real, interacting invariants earns a rich Domain Model; a Generic subdomain is usually fine, even better, as a Transaction Script or Active Record, or bought off the shelf entirely.

---

## Advanced — Question 7

**Q7: What's the difference between a Core Domain, a Supporting Subdomain, and a Generic Subdomain, and why should that classification drive where a team invests its best modeling effort?**

DDD's strategic patterns classify every part of a business's overall problem space into one of three subdomain types, and the classification is meant to directly steer engineering investment — not every part of the system deserves the same care.

**Core Domain:** the part of the business that provides real competitive differentiation — the reason the business wins or loses against competitors. This is where genuine complexity lives, where the business actually wants to invest, and where DDD's full tactical toolkit (rich aggregates, domain events, careful invariant protection, close and ongoing collaboration with domain experts) earns its cost. For an insurance company, this is underwriting risk assessment and policy pricing logic — not, say, employee timesheets.

**Supporting Subdomain:** necessary for the business to function, has some real logic worth getting right, but isn't where the business differentiates. Notification formatting rules, a moderately complex approval workflow — worth a competent implementation, but not worth the same relentless modeling investment as the Core Domain. Often a good candidate for a simpler tactical approach (Active Record, a leaner service) even though it isn't trivial.

**Generic Subdomain:** a solved problem — authentication, payment processing, address validation, PDF generation — where the business gains nothing from building it in-house and every reason to buy or adopt an existing solution (an off-the-shelf identity provider, a payment gateway, a well-known library). Building this from scratch is pure opportunity cost: engineering hours spent solving a problem the business doesn't compete on.

```text
Core Domain           → Underwriting risk engine     → in-house, rich domain model, best engineers, closest domain-expert collaboration
Supporting Subdomain    → Policy document generation    → in-house but simpler, Active Record/Transaction Script is fine
Generic Subdomain       → Authentication, payments       → buy (Auth0/Okta, Stripe) — don't build
```

**Why this should drive investment, concretely:** a team with limited time and its best engineers has to choose where that scarce capacity goes. Spending equal modeling rigor on the Core Domain and on "send a password-reset email" isn't fairness — it's misallocation. Worse, over-investing in a Generic Subdomain (building a bespoke authentication system) creates ongoing maintenance burden for a problem that provides zero competitive advantage no matter how well it's solved, while under-investing in the Core Domain (treating underwriting logic as a quick CRUD screen) is where real business risk and lost differentiation actually accumulate.

**Common pitfall:** classifying subdomains once at project kickoff and never revisiting — a Supporting Subdomain can become Core if the business pivots around it (a logistics company that starts differentiating on delivery-time prediction has just promoted what used to be a supporting "ETA calculation" feature into its Core Domain), and the modeling investment should shift accordingly.

**Practical guidance:** this classification is a conversation to have explicitly with business stakeholders, not a technical judgment call made in isolation — "where do we actually compete" is a business question, and getting the classification wrong (over-engineering a Generic Subdomain, or, more dangerously, under-engineering the Core Domain) is a strategic mistake, not a coding-style one.

---

## Advanced — Question 8

**Q8: How does CQRS relate to DDD specifically — where do aggregates fit on the write side, and what changes on the read side?**

CQRS (Command Query Responsibility Segregation) and DDD are independent patterns that happen to fit together unusually well, and understanding precisely *where* they connect (rather than treating them as a package deal) avoids both over-coupling them and missing the real synergy.

**Write side — commands operate on aggregates, exactly as described throughout this file:** a command handler (Intermediate Q7's Application Service) loads one aggregate root by ID through its repository, calls a behavior method that enforces the aggregate's invariants, and persists the result as one transaction. DDD supplies *what* the write side protects (invariants, via aggregates); CQRS supplies the *shape* of how a write request flows through the system (a command, a handler, nothing else touching the aggregate on that path). Neither pattern requires the other — you can have aggregates without CQRS (a traditional layered app calling `order.Submit()` from a controller) and CQRS without rich aggregates (commands that operate on anemic/Active Record objects) — but combining them means the write side has both a clear invariant-protection boundary (the aggregate) and a clear single-purpose entry point per use case (the command handler).

```csharp
// Write side: command -> handler -> aggregate -> repository. Full DDD tactical stack applies.
public record SubmitOrderCommand(OrderId OrderId) : IRequest;

public class SubmitOrderCommandHandler : IRequestHandler<SubmitOrderCommand>
{
    public async Task Handle(SubmitOrderCommand cmd, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(cmd.OrderId);
        order.Submit();                          // aggregate enforces its own invariants
        await _orders.SaveChangesAsync(ct);
    }
}

// Read side: query -> dedicated read model. No aggregate, no domain model at all.
public record GetOrderSummaryQuery(OrderId OrderId) : IRequest<OrderSummaryDto>;

public class GetOrderSummaryHandler : IRequestHandler<GetOrderSummaryQuery, OrderSummaryDto>
{
    public Task<OrderSummaryDto> Handle(GetOrderSummaryQuery q, CancellationToken ct) =>
        _dbContext.Orders
            .Where(o => o.Id == q.OrderId)
            .Select(o => new OrderSummaryDto(o.Id, o.CustomerName, o.Total, o.Status))   // flat projection, joins allowed
            .SingleAsync(ct);
}
```

**Read side — the aggregate is deliberately bypassed:** this is the connection point Intermediate Q2 already flags — reads that don't need to enforce an invariant or trigger domain behavior shouldn't be forced through an aggregate-scoped repository at all. A read model can freely join across what would be several different aggregates (`Order` plus `Customer` plus `Product` names, all in one flat DTO) because a query has no consistency-boundary concern — it's just retrieving a snapshot for display, not deciding whether a mutation is valid.

**Why this matters for the eventual-consistency discussion in Intermediate Q9:** in a CQRS system with denormalized read models (updated asynchronously by the same domain events that coordinate cross-aggregate consistency), the read model itself is one more eventually-consistent consumer of domain events — a query might briefly show slightly stale data relative to the write side's latest committed state, which is the same trade-off already accepted for cross-aggregate consistency, just extended to the read projection too.

**Practical guidance:** for the MediatR pipeline mechanics, request/notification wiring, and pipeline behaviors, see `clean-architecture.md` — this answer's scope is specifically the DDD-side question of *what* belongs on each side of the split: aggregates and invariants on the write side, flat projections with no domain model at all on the read side.

---

## Scenario — Question 5

**Q5: A `Subscription` aggregate started simple — plan, status, renewal date. Over a year, the Billing team added invoicing fields, the Notifications team added reminder-preference and delivery-history fields, and the Analytics team added engagement-scoring and cohort-tagging fields, all onto the same `Subscription` class. Now every team steps on each other's changes: a Notifications deploy that touches `Subscription`'s schema risks breaking Billing's invoice generation, and the class has grown to 40+ properties nobody fully understands. Diagnose the problem and redesign it.**

This is the same misdiagnosis as Scenario Q4's `Customer`, wearing a different aggregate's clothes: three teams assumed there was one `Subscription` concept because there's one word for it, when in fact each team has a genuinely different Bounded Context's view of a subscription, with different fields, different invariants, and different rates of change — bolted onto a single class because nobody stopped to ask whether they were the same concept.

**Diagnosis — check each team's fields against real invariants:**
- Billing's invoicing fields (amount due, payment method, invoice history) have invariants that matter to Billing alone — "an invoice can't be generated for a cancelled subscription," "the amount must match the plan's current price tier."
- Notifications' reminder-preference and delivery-history fields have their own concern entirely — "don't send more than one renewal reminder per week" — and change on a completely different schedule (a new reminder channel ships without Billing caring at all).
- Analytics' engagement-scoring and cohort-tagging fields aren't even transactional data — they're derived, read-heavy, recomputed periodically, and have no business being inside a transactional write-side aggregate at all.

None of these three teams' concerns share a real invariant with each other. There is no rule that says "a reminder-preference change must be atomically consistent with an engagement score" — which is exactly the eventual-consistency test from Intermediate Q9: if nothing requires same-transaction atomicity, it doesn't belong in the same aggregate.

**Redesign — split by Bounded Context, correlate by ID, coordinate via events:**

```csharp
// Billing context — owns the actual Subscription aggregate: plan, status, renewal, invoicing
namespace Billing.Domain
{
    public class Subscription   // Aggregate Root — the "true" transactional subscription
    {
        public SubscriptionId Id { get; }
        public SubscriberId SubscriberId { get; }        // reference, not embedded — correlates across contexts
        public PlanId PlanId { get; private set; }
        public SubscriptionStatus Status { get; private set; }
        public DateTime RenewalDate { get; private set; }

        public void Renew()
        {
            if (Status == SubscriptionStatus.Cancelled)
                throw new DomainException("Cannot renew a cancelled subscription.");
            RenewalDate = RenewalDate.AddMonths(1);
            _domainEvents.Add(new SubscriptionRenewed(Id, SubscriberId, RenewalDate));
        }
    }
}

// Notifications context — its own read model, populated by subscribing to Billing's events
namespace Notifications.ReadModel
{
    public class SubscriptionReminderState   // not an aggregate — a projection this context owns and maintains
    {
        public SubscriberId SubscriberId { get; set; }
        public DateTime NextRenewalDate { get; set; }     // kept in sync via SubscriptionRenewed
        public DateTime? LastReminderSentAt { get; set; }
        public ReminderChannel PreferredChannel { get; set; }
    }
}

// Analytics context — same pattern: its own store, its own update cadence, no write access to Billing's aggregate
namespace Analytics.ReadModel
{
    public class SubscriberEngagement
    {
        public SubscriberId SubscriberId { get; set; }
        public int EngagementScore { get; set; }
        public string CohortTag { get; set; }
    }
}
```

Billing's `Subscription` publishes `SubscriptionRenewed`, `SubscriptionCancelled`, etc.; Notifications and Analytics each subscribe and maintain their own projections, in their own storage, on their own deployment cadence — a Notifications-team migration can never again touch Billing's schema, because it isn't Billing's schema. `SubscriberId` (not a shared `Subscription` entity) is the correlation key across all three, exactly like `CustomerId` was in Scenario Q4.

**Result:** each team's aggregate/read model now only carries the fields it actually has invariants (or query needs) for; a Billing deploy can no longer break Notifications' reminder logic, because they're no longer the same class, the same table, or even the same service boundary.

**Practical guidance:** "three teams keep needing to add unrelated fields to the same class" is one of the most reliable field signals that a Bounded Context split is overdue — treat it the same way as Scenario Q4's shared-`Customer` symptom, not as a reason to add yet more governance process around a single shared model.

---

## Beginner — Question 7

**Q7: How do you enforce Value Object immutability in C#, and what does `record` or `readonly struct` actually buy you over a plain class with get-only properties?**

A Value Object (Beginner Q2) is defined by its attributes, not an identity — two `Money` instances with the same amount and currency *are* the same value, and that only holds if neither instance can be mutated out from under code holding a reference to it. Immutability isn't a nice-to-have style choice for Value Objects; it's the property that makes equality-by-value and safe sharing actually correct.

**Plain class with get-only properties — immutable, but incompletely:**

```csharp
public class Money
{
    public decimal Amount { get; }
    public string Currency { get; }
    public Money(decimal amount, string currency) { Amount = amount; Currency = currency; }
    // must hand-write Equals/GetHashCode or two equal Moneys compare unequal by reference
}
```

This compiles and is immutable, but C# gives you reference equality for free on a class — without overriding `Equals`/`GetHashCode`, `new Money(10, "USD") == new Money(10, "USD")` is `false`, which directly contradicts what a Value Object is supposed to mean.

**`record` — the idiomatic fix, gives both immutability and value equality in one declaration:**

```csharp
public record Money(decimal Amount, string Currency)
{
    public static Money operator +(Money a, Money b)
    {
        if (a.Currency != b.Currency) throw new InvalidOperationException("Currency mismatch.");
        return new Money(a.Amount + b.Amount, a.Currency);
    }
}

var price = new Money(10.00m, "USD");
var samePrice = new Money(10.00m, "USD");
Console.WriteLine(price == samePrice);   // true — member-wise equality, generated automatically
// price.Amount = 20;                    // compile error — init-only, no public setter exists
```

`record` synthesizes `Equals`, `GetHashCode`, and `ToString()` from the declared members, and its positional properties are `init`-only by default — no accidental mutation path exists at all, not even from within the same assembly.

**`readonly struct`** is the value-type alternative — appropriate for very small, frequently-allocated Value Objects (a `Point` or `Coordinates`) where avoiding heap allocation matters; the `readonly` modifier on the struct itself (not just its members) guarantees the compiler rejects any mutating method, including implicitly mutating ones the compiler would otherwise silently allow via defensive copies.

**Common pitfall:** using `record` but adding a mutable collection property (`List<string> Tags { get; set; }`) — the record's generated equality still calls `Equals` on that list reference, not its contents, and the list itself remains freely mutable, quietly reintroducing the exact bug immutability was meant to prevent.

**Practical guidance:** default to `record` for Value Objects in modern C# — it's less code than a hand-rolled class and eliminates the "forgot to override Equals" class of bug entirely; reach for `readonly struct` only when profiling shows allocation pressure from a Value Object created in a hot path.

---

## Beginner — Question 8

**Q8: An Aggregate Root is often described as "protecting its invariants," but what actually enforces that in code — is it a naming convention, or something the compiler enforces?**

It's the latter, and this is the detail that separates a real Aggregate Root from a class that merely has "Aggregate" in a design doc somewhere. The enforcement mechanism is ordinary C# encapsulation — private setters, private fields, and methods that are the *only* path to mutation — not a base class, an attribute, or a naming convention that a future developer has to remember to respect.

**What doesn't enforce anything — public setters, invariant checked "elsewhere":**

```csharp
public class Order
{
    public OrderStatus Status { get; set; }          // anyone can set this directly
    public List<OrderLine> Lines { get; set; } = new();
}

// somewhere in a service:
order.Status = OrderStatus.Submitted;    // no check that Lines is non-empty — nothing stops this
```

Here "the aggregate enforces invariants" is a comment in a design doc, not a fact about the code — any caller anywhere in the codebase can set `Status` directly, bypassing whatever rule was supposed to gate submission (this is the anemic-model failure from Beginner Q3/Q4, specifically as it applies to aggregates).

**What actually enforces it — private setter, mutation only through a behavior method:**

```csharp
public class Order
{
    public OrderStatus Status { get; private set; }   // compiler rejects order.Status = x from outside
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyCollection<OrderLine> Lines => _lines.AsReadOnly();

    public void AddLine(OrderLine line)
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException("Cannot add lines to a submitted order.");
        _lines.Add(line);
    }

    public void Submit()
    {
        if (!_lines.Any())
            throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;    // the ONLY line in the codebase that can set this
    }
}
```

Now `order.Status = OrderStatus.Submitted` from outside the class is a compile error, not a code-review nitpick — `private set` and the exposure of `_lines` only as `IReadOnlyCollection<T>` (not `List<T>`, which would let a caller `.Add()` directly around `AddLine`'s check) close off every path except the ones with a guard clause in front of them.

**Common pitfall:** exposing a backing collection as its concrete mutable type (`public List<OrderLine> Lines { get; }`) — even without a public setter, callers can still call `order.Lines.Add(...)` and bypass `AddLine`'s invariant entirely; only `IReadOnlyCollection<T>`/`IReadOnlyList<T>` genuinely closes that gap.

**Practical guidance:** when reviewing whether something is really an Aggregate Root, don't ask "does it have behavior methods" — ask "is there any public path that mutates state without going through one of them." If the answer is yes, the invariant is aspirational, not enforced.

---

## Intermediate — Question 10

**Q10: What's the difference between a domain event and an integration event, and why is conflating them a common and costly mistake?**

Both are "something happened, past tense" — `OrderPlaced`, `PaymentReceived` — and the naming similarity is exactly why teams conflate them, but they solve different problems at different scopes, and treating one as the other creates real coupling and reliability bugs.

**Domain event** (already covered throughout this file, e.g. Intermediate Q9): an in-process notification, published and handled within the same Bounded Context, typically within — or immediately after — the same transaction that raised it. Its purpose is to let one aggregate trigger a side effect on another part of *the same context* without the triggering aggregate needing a direct reference to the thing it's affecting.

**Integration event:** a message published *across* a service/Bounded-Context boundary — serialized, put on a broker (RabbitMQ, Azure Service Bus, Kafka), and consumed by a different service, possibly owned by a different team, possibly written in a different language. It has a public, versioned contract because external consumers depend on it; a domain event has no such obligation because nothing outside the context ever sees it.

```csharp
// Domain event — internal shape, can change freely as long as in-process handlers agree
public record OrderPlaced(OrderId OrderId, IReadOnlyList<(ProductId, int Qty)> Lines) : IDomainEvent;

// Integration event — public contract, versioned, stable field names, no internal types leaked
public record OrderPlacedIntegrationEvent(Guid OrderId, string CustomerEmail, decimal Total, DateTime PlacedAtUtc);

public class PublishIntegrationEventOnOrderPlaced : INotificationHandler<OrderPlaced>
{
    public async Task Handle(OrderPlaced e, CancellationToken ct)
    {
        var order = await _orders.GetByIdAsync(e.OrderId);
        await _bus.PublishAsync(new OrderPlacedIntegrationEvent(
            e.OrderId.Value, order.CustomerEmail, order.Total, DateTime.UtcNow), ct);
    }
}
```

Note the translation step: the domain event's handler *produces* the integration event rather than the domain event being serialized and shipped directly — this is deliberate, mirroring the Anti-Corruption Layer idea (Advanced Q4) in reverse, keeping the internal domain model free to evolve without breaking external consumers' contract.

**Why conflating them is costly:** publishing a domain event straight onto a message broker locks the internal model's shape to an external contract — renaming an internal field now breaks another team's consumer. Going the other direction, treating an integration event as if it carries in-process transactional guarantees (assuming it arrives "with" the transaction, or that handling it is instant) leads to code that doesn't account for delivery delay, retries, or duplicate delivery, all of which are normal for a message broker but never happen with an in-process domain event.

**Practical guidance:** always translate at the boundary — one or more domain events inside a context, an explicit outbound integration event published (often via the outbox pattern from Intermediate Q3) once behavior settles. Never let an internal event type's namespace or serialization format leak into another service's consumer.

---

## Intermediate — Question 11

**Q11: What is "persistence ignorance," and how do you implement a Repository with EF Core without letting EF-specific concerns leak into the domain model?**

Persistence ignorance means the domain model — entities, aggregates, value objects — has no idea *how* or *whether* it's persisted: no base class inherited from an ORM, no attributes decorating properties, no navigation-property shape dictated by what EF Core finds convenient. The domain model is written purely in terms of domain concepts; persistence is an entirely separate concern layered on top via the Repository pattern (Intermediate Q6).

**What violates it — EF concerns bleeding into the domain class:**

```csharp
[Table("Orders")]                                   // EF attribute inside the domain model
public class Order
{
    [Key] public int Id { get; set; }                // public setter added only so EF can materialize it
    public virtual ICollection<OrderLine> Lines { get; set; }   // virtual added only for lazy-loading proxies
}
```

Every one of those accommodations exists to satisfy EF Core, not the domain — and the public setters this forces open are exactly the encapsulation hole Beginner Q8 warns about.

**Persistence-ignorant domain + separate EF mapping configuration:**

```csharp
// Domain model — no EF references anywhere, private setters intact
public class Order
{
    public OrderId Id { get; private set; }
    private readonly List<OrderLine> _lines = new();
    public IReadOnlyCollection<OrderLine> Lines => _lines.AsReadOnly();
    public void Submit() { /* invariants enforced here, per Beginner Q8 */ }
}

// Separate mapping file — EF Core's Fluent API, kept entirely outside the domain assembly
public class OrderEntityConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Id).HasConversion(id => id.Value, v => new OrderId(v));
        builder.Metadata.FindNavigation(nameof(Order.Lines))!
            .SetPropertyAccessMode(PropertyAccessMode.Field);   // EF writes to the private _lines field directly
    }
}

// Repository — the only place EF Core is visible at all
public class EfOrderRepository : IOrderRepository
{
    private readonly AppDbContext _db;
    public Task<Order?> GetByIdAsync(OrderId id) => _db.Orders.FirstOrDefaultAsync(o => o.Id == id);
    public Task AddAsync(Order order) => _db.Orders.AddAsync(order).AsTask();
}
```

`PropertyAccessMode.Field` is the key trick: it tells EF Core to materialize `Lines` by writing directly to the private `_lines` field via reflection, bypassing the need for a public setter entirely, so the domain model's encapsulation survives contact with the ORM completely intact.

**Common pitfall:** adding `[Required]`/`[MaxLength]` data-annotation attributes to domain properties "just for validation" — this is the same leak in miniature; validation *is* a domain concern, but it belongs enforced in a constructor or behavior method (throwing a `DomainException`), not delegated to an EF attribute that only fires at `SaveChanges` time.

**Practical guidance:** if deleting the EF Core NuGet reference from the domain project would break it, persistence ignorance has already been violated — the domain assembly should reference nothing but the base class library and, at most, a lightweight abstractions package.

---

## Intermediate — Question 12

**Q12: What does it mean to unit test a rich domain model "in isolation," and why is this held up as a key payoff of investing in DDD's tactical patterns?**

Because a well-designed aggregate is persistence-ignorant (Intermediate Q11) and enforces its own invariants through behavior methods (Beginner Q8) rather than delegating checks to a service or the database, it can be constructed directly in a unit test with `new`, exercised through its public methods, and asserted on — with zero database, zero HTTP, zero test containers, and no mocking framework in sight.

```csharp
public class OrderTests
{
    [Fact]
    public void Submit_WithNoLines_ThrowsDomainException()
    {
        var order = new Order(OrderId.New(), CustomerId.New());   // constructed directly, no repository involved

        var act = () => order.Submit();

        act.Should().Throw<DomainException>()
           .WithMessage("Cannot submit an order with no lines.");
    }

    [Fact]
    public void Submit_AfterAddingLines_TransitionsToSubmitted()
    {
        var order = new Order(OrderId.New(), CustomerId.New());
        order.AddLine(new OrderLine(ProductId.New(), quantity: 2, unitPrice: new Money(10m, "USD")));

        order.Submit();

        order.Status.Should().Be(OrderStatus.Submitted);
    }

    [Fact]
    public void AddLine_AfterSubmit_ThrowsDomainException()
    {
        var order = new Order(OrderId.New(), CustomerId.New());
        order.AddLine(new OrderLine(ProductId.New(), 1, new Money(5m, "USD")));
        order.Submit();

        var act = () => order.AddLine(new OrderLine(ProductId.New(), 1, new Money(5m, "USD")));

        act.Should().Throw<DomainException>();
    }
}
```

No `IOrderRepository`, no `DbContext`, no `WebApplicationFactory` — the test runs in milliseconds and fails only when the domain's actual behavior changes, not when an unrelated infrastructure detail (a connection string, a migration, a test database's state left over from a previous run) gets in the way.

**Why this is a genuine payoff, not just "testing is good":** contrast this with testing a Transaction Script (Advanced Q6) or an anemic model with logic scattered across services — those require standing up whatever infrastructure the script talks to directly, or mocking so many collaborators that the test mostly verifies the mocks were called correctly rather than that the business rule holds. A rich domain model's tests read like a specification of the business rules themselves (`Submit_WithNoLines_ThrowsDomainException` *is* documentation of the invariant).

**Common pitfall:** reaching for a mocking framework to test an aggregate anyway, out of habit — if a test of `Order.Submit()` needs a mock, that's a signal the aggregate has picked up a dependency it shouldn't have (an injected service call inside a behavior method), which is itself a persistence-ignorance or single-responsibility violation worth fixing rather than working around with more mocks.

**Practical guidance:** aggregate unit tests should be the fastest, most numerous tests in the suite, and a broken one should always mean "a business rule changed," never "the test database needed a reset" — if that's not true yet, it's a sign the domain model still has an infrastructure leak somewhere (Intermediate Q11).

---

## Advanced — Question 9

**Q9: Layered/Clean Architecture insists the Domain layer has zero dependencies pointing outward, toward infrastructure. Why is this specific dependency direction — not just "layers exist" — what actually makes a domain model testable and portable?**

The rule isn't "organize code into layers" (many codebases do that and still fail this test) — it's specifically that the dependency arrow at compile time must point *from* infrastructure *toward* the domain, never the reverse. `clean-architecture.md` covers the full ring structure and the Dependency Inversion mechanics that make this work in an ASP.NET Core project; the point worth isolating here is *why* this particular direction is the one that buys testability and portability, since a lot of "layered" code gets the direction backwards while still drawing boxes labeled correctly.

**Getting the direction wrong — Domain compiles fine, but only because it silently depends on infrastructure:**

```csharp
// In the "Domain" project, but referencing EF Core and a concrete SQL-backed service
public class Order
{
    public void Submit(AppDbContext db)              // domain method takes an infrastructure type as a parameter
    {
        var creditOk = db.Customers.Any(c => c.Id == CustomerId && !c.CreditHold);  // domain code running a LINQ-to-SQL query
        if (!creditOk) throw new DomainException("Customer on credit hold.");
    }
}
```

This class lives in a folder called "Domain," but it cannot be compiled, let alone unit-tested (Intermediate Q12), without EF Core and a real or in-memory database present — the folder name says "domain," the actual dependency graph says "infrastructure." Every test of `Submit()` now needs a `DbContext`, defeating the entire "construct directly and assert" payoff.

**Getting the direction right — the domain declares an interface, infrastructure implements it:**

```csharp
// Domain project — defines what it needs, owns nothing about how it's satisfied
public interface ICreditCheck { bool IsOnCreditHold(CustomerId id); }

public class Order
{
    public void Submit(ICreditCheck creditCheck)
    {
        if (creditCheck.IsOnCreditHold(CustomerId))
            throw new DomainException("Customer on credit hold.");
    }
}

// Infrastructure project — references Domain, implements its interface; Domain never references this project
public class EfCreditCheck : ICreditCheck
{
    public bool IsOnCreditHold(CustomerId id) => _db.Customers.Any(c => c.Id == id && c.CreditHold);
}
```

Now `Order.Submit()` can be tested by passing a fake `ICreditCheck` that returns `true`/`false` — no database, no EF Core reference in the Domain project at all, and the *compiler*, not a code-review checklist, is what prevents the regression, since the Domain project's `.csproj` simply has no reference to add.

**Why this is what makes portability real:** because Domain has no outward reference, the same Domain assembly can be hosted behind a REST API today and a message-driven worker tomorrow, or have its EF Core repository swapped for a different store, without the Domain project changing at all — portability isn't an aspiration, it's a direct, mechanical consequence of the reference graph having only one valid direction.

**Practical guidance:** the fastest way to audit this is literally to open the Domain project's dependencies list — any reference to EF Core, ASP.NET Core, or a message-broker SDK is the violation, full stop, regardless of how the code inside is organized or named.

---

## Advanced — Question 10

**Q10: CQRS read models often bypass the aggregate entirely for queries — doesn't that defeat the purpose of protecting invariants behind the aggregate? Why is this considered acceptable, even correct, DDD?**

The apparent contradiction dissolves once "protecting invariants" is understood precisely: an aggregate protects invariants against *mutation*, not against being *read*. A query that only displays data changes nothing and therefore has no invariant to violate — asking a read model to "go through the aggregate" first would mean loading a full object graph, applying no behavior to it, and immediately throwing that graph away in favor of a DTO, which is pure overhead with no corresponding safety benefit.

**What loading through the aggregate for a query actually costs:**

```csharp
// "Correct-looking" but wasteful: load the whole aggregate just to read three fields
public async Task<OrderSummaryDto> GetSummary(OrderId id)
{
    var order = await _orderRepository.GetByIdAsync(id);   // hydrates Order + all OrderLines + any nested VOs
    return new OrderSummaryDto(order.Id, order.Status, order.Lines.Sum(l => l.LineTotal));
}
```

This pays the full cost of aggregate hydration — every child entity, every value object, potentially lazy-loaded navigation properties — to produce three scalar values that get discarded the instant the method returns. No invariant was checked, none could be, because nothing was mutated.

**The read-model alternative — a flat, denormalized projection, no aggregate involved:**

```csharp
public record OrderSummaryDto(Guid Id, string Status, decimal Total);

public async Task<OrderSummaryDto> GetSummary(Guid id) =>
    await _db.Orders
        .Where(o => o.Id == id)
        .Select(o => new OrderSummaryDto(o.Id, o.Status, o.LineTotals.Sum()))   // SQL projection, no domain objects materialized
        .SingleAsync();
```

This is Advanced Q8's write/read split made explicit at the cost level: the query runs as a single efficient SQL projection, can freely join across tables that belong to entirely different aggregates (`Order` plus `Customer.Name`), and never risks violating an invariant because it never attempts a mutation in the first place.

**Why this doesn't undermine DDD:** DDD's actual claim is narrower than "all data access goes through the aggregate" — it's "all *mutating* access goes through the aggregate boundary that owns the invariant being protected." A read path that never calls a single behavior method, never calls `SaveChanges`, and produces a DTO the caller can't even feed back into a repository is categorically outside what the invariant-protection guarantee was ever about.

**Common pitfall:** allowing a read model's DTO to be mutated and then passed back into a write operation "since it's basically the same shape as the aggregate" — this reintroduces exactly the risk the aggregate boundary exists to prevent, because the DTO has none of the aggregate's guard clauses. Read models must be one-way: query out, never write back in without going through a proper command and aggregate.

**Practical guidance:** if a query needs to display data, reach for a purpose-built read model without hesitation, even when it duplicates data the aggregate also holds — that duplication (kept in sync via domain events, per Intermediate Q9) is a deliberate, healthy trade of storage/consistency-lag for query simplicity and performance, not a modeling shortcut to feel guilty about.

---

## Advanced — Question 11

**Q11: What is the "Big Ball of Mud," and why is even a messy, imperfect, explicit Context Map still strictly better than having none?**

"Big Ball of Mud" (a term from Brian Foote and Joseph Yoder, adopted widely in DDD writing) describes the architecture a system arrives at by default when nobody deliberately draws Bounded Context boundaries: one sprawling, tangled model where every class can reference every other class, terms mean subtly different things depending on which code path reads them, and there is no map — implicit or explicit — of where one concept's authority ends and another's begins. It isn't a boundary strategy; it's the absence of one, and it's the gravity every codebase decays toward without active resistance.

**How it forms without anyone deciding to build it:** a `Customer` class gets a field added by the billing team, then the shipping team, then support — each addition locally reasonable, none of them coordinated against a boundary, because no boundary was ever declared (this is Scenario Q4 and Q5's failure mode, generalized to the whole system rather than one aggregate). Multiply that across every entity in a codebase for a few years and the result is a system where changing anything requires understanding almost everything, because nothing was ever partitioned to prevent that.

**Why an explicit Context Map — even one that honestly documents Shared Kernel, Conformist, and Anti-Corruption Layer relationships in a system with real inconsistencies — beats having none:**

```text
Explicit (messy but mapped):                     Big Ball of Mud (no map at all):
+-----------+   ACL    +-------------+            +----------------------------------+
| Ordering  |<-------->| Legacy ERP  |             |  Everything                       |
+-----------+          +-------------+             |  references                       |
     |  Conformist                                  |  everything,                      |
     v                                              |  nobody knows                     |
+-----------+                                       |  which "Customer"                 |
| Shipping  |  <- known to be tightly coupled,       |  field is safe to                 |
+-----------+     documented as a debt to pay down   |  change without                   |
                                                      |  breaking something               |
                                                      +----------------------------------+
```

The left side is genuinely messy — a Conformist relationship is not a design win, an Anti-Corruption Layer around legacy ERP is an admission of unideal integration — but every relationship on it is *known*, named, and therefore something a team can reason about, prioritize fixing, or safely leave alone because its blast radius is understood. The right side has the same underlying mess with none of that visibility: a change's blast radius is "unknown until it breaks something in production."

**Common pitfall:** treating "we don't have time to do proper Context Mapping" as a reason to skip it entirely, rather than doing a rough, incomplete map — even a whiteboard photo naming the known Shared Kernels and Conformist relationships gives the next engineer touching that code something to check before assuming a change is safe.

**Practical guidance:** a Context Map's value isn't in being clean; it's in existing at all and being kept roughly current — treat "our context map is embarrassing" as evidence the system needs one even more urgently, not as a reason to keep it undocumented.

---

## Scenario — Question 6

**Q6: A multi-day order-fulfillment workflow spans three Bounded Contexts — Ordering places the order, Inventory reserves and later commits stock, and Shipping schedules and confirms delivery — with waiting periods between each step and the possibility of failure (an inventory shortfall, a failed delivery attempt) requiring compensating action days after the process started. Where does the state for "which step this particular order is on" live?**

The instinctive first answer — "put a `FulfillmentStatus` field on the `Order` aggregate and update it as things happen" — is the same trap Scenario Q4/Q5 diagnose in miniature: it assumes one aggregate can own state that actually spans three separate Bounded Contexts' invariants and lifecycles, each changing on its own schedule, none of which `Order` alone can observe or control.

**Why forcing it into `Order` breaks down:** `Order` would need to know about inventory reservation state (Inventory's concern), shipping schedule state (Shipping's concern), and the timing/retry logic connecting them — none of which are things the `Order` aggregate has any authority over or visibility into on its own. Worse, `Order.Submit()`'s original invariant ("can't submit with no lines") has nothing to do with "has inventory been reserved three days later," and cramming both into one class recreates exactly the unrelated-concerns-sharing-a-class problem from Scenario Q5, just spread across contexts instead of teams.

**Recognizing this needs a process manager (saga):** the defining symptom is that the thing being tracked — "where is this fulfillment in its multi-day journey" — has its own lifecycle, its own state machine, and its own failure/compensation logic, entirely separate from any single aggregate's invariants. That's precisely what a process manager exists for: a stateful coordinator, itself persisted, that listens for domain/integration events from multiple Bounded Contexts and reacts by issuing commands to advance (or compensate) the process — without any single aggregate needing to know the other contexts exist.

```csharp
public class OrderFulfillmentProcess    // the saga's own persisted state — not part of any domain aggregate
{
    public Guid OrderId { get; set; }
    public FulfillmentStep CurrentStep { get; set; }   // AwaitingInventory, AwaitingShipment, Completed, Compensating
    public DateTime StartedAtUtc { get; set; }
}

public class OrderFulfillmentSaga :
    INotificationHandler<OrderPlaced>,
    INotificationHandler<InventoryReserved>,
    INotificationHandler<InventoryShortfall>,
    INotificationHandler<ShipmentConfirmed>
{
    public async Task Handle(OrderPlaced e, CancellationToken ct)
    {
        await _store.Save(new OrderFulfillmentProcess { OrderId = e.OrderId, CurrentStep = FulfillmentStep.AwaitingInventory });
        await _bus.Send(new ReserveInventory(e.OrderId, e.Lines));      // command into Inventory's context
    }

    public async Task Handle(InventoryReserved e, CancellationToken ct)
    {
        var process = await _store.Load(e.OrderId);
        process.CurrentStep = FulfillmentStep.AwaitingShipment;
        await _bus.Send(new ScheduleShipment(e.OrderId));                // command into Shipping's context
    }

    public async Task Handle(InventoryShortfall e, CancellationToken ct)
    {
        var process = await _store.Load(e.OrderId);
        process.CurrentStep = FulfillmentStep.Compensating;
        await _bus.Send(new CancelOrder(e.OrderId));                     // compensating command back into Ordering
    }
}
```

`Order`, the `InventoryItem`, and `Shipment` aggregates each keep enforcing only their own invariants, exactly as before; the saga is the only thing that knows the *sequence* they participate in, and it's the only place "which step is this order on, three days in" is allowed to live.

**Practical guidance:** the tell is duration and cross-context reach — a workflow that completes within one aggregate's own transaction is just a behavior method; a workflow that spans multiple contexts, waits on external events, and needs compensating logic on failure is a process manager, full stop, and trying to squeeze it into one aggregate's field list is how Scenario Q4/Q5's symptoms get reintroduced one workflow at a time.

---

## Beginner — Question 9

**Q9: What's the difference between a DDD Entity and a plain database row/record with an ID column — isn't "has an identity" true of every table anyway?**

Every row in a relational table technically "has an ID," so this distinction is easy to wave away — but it's not about whether an ID column exists. It's about what the identity is *for* and whether the object built around it protects anything.

**A database row is a current-state snapshot.** A `SELECT * FROM Orders WHERE Id = 5` gives you whatever the row currently holds. The row has no memory of how it got there, no behavior of its own, and no opinion about whether the values it holds together are a *valid* combination — that's entirely up to whatever code last wrote to it. The ID is just a lookup key; nothing about the row's shape depends on it.

**A DDD Entity's identity is what makes it "the same thing" across its whole lifecycle, independent of its current attributes.** An `Order` with `Id = 5` that started as an empty draft, had three lines added, was submitted, then partially refunded is still *the same order* throughout — every one of those states is a different set of attribute values, but the identity never changes, and DDD cares about that continuity specifically because business rules often reference it ("has this order ever been submitted," "was this the original amount or a refunded one"). More importantly, the Entity is not just data at that identity — it's data *plus the only methods allowed to change it* (Beginner Q8's private-setter discipline), so `order.Submit()` can refuse to run if the order has no lines, something a row update statement has no way to refuse.

```csharp
// DB row equivalent — an ID, current values, no memory of history, no self-protection
UPDATE Orders SET Status = 'Submitted' WHERE Id = 5;   -- runs regardless of whether Lines is empty

// Entity — same identity, but the identity is attached to protected behavior
order.Submit();   // throws if _lines is empty; the row can never reach this state directly
```

**The practical difference shows up the moment two code paths touch the same row.** With a plain row, nothing stops one code path from writing `Status = 'Submitted'` while another writes `Total = 0` moments later, producing a combination the business would call broken. An Entity's identity is meaningless without the behavior wrapped around it — identity alone is just a key; identity *plus* enforced invariants is what DDD means by Entity.

**Practical guidance:** if a class's only job is to mirror a table's columns with public getters/setters, it's a row with extra syntax, not a DDD Entity — regardless of what the class is named or whether it has an `Id` property. The tell is the same one from Beginner Q8: is there any path that changes the object's state without going through a method that could refuse to do so.

---

## Intermediate — Question 13

**Q13: In EF Core specifically, what practical discipline keeps "the Aggregate is a transaction boundary" from being just theory — and what happens in code when that discipline is violated?**

Intermediate Q1 states the principle: one transaction should touch at most one aggregate. In EF Core, that principle becomes a concrete, checkable rule: **load one aggregate root, mutate it through its own methods, and call `SaveChanges()` once** — not partway through handling several aggregates, and not by reaching into a second aggregate's rows mid-handler.

```csharp
// Correct: one aggregate root loaded, mutated through its own method, one SaveChanges
public async Task Handle(SubmitOrderCommand cmd, CancellationToken ct)
{
    var order = await _db.Orders.FindAsync(cmd.OrderId);
    order.Submit();                 // invariant enforced inside the aggregate
    await _db.SaveChangesAsync(ct); // one transaction, one aggregate root's changes
}
```

`SaveChanges()` (or `SaveChangesAsync`) wraps everything the `DbContext`'s change tracker has accumulated into one implicit transaction. That's precisely why "one aggregate per `SaveChanges()` call" isn't a style preference — it's the mechanism that makes the consistency boundary real: if the aggregate's `Submit()` method is the only path that mutates it, and exactly one `SaveChanges()` commits that mutation, then the invariant `Submit()` checked is guaranteed to still hold the instant the transaction lands.

**What violating it looks like — reaching into a second aggregate before saving:**

```csharp
public async Task Handle(SubmitOrderCommand cmd, CancellationToken ct)
{
    var order = await _db.Orders.FindAsync(cmd.OrderId);
    order.Submit();

    var inventoryItem = await _db.InventoryItems.FindAsync(cmd.ProductId);  // second aggregate, same handler
    inventoryItem.Decrement(cmd.Quantity);                                  // its own invariant, now entangled

    await _db.SaveChangesAsync(ct);   // one transaction now spans two aggregates' consistency boundaries
}
```

This compiles and often "works" in testing, but it recreates the lock-contention problem from Scenario Q2/Intermediate Q9 in miniature: every order submission now takes a lock on an inventory row too, and the two aggregates' independent invariants are silently coupled to the same commit. The fix is the pattern already shown in Intermediate Q9 — `Submit()` raises `OrderPlaced`, a separate handler reacts and calls `SaveChanges()` again for `InventoryItem`, in its own transaction.

**Practical guidance:** the concrete code-review check is "does this handler call `SaveChanges()` after touching more than one `DbSet` that maps to a different aggregate root's tables?" If yes, either the handler is doing too much, or the two aggregates were split incorrectly in the first place. A repository that only ever exposes `GetByIdAsync`/`SaveChangesAsync` for a single aggregate root (Intermediate Q2) makes this violation harder to write by accident, since there's no `IInventoryRepository` reachable from `IOrderRepository`'s context in the first place.

---

## Intermediate — Question 14

**Q14: Domain and integration events may be delivered more than once in a distributed system — why does that make handler idempotency a DDD-adjacent concern, and what does an idempotent handler actually look like?**

Intermediate Q3 and Q10 cover *what* domain and integration events are and how they're dispatched (typically via an outbox pattern that guarantees an event is never silently lost between commit and publish). The unavoidable consequence of that reliability guarantee is the opposite failure mode: "at-least-once" delivery, not "exactly-once." A broker that guarantees an event isn't lost achieves that by retrying when it isn't sure a handler finished — which means the same `OrderPlaced` can legitimately arrive at a handler twice. A handler that assumes single delivery will double-charge, double-decrement inventory, or send two confirmation emails.

```csharp
// Not idempotent — running it twice for the same OrderPlaced double-decrements stock
public class DecrementInventoryOnOrderPlaced : INotificationHandler<OrderPlaced>
{
    public async Task Handle(OrderPlaced e, CancellationToken ct)
    {
        var item = await _inventory.GetByIdAsync(e.ProductId);
        item.Decrement(e.Quantity);           // runs again on redelivery — decrements twice
        await _inventory.SaveChangesAsync(ct);
    }
}
```

This is the same underlying problem an HTTP idempotency key solves for a client retrying a POST — the concept, not the mechanics, carries over directly: the handler needs a way to recognize "I have already processed this specific event" and skip re-applying its effect, rather than relying on the event only ever arriving once.

```csharp
// Idempotent — records which event IDs have been applied, checked before acting
public class DecrementInventoryOnOrderPlaced : INotificationHandler<OrderPlaced>
{
    public async Task Handle(OrderPlaced e, CancellationToken ct)
    {
        if (await _processedEvents.AlreadyHandledAsync(e.EventId, ct))
            return;                                    // redelivery — effect already applied, do nothing

        var item = await _inventory.GetByIdAsync(e.ProductId);
        item.Decrement(e.Quantity);
        await _processedEvents.MarkHandledAsync(e.EventId, ct);
        await _inventory.SaveChangesAsync(ct);          // event-ID record and effect commit in the same transaction
    }
}
```

The `EventId` check and the domain mutation must commit together, in the same `SaveChanges()` call — recording "handled" in a separate transaction reopens the exact gap the outbox pattern was closing on the publish side, just moved to the consume side.

**Common pitfall:** assuming a message broker's "exactly-once" marketing claim removes the need for this — most brokers that advertise it only guarantee exactly-once *delivery to the queue*, not exactly-once *execution of your handler's side effects*, especially once retries, timeouts, and consumer crashes are in the picture.

**Practical guidance:** design domain event effects to be naturally idempotent where possible (`Decrement` by an absolute target rather than a relative amount, `SetStatus(Delivered)` rather than `AdvanceStatus()`) before reaching for an explicit processed-events table — some operations are idempotent by construction and need no bookkeeping at all.

---

## Intermediate — Question 15

**Q15: The term "Saga" shows up both in DDD literature and in general distributed-systems/microservices literature — do they mean the same thing?**

Closely related, but not identically scoped, and conflating them causes real confusion when a team reads one source expecting the other's guarantees.

**The original "Saga" (Garcia-Molina and Salem, 1987, database literature)** describes a long-running transaction broken into a sequence of local transactions, each with a defined **compensating transaction** that can undo its effect if a later step fails — the point being to achieve transaction-like all-or-nothing behavior across steps that can't share one ACID transaction, purely through forward steps and their reverses.

**DDD literature's use (and Scenario Q6's "process manager")** borrows the term for the same broad shape — a multi-step, potentially long-running process with compensation on failure — but usually frames it specifically in terms of Bounded Contexts and aggregates: a saga/process manager coordinates *aggregates that must not be merged*, reacting to domain/integration events and issuing commands, precisely because DDD's own rule (Intermediate Q9) forbids one transaction spanning multiple aggregates. The DDD framing emphasizes *why* the coordination has to happen this way — because the aggregate boundary is a hard consistency wall — more than the general pattern does.

**General microservices/resiliency literature** uses "Saga" more broadly for any multi-service, multi-step business transaction with compensation, often without reference to aggregates or Bounded Contexts at all — the concern there is service-to-service coordination and failure handling, and the pattern is frequently discussed alongside two implementation styles: **choreography** (each service reacts to the previous service's event with no central coordinator) and **orchestration** (a central saga orchestrator, similar to Scenario Q6's `OrderFulfillmentSaga`, explicitly issues each step's command).

```text
DDD framing:            "aggregates X and Y can't share a transaction, so a process
                          manager coordinates them via events, one aggregate at a time"

Distributed-systems      "service X and service Y can't share a transaction, so we
framing:                  need compensating steps if step 2 fails after step 1 committed"
```

The mechanics — a persisted process state, forward steps, compensating actions, at-least-once event handling (which is exactly why Intermediate Q14's idempotency matters *inside* saga steps too) — are the same regardless of which literature you're reading. What differs is emphasis: DDD sources tend to justify the pattern from aggregate/consistency-boundary theory; general resiliency sources tend to justify it from service-autonomy and network-reliability concerns.

**Practical guidance:** when a colleague says "saga," clarify whether they mean the orchestration/choreography implementation question (how do services coordinate) or the DDD-flavored question (which aggregates does this process touch, and why can't they share a transaction) — both are legitimate readings of the same word, and a design conversation that conflates them tends to produce a saga that's well-justified on one axis and unexamined on the other.

---

## Intermediate — Question 16

**Q16: What is the "Ubiquitous Language" in Domain-Driven Design?**

The Ubiquitous Language is a shared, rigorously defined vocabulary used by everyone on the project—both domain experts (the business side) and software developers. 

It is "ubiquitous" because it is used everywhere: in spoken conversations, in requirements, and directly in the source code (class names, method names, variables). If the business experts call a concept a "Policy", developers must name the class `Policy`, not `Contract` or `Document`. If a term changes in the business, the code must be refactored to reflect that change. This eliminates the "translation layer" between business requirements and technical implementation.

---

## Intermediate — Question 17

**Q17: What is the difference between a Value Object and an Entity in DDD?**

- **Entity:** An object defined by its continuous **identity**, regardless of its attributes. (e.g., A `Person`. If John changes his name or address, he is still the same person because his `Id` or SSN is the same).
- **Value Object:** An object defined solely by its **attributes** (structural equality), with no conceptual identity. It is immutable. (e.g., An `Address`. If two addresses have the same street, city, and zip, they are exactly the same address. You don't update a Value Object; you replace it completely with a new one).

---

## Intermediate — Question 18

**Q18: What is the difference between a Subdomain and a Bounded Context?**

- A **Subdomain** exists in the *Problem Space*. It is a logical part of the real-world business (e.g., the Billing department, the Shipping department). It exists whether you write software for it or not.
- A **Bounded Context** exists in the *Solution Space*. It is an explicit architectural boundary in your software where a specific Ubiquitous Language applies. 

Ideally, they align 1:1 (one Bounded Context built to solve one Subdomain). But in legacy systems, one monolithic Bounded Context might span multiple Subdomains.

---

## Intermediate — Question 19

**Q19: What is an Aggregate and an Aggregate Root?**

An **Aggregate** is a cluster of associated domain objects (Entities and Value Objects) that are treated as a single unit for data changes. It represents a strict transactional consistency boundary. 

Every Aggregate has one specific Entity designated as the **Aggregate Root**. Outside objects can only hold references to the Root, never to the internal children. All modifications to the Aggregate must go through the Root's methods. This ensures the Root can enforce all business rules and invariants across the entire cluster of objects before saving.

---

## Intermediate — Question 20

**Q20: What is a Domain Event, and how does it help decouple Aggregates?**

A Domain Event is an immutable object representing something meaningful that occurred in the domain (e.g., `OrderShipped`, `InventoryDepleted`). 

Because DDD mandates that a single transaction should only modify *one* Aggregate, Domain Events are used when a change in one Aggregate needs to trigger a side-effect in another. 
Instead of the `Order` aggregate directly modifying the `Inventory` aggregate (creating tight coupling), the `Order` aggregate publishes an `OrderShipped` domain event. A separate event handler listens to that event and updates the `Inventory` aggregate in a separate transaction, ensuring loose coupling and eventual consistency.

---

## Advanced — Question 12

**Q12: How do you introduce DDD into a legacy/brownfield codebase that wasn't built with it, without requiring a full rewrite?**

A full rewrite is rarely justified and often fails outright (the "second-system effect" — a rewrite frequently takes longer than expected, and the business can't pause feature work while it happens). DDD adoption in a brownfield system instead works incrementally, treating strategic design as the entry point rather than tactical patterns.

**Step 1 — map Bounded Contexts onto the existing system as it actually is, not as it should be.** Before changing any code, do an Event Storming pass (Intermediate Q8) against the current system's real behavior, and overlay candidate Bounded Context boundaries onto the existing module/table structure. This surfaces where the legacy code already has implicit seams (even a Big Ball of Mud, Advanced Q11, usually has some natural fault lines) and, just as usefully, where it doesn't — those unbounded areas are where the biggest payoff (and the biggest risk) lives.

**Step 2 — pick one Bounded Context, usually the one causing the most pain or closest to the Core Domain, and wrap it with an Anti-Corruption Layer facing the rest of the legacy system.** This is Advanced Q4's ACL pattern turned inward: rather than treating "legacy" as an external vendor system, treat the *un-refactored parts of your own codebase* as the messy upstream, and build a translation seam so the newly-modeled context's domain model stays clean even while everything around it is still the old shape.

```csharp
// New Bounded Context's clean model, introduced alongside the legacy code —
// not a replacement for it yet, just a parallel, correctly-modeled slice
public class Order   // new rich aggregate
{
    public void Submit() { /* real invariants enforced here, finally */ }
}

// Anti-Corruption Layer translating the legacy schema into the new aggregate
public class LegacyOrderTranslator
{
    public Order FromLegacyRow(LegacyOrderRow row) => Order.Reconstitute(row.Id, row.Status, /* ... */);
}
```

**Step 3 — apply tactical patterns only inside the new context's boundary, leave the rest of the legacy system alone.** The legacy code outside the newly-carved context keeps working exactly as before; nothing requires touching it. Each subsequent iteration picks the next highest-value context and repeats — a "strangler fig" migration (incrementally replacing legacy behavior module by module while the old system keeps running) applied at the Bounded Context level rather than the endpoint or service level.

**Common pitfall:** starting with tactical patterns (retrofitting rich aggregates onto legacy tables) before strategic mapping — without knowing the Bounded Context boundaries first, "richer" entities just end up modeling the wrong scope, entangled with whatever the legacy schema happened to couple together.

**Practical guidance:** pick the first context based on business pain, not technical convenience — the Core Domain subdomain (Advanced Q7) causing the most bugs or slowest feature velocity is usually the highest-leverage starting point, since that's where DDD's investment pays off fastest and most visibly, building the case for continuing.

---

## Advanced — Question 13

**Q13: What's the trade-off of applying DDD's full tactical toolkit — aggregates, repositories, domain events — to a subdomain that's genuinely simple CRUD?**

Advanced Q6 and Q7 already establish the classification (Core/Supporting/Generic) and the alternative (Transaction Script/Active Record) — this is the concrete cost side of getting that classification wrong in the over-engineering direction, since it's the direction that's easy to justify one decision at a time and hard to notice accumulating.

**What the toolkit costs, regardless of whether it's earning its keep:** an aggregate root with private setters and behavior methods, a dedicated repository interface and implementation, domain events for state changes, a mapping configuration keeping the ORM out of the domain model (Intermediate Q11) — each piece is a real file, a real indirection a future reader has to trace through, and real ceremony around what might be a two-field settings row.

```csharp
// A "maintenance mode banner" setting — no real invariant, changes rarely, single field of consequence
public class MaintenanceBannerSetting   // Aggregate Root?
{
    public SettingId Id { get; private set; }
    private string _bannerText;
    public string BannerText => _bannerText;

    public void UpdateText(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) throw new DomainException("Banner text cannot be empty.");
        _bannerText = text;
        _domainEvents.Add(new MaintenanceBannerTextChanged(Id, text));  // who's listening? usually nobody.
    }
}
// Plus: ISettingRepository, EfSettingRepository, SettingEntityConfiguration, a command handler,
// a domain event with zero subscribers — for one string field.
```

Compare to the honest Active Record equivalent: a class with a settable `BannerText` property and a straightforward `UPDATE Settings SET BannerText = @text` — same functional result, a fraction of the code, and nothing lost, because there was never a multi-field invariant to protect in the first place.

**Where the cost actually bites:** it's not that the rich version is wrong, exactly — it's that every future developer touching this subdomain now has to understand aggregate/repository/domain-event conventions to make a one-line change, the domain event has no subscriber and exists purely as ceremony, and the pattern's presence signals "this is complex, be careful" about code that isn't complex at all, which wastes reviewer attention that should go toward the parts of the system that are.

**Practical guidance:** the test from Advanced Q7 applies directly — ask whether this subdomain is Core, Supporting, or Generic before reaching for the tactical toolkit, not after. A settings banner, a static content page, an admin lookup-table editor are almost always Generic or thin Supporting subdomains: default to the simplest thing that works (a plain class, direct SQL or a generic `DbSet<T>` CRUD path) and only promote a subdomain to the full tactical toolkit when it demonstrably grows real invariants — not preemptively, on the theory that it might need them eventually.

---

## Scenario — Question 7

**Q7: A team has correctly identified their Bounded Contexts, but `Ordering` and `Billing` both need "the current price of a product," disagree about who owns it, and end up with duplicated, occasionally-inconsistent copies. How do you resolve it?**

The disagreement itself is the diagnostic clue: if both contexts think they might own product pricing, neither actually does — pricing is a distinct concept from either "placing an order" or "generating an invoice," and it's been left homeless, which is why it's drifted into two disconnected copies instead of one owned source.

**Step 1 — recognize "current price" isn't Ordering's or Billing's concept at all.** Neither context's Ubiquitous Language naturally includes "set the price of a product" as something it does — Ordering's language is about carts and line items, Billing's is about invoices and payments. Pricing (list price, price tiers, discount rules, effective dates) is its own coherent set of rules and vocabulary, which is exactly the signal for a distinct Bounded Context — either its own `Pricing` context, or folded into `Catalog` if the team already has one and pricing rules aren't complex enough to warrant a fully separate context (Advanced Q7's Core-vs-Supporting judgment call applies here too).

**Step 2 — give that context sole write ownership, and make it the only source of the *live* price.**

```csharp
// Catalog (or Pricing) Bounded Context — single source of truth for current price
namespace Catalog.Domain
{
    public class Product
    {
        public ProductId Id { get; }
        public Money CurrentPrice { get; private set; }   // the only place "current price" is writable
        public void ChangePrice(Money newPrice) { /* validation, price-change event raised here */ }
    }
}
```

**Step 3 — Ordering and Billing each keep only a locally-relevant, point-in-time snapshot, never a live reference.** This is the same principle Scenario Q2 already applied to `OrderLine`'s `UnitPriceSnapshot` — an order or invoice should reflect the price that was actually agreed at that moment, immune to later catalog changes, which is correct domain behavior, not just a performance shortcut:

```csharp
namespace Ordering.Domain
{
    public class OrderLine
    {
        public ProductId ProductId { get; }         // reference by ID
        public Money PriceAtOrderTime { get; }       // snapshot, captured once, never re-queried from Catalog
    }
}

namespace Billing.Domain
{
    public class InvoiceLine
    {
        public ProductId ProductId { get; }
        public Money PriceAtInvoiceTime { get; }      // Billing's own snapshot — may legitimately differ from
    }                                                  // Ordering's if the invoice reflects a later re-price
}
```

Naming the field `PriceAtOrderTime`/`PriceAtInvoiceTime` rather than `Price` makes the snapshot nature explicit in the Ubiquitous Language itself — nobody misreads it as a live lookup.

**Why the "occasional inconsistency" symptom disappears:** it wasn't really an inconsistency bug — it was two undeclared, uncoordinated write paths to the same concept. Once `Catalog`/`Pricing` is the only writer and both consumers hold snapshots, there's exactly one place a price can change, and both downstream copies are honestly labeled as point-in-time, not silently stale duplicates of an ambiguous "current" value.

**Practical guidance:** the general pattern — two contexts fighting over ownership of a concept usually means the concept doesn't belong to either of them — recurs throughout this file (Scenario Q4's `Customer`, Scenario Q5's `Subscription`); the fix is always the same shape: find or create the context that actually owns the concept, and let every consumer hold an ID reference plus a snapshot of whatever value they need to be locally correct at a point in time, never a live cross-context reference.

---

## Beginner — Question 10

**Q10: What is Domain-Driven Design (DDD)?**

Domain-Driven Design (DDD) is a software engineering approach that focuses on modeling software to match a complex domain. It emphasizes collaboration between technical experts (developers) and domain experts (business stakeholders) to create a shared understanding and a conceptual model of the business, translating that model directly into the software's structure and code.

---

## Beginner — Question 11

**Q11: What is the Ubiquitous Language?**

The Ubiquitous Language is a core concept in DDD: a common, rigorous language developed collaboratively by developers and domain experts. 

Instead of developers using technical jargon and business experts using business jargon, both groups agree on a single, shared vocabulary. This exact vocabulary is then used everywhere: in spoken conversations, in documentation, and most importantly, directly in the source code (class names, variable names, method names).

---

## Beginner — Question 12

**Q12: What is a Bounded Context?**

A Bounded Context defines a specific, explicit boundary within a larger system where a particular domain model and its Ubiquitous Language apply strictly. 

Because the same term can mean different things in different parts of a business (e.g., a "Customer" to the Billing department is different from a "Customer" to the Shipping department), Bounded Contexts ensure that terms remain unambiguous within their specific boundaries, preventing giant, confused models.

---

## Beginner — Question 13

**Q13: Explain what an Entity is in DDD.**

An Entity is a domain object that has a distinct identity that runs through time and different states. 

It is not defined primarily by its attributes, but by its unique identity (like a User ID or Order Number). Even if two Entities have exactly the same attributes (two users with the same name and age), they are considered different if their IDs are different.

---

## Beginner — Question 14

**Q14: What is a Value Object?**

A Value Object is a domain object that represents a descriptive aspect of the domain with no conceptual identity. 

It is defined entirely by its attributes (e.g., an Address, a Money amount, or a Color). If two Value Objects have exactly the same attributes, they are considered identical. They should always be designed to be immutable; if a value changes, the entire object is replaced with a new one rather than modifying the existing one.

---

## Beginner — Question 15

**Q15: What is "Tell, Don't Ask," and how does it explain why a rich domain model looks the way it does?**

"Tell, Don't Ask" is an object-oriented design principle: instead of asking an object for its internal state and then making a decision about it from the outside, you tell the object what you want to happen and let it decide, internally, whether and how to do it. It's not a DDD-specific term — it predates DDD — but it's the everyday design habit that produces exactly the kind of aggregate methods this file uses throughout (`order.Submit()`, `account.Withdraw(amount)`), and naming it explicitly makes it easier to catch violations in review.

**Asking (violates the principle):**

```csharp
// Caller pulls out state, makes the decision itself, then pushes state back in
if (order.Status == OrderStatus.Draft && order.Lines.Count > 0)
{
    order.Status = OrderStatus.Submitted;
}
```

This only works if `Status` and `Lines` are both publicly readable *and* writable from outside — which is precisely the anemic-model shape Beginner Q4 objects to. The rule "can't submit with no lines" now lives in whatever code happened to write this `if`, and nothing stops a second call site from writing a different, inconsistent version of the same check.

**Telling (the rich-model version):**

```csharp
order.Submit();   // Order decides internally whether this is allowed; caller doesn't ask first
```

The caller expresses *intent* ("I want this order submitted") and the object owns the rule about whether that intent can be satisfied right now. This is exactly why aggregate methods are named as domain verbs (`Submit`, `Withdraw`, `Lapse`) rather than the object exposing a `CanSubmit` getter plus a `Status` setter for the caller to orchestrate itself.

**Common pitfall:** adding a `CanSubmit()` query method *alongside* a public `Status` setter "just so the UI can show a disabled button" — this looks harmless but reintroduces the asking pattern the moment any code calls `CanSubmit()` and then sets `Status` directly instead of calling `Submit()`. A query method for display purposes is fine; a query method paired with a public setter for the same state is a loophole back to anemic behavior.

**Practical guidance:** when reviewing a new domain method, check whether the caller needed to read any of the object's internal state before deciding to call it. If the answer is "no, it just told the object what it wanted," that's Tell, Don't Ask in practice — and it's the same underlying discipline as Beginner Q8's "no public path that mutates state without going through a guarded method."

---

## Beginner — Question 16

**Q16: Why do DDD-modeled aggregates usually generate their own identity (e.g., a client-side `Guid.NewGuid()`) rather than relying on a database identity column?**

An Aggregate Root's identity (Intermediate Q1) needs to exist and be stable from the moment the aggregate is *conceptually* created — not from the moment a row happens to be inserted into a table. A database identity/auto-increment column only produces a value after `INSERT` succeeds, which creates an awkward gap: the aggregate exists as a fully valid domain object (it can have invariants checked, domain events raised, even be passed around in memory) before it has any identity at all.

**Why that gap causes real problems:**

```csharp
public class Order
{
    public int Id { get; private set; }   // 0 until the database assigns a real value
    public void Submit()
    {
        if (!Lines.Any()) throw new DomainException("Cannot submit an order with no lines.");
        Status = OrderStatus.Submitted;
        _domainEvents.Add(new OrderPlaced(Id, ...));   // Id is still 0 here if not yet persisted!
    }
}
```

If a domain event is raised before the entity has been saved, an identity-column design either raises the event with a meaningless placeholder ID, or forces the code to save first and raise the event second — coupling domain behavior to persistence sequencing, which is exactly what persistence ignorance (Intermediate Q11) says to avoid.

**Client-generated identity avoids the gap entirely:**

```csharp
public class Order
{
    public OrderId Id { get; }   // assigned the moment the object is constructed, e.g. OrderId.New() -> Guid
    public Order(OrderId id, CustomerId customerId) { Id = id; /* ... */ }
}
```

Now `Order` has a real, final identity from the instant it's created in memory — domain events can safely carry it, equality comparisons work before the first `SaveChanges`, and the aggregate never passes through a state where its own identity is undefined.

**Common pitfall:** assuming client-generated GUIDs are "worse for the database" and reverting to identity columns for performance reasons without checking — sequential GUID generation strategies (e.g., `NEWSEQUENTIALID()` in SQL Server, or a `Guid`-generation library that produces roughly time-ordered values) largely close the index-fragmentation gap that made random GUIDs a real concern for primary keys, without giving up client-side ID assignment.

**Practical guidance:** default to a strongly-typed ID Value Object (`OrderId` wrapping a `Guid`, per Beginner Q3) generated at construction time for any Aggregate Root that raises domain events or needs to be referenced before its first save; a plain identity column is a reasonable simplification only for Generic-subdomain entities (Advanced Q7) with no domain events and no cross-aggregate references to worry about.

---

## Intermediate — Question 21

**Q21: A Factory (Beginner Q6) and a Repository (Intermediate Q2) can both "hand you" an Order object — what's the actual difference, and why do both exist?**

They sit on opposite ends of an aggregate's lifecycle and answer different questions, even though from a call site both can look like `var order = something.GetOrder(...)`.

**A Factory answers "how does a brand-new, valid aggregate come into existence?"** It's invoked when there is no aggregate yet — only the raw inputs needed to construct one (a `Cart`, a `CustomerId`). Its job is to satisfy whatever invariants apply *at creation time* and produce a fully valid aggregate that has never been persisted.

**A Repository answers "how do I get back an aggregate that already exists?"** It's invoked when the aggregate already has an identity and a persisted history — `GetByIdAsync` reconstitutes it from storage into the same in-memory shape it would have had if it had never left memory at all, invariants and all.

```csharp
// Factory: brings a new Order into existence — no prior persisted state
var order = _orderFactory.CreateFromCart(cart, customerId);
await _orderRepository.AddAsync(order);      // now, for the first time, it's persisted

// Repository: retrieves an Order that already has a persisted history
var existingOrder = await _orderRepository.GetByIdAsync(orderId);
existingOrder.Submit();                       // mutate the retrieved aggregate
await _orderRepository.SaveChangesAsync(ct);
```

**Why both are needed rather than folding creation into the repository:** a repository's job (Intermediate Q2) is specifically to give the illusion of an in-memory collection of *already-existing* aggregates — `Add`, `GetById`, `Remove` — none of which involve deciding whether a set of raw inputs is enough to construct a valid new object. Mixing creation logic (cart validation, price-snapshotting) into `IOrderRepository.Add(Cart cart, CustomerId id)` would make the repository responsible for a domain decision it has no business making, and would make it impossible to construct an `Order` in a unit test (Intermediate Q12) without an `IOrderRepository` implementation to call.

**Common pitfall:** implementing "reconstitution from the database" (turning rows back into an aggregate) as if it were the same operation as "creating a new aggregate from business inputs" — they often *look* similar (both end with `new Order(...)`) but reconstitution must skip creation-time invariants that only make sense for brand-new aggregates (e.g., "a cart must not be empty" doesn't apply when rehydrating an `Order` that was already validly submitted years ago), which is why reconstitution is usually a dedicated internal factory method (`Order.Reconstitute(...)`, as used in Advanced Q12) rather than the same path a fresh `OrderFactory.CreateFromCart` uses.

**Practical guidance:** if a piece of code is deciding whether inputs are *sufficient and valid to bring a new aggregate into being*, that's Factory territory; if it's retrieving something that already has a lifecycle and an identity, that's Repository territory — conflating them tends to produce a repository interface cluttered with creation parameters that have nothing to do with data access.

---

## Intermediate — Question 22

**Q22: Do domain and integration events need to be processed in the order they were raised, and what breaks if that assumption is silently relied on?**

Most messaging infrastructure (a broker, an outbox-poller, even in-process `INotificationHandler` dispatch under concurrent processing) makes no strict, end-to-end ordering guarantee once more than one message is in flight — it guarantees *delivery* (per Intermediate Q14's at-least-once discussion), not necessarily the *order* two independently-published events arrive in, especially across partitions, retries, or multiple consumer instances processing in parallel for throughput.

**Where an unspoken ordering assumption breaks:**

```csharp
// Handler assumes OrderPlaced always arrives before OrderCancelled for the same order
public class InventoryProjectionHandler :
    INotificationHandler<OrderPlaced>, INotificationHandler<OrderCancelled>
{
    public Task Handle(OrderPlaced e, CancellationToken ct) =>
        _readModel.UpsertAsync(new OrderProjection(e.OrderId, "Placed"));

    public Task Handle(OrderCancelled e, CancellationToken ct) =>
        _readModel.UpsertAsync(new OrderProjection(e.OrderId, "Cancelled"));
}
```

If `OrderCancelled` is redelivered after a transient failure and happens to be processed *after* a later `OrderPlaced` retry for an unrelated reprocessing pass, the read model can end up showing "Placed" for an order that was actually cancelled — not because either handler has a bug in isolation, but because the code implicitly assumed events for the same aggregate always arrive in raise-order, which nothing in the pipeline promised.

**Making the handler order-safe rather than order-dependent:**

```csharp
public Task Handle(OrderCancelled e, CancellationToken ct) =>
    _readModel.UpsertIfNewerAsync(e.OrderId, "Cancelled", e.OccurredOn);   // compares timestamps/sequence, not arrival order

public Task Handle(OrderPlaced e, CancellationToken ct) =>
    _readModel.UpsertIfNewerAsync(e.OrderId, "Placed", e.OccurredOn);
```

Carrying a sequence number or `OccurredOn` timestamp on the event itself, and having the projection compare it against whatever it currently holds before overwriting, makes the outcome correct regardless of arrival order — the same defensive habit as Intermediate Q14's idempotency, extended from "did I already apply this" to "is this the most recent thing I should apply."

**Common pitfall:** reaching for a single global ordered queue "to make this simpler" — that trades away the whole point of scaling consumers horizontally (Kafka's per-partition ordering guarantee is the realistic middle ground many systems use: order is guaranteed *within* a partition key, typically the aggregate's ID, but not across the whole topic).

**Practical guidance:** design each handler to be correct under out-of-order *and* duplicate delivery from the start (timestamp/sequence comparisons, last-write-wins or explicit conflict rules) rather than relying on infrastructure to preserve an order it was never contractually promising — and where true ordering matters for one aggregate's stream specifically, key the partitioning/routing on that aggregate's ID so at least same-aggregate events stay ordered relative to each other.

---

## Advanced — Question 14

**Q14: An Aggregate Root enforces its invariants in memory before any write happens — so why do systems still add optimistic concurrency control (a `RowVersion`/`xmin`-style column) on top of that?**

In-memory invariant checks (Beginner Q8, Intermediate Q1) guarantee that *the object the code is holding* never transitions to an invalid state. They say nothing about whether that object still reflects the *current* row in the database at the moment `SaveChanges` runs — and in any system with more than one concurrent writer, it might not.

**The gap optimistic concurrency closes:**

```csharp
// Two requests load the same Order concurrently, both pass their own in-memory invariant checks
var orderA = await _repository.GetByIdAsync(orderId);   // Lines.Count == 2
var orderB = await _repository.GetByIdAsync(orderId);   // also loaded with Lines.Count == 2, same DB row

orderA.AddLine(productX, 1, price);   // valid in memory: still Draft, adding a line is fine
orderB.Submit();                      // also valid in memory: Lines.Any() was true when orderB was loaded

// Without concurrency control: whichever SaveChanges runs second silently overwrites the first's effect —
// orderA's new line may vanish, or orderB may "submit" an order that, by the time it commits,
// no longer matches what was actually checked.
```

Each aggregate instance is internally consistent by itself — the problem is that two different in-memory snapshots of the *same* underlying row were mutated independently, and nothing forces either save to notice the other happened.

**How a version column resolves it:**

```csharp
public class Order
{
    public OrderId Id { get; }
    public uint Version { get; private set; }   // mapped to a RowVersion/rowversion column via EF Core's IsRowVersion()
}
```

```csharp
builder.Property(o => o.Version).IsRowVersion();
```

EF Core includes the originally-loaded `Version` value in the `UPDATE ... WHERE Id = @id AND Version = @originalVersion` statement. If another transaction already committed a change to that row, zero rows match the `WHERE` clause, EF Core throws `DbUpdateConcurrencyException`, and the second writer is forced to reload the aggregate, re-run its behavior method against the *current* state, and retry — rather than silently clobbering the first writer's committed change.

**Why this doesn't contradict "the aggregate is the consistency boundary" (Intermediate Q1):** the aggregate boundary defines *what must be checked together* (the invariant); optimistic concurrency defends *when* that check is still valid — specifically, that the state the invariant was checked against hasn't been superseded by another transaction between load and save. Without it, the aggregate's invariant enforcement is only as good as the assumption that nobody else touched the row in between, which concurrent load in a multi-user system routinely violates.

**Practical guidance:** add a version/concurrency token to every Aggregate Root that can be loaded and mutated by more than one concurrent request path (which, in practice, is nearly all of them) — it's cheap (one extra column, one EF Core mapping line) relative to the class of silent-lost-update bugs it prevents, and unlike a pessimistic lock, it doesn't hold a database lock for the duration of a request, only detects the conflict at commit time.

---

## Advanced — Question 15

**Q15: Intermediate Q5 mentions Open Host Service / Published Language in passing — worked out in full, what does it actually look like, and how is it different from just "publishing an API"?**

Every service exposes *some* API, so "Open Host Service" only earns its name when the exposed contract is treated as a deliberately designed, versioned **Published Language** — a shared vocabulary meant for many independent consumers, decoupled from the provider's internal model, with an explicit compatibility contract — rather than an incidental byproduct of whatever the internal domain model happens to look like this week.

**What it's replacing — an internal model exposed directly, one integration at a time:**

```csharp
// Catalog's internal Product entity, serialized straight onto the wire — no translation, no contract
public class Product
{
    public ProductId Id { get; private set; }
    public InternalPricingStrategy PricingStrategy { get; private set; }   // internal concept leaks straight out
    public CategoryTree Category { get; private set; }                     // internal shape leaks straight out
}
```

Every consumer of this endpoint is now coupled to `Catalog`'s internal refactoring decisions — renaming `InternalPricingStrategy` or restructuring `CategoryTree` breaks every consumer simultaneously, with no seam to absorb the change. This is the Conformist relationship (Intermediate Q5) forced onto *every* consumer of `Catalog`, whether or not any of them individually has the leverage or the interest to negotiate a change.

**Open Host Service / Published Language — a stable, intentionally-designed contract sitting in front of the internal model:**

```csharp
// Published Language: a small, deliberately stable DTO shape — versioned, documented, decoupled from internals
public record ProductV1(string Sku, string DisplayName, decimal CurrentPrice, string CategoryPath);

public class CatalogOpenHostService
{
    public ProductV1 GetProduct(ProductId id)
    {
        var product = _repository.GetById(id);   // internal aggregate, free to change shape
        return new ProductV1(product.Sku.Value, product.DisplayName, product.CurrentPrice.Amount, product.Category.FullPath);
    }
}
```

```yaml
# The "Published" half: an OpenAPI contract, checked into a shared/versioned location,
# that consumers code against instead of Catalog's internal types.
openapi: 3.0.0
paths:
  /products/{id}:
    get:
      responses:
        "200":
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductV1' }
```

Now `Catalog`'s team can restructure `InternalPricingStrategy` or `CategoryTree` freely — as long as `CatalogOpenHostService` keeps producing a `ProductV1` shape that satisfies the published contract, every consumer is unaffected. A breaking change to the *published* shape becomes `ProductV2`, introduced alongside `V1` and deprecated on a schedule, rather than an unannounced break.

**Why this is a strategic-design decision, not just API hygiene:** choosing to invest in an Open Host Service is choosing to absorb translation cost centrally (one team designs and maintains the Published Language) instead of leaving each consumer to build its own Conformist adapter against a moving internal target — worth it specifically when a context has many independent consumers, which is exactly the situation where negotiating a bespoke Customer-Supplier relationship (Intermediate Q5) with each one doesn't scale.

**Practical guidance:** version the Published Language explicitly (a path segment, a media-type parameter, or a schema version field) from the very first release, even before a second version is needed — retrofitting versioning onto a contract that consumers already depend on unversioned is far more disruptive than starting with `V1` in the name.

---

## Advanced — Question 16

**Q16: What is Event Sourcing, and how does it relate to — without being required by — Domain-Driven Design's tactical patterns?**

Event Sourcing is a persistence strategy: instead of storing an aggregate's *current* state as a row that gets overwritten on each change, you store the complete, ordered sequence of domain events that ever happened to it, and derive current state by replaying those events from the beginning (or from the last snapshot) whenever the aggregate needs to be loaded. It's a persistence choice, not a DDD requirement — the vast majority of this file's examples use conventional "store current state" persistence with domain events used only for decoupling (Intermediate Q3), and that's a completely valid, arguably more common way to do DDD.

**Conventional persistence — the row *is* the state:**

```csharp
// Loading: SELECT current columns, done. History of how it got here is gone.
var order = await _db.Orders.FindAsync(id);   // Status = Submitted; no record of the Draft state that preceded it
```

**Event-sourced persistence — the events *are* the state; current state is a derived projection:**

```csharp
public class Order
{
    public OrderId Id { get; private set; }
    public OrderStatus Status { get; private set; }
    private readonly List<OrderLine> _lines = new();

    // Replays recorded events to arrive at current state — no "current row" is ever stored directly
    public static Order LoadFromHistory(IEnumerable<IDomainEvent> history)
    {
        var order = new Order();
        foreach (var e in history) order.Apply(e);
        return order;
    }

    private void Apply(IDomainEvent e)
    {
        switch (e)
        {
            case OrderLineAdded lineAdded: _lines.Add(new OrderLine(lineAdded.ProductId, lineAdded.Quantity, lineAdded.UnitPrice)); break;
            case OrderSubmitted: Status = OrderStatus.Submitted; break;
        }
    }

    // Behavior methods still enforce invariants against current (replayed) state, then record a new event
    public void Submit()
    {
        if (!_lines.Any()) throw new DomainException("Cannot submit an order with no lines.");
        _domainEvents.Add(new OrderSubmitted(Id));
        Apply(_domainEvents.Last());   // apply immediately so in-memory state reflects the new event too
    }
}
```

**Where it genuinely reinforces DDD tactical patterns:** event sourcing takes the domain event (Intermediate Q3) — already a first-class concept in DDD — and makes it the *only* thing persisted, rather than a side artifact. It also makes the Aggregate boundary even more load-bearing than usual: because events are the unit of storage and an aggregate is loaded by replaying only its own event stream, the aggregate boundary must exactly match the event stream boundary, or replay pulls in (or leaves out) the wrong events entirely.

**What it costs, and why it's not a default choice:** every query that isn't "give me current state by ID" (a list of overdue orders, a report joining several orders) needs a separately-maintained read projection, because the event stream alone is a poor shape to query — this is CQRS's read-model split (Advanced Q8), but now mandatory rather than optional. Schema evolution is harder too: an old event type recorded years ago must still be replayable by current code, which usually means versioned event types and upcasting logic, a maintenance burden a conventional current-state table never has.

**Practical guidance:** reach for event sourcing when the audit trail/history *is* a real business requirement (financial ledgers, insurance claim histories, anything where "what did this look like on March 3rd, and why" is a genuine question the business asks) — not merely because domain events are already being used for decoupling. Using domain events for pub/sub between aggregates (Intermediate Q3, Q9) is valuable on its own and doesn't obligate a team to also adopt event sourcing as the storage mechanism.

---

## Scenario — Question 8

**Q8: Eight months into building a `Fulfillment` service, the team notices that roughly a third of its code exists purely to ask the `Ordering` service detailed questions about order contents, discounts, and payment status — logic that conceptually belongs to Ordering, not Fulfillment. The Bounded Context boundary was drawn wrong at the start. How do you diagnose this precisely, and what's the safe path to correct it now that both services are live and have their own databases?**

**Diagnosing precisely, not just "it feels wrong":** the concrete tell is the one from Advanced Q5 and Q1 — count how often `Fulfillment` has to synchronously call back into `Ordering` to answer questions that are really about *order* concepts (was this line discounted, has payment cleared) rather than *fulfillment* concepts (has this shipped, which carrier). A high ratio of "calls back to ask" versus "acts on data it actually owns" means the boundary split a single business capability down the middle instead of separating two genuinely different ones — `Fulfillment` never got a complete-enough model to act alone, which is precisely Advanced Q1's distributed-monolith symptom.

**Why this can't be fixed by adding an ACL or more caching:** an Anti-Corruption Layer (Advanced Q4) protects a context from a *foreign* model's vocabulary leaking in — it's the right tool when the upstream genuinely belongs to someone else's problem space. Here the problem is the opposite: `Fulfillment` is repeatedly asking about concepts that *are* its own problem space, just modeled on the wrong side of the line. Wrapping the cross-service calls in a nicer-looking client doesn't change which service should own the data.

**Safe correction path — treat it as a boundary move, not a rewrite:**

1. **Re-run Event Storming (Intermediate Q8) on the actual observed behavior**, not the original design intent, to find where the real seam is. Often the finding is narrower than "merge the services" — e.g., "which line items were discounted" genuinely belongs with `Ordering`, but "which carrier and tracking number" genuinely belongs with `Fulfillment`; the boundary needs to move, not disappear.
2. **Introduce the corrected model as a new, parallel slice inside `Fulfillment`,** populated via a domain/integration event from `Ordering` (`OrderPlaced` carrying the discount-adjusted line totals `Fulfillment` actually needs) rather than a synchronous query — this is the "strangler fig at the Bounded Context level" approach from Advanced Q12, just applied to correcting a boundary rather than introducing DDD for the first time.
3. **Cut over call sites one at a time**, from "ask `Ordering` synchronously" to "read the locally-maintained projection kept current by events," verifying against production traffic before removing the old synchronous path.
4. **Only after every call site is migrated, remove the now-dead synchronous query capability** from `Ordering`'s public API — removing it earlier breaks `Fulfillment` mid-migration.

**Why not do a "big bang" boundary redraw:** both services have their own databases and live consumers; a single cutover risks an all-or-nothing outage if the new event-driven data path has a gap the old synchronous path didn't. The incremental version keeps both paths correct simultaneously until the migration is verified complete.

**Practical guidance:** treat "how often does this service call back to its neighbor to answer questions about its neighbor's data" as a standing, monitorable signal, not a one-time design review question — a boundary that's correct at launch can still be revealed as wrong months later purely from how usage patterns actually settled, and catching the ratio climbing is cheaper than discovering it from a postmortem.

---

## Scenario — Question 9

**Q9: `Fulfillment` and `Returns` are two correctly-separated Bounded Contexts, but their teams have started arguing: `Fulfillment` considers an order "Complete" the moment it's delivered, while `Returns` considers an order "Complete" only after the 30-day return window closes with no return filed. Both teams insist their definition is the only correct one, and a shared status field keeps getting flipped back and forth by each side's logic. How do you resolve this without forcing one team to be "wrong"?**

**This is not an ownership dispute like Scenario Q4 or Q7 — it's a Ubiquitous Language collision.** Both teams are using the identical word, "Complete," and both are internally consistent and correct *within their own context* — this is exactly what Intermediate Q4 predicts: the same term is not guaranteed to mean the same thing across Bounded Contexts, and here it demonstrably doesn't. The bug isn't either team's logic; it's the shared field itself, which assumes one boolean can answer two different questions.

**Why a shared status field actively causes the flip-flopping:** whichever team's process runs last overwrites the other's meaning of "Complete" into the same column, because the column has no way to represent "delivered-complete" and "return-window-complete" as two distinct facts — it was modeled as if there were one universal lifecycle stage both contexts walk through together, when there are actually two independent lifecycles that happen to share a word.

**Resolution — stop sharing the field, let each context name its own concept explicitly:**

```csharp
// Fulfillment's own concept — deliberately not named "Complete"
namespace Fulfillment.Domain
{
    public class Shipment
    {
        public ShipmentId Id { get; }
        public OrderId OrderId { get; }                 // correlates to the order, doesn't own its lifecycle
        public DeliveryStatus DeliveryStatus { get; private set; }   // Delivered, InTransit, etc.
    }
}

// Returns' own concept — a different lifecycle, different name, same correlation ID
namespace Returns.Domain
{
    public class ReturnWindow
    {
        public OrderId OrderId { get; }
        public ReturnEligibility Eligibility { get; private set; }   // Open, Expired, ReturnFiled
    }
}
```

Neither team's word gets forced onto the other. `Fulfillment` publishes `ShipmentDelivered`; `Returns` subscribes to it to *start* its own 30-day clock, but `Returns.ReturnWindow.Eligibility` reaching `Expired` is Returns' own fact, computed on its own timeline, never written back into a shared "Complete" column that `Fulfillment` also touches.

**If a consuming team (say, a customer-facing order-status page) genuinely needs a single "is this order fully done" answer,** that's a new, distinct concept belonging to whichever context serves that page (or a dedicated read model composing both), explicitly defined as its own thing — e.g., `OrderLifecycleSummary.FullyResolved = DeliveryStatus == Delivered && ReturnEligibility == Expired` — rather than reusing either team's internal vocabulary for a third meaning.

**Practical guidance:** when two teams are arguing that the *same word* means different things and both are right, the fix is almost never "vote on the one true definition" — that produces a definition neither team's process actually implements correctly. Give each context's meaning its own name, correlate via a shared ID, and if a unified view is genuinely needed, model it as an explicit new concept rather than smuggling a second meaning into an existing field.

---

## Scenario — Question 10

**Q10: You've been asked to introduce DDD into one painful corner of a five-year-old codebase — a `Shipment` class with 40 public getters/setters and all its business logic scattered across six different `ShipmentService` methods — without a rewrite and without breaking the (extensive but slow) existing test suite that tests those services. Walk through the incremental refactor.**

This is Advanced Q12's strategic roadmap (map contexts, wrap with an ACL, apply tactical patterns inside one context at a time) applied at the scale of a single anemic class, where the immediate goal is tactical, not strategic — the Bounded Context boundary here is already accepted as correct; the problem is purely that `Shipment` is an anemic model (Beginner Q4) and the fix has to happen without a stop-the-world rewrite.

**Step 1 — pin current behavior with characterization tests before changing anything.** Before moving a single line of logic, write tests against the *existing* `ShipmentService` methods that lock in current behavior, including any behavior that looks accidental — these are the safety net for every subsequent step, independent of whether the existing slow test suite already covers it well.

**Step 2 — move one invariant at a time, starting with the one causing the most bugs.** Pick a single rule currently enforced (inconsistently) across multiple `ShipmentService` methods — say, "can't mark a shipment `Delivered` if it was already `Cancelled`" — and move it onto `Shipment` itself as a guarded method, without touching any other rule yet:

```csharp
// Before: rule checked (or forgotten) independently in ShipmentService.MarkDelivered,
// ShipmentService.BulkUpdateStatus, and a background job — three chances to get it wrong
public class Shipment
{
    public string Status { get; set; }   // still public — everything else still works exactly as before
}

// After, step 2: one rule moved, everything else untouched
public class Shipment
{
    public string Status { get; private set; }   // now private-set for THIS field only
    public void MarkDelivered()
    {
        if (Status == "Cancelled")
            throw new DomainException("Cannot mark a cancelled shipment as delivered.");
        Status = "Delivered";
    }
    // other 39 properties: still public getters/setters, untouched, for now
}
```

`ShipmentService.MarkDelivered` is updated to call `shipment.MarkDelivered()` instead of setting `Status` directly; the other five service methods are left exactly as they were. The characterization tests from Step 1 confirm nothing else broke.

**Step 3 — repeat, one invariant and one property at a time, verified by the growing test suite at each step.** Each iteration converts one more public setter into a private one backed by a guarded method, and each iteration is small enough to review and revert independently if something regresses — there is no "flip the whole class over" commit.

**Step 4 — once enough of `Shipment`'s state is behind guarded methods, the six `ShipmentService` methods shrink to orchestration** (load, call one behavior method, save) rather than housing business rules themselves, converging naturally toward the Application-Service shape from Intermediate Q7 — without that convergence ever being a discrete, risky step of its own.

**Why this order (tests first, one invariant at a time, service shrinks last) matters:** reversing it — refactoring `Shipment` broadly first and writing tests after — means the refactor has no safety net while it's happening, which is precisely the risk that makes teams avoid touching anemic legacy code at all. Making each step both small and independently testable is what makes the incremental path actually safer than leaving the anemic model alone.

**Practical guidance:** resist the urge to "finish" `Shipment` in one sitting once the pattern feels obvious — a half-converted class (some properties private-set and guarded, others still open) is a perfectly good intermediate state to leave in production between iterations, and is strictly safer than a single large, hard-to-review commit that converts all 40 properties at once.

---

## Scenario — Question 11

**Q11: A `PaymentReceived` domain event is supposed to trigger an `InventoryReserved` update in a separate service via an integration event, but a production incident review reveals that during a broker outage last month, several `PaymentReceived` events were never published at all — the payments were processed successfully, but the corresponding inventory was never reserved, and nobody noticed until customers started reporting oversells. Diagnose the architectural gap and fix it.**

**Diagnosis — the gap is between "the transaction committed" and "the event is guaranteed to be published," and nothing was closing it.** Intermediate Q3 states the correct lifecycle (events dispatched only after the originating transaction commits) but that's necessary, not sufficient — if publishing to the broker is just a method call made *after* `SaveChanges()` in the same request, a crash or broker outage between those two steps means the payment is durably committed but the event is silently lost forever, with no record that it was ever supposed to have gone out.

```csharp
// The gap: SaveChanges succeeds, but the process crashes or the broker is unreachable
// before the next line runs — PaymentReceived is gone, with no trace it should have existed
public async Task Handle(ProcessPaymentCommand cmd, CancellationToken ct)
{
    payment.MarkReceived();               // raises PaymentReceived in memory
    await _db.SaveChangesAsync(ct);       // COMMITTED — the payment is real and paid
    await _bus.PublishAsync(payment.DomainEvents, ct);   // <- outage here = event lost forever, silently
}
```

**The fix — an Outbox: persist the event to be published in the *same* transaction as the business change, then publish it separately with retry.**

```csharp
public async Task Handle(ProcessPaymentCommand cmd, CancellationToken ct)
{
    payment.MarkReceived();
    _db.OutboxMessages.Add(new OutboxMessage(payment.DomainEvents));   // same DbContext, same transaction
    await _db.SaveChangesAsync(ct);        // payment state AND the "must publish this" record commit atomically
}

// Separate background process — polls the outbox table and publishes, retrying until it succeeds
public class OutboxPublisher : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var pending = await _db.OutboxMessages.Where(m => !m.Published).ToListAsync(ct);
            foreach (var msg in pending)
            {
                await _bus.PublishAsync(msg.Payload, ct);   // if the broker is down, this loop just retries later
                msg.Published = true;
                await _db.SaveChangesAsync(ct);
            }
            await Task.Delay(TimeSpan.FromSeconds(2), ct);
        }
    }
}
```

Because the outbox row is written in the *same* database transaction as `payment.MarkReceived()`, there is no window where the payment is committed but the record of "this event still needs publishing" doesn't exist — a crash after `SaveChanges` still leaves the outbox row there for the publisher to pick up once the process (or the broker) recovers. This directly closes the gap the incident exposed.

**This also reintroduces Intermediate Q14's idempotency requirement, deliberately:** because the outbox publisher retries until it confirms success, `InventoryReserved`'s handler on the receiving side may now see the same event more than once (if publish succeeds but the "mark published" write fails) — which is exactly why the fix isn't complete without also confirming the downstream handler is idempotent, not just that publishing is now reliable.

**Practical guidance:** treat "what happens to this domain event if the process crashes or the broker is unreachable between commit and publish" as a standing design question for every event that triggers a cross-service side effect, not a hypothetical — this is precisely the failure mode outbox exists for, and it's cheap to add proactively but expensive to discover for the first time via a customer-facing oversell incident.

---

## Scenario — Question 12

**Q12: You're designing the `Order`/`Invoice` boundary for a B2B billing system. Finance requires that once an invoice is issued, its total must never silently drift from what was actually invoiced — a hard, always-consistent invariant. Sales requires that orders remain editable after invoicing, to record post-delivery corrections (a damaged item, a quantity dispute) without waiting for a formal credit-note process. These two requirements look contradictory: how can an order be editable while an invoice derived from it stays permanently fixed?**

**The apparent contradiction dissolves once "editable" and "fixed" are recognized as applying to two different aggregates with two different jobs — the mistake to avoid is modeling `Order` and `Invoice` as one aggregate (or as a live parent/computed-child relationship) just because an invoice is "derived from" an order.**

**Why forcing them into one aggregate fails both requirements at once:** if `Invoice.Total` were computed live from `Order.Lines` every time it's read, then editing the order *after* invoicing would silently change the invoice's total — violating Finance's hard invariant the moment Sales exercises the flexibility they asked for. If, instead, `Order` were locked immutable the moment it's invoiced to protect the invoice, Sales loses the post-delivery correction workflow entirely. There's no single aggregate design that satisfies both requirements, because they're not actually requirements about the same object.

**The resolution — `Invoice` is its own Aggregate Root, snapshotting what it needs from `Order` at issuance, exactly like Scenario Q2's `OrderLine` price snapshot and Scenario Q7's pricing ownership pattern:**

```csharp
public class Invoice   // Aggregate Root — Finance's context, its own consistency boundary
{
    public InvoiceId Id { get; }
    public OrderId OrderId { get; }                          // reference by ID — correlation only, not a live link
    private readonly List<InvoiceLine> _lines = new();        // snapshot, captured once at issuance
    public Money Total => _lines.Sum(l => l.LineTotal);
    public InvoiceStatus Status { get; private set; }

    public static Invoice IssueFrom(Order order)
    {
        if (order.Status != OrderStatus.Delivered)
            throw new DomainException("Cannot invoice an order that hasn't been delivered.");

        var invoice = new Invoice(InvoiceId.New(), order.Id);
        foreach (var line in order.Lines)
            invoice.AddLine(line.ProductId, line.Quantity, line.UnitPriceSnapshot);   // copied, not referenced
        invoice.Status = InvoiceStatus.Issued;
        return invoice;
    }
    // No method exists that re-reads Order after issuance — Invoice has everything it needs, permanently.
}

public class Order   // Aggregate Root — Sales' context, remains freely editable after invoicing
{
    public OrderId Id { get; }
    public InvoiceId? InvoiceId { get; private set; }         // reference only — knows an invoice exists, not its contents

    public void RecordDeliveryCorrection(OrderLineId lineId, int correctedQuantity)
    {
        // Order can still be corrected after invoicing — this never touches the already-issued Invoice at all
        var line = _lines.Single(l => l.Id == lineId);
        line.Correct(correctedQuantity);
        _domainEvents.Add(new OrderCorrectedPostInvoice(Id, InvoiceId, lineId, correctedQuantity));
    }
}
```

Finance's invariant holds absolutely: once `Invoice.IssueFrom(order)` returns, nothing in the system has a method that mutates that `Invoice`'s lines or total — it's permanently fixed by construction, not by convention. Sales' requirement holds too: `Order.RecordDeliveryCorrection` is unrestricted by anything invoice-related, because `Order` genuinely doesn't reference `Invoice`'s internals, only its ID.

**Reconciling the two facts (order changed, invoice didn't) is a deliberate, visible business process, not a data-consistency bug:** `OrderCorrectedPostInvoice` is exactly the domain event that should trigger Finance's own explicit workflow — typically issuing a credit note or a supplementary invoice — which is itself a new `Invoice`-like aggregate, not a mutation of the original one. The two aggregates staying independently truthful about their own facts, plus an explicit event connecting them, *is* the correct model — not a compromise between the two teams' requirements.

**Practical guidance:** when two stakeholders' requirements for "the same" business object seem to contradict, check whether they're actually describing two different aggregates correlated by an ID (as here) before assuming one requirement has to lose — the contradiction is often an artifact of assuming there's only one object in the first place, the same root cause as Scenario Q4, Q5, Q7, and Q9.

---

## Scenario — Question 13

**Q13: A `Policy` aggregate in an insurance system has grown to expose 30+ public methods — `Underwrite`, `AdjustRiskScore`, `Endorse`, `FileClaim`, `AdjustClaimReserve`, `SettleClaim`, `DenyClaim`, `RenewPolicy`, `CancelPolicy`, `ApplyDiscount`, `RecalculatePremium`, and more — and the team has learned to dread touching it: a change to claims-handling logic has twice broken renewal behavior in ways nobody predicted. Unlike a "too large" aggregate bloated with embedded data, this one is lean on data but bloated on behavior. What's actually wrong, and how do you split it?**

**This is a different flavor of the "god aggregate" failure than Scenario Q2/Q5's data-embedding version — here the aggregate's *data* is reasonably sized, but it has accumulated the behavior of several genuinely separate lifecycles that happen to all reference "a policy."** Underwriting (deciding whether and at what price to insure), Claims handling (processing an individual claim from filing to settlement), and Renewal (the periodic re-evaluation cycle) are three business processes with their own state machines, their own invariants, and — critically — their own rates and reasons for change. A change to claims-handling logic breaking renewal behavior is the tell: two unrelated concerns are close enough in the same class that a change to one can ripple into the other purely through shared internal state, exactly the single-responsibility violation the "one reason to change" heuristic exists to catch, applied to an aggregate instead of an ordinary class.

**Diagnosing which methods actually share an invariant versus which merely share the word "Policy":** ask, for each pair of methods, "does a change made by one need to be atomically consistent with the other, right now, in the same transaction?" `FileClaim` and `SettleClaim` clearly do — a claim's reserve amount and its settlement status must never be inconsistent with each other. `FileClaim` and `RenewPolicy` almost certainly don't — filing a claim on Tuesday has no invariant requiring it to be atomically consistent with a renewal decision made the following month.

**Splitting along true lifecycle boundaries, correlated by a shared `PolicyId`:**

```csharp
// Underwriting context — its own aggregate, its own invariants around risk and pricing
public class PolicyUnderwriting
{
    public PolicyId Id { get; }
    public RiskScore RiskScore { get; private set; }
    public Money Premium { get; private set; }
    public void Underwrite(RiskAssessment assessment) { /* ... */ }
    public void RecalculatePremium() { /* ... */ }
}

// Claims context — a genuinely separate aggregate per claim, not folded into Policy at all
public class Claim
{
    public ClaimId Id { get; }
    public PolicyId PolicyId { get; }                 // reference, correlates back — doesn't embed underwriting data
    public ClaimStatus Status { get; private set; }
    public Money ReserveAmount { get; private set; }
    public void AdjustReserve(Money amount) { /* ... */ }
    public void Settle(Money finalAmount) { /* ... */ }
}

// Renewal context — its own lifecycle, its own cadence, reacts to events rather than sharing state directly
public class PolicyRenewal
{
    public PolicyId Id { get; }
    public DateTime RenewalDate { get; private set; }
    public void Renew(RiskScore currentRiskScore) { /* reads underwriting's current risk score by reference, not by embedding it */ }
}
```

Each piece now changes for exactly one reason: a claims-handling bug fix touches only `Claim`, and cannot ripple into `PolicyRenewal`'s behavior because `PolicyRenewal` no longer shares a class, a transaction, or even necessarily a service with `Claim` — the two are connected only via `PolicyId` and, where genuinely needed, domain events (a settled claim affecting future risk scoring is a `ClaimSettled` event that `PolicyUnderwriting` can react to on its own schedule, not a same-transaction side effect).

**Why this is a stronger fix than "just refactor the class into smaller private methods":** breaking `Policy`'s 30 public methods into smaller private helpers inside the same class would improve readability but leaves the actual coupling intact — claims logic and renewal logic would still live in one aggregate, sharing one transaction boundary and one set of fields, so a claims change could still ripple into renewal behavior through shared state, just through fewer, tidier-looking methods.

**Practical guidance:** "this aggregate has many methods, and changes to one area keep unexpectedly affecting another" is the behavioral-bloat counterpart to Scenario Q2's data-bloat symptom — both point to the same root cause (a class doing the job of several aggregates) and the same fix (split along true invariant/lifecycle boundaries, correlate by ID, coordinate via events), just discovered from a different angle: one from lock contention on shared data, this one from unpredictable cross-feature regressions in shared behavior.

---
