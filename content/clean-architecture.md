# Clean Architecture & DDD — Q&A

## Beginner — Question 1

**Q1: What is Clean Architecture and what problem does it solve?**

Clean Architecture (championed by Robert C. Martin / "Uncle Bob") is an architectural pattern that separates software into layers, with a strict rule about dependencies: **dependencies must only point inward** toward the core domain.

**The Problem it Solves:**
In traditional N-Tier (layered) architecture, the business logic layer often depends heavily on the data access layer (the database). If you want to change the database, upgrade the ORM, or switch UI frameworks, the entire application breaks because everything is tightly coupled to the infrastructure.

**The Clean Architecture Solution:**
It places the **Domain** (business entities and rules) at the absolute center. The Domain knows nothing about databases, web APIs, or UI. 

1. **Domain Layer (Center):** Entities, Value Objects, Domain Exceptions. Zero external dependencies.
2. **Application Layer:** Use cases (Commands/Queries), DTOs, and Interfaces for infrastructure (e.g., `IUserRepository`). Depends *only* on the Domain layer.
3. **Infrastructure Layer:** Concrete implementations (e.g., `SqlUserRepository` using EF Core). Depends on the Application layer to implement its interfaces.
4. **Presentation Layer:** The Web API or UI. Depends on the Application layer to execute use cases.

Because the core business logic has no external dependencies, it is incredibly easy to unit test and completely insulated from technology churn.

---

## Intermediate — Question 1

**Q1: What is the CQRS pattern and how is it used with MediatR in .NET?**

CQRS (Command Query Responsibility Segregation) is an architectural pattern that states that every method should either be a **Command** that performs an action (modifies state) or a **Query** that returns data to the caller (reads state), but never both.

**Why use it?**
In many applications, the read workload (querying data) is vastly different from the write workload (processing business rules). CQRS allows you to optimize, scale, and secure reads and writes independently. For example, writes might go to a normalized SQL Server, while reads query a denormalized Redis cache or Elasticsearch index.

**Using MediatR in .NET:**
MediatR is an incredibly popular library that implements the Mediator pattern, serving as the perfect delivery mechanism for CQRS.
Instead of injecting a dozen different services into your Controller, you inject `IMediator`.

1. **The Request:** You create a record class representing the intent (e.g., `CreateUserCommand`).
2. **The Handler:** You create a separate class (`CreateUserCommandHandler`) that executes the business logic.
3. **The Controller:** 
```csharp
[HttpPost]
public async Task<IActionResult> CreateUser(CreateUserCommand command) {
    var result = await _mediator.Send(command); // Mediator finds the correct handler
    return Ok(result);
}
```
This forces single-responsibility. The controller only routes HTTP to MediatR, and each Handler does exactly one specific use case.

---

## Advanced — Question 1

**Q1: In Domain-Driven Design (DDD), what are Entities, Value Objects, and Aggregates?**

Clean Architecture is often paired with DDD to model complex business rules in the Domain layer.

1. **Entity:** An object defined primarily by its **identity**, not its attributes. Even if two people have the exact same Name and Age, they are different people because their IDs are different. (e.g., `User`, `Order`).
   - *Key trait:* They have a distinct lifecycle and their state can change over time.

2. **Value Object:** An object defined entirely by its **attributes** (its value), with no concept of identity. If two objects have the same attributes, they are considered mathematically equal. (e.g., `Money`, `Address`, `Color`).
   - *Key trait:* They must be **immutable**. If you want to change an address, you don't update its ZipCode; you replace the entire Address object.

3. **Aggregate (and Aggregate Root):** An Aggregate is a cluster of associated Entities and Value Objects that are treated as a single unit for data changes. Every Aggregate has a single entry point called the **Aggregate Root**.
   - *Example:* An `Order` (Root) containing multiple `OrderLine` (Entities) and a `ShippingAddress` (Value Object).
   - *The Rule:* Outside objects can only hold references to the Aggregate Root. If you want to add an OrderLine, you cannot modify the OrderLine table directly. You must call a method on the `Order` root (e.g., `order.AddLineItem(...)`). The Root is responsible for enforcing all business invariants (e.g., "An order cannot have more than 10 lines").

---

## Scenario — Question 1

**Q1: You have a Clean Architecture solution. Your Domain layer has a `User` entity with an `UpdatePassword()` method. This method needs to hash the new password, but hashing requires a cryptographic library (like BCrypt) that should not be in the pure Domain layer. How do you implement this without violating Clean Architecture dependency rules?**

This is the classic problem of injecting infrastructure capabilities into the pure Domain. The Domain cannot depend on BCrypt, but it needs to use it.

**The Solution: Domain Services and Interface Injection**

1. **Define the Interface in the Domain:**
   Inside the pure Domain Layer, you create an interface representing the capability you need.
   ```csharp
   // Inside Domain Layer
   public interface IPasswordHasher {
       string Hash(string plainText);
   }
   ```

2. **Use the Interface in the Domain:**
   Your `User` entity (or a Domain Service) accepts this interface as an argument. The Domain dictates the contract, but knows nothing about the implementation.
   ```csharp
   // Inside Domain Layer
   public class User {
       public string PasswordHash { get; private set; }
       
       public void UpdatePassword(string newPassword, IPasswordHasher hasher) {
           if (newPassword.Length < 8) throw new DomainException("Too short");
           this.PasswordHash = hasher.Hash(newPassword);
       }
   }
   ```

3. **Implement in the Infrastructure Layer:**
   In the Infrastructure Layer (which is allowed to reference the Domain Layer and external NuGet packages), you create the concrete class.
   ```csharp
   // Inside Infrastructure Layer
   public class BCryptPasswordHasher : IPasswordHasher {
       public string Hash(string plainText) => BCrypt.Net.BCrypt.HashPassword(plainText);
   }
   ```

4. **Wire it up in Application/API:**
   The Application layer's `UpdatePasswordCommandHandler` receives the `IPasswordHasher` via Dependency Injection, fetches the `User` from the database, and calls `user.UpdatePassword(newPassword, _hasher)`.

**Result:**
The dependency points *inward*. The Infrastructure depends on the Domain's interface. The Domain remains 100% pure, unit-testable (by passing a mock hasher), and ignorant of BCrypt.

---

## Scenario — Question 2

**Q2: You are enforcing Clean Architecture. A developer submits a Pull Request where the Application Layer's `GetUserQueryHandler` returns the EF Core `User` Entity directly to the Presentation Layer (the Web API controller), which then serializes it to JSON and sends it to the client. What is wrong with this, and how do you fix it?**

Returning Domain Entities or Infrastructure models directly to the Presentation Layer violates the strict boundaries of Clean Architecture and creates tight coupling.

**The Flaw:**
1. **Security Risk (Over-posting):** The `User` entity might contain sensitive fields like `PasswordHash` or `SocialSecurityNumber`. Serializing it directly exposes this data to the public API.
2. **Coupling:** If you rename a column in the database (which changes the Entity), the JSON payload returned to the mobile app changes automatically, breaking the mobile app. The database schema now dictates the API contract.

**The Fix: Data Transfer Objects (DTOs)**
You must decouple the internal domain from the external contract.

1. **Create a DTO:** In the Application Layer, define a `UserResponseDto` that contains *only* the data the client specifically requested (e.g., `Id`, `FullName`, `Email`).
2. **Map the Entity:** The `GetUserQueryHandler` fetches the `User` Entity from the database (via repository), and then maps its properties to a new `UserResponseDto`. You can do this manually or use a library like AutoMapper.
3. **Return the DTO:** The handler returns the DTO to the Controller. The Controller serializes the DTO.

Now, the database can change, and the Entity can change, but as long as the mapping logic is updated, the external API contract (`UserResponseDto`) remains perfectly stable and secure.

---

## Scenario — Question 3

**Q3: A team is building a microservice using Clean Architecture. They place EF Core `DbContext` logic directly inside the Domain layer so that Domain Entities can be loaded easily. Why is this a severe anti-pattern, and what is the correct approach?**

Placing `DbContext` (or any data access logic) in the Domain layer violates the primary rule of Clean Architecture: The Dependency Rule. 

**The Flaw:**
If the Domain depends on EF Core, it is no longer framework-independent. It becomes tightly coupled to a specific ORM and a specific version of that ORM. If you want to switch to Dapper or a NoSQL database, you have to rewrite your core business logic. Furthermore, it often leads to developers embedding database concepts (like foreign key IDs or navigation properties required by EF) directly into pure Domain models, muddying the business rules.

**The Fix:**
Data access is an infrastructure concern and must be pushed to the outermost Infrastructure Layer.

1. **Define a Repository Interface:** In the Application layer (or Domain layer depending on preference), define an abstraction, e.g., `IUserRepository` with methods like `Add()` or `GetById()`.
2. **Implement in Infrastructure:** In the Infrastructure layer, implement the `UserRepository` which injects the `DbContext` and uses EF Core to execute the database operations.
3. **Use the Interface:** The Application layer's Command/Query handlers use the `IUserRepository` interface to persist data without knowing how it actually happens. 
The Domain layer remains pure, focusing only on business rules, while the Infrastructure layer handles the messy details of translating objects into SQL.

---

## Scenario — Question 4

**Q4: In your Clean Architecture application, a user creates an order. When the order is successfully saved to the database, you need to send a confirmation email. The developer injects an `IEmailService` into the Application Layer's `CreateOrderCommandHandler`, saves the order to the database, and then immediately calls `_emailService.Send()`. Why is this problematic, and what is the better architectural pattern?**

This is problematic because it violates the **Single Responsibility Principle** and creates issues with transaction boundaries and resilience.

**The Flaw:**
If the database save succeeds, but the `_emailService.Send()` fails (e.g., SendGrid is down), the `CreateOrderCommandHandler` throws an exception. This might bubble up and return a 500 Error to the user, even though their order *was* actually created in the database. Furthermore, the handler is now responsible for orchestrating side effects (sending emails) rather than just executing the core use case.

**The Solution: Domain Events**
You should decouple the side effect from the primary action using Domain Events.

1. **Raise the Event:** Inside the `Order` aggregate (in the Domain Layer), when the order is successfully created, it adds an `OrderCreatedEvent` to an internal list of events.
   ```csharp
   public class Order : AggregateRoot {
       public Order() {
           // Core business logic...
           AddDomainEvent(new OrderCreatedEvent(this.Id));
       }
   }
   ```
2. **Publish the Event (Infrastructure/Application Layer):** When you call `SaveChanges()` on the DbContext, you intercept it (using an EF Core Interceptor or overriding `SaveChanges`). Before actually committing to the database, you extract all Domain Events from tracked entities and publish them using a mediator (like MediatR).
3. **Handle the Event (Application Layer):** You create a completely separate `OrderCreatedEventHandler` that implements `INotificationHandler<OrderCreatedEvent>`. This handler injects the `IEmailService` and sends the email.

**Benefits:**
The `CreateOrderCommandHandler` only cares about saving the order. The `OrderCreatedEventHandler` only cares about sending the email. You can easily add more side effects (e.g., `UpdateInventoryEventHandler`) without ever modifying the original command handler. (For absolute reliability, you would combine this with the Outbox Pattern).

---

## Beginner — Question 2

**Q2: What is the "Dependency Rule" in Clean Architecture, and how does it relate to the Dependency Inversion Principle?**

The Dependency Rule states that **source code dependencies can only point inward** — an outer layer (Infrastructure, Presentation) can reference an inner layer (Application, Domain), but an inner layer must never reference anything from an outer layer.

**Visualizing the layers (concentric circles, dependencies point inward):**
```text
┌─────────────────────────────────────┐
│  Presentation (Web API, Controllers) │
│  ┌─────────────────────────────────┐ │
│  │  Infrastructure (EF Core, etc.) │ │
│  │  ┌───────────────────────────┐  │ │
│  │  │  Application (Use Cases)  │  │ │
│  │  │  ┌─────────────────────┐  │  │ │
│  │  │  │  Domain (Entities)  │  │  │ │
│  │  │  └─────────────────────┘  │  │ │
│  │  └───────────────────────────┘  │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
All arrows point INWARD, toward Domain
```

**How this relates to DIP:** the Dependency Rule is essentially the Dependency Inversion Principle applied at the *architectural* level rather than just the class level. DIP says "depend on abstractions, not concretions" — Clean Architecture's Domain and Application layers define the *interfaces* (`IUserRepository`, `IEmailService`), while the Infrastructure layer (outer) provides the *implementations*. The dependency on the interface still points inward (Infrastructure → Application's interface), even though the actual *runtime* data flow and control often moves outward (Application calls into Infrastructure's implementation via that interface) — this inversion of the compile-time dependency direction relative to the runtime call direction is the entire point.

**Common Pitfall:** allowing a "just this once" shortcut — e.g., the Domain layer directly referencing a NuGet package from Infrastructure "because it's a small utility." Once one inward-pointing rule is broken, the boundary stops being enforceable by convention alone, and teams typically need architecture tests (e.g., using `NetArchTest` to assert "Domain project has zero references to Infrastructure project" in CI) to keep the rule honest as the codebase grows.

---

## Intermediate — Question 2

**Q2: What is the Repository pattern, and why is a generic `IRepository<T>` often considered an anti-pattern in Clean Architecture / DDD?**

The Repository pattern abstracts data access behind an interface that looks like an in-memory collection, letting the Application layer work with `IUserRepository.GetById()` instead of raw `DbContext` queries — the classic building block for keeping Infrastructure details out of business logic.

**A well-scoped, specific repository:**
```csharp
public interface IUserRepository
{
    Task<User?> GetByIdAsync(int id);
    Task<User?> GetByEmailAsync(string email);   // specific to how Users are actually queried
    Task AddAsync(User user);
}
```

**The generic `IRepository<T>` anti-pattern:**
```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id);
    Task<IEnumerable<T>> GetAllAsync();
    Task AddAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(T entity);
}
// Usage: IRepository<User>, IRepository<Order>, IRepository<AuditLog>, all forced into the same shape
```

**Why this is problematic in a DDD/Clean Architecture context:**
- **It's really just `DbSet<T>` with extra steps** — EF Core's `DbSet<T>` already *is* a generic repository/unit-of-work abstraction. Wrapping it in another generic interface adds a layer of indirection that provides no additional abstraction value, since both are equally generic.
- **It hides genuinely different querying needs behind one shape:** `AuditLog` might legitimately need `GetAllAsync()` for a report; `Order` almost never should support fetching "all orders" unbounded — a generic interface can't express "this method doesn't make sense for this aggregate" the way a purpose-built `IOrderRepository` with only the methods that actually make domain sense can.
- **It encourages leaking query logic out of the repository** — since `IRepository<T>` can't anticipate every specific query (`GetOrdersByCustomerAndDateRange`), callers end up calling `GetAllAsync().Where(...)` in the Application layer, silently pulling entire tables into memory and defeating the purpose of a data-access abstraction in the first place.

**The DDD-aligned alternative:** one repository interface **per Aggregate Root** (not per entity, and never generic), with methods named for the actual business operations the Application layer needs — `IOrderRepository.GetPendingOrdersOlderThan(TimeSpan age)` rather than a generic `GetAllAsync()` a caller must filter themselves.

---

## Advanced — Question 2

**Q2: What is a Domain Service, and how do you decide whether a piece of business logic belongs on an Entity or in a Domain Service?**

A Domain Service holds business logic that doesn't naturally belong to any single Entity or Value Object — typically because it operates *across* multiple aggregates, or requires a stateless calculation with no clear "owner" object.

**Logic that belongs on the Entity (the common, default case):**
```csharp
public class Order : AggregateRoot
{
    public void AddLineItem(Product product, int quantity)
    {
        if (Status != OrderStatus.Draft)
            throw new DomainException("Cannot modify a submitted order.");
        _lines.Add(new OrderLine(product.Id, quantity, product.Price));
    }
}
```
This rule ("can't modify a submitted order") is entirely about `Order`'s own state — it belongs on `Order` itself, enforced by the Aggregate Root, per DDD's core guidance of keeping invariants close to the data they protect.

**Logic that belongs in a Domain Service (spans multiple aggregates, no natural owner):**
```csharp
public class FundsTransferDomainService
{
    // Doesn't naturally belong to EITHER Account -- it's about the relationship between two
    public void Transfer(Account from, Account to, decimal amount)
    {
        if (from.Balance < amount) throw new DomainException("Insufficient funds.");
        from.Withdraw(amount);
        to.Deposit(amount);
    }
}
```
"Transferring funds between two accounts" isn't naturally owned by either individual `Account` — putting it on one `Account` (e.g., `fromAccount.TransferTo(toAccount, amount)`) would force one aggregate to reach into and directly mutate another aggregate's internals, breaking the rule that aggregates should only be modified through their own root.

**The decision heuristic:**
- **Single aggregate, clear owner → method on the Entity/Aggregate Root.** This should be the default; most business logic genuinely does belong to one specific object.
- **Spans multiple aggregates, or is a stateless calculation with no natural "owner" → Domain Service.** Domain Services still live in the pure Domain layer (no infrastructure dependencies) — they're a Domain concept, not an Application-layer or Infrastructure concept, distinguishing them from an "Application Service" (a use-case handler like `TransferFundsCommandHandler` that *orchestrates* calling the Domain Service plus persistence).

**Common Pitfall:** overusing Domain Services as a dumping ground for logic that's actually too lazy to model properly on an Entity — if a "Domain Service" ends up holding most of the business rules while your Entities become anemic property bags, that's a sign the modeling work of identifying true aggregate boundaries and invariants was skipped, not a sign Domain Services were the right tool.

---

## Beginner — Question 3

**Q3: What is the difference between a Domain Model and an Anemic Domain Model, and why is the latter considered an anti-pattern in Clean Architecture / DDD?**

A proper Domain Model bundles data together with the behavior/business rules that operate on it. An Anemic Domain Model separates them entirely — entities become pure data bags with public getters/setters, while all business logic lives elsewhere (typically in "service" classes), defeating much of the purpose of object-oriented domain modeling.

**Anemic Domain Model — data with no behavior:**
```csharp
public class Order  // just a bag of properties, no logic of its own
{
    public decimal Total { get; set; }
    public OrderStatus Status { get; set; }
}

public class OrderService  // ALL the actual business rules live here instead
{
    public void Cancel(Order order)
    {
        if (order.Status == OrderStatus.Shipped)
            throw new InvalidOperationException("Cannot cancel a shipped order.");
        order.Status = OrderStatus.Cancelled; // any code, anywhere, could also just do this directly!
    }
}
```
Nothing stops *any* other code elsewhere in the codebase from setting `order.Status = OrderStatus.Cancelled` directly, completely bypassing the "can't cancel a shipped order" rule — the rule only exists inside `OrderService.Cancel()`, but the entity's own public setter provides no protection against the invariant being violated some other way.

**A proper Domain Model — behavior lives with the data it protects:**
```csharp
public class Order
{
    public decimal Total { get; private set; }
    public OrderStatus Status { get; private set; } // no public setter -- can't be set from outside

    public void Cancel()
    {
        if (Status == OrderStatus.Shipped)
            throw new InvalidOperationException("Cannot cancel a shipped order.");
        Status = OrderStatus.Cancelled;
    }
}
```
Now there is **no way** to change `Status` except by calling `Cancel()` (or other methods the `Order` class itself exposes) — the invariant is structurally enforced by the type itself, not just conventionally followed by whichever service classes happen to remember to check it.

**Why this matters for Clean Architecture specifically:** an Anemic Domain Model pushes all business logic into the Application layer's use-case handlers, leaving the Domain layer as just data-transfer-object-like classes — which somewhat defeats the purpose of having a dedicated Domain layer at all, since "the rules that make this a valid Order" aren't actually protected by the Domain layer's own types.

**Common Pitfall:** justifying an Anemic Domain Model as "simpler" or "easier for EF Core to map" — modern EF Core fully supports private setters and encapsulated behavior methods on entities; the anemic pattern is usually a habit carried over from older ORM limitations, not a genuine current technical constraint.

---

## Intermediate — Question 3

**Q3: What is a Specification pattern, and how does it let you reuse complex query logic across both the Application layer and unit tests without duplicating LINQ expressions?**

A Specification encapsulates a piece of business-meaningful query/filtering logic (e.g., "orders eligible for auto-cancellation") as a reusable, named, testable object — instead of that same `Where` clause being copy-pasted across a repository method, a background job, and a report, all slightly drifting out of sync over time.

**Without a Specification — the same business rule duplicated in multiple places:**
```csharp
// In OrderRepository
var staleOrders = _db.Orders.Where(o => o.Status == OrderStatus.Pending && o.CreatedAt < DateTime.UtcNow.AddDays(-7));

// In a background cleanup job, written independently, SLIGHTLY different (bug: 7 vs 5 days)
var oldOrders = _db.Orders.Where(o => o.Status == OrderStatus.Pending && o.CreatedAt < DateTime.UtcNow.AddDays(-5));
```

**With a Specification — the rule is defined once, reused everywhere:**
```csharp
public class StaleOrderSpecification : Specification<Order>
{
    public override Expression<Func<Order, bool>> ToExpression()
        => o => o.Status == OrderStatus.Pending && o.CreatedAt < DateTime.UtcNow.AddDays(-7);
}

// Repository
var staleOrders = _repository.Find(new StaleOrderSpecification());
// Background job -- reuses the EXACT same rule, can't drift out of sync
var oldOrders = _repository.Find(new StaleOrderSpecification());
```
Because `ToExpression()` returns a genuine `Expression<Func<T, bool>>`, EF Core can still translate it into SQL (it's not just an in-memory predicate) — the Specification composes into `IQueryable` the same way a hand-written `Where` clause would, while giving that specific business rule a name and a single place to change it.

**The testing benefit:** the specification's logic can be unit tested in complete isolation, against plain in-memory objects, without needing a database or repository at all:
```csharp
[Fact]
public void StaleOrderSpecification_MatchesOrdersOlderThan7Days()
{
    var spec = new StaleOrderSpecification();
    var predicate = spec.ToExpression().Compile();
    Assert.True(predicate(new Order { Status = OrderStatus.Pending, CreatedAt = DateTime.UtcNow.AddDays(-8) }));
    Assert.False(predicate(new Order { Status = OrderStatus.Pending, CreatedAt = DateTime.UtcNow.AddDays(-3) }));
}
```

**Common Pitfall:** introducing the Specification pattern for simple, one-off queries that are only ever used in a single place — the pattern earns its complexity specifically when a business rule is genuinely reused across multiple call sites (or needs isolated unit testing independent of the database), not as a blanket wrapper around every `Where` clause in the codebase.

---

## Advanced — Question 3

**Q3: What is the "Ports and Adapters" (Hexagonal Architecture) way of describing the same boundary Clean Architecture enforces, and how do the two relate?**

Hexagonal Architecture (Ports and Adapters), introduced by Alistair Cockburn, and Clean Architecture (Robert C. Martin) were developed independently but describe essentially the same core idea using different vocabulary — recognizing this helps when reading codebases or articles that use one framing versus the other.

**Hexagonal's vocabulary — Ports and Adapters:**
```text
                    ┌─────────────────────┐
   HTTP Adapter ───►│                     │◄─── Database Adapter
   (driving)        │   Application Core   │      (driven)
                    │   (the "hexagon")    │
   CLI Adapter  ───►│                     │◄─── Email Adapter
   (driving)        └─────────────────────┘      (driven)
```
- A **Port** is an interface the application core defines, describing a capability it needs (`IOrderRepository`) or exposes (`IOrderService`).
- An **Adapter** is a concrete implementation of a Port, translating between the outside world and the core (a `SqlOrderRepository` adapts a Port to a real database; an HTTP controller adapts an incoming request to a call into the core).
- **Driving adapters** (HTTP, CLI) initiate calls *into* the core; **driven adapters** (database, email) are called *by* the core.

**Clean Architecture's vocabulary for the same structural idea:**
```text
Domain/Application layers  <-->  the "hexagon" / application core
Infrastructure layer        <-->  driven adapters (database, external services)
Presentation layer           <-->  driving adapters (HTTP controllers, CLI)
Interfaces defined in Application layer (IOrderRepository)  <-->  Ports
```

**Why they're considered essentially the same idea:** both insist that the core business logic depend only on abstractions it defines itself, with all technology-specific detail (databases, web frameworks, message queues) living in outer, swappable implementations — Clean Architecture describes this with **concentric circles and a Dependency Rule**; Hexagonal describes the identical structural constraint with a **hexagon and Ports/Adapters** terminology. A codebase following either faithfully looks structurally almost identical to one following the other.

**Common Pitfall:** treating "Clean Architecture" and "Hexagonal Architecture" as meaningfully different methodologies requiring a team to pick one "correctly" — in practice, teams and articles often mix the vocabulary freely (calling an interface both a "Port" and simply "an Application layer interface" in the same codebase), and the actual architectural discipline (dependencies point inward, technology detail stays at the edges) matters far more than which naming convention is used to describe it.

---
