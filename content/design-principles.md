# Design Principles — Q&A

## Beginner — Question 1

**Q1: What are the SOLID design principles?**

SOLID is an acronym for five design principles intended to make software designs more understandable, flexible, and maintainable. They are fundamental to object-oriented design:

1. **S**ingle Responsibility Principle (SRP): A class should have one, and only one, reason to change. It should only have one job or responsibility.
2. **O**pen/Closed Principle (OCP): Software entities (classes, modules, functions, etc.) should be open for extension, but closed for modification.
3. **L**iskov Substitution Principle (LSP): Subtypes must be substitutable for their base types without altering the correctness of the program.
4. **I**nterface Segregation Principle (ISP): Clients should not be forced to depend upon interfaces that they do not use. Many client-specific interfaces are better than one general-purpose interface.
5. **D**ependency Inversion Principle (DIP): High-level modules should not depend on low-level modules. Both should depend on abstractions. Abstractions should not depend on details. Details should depend on abstractions.

#### Follow-up: Can you give a simple example of violating the Single Responsibility Principle?
If you have a `UserService` class that handles both saving a user to the database *and* sending a welcome email, it violates SRP. It has two reasons to change: if the database schema changes, or if the email provider changes. These responsibilities should be split into `UserRepository` and `EmailService`.

---

## Beginner — Question 2

**Q2: What do the acronyms DRY, YAGNI, and KISS stand for?**

These are pragmatic development principles:

- **DRY (Don't Repeat Yourself):** Every piece of knowledge must have a single, unambiguous, authoritative representation within a system. If you find yourself copying and pasting code, you are violating DRY. It should be extracted into a shared method or class.
- **YAGNI (You Aren't Gonna Need It):** A principle from Extreme Programming (XP) stating that a programmer should not add functionality until deemed necessary. Don't build abstract, flexible architectures for future requirements that might never happen.
- **KISS (Keep It Simple, Stupid):** Systems work best if they are kept simple rather than made complicated. Simplicity should be a key goal in design, and unnecessary complexity should be avoided.

**Trade-offs:** Applying DRY too early can sometimes violate KISS, leading to overly abstracted and hard-to-read code. It's often better to write code twice (WET - Write Everything Twice) and only extract it when you need to write it a third time (the "Rule of Three").

---

## Intermediate — Question 1

**Q1: Explain the Open/Closed Principle (OCP) with a C# example.**

The Open/Closed Principle states that a class should be open for extension (we can add new features) but closed for modification (we shouldn't have to rewrite existing code to add those features).

**The Mechanism:**
This is almost exclusively achieved using **Polymorphism** and **Dependency Injection**. Instead of using `switch` statements or `if-else` chains that must be modified every time a new type is added, you depend on abstractions.

**Violating OCP:**
```csharp
public class DiscountCalculator {
    public decimal Calculate(decimal price, string customerType) {
        if (customerType == "Regular") return price;
        if (customerType == "Premium") return price * 0.9m;
        // If we add "VIP", we MUST modify this class.
        return price;
    }
}
```

**Following OCP:**
```csharp
public interface IDiscountStrategy {
    decimal ApplyDiscount(decimal price);
}

public class PremiumDiscount : IDiscountStrategy {
    public decimal ApplyDiscount(decimal price) => price * 0.9m;
}

public class DiscountCalculator {
    public decimal Calculate(decimal price, IDiscountStrategy strategy) {
        return strategy.ApplyDiscount(price);
    }
}
```
Now, if we need a VIP discount, we create a new class `VipDiscount : IDiscountStrategy`. We *extended* the functionality without *modifying* the `DiscountCalculator`.

#### Follow-up: What are the practical limits of OCP?
It is impossible to make a class closed to *every* kind of change. You have to anticipate what kind of changes are likely and abstract those. Over-engineering OCP for changes that never happen violates YAGNI.

---

## Intermediate — Question 2

**Q2: Explain "Composition over Inheritance". Why is it preferred in modern design?**

"Composition over Inheritance" dictates that classes should achieve polymorphic behavior and code reuse by containing instances of other classes (composition) rather than inheriting from a base class.

**Why Inheritance is problematic (The Fragile Base Class Problem):**
- Inheritance creates a tight coupling. The derived class is intimately tied to the base class's implementation.
- You can only inherit from one class in C#.
- Modifying a base class can inadvertently break derived classes.
- It often leads to deep, rigid inheritance hierarchies (e.g., `Bird` inherits from `Animal`, `Penguin` inherits from `Bird`, but `Penguin` can't fly, so it throws `NotSupportedException` on `Fly()`, violating LSP).

**The Composition Approach:**
Instead of saying a `Car` *is a* `Vehicle`, you define what a car *has*.
```csharp
// Inheritance (Rigid)
public class DataStore {
    public virtual void Save() { /* DB logic */ }
}
public class CloudDataStore : DataStore {
    public override void Save() { /* Cloud logic */ }
}

// Composition (Flexible)
public interface ISaveBehavior {
    void Save();
}
public class DataStore {
    private readonly ISaveBehavior _saveBehavior;
    public DataStore(ISaveBehavior saveBehavior) {
        _saveBehavior = saveBehavior;
    }
    public void Save() => _saveBehavior.Save();
}
```
With composition, behaviors can be swapped at runtime, it's easier to mock in unit tests, and classes stay focused on a single responsibility.

---

## Advanced — Question 1

**Q1: How does the Dependency Inversion Principle (DIP) relate to Dependency Injection (DI) and Inversion of Control (IoC)?**

While they sound similar and are often used together, they represent different levels of architecture:

1. **Dependency Inversion Principle (DIP):** The 'D' in SOLID. It is a **design principle** stating that high-level policies should not depend on low-level implementation details; both should depend on abstractions (interfaces).
2. **Inversion of Control (IoC):** A **software architecture pattern** where the flow of control is inverted. Instead of your custom code calling a library, a framework calls your custom code. 
3. **Dependency Injection (DI):** A **technique** (or design pattern) used to implement IoC and DIP. Instead of a class creating its own dependencies using `new`, the dependencies are passed in (injected) from the outside, usually via the constructor.

**The Mechanism:**
If `OrderService` (high-level) creates a `SqlDatabase` (low-level) using `new SqlDatabase()`, it violates DIP because it depends on a concrete detail.
By creating an `IDatabase` interface, both `OrderService` and `SqlDatabase` now depend on the abstraction (DIP).
By passing `IDatabase` into the `OrderService` constructor, we use DI.
When ASP.NET Core's runtime automatically provides the right `SqlDatabase` to the `OrderService` constructor at runtime, it is utilizing an IoC Container.

**Common Pitfalls:**
- **Service Locator Anti-Pattern:** Passing the entire IoC container `IServiceProvider` into a class and asking it to resolve dependencies. This hides the class's real dependencies and makes unit testing difficult, violating the explicit dependency principle.

#### Follow-up: Does using an IoC Container guarantee you are following DIP?
No. You can inject a concrete `SqlDatabase` class directly into your `OrderService` using DI. You are using DI and IoC, but you are *violating* DIP because the high-level module still depends directly on a low-level concrete class, not an abstraction.

---

## Scenario — Question 1

**Q1: You inherit a massive `OrderProcessor` class (2,000 lines) that validates orders, calculates taxes, applies discounts, connects to a payment gateway, and saves to the database. How do you refactor it using SOLID?**

This is a classic "God Object" that brutally violates the **Single Responsibility Principle (SRP)**. It is impossible to unit test and a nightmare to maintain.

**Step 1: Identify the Responsibilities**
We need to extract the distinct responsibilities into their own abstractions (Interfaces).
- `IOrderValidator`
- `ITaxCalculator`
- `IDiscountStrategy` (Applying the Strategy Pattern for OCP)
- `IPaymentGateway`
- `IOrderRepository`

**Step 2: Dependency Injection (DIP)**
We rewrite the `OrderProcessor` so it has zero concrete implementations. It will take the interfaces via its constructor.
```csharp
public class OrderProcessor {
    private readonly IOrderValidator _validator;
    private readonly ITaxCalculator _taxCalc;
    // ...
    
    public OrderProcessor(IOrderValidator validator, ITaxCalculator taxCalc /* ... */) {
        _validator = validator;
        _taxCalc = taxCalc;
    }
}
```

**Step 3: The Facade Pattern**
The `OrderProcessor` is no longer doing the heavy lifting. It acts as an orchestrator (or Facade), passing data between the specialized services.
```csharp
public async Task ProcessAsync(Order order) {
    if (!_validator.IsValid(order)) throw new Exception();
    order.Tax = _taxCalc.Calculate(order);
    await _paymentGateway.ChargeAsync(order);
    await _repository.SaveAsync(order);
}
```

**Result:**
The 2,000-line God Object becomes a 50-line orchestrator. We can easily unit test the tax calculator in isolation. If we need a new payment gateway (Stripe instead of PayPal), we create a new class implementing `IPaymentGateway` without touching the `OrderProcessor` (honoring OCP).

---

## Scenario — Question 2

**Q2: You notice a colleague has created a master `IRepository<T>` interface that forces every class implementing it to define `GetAll()`, `GetById()`, `Save()`, `Delete()`, and `BulkInsert()`. The `AuditLogRepository` implements this interface, but because you can never delete or bulk insert audit logs, those methods just throw `NotImplementedException`. What principle is violated, and how do you fix it?**

This is a classic violation of the **Interface Segregation Principle (ISP)**. 

**The Flaw:**
ISP states that no client should be forced to depend on methods it does not use. By creating a massive, "fat" interface, you force implementing classes to carry around dead code or throw exceptions, which can lead to runtime crashes if other parts of the system assume the interface methods actually work (which also violates the Liskov Substitution Principle).

**The Fix:**
Break the fat interface down into highly cohesive, role-specific interfaces.

1. **Segregate the Interfaces:**
   - `IReadOnlyRepository<T>` containing `GetAll()` and `GetById()`.
   - `IWriteRepository<T>` containing `Save()` and `Delete()`.
   - `IBulkOperations<T>` containing `BulkInsert()`.

2. **Implement Selectively:**
   - Your `UserRepository` can implement all three interfaces.
   - Your `AuditLogRepository` will *only* implement `IReadOnlyRepository` and perhaps a separate `IAppendOnlyRepository`. It never implements the delete or bulk interfaces, so it never has to throw a `NotImplementedException`.

By segregating the interfaces, you ensure that the contract perfectly matches the capabilities of the class, resulting in safer, more self-documenting code.

---

## Scenario — Question 3

**Q3: A developer writes a `ReportGenerator` class that connects directly to SQL Server using `SqlConnection`, executes a query, and then uses the `iTextSharp` library to output a PDF to disk. Which SOLID principles are violated, and how do you redesign this class?**

This class is a classic example of tight coupling and violates two major SOLID principles: the **Single Responsibility Principle (SRP)** and the **Dependency Inversion Principle (DIP)**.

**The Flaws:**
1. **SRP Violation:** The class has three distinct responsibilities (and three reasons to change):
   - Data access (connecting to SQL).
   - Business logic (generating the report data).
   - Output formatting (creating a PDF).
2. **DIP Violation:** The class depends directly on low-level concrete implementations (`SqlConnection`, `iTextSharp`), making it impossible to unit test the business logic in isolation.

**The Redesign:**
We must separate these concerns and use Dependency Injection.

1. **Extract Data Access:** Create an `IReportDataRepository` interface. Implement it in a `SqlReportDataRepository` class.
2. **Extract Formatting:** Create an `IReportFormatter` interface with a `Format(ReportData data)` method. Implement it in a `PdfReportFormatter` class.
3. **Refactor `ReportGenerator` (The Coordinator):**
```csharp
public class ReportGenerator {
    private readonly IReportDataRepository _repository;
    private readonly IReportFormatter _formatter;

    // Depend on abstractions, injected via constructor (DIP)
    public ReportGenerator(IReportDataRepository repository, IReportFormatter formatter) {
        _repository = repository;
        _formatter = formatter;
    }

    public void Generate() {
        var data = _repository.GetData();
        var document = _formatter.Format(data);
        // Save document...
    }
}
```

**The Result:**
The `ReportGenerator` now only has one responsibility: orchestrating the generation process. If you decide to switch from SQL to MongoDB, or from PDF to Excel, you simply create new classes implementing the interfaces and inject them. The core `ReportGenerator` logic remains completely untouched.

---

## Scenario — Question 4

**Q4: Your team is building a microservice. A developer creates a `ConfigurationManager` static class that reads the `appsettings.json` file. Throughout the entire codebase, hundreds of classes call `ConfigurationManager.GetConnectionString()` directly. When the team decides to migrate to Azure Key Vault, they realize they have to modify 300 different files. Which core design principle was violated?**

This is a severe violation of the **Dependency Inversion Principle (DIP)**, specifically relying on **Hidden Dependencies** rather than explicit ones.

**The Flaw:**
When a class calls a static method like `ConfigurationManager.GetConnectionString()`, it tightly couples itself to that specific static implementation. The dependency is "hidden" because it doesn't appear in the class's constructor. The client using the class has no idea it needs a configuration file to run. 

**The Fix:**
Dependencies should be explicit and inverted. High-level modules should depend on abstractions (interfaces), and those abstractions should be injected.

1. **Extract an Interface:** In .NET, this is already done for you: `IConfiguration` or the `IOptions<T>` pattern.
2. **Constructor Injection:** Every class that needs configuration should demand it in its constructor.
   ```csharp
   public class DatabaseService {
       private readonly string _connectionString;
       
       // Explicit dependency!
       public DatabaseService(IOptions<DatabaseSettings> options) {
           _connectionString = options.Value.ConnectionString;
       }
   }
   ```

**The Result:**
If the application switches to Azure Key Vault, you only change the configuration provider setup in `Program.cs`. None of the 300 classes need to be touched, because they all rely on the abstract `IOptions<T>`, completely oblivious to where the actual data came from.

---

## Beginner — Question 3

**Q3: What is "Tell, Don't Ask" as a design principle?**

"Tell, Don't Ask" says: instead of *asking* an object for its internal data and then making decisions about it from the outside, you should *tell* the object what you want done and let it use its own data to do it.

**Asking (violates the principle):**
```csharp
if (account.Balance >= amount) {
    account.Balance -= amount; // external code manipulates internal state directly
}
```
This exposes `Balance` as public, mutable state, and duplicates the "can I afford this" logic anywhere someone withdraws money — every call site has to remember the rule.

**Telling (follows the principle):**
```csharp
public class Account {
    private decimal _balance;
    public bool TryWithdraw(decimal amount) {
        if (amount > _balance) return false;
        _balance -= amount;
        return true;
    }
}

account.TryWithdraw(amount); // Account owns its own invariant
```

**Why it matters:** it keeps behavior next to the data it operates on (proper encapsulation), so the invariant ("balance can't go negative") is enforced in exactly one place instead of trusted to every caller. It's a more concrete, actionable restatement of encapsulation — a code-review heuristic for "did we just leak a decision that belongs inside this object?"

**Common Pitfall:** over-applying it to simple, stateless data-holder types (DTOs, view models) where there's no real behavior to "tell" — those are meant to be asked, and wrapping every getter in a method just adds ceremony without benefit.

---

## Intermediate — Question 3

**Q3: What is the Law of Demeter ("Principle of Least Knowledge"), and what does a violation look like?**

The Law of Demeter says a method should only talk to its "immediate friends" — its own fields, its parameters, objects it creates, and objects held by those — not to objects obtained *through* another object (no "reaching through" a chain of getters).

**A violation — the classic "train wreck":**
```csharp
// Violates LoD: reaches through Customer -> Wallet -> Cash
decimal cash = order.Customer.Wallet.GetCash();
if (cash >= order.Total) order.Customer.Wallet.Withdraw(order.Total);
```
This method now depends on the *entire chain* of internal structure: `Order` has a `Customer`, which has a `Wallet`, which has cash. If any link in that chain changes shape, this code breaks — even though this method never needed to know a `Wallet` exists.

**Following LoD:**
```csharp
// Order only talks to its immediate collaborator: Customer
if (order.Customer.CanAfford(order.Total)) {
    order.Customer.Pay(order.Total);
}
```
`Customer` now hides how payment actually happens internally (maybe via a `Wallet`, maybe a linked card) — callers don't need to know or care.

**Why it matters:** each "reach-through" is a hidden coupling to a structure that has nothing to do with the calling code's actual job. Changing internal structure anywhere along a long chain ripples out to every caller that "knew" about it.

**Common Pitfall:** LoD is about avoiding chains that traverse *unrelated* object structure — it does **not** forbid fluent APIs or builder chains (`query.Where(...).OrderBy(...).ToList()`), because each call there returns the *same conceptual object* (or an interface the caller was always meant to know about), not a walk through unrelated internal collaborators.

---

## Advanced — Question 2

**Q2: The Open/Closed Principle and the Strategy pattern look almost identical in practice — how do they actually relate?**

They operate at different levels: OCP is a *principle* (a goal — "don't require modification to add behavior"), while Strategy is one specific *pattern* (a mechanism) commonly used to achieve that goal. Not every OCP-compliant design uses Strategy, and Strategy alone doesn't guarantee OCP is upheld correctly.

**How Strategy achieves OCP:**
```csharp
public interface IDiscountStrategy { decimal Apply(decimal price); }
public class PremiumDiscount : IDiscountStrategy { public decimal Apply(decimal p) => p * 0.9m; }

public class Checkout {
    public decimal Total(decimal price, IDiscountStrategy discount) => discount.Apply(price);
}
```
Adding a new discount type means writing a new `IDiscountStrategy` implementation — `Checkout` is never touched. That's OCP, implemented via Strategy.

**Where they diverge:**
- OCP can also be achieved through other mechanisms entirely: event/observer hooks, template method (fixed algorithm skeleton with overridable steps), plugin/middleware pipelines, or simple composition — Strategy is just the most common textbook example because it maps so cleanly onto "swap an algorithm."
- Conversely, you can use the Strategy pattern **without actually achieving OCP** — if the code that *selects* which strategy to instantiate is a giant `switch` statement that must be edited for every new strategy, you've just moved the OCP violation from the algorithm itself into the strategy-selection/factory code. True OCP requires the selection mechanism (often a DI container or a registration-based factory) to also be extensible without modification.

**Common Pitfall:** believing "I used an interface and Strategy, therefore this code is OCP-compliant" without checking whether something else (a factory, a switch, a hardcoded list) still needs editing every time a new variant is added.

---

## Beginner — Question 4

**Q4: What is YAGNI ("You Aren't Gonna Need It"), and how does it interact with the Open/Closed Principle's advice to design for extension?**

YAGNI says: don't build functionality, abstraction layers, or configuration options for a requirement you don't have yet, based on a guess that you *might* need it later. It sits in apparent tension with OCP's "design for extension" — but the two are actually compatible once you separate *designing for known variation* from *speculating about unknown future variation*.

**Speculative, YAGNI-violating "flexibility":**
```csharp
public interface IDiscountStrategy { decimal Apply(decimal price); }
public class StandardDiscount : IDiscountStrategy { public decimal Apply(decimal p) => p; }
// Only ONE discount type exists today, but a full Strategy pattern was built "in case we need more"
```
If there's only ever been one discount type, and no concrete plan for a second, this interface and its indirection is pure speculative complexity — it adds a layer future readers must understand, for a variation that may never materialize.

**OCP applied to a requirement that's actually, concretely happening:**
```csharp
// The business has confirmed: Premium and VIP discounts launch next sprint
public interface IDiscountStrategy { decimal Apply(decimal price); }
public class PremiumDiscount : IDiscountStrategy { ... }
public class VipDiscount : IDiscountStrategy { ... }
```
Here, the abstraction earns its keep immediately — it's not speculation, it's modeling a real, current requirement that already has more than one concrete case.

**The reconciling principle:** YAGNI says don't build for a *guessed* future. OCP says *when a real variation point already exists* (two or more concrete cases today, or a near-certain, committed one), design that specific point so adding a third case doesn't require modifying existing code. Neither principle argues for abstracting everything defensively; they agree that abstractions should be justified by concrete, present evidence of variation, not speculation.

**Common Pitfall:** invoking YAGNI to justify a rigid, un-extensible design even when a second concrete variant already exists in the current requirements — YAGNI is about not building for imagined *future* needs, not an excuse to skip reasonable design for needs that are already real and known today.

---

## Intermediate — Question 4

**Q4: What is the Interface Segregation Principle (ISP), and how is it different from just "keeping interfaces small"?**

ISP states that clients should not be forced to depend on methods they don't use — but the precise idea is about *what each specific client actually needs*, not merely an arbitrary rule that "interfaces should have few methods."

**A "small" interface that still violates ISP:**
```csharp
public interface IWorker
{
    void Work();
    void Eat(); // fine for a HumanWorker, meaningless for a RobotWorker
}

public class RobotWorker : IWorker
{
    public void Work() { /* ... */ }
    public void Eat() => throw new NotSupportedException(); // forced to implement something irrelevant
}
```
This interface is small (two methods) but still violates ISP, because `RobotWorker` is forced to depend on (and provide some implementation for) a method that's meaningless for it — smallness alone doesn't guarantee every implementer actually needs every member.

**Segregating by actual client need, not just splitting arbitrarily:**
```csharp
public interface IWorkable { void Work(); }
public interface IFeedable { void Eat(); }

public class HumanWorker : IWorkable, IFeedable { ... }
public class RobotWorker : IWorkable { ... } // only implements what actually applies
```
Now `RobotWorker` depends only on `IWorkable` — it's never forced to provide a nonsensical `Eat()` implementation, because the interface segregation was driven by *which capabilities different clients genuinely need*, not by an arbitrary method-count target.

**How this differs from "just keep interfaces small":** you could split `IWorker` into ten tiny one-method interfaces and still violate ISP's actual intent if a given implementer is forced to implement several of those ten it doesn't need together as a bundle — the goal is that each interface represents one cohesive **role** a client either needs entirely or not at all, not an arbitrary size limit.

**Common Pitfall:** over-segregating single-method interfaces so aggressively that a class implementing five unrelated tiny interfaces creates its own kind of confusion (no clear sense of the class's cohesive "role") — ISP is about matching interface boundaries to real client needs, not minimizing method count as a goal in itself.

---

## Advanced — Question 3

**Q3: What is the Robustness Principle ("Postel's Law" — "be conservative in what you send, liberal in what you accept"), and how does it apply to designing APIs and message contracts?**

Postel's Law, originally coined for network protocol design, says a system should be strict and predictable about what it sends out, but tolerant and forgiving about what it accepts from others — applied to API/message design, it's a key technique for evolving contracts without constant breaking changes.

**"Liberal in what you accept" — tolerant reading of incoming data:**
```csharp
public class OrderCreatedEvent
{
    public int OrderId { get; set; }
    public decimal Total { get; set; }
    // A NEW field a producer might add later
    public string? PromoCode { get; set; }
}

// A consumer using System.Text.Json ignores unrecognized fields by default --
// if the producer adds yet ANOTHER new field tomorrow, this consumer doesn't break
var order = JsonSerializer.Deserialize<OrderCreatedEvent>(json);
```
A consumer that only reads the specific fields it cares about (rather than, say, strictly validating that the payload contains *exactly* an expected set of fields and rejecting anything extra) tolerates a producer adding new fields over time without a coordinated deployment.

**"Conservative in what you send" — don't emit more variability than necessary:**
```csharp
// Sending a WELL-DEFINED, minimal, explicit contract -- not "whatever fields happen to exist internally"
var event = new OrderCreatedEvent { OrderId = order.Id, Total = order.Total }; // explicit, deliberate shape
```
A producer shouldn't serialize its entire internal domain object (which might contain incidental fields that change on any internal refactor) — it should emit a deliberately-designed, minimal contract, precisely because consumers are relying on that shape staying predictable.

**Why this matters for distributed systems specifically:** this is the same underlying idea that lets GraphQL and additive-only REST evolution avoid constant version bumps (from the GraphQL/REST versioning discussion) — systems that are strict senders but tolerant receivers can evolve independently without every change requiring synchronized deployment across every service.

**Common Pitfall:** applying "liberal in what you accept" so loosely that a consumer silently accepts and processes malformed or semantically-invalid data rather than genuinely-extra-but-valid fields — tolerance should apply to *unrecognized additions*, not to actually invalid or missing required data; being liberal about garbage input just relocates bugs downstream instead of catching them at the boundary.

---
