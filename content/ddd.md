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
