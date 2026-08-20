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

## Beginner — Question 5

**Q5: What is the "Principle of Least Astonishment," and how does it differ from the other named principles (SOLID, DRY, YAGNI) in what kind of guidance it gives?**

Most named principles give structural guidance (how to split classes, when to abstract). The Principle of Least Astonishment gives **behavioral** guidance: a component should behave the way a reasonable user of it would expect, based on its name, its type signature, and common conventions — surprising behavior, even if technically documented, is a design smell.

**A method that violates it — surprising behavior hidden behind an innocuous-looking name:**
```csharp
public List<Order> GetOrders()
{
    _lastAccessedTimestamp = DateTime.UtcNow; // side effect a caller wouldn't expect from a "Get"
    _db.Orders.Where(o => o.IsExpired).ToList().ForEach(o => _db.Orders.Remove(o)); // DELETES rows!
    return _db.Orders.ToList();
}
```
Nothing about the name `GetOrders()` suggests it also deletes expired orders as a side effect — a caller reasonably expecting a pure "read" operation (matching the strong convention that a `Get`-prefixed method just retrieves data) gets an unexpected, surprising mutation instead.

**The same operation, honoring the principle:**
```csharp
public List<Order> GetOrders() => _db.Orders.ToList(); // does exactly what the name promises

public void PurgeExpiredOrders() // a SEPARATE, honestly-named operation for the side effect
{
    _db.Orders.Where(o => o.IsExpired).ToList().ForEach(o => _db.Orders.Remove(o));
}
```

**How this differs from the structural principles:** SOLID/DRY/YAGNI mostly ask "is this class/module structured well?" Least Astonishment asks a more human question: "if a new developer only reads this method's name and signature, would they correctly predict what it does?" It's less formally checkable than SOLID's rules, but arguably closer to what actually causes real-world bugs — a caller trusting a name that lies about its actual behavior.

**Common Pitfall:** justifying a surprising side effect as "it's documented in the XML doc comment" — comments are easy to skip, and a name that actively misleads (even with accurate documentation elsewhere) sets a trap for the many developers who read call sites without opening every method's full documentation first.

---

## Intermediate — Question 5

**Q5: What is Command-Query Separation (CQS), and how does it relate to (but differ from) CQRS?**

CQS is a principle at the **method** level: every method should either be a **Command** (performs an action, changes state, returns nothing) or a **Query** (returns data, changes nothing) — never both. CQRS (Command Query Responsibility Segregation, covered earlier at the architectural level) applies a similar idea but at the scale of an entire **system's** read/write models, not a single method's signature.

**A method violating CQS — mixing a query and a command:**
```csharp
public bool TryWithdraw(decimal amount) // returns a value (query-like) AND mutates state (command-like)
{
    if (amount > _balance) return false;
    _balance -= amount; // side effect
    return true;         // also returns information
}
```
This isn't necessarily *wrong* — `TryParse`-style methods across .NET's own BCL follow exactly this pattern deliberately — but strict CQS would say this conflates two responsibilities that should ideally be separate.

**Following CQS strictly — separate methods for the query and the command:**
```csharp
public bool CanWithdraw(decimal amount) => amount <= _balance; // QUERY -- no side effect
public void Withdraw(decimal amount) { _balance -= amount; }    // COMMAND -- no return value
```

**The relationship to CQRS:** CQRS scales the same core idea (don't mix reading and writing) up from a single method to an entire application's architecture — separate read models and write models, potentially separate databases entirely. CQS is a micro-level coding discipline; CQRS is a macro-level architectural pattern. A codebase can follow CQS at the method level without ever needing full CQRS at the architectural level, and vice versa — they're related by philosophy, not a strict dependency on one another.

**Why strict CQS isn't always practical:** the `TryWithdraw`-style pattern (query and command combined) exists specifically to avoid a **race condition** between separately calling `CanWithdraw()` then `Withdraw()` — if another thread withdraws funds between those two separate calls, the balance could go negative despite the check having passed. Sometimes combining a check-and-act into one atomic operation is a deliberate, correct trade-off against strict CQS.

**Common Pitfall:** applying CQS so rigidly that it forces a genuinely atomic check-and-act operation into two separate calls, reintroducing a race condition that a combined method would have avoided — CQS is a strong default, not an absolute rule that overrides correctness in concurrent scenarios.

---

## Advanced — Question 4

**Q4: What is the difference between "Accidental Complexity" and "Essential Complexity" (a distinction from Fred Brooks' "No Silver Bullet"), and how does it help decide where refactoring effort is actually worth spending?**

Essential Complexity is complexity inherent to the *problem itself* — it would exist no matter how well the code is written, because the underlying business domain genuinely is that complicated. Accidental Complexity is complexity introduced by *how the solution was built* — poor abstractions, unnecessary layers, tangled dependencies — and is, in principle, entirely fixable through better engineering.

**Essential Complexity — inherent to the problem domain itself:**
```text
Calculating tax owed across US states, each with different rates, thresholds,
exemptions, and filing rules that change yearly by legislative action.
```
No amount of clever refactoring eliminates this complexity — the *business rules themselves* are genuinely this intricate; the best code can do is represent that inherent complexity as clearly and manageably as possible, not make it disappear.

**Accidental Complexity — an artifact of how the code happens to be built:**
```csharp
// Tax calculation logic ACCIDENTALLY tangled with database access, logging,
// email notifications, and UI formatting all in one 800-line method
public string CalculateAndFormatAndEmailAndLogTaxOwed(int userId) { /* ... */ }
```
None of this tangling is inherent to "how tax is calculated" — it's purely a consequence of how the code was organized, and (unlike the tax rules themselves) is fully addressable through better structure (Single Responsibility Principle, layering) without changing what the system actually needs to accomplish.

**Why this distinction matters for prioritizing refactoring effort:** a team frustrated by a genuinely complex tax-calculation module should ask "is this complexity essential (the domain is just this complicated) or accidental (we tangled unrelated concerns together)?" — refactoring can meaningfully reduce the latter, but attempting to refactor away *essential* complexity is often just relocating it or hiding it, not actually simplifying the underlying problem the code has to solve.

**Common Pitfall:** treating all complexity as accidental and therefore "fixable with enough refactoring effort" — some domains (tax law, complex pricing/discounting rules, regulatory compliance logic) are genuinely, irreducibly complicated, and expecting a clean, simple abstraction to fully capture that complexity without loss is often unrealistic; the realistic goal for essential complexity is making it as *manageable and clearly expressed* as possible, not making it vanish.

---

## Beginner — Question 6

**Q6: What is "Convention over Configuration," and how does it trade explicitness for reduced boilerplate — and when does that trade-off stop being worth it?**

Convention over Configuration means a framework assumes sensible defaults based on naming/structure patterns, requiring explicit configuration only when you want to deviate from those defaults — ASP.NET Core MVC's routing (`ProductsController` automatically maps to `/products`) is a direct example already covered elsewhere.

**Configuration-heavy — every single detail must be explicitly declared:**
```xml
<!-- A hypothetical fully-explicit configuration approach -->
<controller name="Products" route="/products">
  <action name="GetAll" method="GET" route="/products" />
  <action name="GetById" method="GET" route="/products/{id}" />
</controller>
```
Nothing is assumed — every route, every mapping must be spelled out explicitly, which is verbose but leaves zero ambiguity about what will happen.

**Convention over Configuration — sensible defaults inferred from naming/structure:**
```csharp
public class ProductsController : ControllerBase // convention: maps to /products automatically
{
    [HttpGet] public IActionResult GetAll() { }       // convention: GET /products
    [HttpGet("{id}")] public IActionResult GetById(int id) { } // convention: GET /products/{id}
}
```
Far less boilerplate — the framework infers routing from naming patterns rather than requiring every mapping to be spelled out.

**Why the trade-off isn't unconditionally good:** conventions are implicit — a developer unfamiliar with the specific framework's conventions has to *learn* what "ProductsController automatically becomes /products" means, rather than being able to read it directly from explicit configuration; conventions work great when the defaults genuinely match what most people want most of the time, and become a source of confusion/debugging difficulty when a project's actual needs deviate significantly from the framework's assumed defaults, requiring increasingly awkward "override the convention" configuration to compensate.

**Common Pitfall:** fighting a framework's strong conventions with extensive configuration overrides because a project's structure doesn't naturally fit them — at that point, the convention-over-configuration approach is providing negative value (more total code/complexity than an explicitly-configured approach would have needed), and it's worth reconsidering whether the chosen framework/convention actually fits the problem, rather than continuously overriding its defaults.

---

## Intermediate — Question 6

**Q6: What is the "Law of Least Privilege" (Principle of Least Privilege) applied specifically to code/software design, not just user/system permissions?**

Most commonly discussed in a security context (a user account should only have the permissions it genuinely needs), the same principle applies directly to code design: a class, method, or module should only be granted access to exactly the capabilities/data it genuinely needs to do its job — nothing broader "just in case."

**A class granted broader access than it actually needs:**
```csharp
public class OrderConfirmationEmailSender
{
    private readonly AppDbContext _db; // the ENTIRE database context -- full read/write access to EVERYTHING
    public void SendConfirmation(int orderId)
    {
        var order = _db.Orders.Find(orderId); // only ACTUALLY needs to read one Order
    }
}
```
This class only genuinely needs to *read* one specific `Order` — but injecting the full `AppDbContext` grants it silent, unused access to write to *any* table, and to read every other table in the entire schema, none of which its actual job requires.

**Granting only the minimum access the class's actual responsibility needs:**
```csharp
public class OrderConfirmationEmailSender
{
    private readonly IOrderReader _orderReader; // a narrow interface, exposing ONLY read access to Orders
    public void SendConfirmation(int orderId)
    {
        var order = _orderReader.GetById(orderId); // genuinely can't do anything else, even if compromised
    }
}
```

**Why this matters beyond "just tidiness":** if this class later has a bug (or is compromised via a dependency vulnerability), the narrower interface strictly limits the *blast radius* of what that bug/compromise can actually do — with the full `AppDbContext` injected, a bug here could accidentally (or maliciously) write to or read from tables that have nothing to do with sending an email confirmation; with `IOrderReader`, that's structurally impossible regardless of what goes wrong inside this specific class.

**Common Pitfall:** injecting broad, general-purpose dependencies (a full `DbContext`, a general `IServiceProvider`) into classes "for convenience," reasoning "it's easier than defining a narrow interface for every single class" — this convenience comes at the direct cost of the Least Privilege guarantee, expanding every such class's potential blast radius unnecessarily, echoing the same reasoning behind the Interface Segregation Principle covered earlier, applied specifically through a security/blast-radius lens rather than a pure interface-design one.

---

## Advanced — Question 5

**Q5: What is "Coupling" versus "Cohesion," and why is the combination "low coupling, high cohesion" considered the single most important structural goal across nearly every other named design principle?**

Cohesion measures how strongly the responsibilities *within* one module/class belong together. Coupling measures how much one module/class depends on the internal details of another. Nearly every principle covered so far (SRP, ISP, DIP, Composition over Inheritance) can be understood as a specific technique for pushing toward the same underlying goal: **high cohesion, low coupling**.

**Low cohesion — a class bundling unrelated responsibilities (the earlier God Object / SRP violation, revisited through this lens):**
```csharp
public class OrderManager // handles tax calculation, PDF generation, AND email sending -- three unrelated jobs
{
    public decimal CalculateTax(Order o) { ... }
    public byte[] GeneratePdf(Order o) { ... }
    public void SendEmail(Order o) { ... }
}
```
Tax calculation, PDF generation, and email sending have nothing meaningfully to do with each other — bundling them into one class is low cohesion, exactly what SRP (covered earlier) argues against.

**High coupling — a class reaching deep into another's internal implementation details (the earlier Law of Demeter violation, revisited through this lens):**
```csharp
decimal cash = order.Customer.Wallet.GetCash(); // reaches through THREE layers of another object's internals
```
This code is tightly coupled not just to `Customer`, but to the specific fact that `Customer` happens to have a `Wallet` with a `GetCash()` method — any internal restructuring of `Customer` ripples directly into this unrelated code.

**Why "low coupling, high cohesion" is the unifying goal beneath the other named principles:** SRP pushes toward high cohesion (each class does ONE cohesive thing). DIP and the Law of Demeter push toward low coupling (depend on abstractions/immediate collaborators, not concrete internals of distant objects). ISP pushes toward low coupling (don't force a dependency on methods you don't use). Nearly every principle covered throughout this topic can be traced back to advancing one or both of these two underlying properties — they're less a checklist of unrelated rules and more different specific techniques for achieving the same two structural goals.

**Common Pitfall:** treating each named principle (SRP, DIP, ISP, Law of Demeter, ...) as an independent rule to check off a list, without recognizing they're all pointing toward the same underlying "low coupling, high cohesion" goal — understanding the unifying goal makes it easier to judge *novel* situations these specific named principles don't directly address, by asking the more fundamental question directly: "does this design increase or decrease coupling/cohesion?"

---

## Beginner — Question 7

**Q7: What is "Fail Fast" as a design principle, and how does detecting and reporting an error at the EARLIEST possible point differ from — and generally beat — letting a bad value silently propagate deeper into a system before finally causing a visible failure?**

Fail Fast says a system should detect an invalid state and raise an error **immediately**, at the point where the problem first becomes detectable — rather than allowing invalid data to silently continue flowing through the system, only surfacing as a confusing failure much later, often far away from the actual root cause.

**Without Fail Fast — an invalid value silently propagates, failing much later in a confusing, disconnected way:**
```csharp
public void ProcessOrder(Order order)
{
    var discount = CalculateDiscount(order); // order.CustomerId happens to be 0 (invalid) -- NOT checked here
    SaveToDatabase(order, discount); // fails HERE instead, with a cryptic foreign-key constraint violation,
                                       // FAR from where the actually-invalid CustomerId originated
}
```
The actual root cause (an invalid `CustomerId`) might have originated several method calls, files, or even services earlier — but the visible failure occurs deep inside a database call, with an error message (a generic foreign-key violation) that gives no direct indication of where the bad data actually came from, forcing a much harder debugging investigation to trace backward to the real source.

**With Fail Fast — the invalid value is rejected at the EARLIEST point it could be detected:**
```csharp
public void ProcessOrder(Order order)
{
    if (order.CustomerId <= 0)
        throw new ArgumentException($"Invalid CustomerId: {order.CustomerId}", nameof(order));
        // FAILS IMMEDIATELY, at the entry point, with a message pointing DIRECTLY at the actual problem

    var discount = CalculateDiscount(order);
    SaveToDatabase(order, discount);
}
```
The error now surfaces at the exact point the invalid data was first available to check, with a message that directly names the actual problem — dramatically shortening the distance between "something's wrong" and "here's exactly what and where," compared to letting the same bad value travel deep into the system before finally causing a much more confusing, disconnected failure.

**Why this connects directly to `ArgumentNullException`/parameter-validation conventions covered implicitly throughout .NET's own API design:** .NET's own BCL conventions (validating constructor/method parameters immediately and throwing descriptive exceptions, rather than letting a `null` silently propagate until it causes a `NullReferenceException` several calls later) are a direct, consistent application of Fail Fast — the entire ecosystem's convention of "check your inputs immediately, throw a specific, descriptive exception" exists precisely because of this principle's debugging-cost benefit.

**Common Pitfall:** adding defensive checks deep inside a call chain (validating data right before it's actually used, several layers removed from where it originated) rather than at the system's actual entry points (a controller action, a public API method) — this technically still catches the problem eventually, but sacrifices Fail Fast's core benefit of pointing directly at the *original* source of bad data, rather than wherever in the call chain someone happened to add a check.

---

## Intermediate — Question 7

**Q7: What is the "Boy Scout Rule" ("leave the code cleaner than you found it"), and how does it provide an incremental alternative to a large, dedicated refactoring effort for improving a codebase's quality over time?**

The Boy Scout Rule says: whenever you touch a piece of code for any reason (adding a feature, fixing a bug), leave it slightly cleaner than you found it — a small, opportunistic improvement made as a natural side effect of work you were already doing, rather than requiring a separate, large, dedicated "refactoring sprint" that's often hard to get prioritized or funded.

**Without the Boy Scout Rule — code quality only improves via large, deliberately-scheduled refactoring efforts:**
```text
Team backlog: "Refactor the OrderService class" -- a large, standalone task competing directly
against new feature work for prioritization, often deprioritized indefinitely since it
delivers no immediately visible business value on its own
```
Large, dedicated refactoring efforts are valuable but notoriously hard to get prioritized against feature work with obvious, immediate business value — a task that's "just cleanup" competes poorly against a task that visibly moves a product forward, and can remain permanently deprioritized.

**With the Boy Scout Rule — small improvements happen continuously, as an incidental part of other work:**
```csharp
// A developer is asked to fix a bug in this method. While there, they ALSO notice
// (and fix) a poorly-named variable and an outdated comment, at essentially zero
// additional cost since they're already reading and touching this exact code
public decimal CalcDisc(Order o, decimal r) // <- poorly named, noticed while fixing the actual bug
{
    // old comment: "TODO: fix rounding bug" (the bug being fixed RIGHT NOW)
    ...
}
// After: renamed to CalculateDiscount(Order order, decimal rate), stale comment removed --
// a small, essentially FREE improvement, made as a side effect of work already being done
```
Because the developer is already deeply engaged with reading and understanding this specific piece of code (to fix the actual bug), making a small, incidental cleanup alongside it costs almost nothing extra — accumulated consistently across a team over time, this produces meaningful overall quality improvement without ever needing a dedicated "refactoring" line item competing against feature work.

**Why this specifically works as an alternative (not just a supplement) to large refactoring efforts:** it converts code-quality improvement from a discrete, hard-to-prioritize *project* into a continuous, essentially free *habit* woven into all other work — the accumulated effect over months of a whole team consistently practicing this can meaningfully exceed what a single, occasional dedicated "refactoring sprint" achieves, without ever requiring the organizational friction of explicitly prioritizing pure cleanup work over visible feature delivery.

**Common Pitfall:** using the Boy Scout Rule as justification for unrelated, large-scale refactoring bundled into an otherwise small, unrelated bug-fix pull request — the principle specifically means *small*, low-risk, easily-reviewable improvements made incidentally; a PR that was supposed to fix one small bug ballooning into a sprawling, hard-to-review refactor (under the banner of "leaving it cleaner") defeats the rule's actual purpose of keeping each individual improvement small, safe, and easy to review alongside the primary change.

---

## Advanced — Question 6

**Q6: What is "Temporal Coupling," and how does it differ from the ordinary structural coupling covered earlier — describing a dependency on the ORDER operations must be called in, rather than a dependency between two classes' data/interfaces?**

Structural coupling (covered earlier, alongside cohesion) describes one class depending on another's interface or internals. Temporal Coupling is a distinct, easy-to-miss kind of coupling: a dependency on the **order** in which a single class's own methods must be called, which the class's own public interface gives callers no explicit signal about.

**A class with hidden Temporal Coupling — the public interface doesn't reveal a REQUIRED call order:**
```csharp
public class ReportGenerator
{
    private List<DataRow> _data;
    public void LoadData(string source) => _data = FetchData(source);
    public void ProcessData() => _data = Transform(_data); // THROWS if _data is null -- i.e., if
                                                              // LoadData() wasn't called FIRST
    public byte[] GenerateReport() => Render(_data); // ALSO throws if ProcessData() wasn't called first
}

// A caller has NO WAY to know, just from the public method signatures, that THIS exact order matters:
var generator = new ReportGenerator();
generator.GenerateReport(); // COMPILES fine -- but THROWS at runtime, since LoadData/ProcessData
                              // were never called first -- nothing in the TYPE SYSTEM prevented this
```
Nothing about the class's public interface (three ordinary-looking public methods) signals that they must be called in a specific sequence — a caller has to *already know* (from documentation, from reading the implementation, or from trial and error) that `LoadData` → `ProcessData` → `GenerateReport` is the required order; the type system provides zero protection against calling them in the wrong sequence, or skipping one entirely.

**Reducing Temporal Coupling — making the required sequence structurally impossible to get wrong:**
```csharp
public class ReportGenerator
{
    public static byte[] Generate(string source) // ONE method, encapsulating the ENTIRE required sequence
    {
        var rawData = FetchData(source);
        var processedData = Transform(rawData);
        return Render(processedData);
    }
}

var report = ReportGenerator.Generate("database"); // there is LITERALLY NO WAY to call this incorrectly
```
By collapsing the three separately-callable, order-dependent methods into one method that internally performs the entire required sequence itself, there's no longer any possibility of a caller invoking the steps out of order or skipping one — the temporal dependency still exists (the *internal* steps still must happen in this order), but it's no longer something a caller could possibly get wrong, since it's no longer exposed as separate, independently-callable public operations at all.

**Why this is worth recognizing as its own distinct category, separate from ordinary coupling/cohesion:** a class can have excellent cohesion (every method is clearly related to "generating reports") and reasonable structural coupling (no messy dependencies on other classes' internals) while still harboring this specific, easy-to-overlook risk — Temporal Coupling is invisible to typical cohesion/coupling analysis, since it's about the *sequencing* relationship between a single class's own members, not about relationships between different classes at all.

**Common Pitfall:** exposing multiple public methods on a class that secretly require a specific call order, relying purely on documentation (a code comment, a wiki page) to communicate that requirement to callers — documentation is easy to miss or skip entirely, whereas structurally eliminating the possibility of an incorrect call sequence (collapsing separately-ordered steps into one method, or using the type system to make an invalid sequence simply uncompilable) provides a guarantee that documentation alone never can.

---
