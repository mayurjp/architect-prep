# Design Patterns — Q&A

## Beginner — Question 1

**Q1: What are Design Patterns and what are the three main categories defined by the Gang of Four (GoF)?**

Design patterns are typical solutions to commonly occurring problems in software design. They are not specific pieces of code, but rather general concepts or templates for solving a problem that can be used in many different situations.

The Gang of Four (GoF) book categorizes 23 classic design patterns into three main groups based on their purpose:

1. **Creational Patterns:** Deal with object creation mechanisms, trying to create objects in a manner suitable to the situation. They hide the creation logic, making the system independent of how its objects are created. *(Examples: Singleton, Factory Method, Builder)*
2. **Structural Patterns:** Deal with object composition. They ease the design by identifying a simple way to realize relationships between entities, ensuring that if one part of a system changes, the entire structure doesn't need to change. *(Examples: Adapter, Decorator, Facade)*
3. **Behavioral Patterns:** Deal with communication between objects, specifically how responsibilities are assigned and how objects interact. *(Examples: Observer, Strategy, Command)*

#### Follow-up: Why shouldn't you use Design Patterns everywhere?
Design patterns introduce abstraction and complexity. Applying a pattern prematurely (violating YAGNI and KISS) makes the code harder to read and maintain. They should be refactored *into* when a clear need arises, not used as a starting template for every piece of code.

---

## Intermediate — Question 1

**Q1: Explain the Singleton pattern and the modern way to implement it in C#.**

The Singleton pattern ensures that a class has only one instance and provides a global point of access to it.

**The Mechanism:**
Historically, implementing a thread-safe Singleton in C# required double-check locking with a `volatile` keyword. However, the modern (and highly recommended) approach relies on the `Lazy<T>` type, which guarantees thread safety automatically.

```csharp
public sealed class Logger {
    // 1. Lazy<T> ensures thread-safe, lazy initialization
    private static readonly Lazy<Logger> _instance = 
        new Lazy<Logger>(() => new Logger());

    // 2. Private constructor prevents 'new' keyword outside the class
    private Logger() {
        Console.WriteLine("Logger initialized.");
    }

    // 3. Public static property to access the instance
    public static Logger Instance => _instance.Value;

    public void Log(string message) => Console.WriteLine(message);
}
```

**Common Pitfalls:**
- **Global State / Hidden Dependencies:** Singletons act like global variables. If a class uses `Logger.Instance`, that dependency is hidden (not injected via the constructor). This makes unit testing incredibly difficult because state persists across tests.
- **ASP.NET Core alternative:** In modern .NET apps, you rarely write Singleton classes manually. Instead, you register standard classes as Singletons in the DI container (`builder.Services.AddSingleton<ILogger, Logger>()`). The container handles the lifecycle, and you inject the interface, keeping your code testable.

---

## Intermediate — Question 2

**Q2: How does the Factory Method pattern differ from the Abstract Factory pattern?**

Both are Creational patterns that abstract the instantiation process, but they differ in scope and complexity.

**Factory Method:**
- Exposes a method (usually on an abstract base class or interface) that subclasses override to create a *single* specific product.
- **Focus:** Creating one object.
- **Example:** An `ILogistics` interface has a `CreateTransport()` method. The `RoadLogistics` class implements it to return a `Truck`, while `SeaLogistics` returns a `Ship`.

**Abstract Factory:**
- Provides an interface for creating *families* of related or dependent objects without specifying their concrete classes.
- **Focus:** Creating a suite of related objects that must work together.
- **Example:** An `IGUIFactory` has methods `CreateButton()` and `CreateCheckbox()`. A `WindowsFactory` returns `WindowsButton` and `WindowsCheckbox`. A `MacFactory` returns `MacButton` and `MacCheckbox`.

```csharp
// --- FACTORY METHOD ---
public abstract class Dialog {
    // The Factory Method
    public abstract IButton CreateButton(); 
    
    public void Render() {
        IButton btn = CreateButton();
        btn.Render();
    }
}

// --- ABSTRACT FACTORY ---
public interface IUIFactory {
    IButton CreateButton();
    ICheckbox CreateCheckbox();
}
// The client depends ONLY on the factory interface, not the concrete classes
public class Application {
    private readonly IButton _button;
    public Application(IUIFactory factory) {
        _button = factory.CreateButton(); // Could be Mac or Windows depending on what factory was injected
    }
}
```

---

## Advanced — Question 1

**Q1: Explain the Strategy Pattern and how it compares to the State Pattern.**

Both Strategy and State are Behavioral patterns that look almost identical structurally (they both involve an object delegating work to an injected interface), but their *intent* is completely different.

**The Strategy Pattern:**
- Defines a family of algorithms, encapsulates each one, and makes them interchangeable at runtime.
- **Intent:** The *Client* chooses the strategy. The algorithms are usually completely independent of each other and don't know the others exist.
- **Example:** A `RouteCalculator` class takes an `IRoutingStrategy`. The client injects `WalkingStrategy`, `DrivingStrategy`, or `PublicTransitStrategy`.

**The State Pattern:**
- Allows an object to alter its behavior when its internal state changes. The object will appear to change its class.
- **Intent:** The *State* objects themselves handle the transitions to other states. The Client rarely dictates the state changes directly.
- **Example:** A `VendingMachine` has an `IState`. If it's in `NoCoinState` and you call `InsertCoin()`, the `NoCoinState` object itself tells the Vending Machine to transition to `HasCoinState`.

```csharp
// Strategy Implementation (Client dictates)
public interface IPaymentStrategy {
    void Pay(decimal amount);
}
public class ShoppingCart {
    public void Checkout(decimal amount, IPaymentStrategy strategy) {
        strategy.Pay(amount); // Strategy executes
    }
}

// State Implementation (State dictates transition)
public interface IVendingMachineState {
    void InsertCoin();
}
public class NoCoinState : IVendingMachineState {
    private readonly VendingMachine _machine;
    public NoCoinState(VendingMachine machine) => _machine = machine;

    public void InsertCoin() {
        Console.WriteLine("Coin accepted.");
        _machine.SetState(new HasCoinState(_machine)); // State triggers the transition!
    }
}
```

**Common Pitfalls:**
Implementing State transitions using giant `switch` statements inside the main context class. The entire point of the State pattern is to distribute the state-specific logic (and transition logic) into the individual State classes, eliminating the massive conditional blocks.

---

## Advanced — Question 2

**Q2: Explain the Decorator Pattern and how it relates to ASP.NET Core Middleware.**

The Decorator Pattern is a Structural pattern that allows you to attach new behaviors to objects dynamically by placing them inside special wrapper objects (decorators) that contain the behaviors.

**The Mechanism:**
Instead of inheriting from a base class to add functionality, you create a decorator class that implements the *same interface* as the target class. The decorator takes an instance of that interface in its constructor. When a method is called on the decorator, it executes its own logic and then passes the call along to the wrapped object.

```csharp
public interface INotifier { void Send(string msg); }

public class EmailNotifier : INotifier {
    public void Send(string msg) => Console.WriteLine($"Email: {msg}");
}

// The Decorator
public class SmsDecorator : INotifier {
    private readonly INotifier _wrapped;
    public SmsDecorator(INotifier wrapped) => _wrapped = wrapped;
    
    public void Send(string msg) {
        Console.WriteLine($"SMS: {msg}");
        _wrapped.Send(msg); // Pass to the next one
    }
}

// Usage: They chain together!
INotifier notifier = new SmsDecorator(new EmailNotifier());
notifier.Send("Alert!"); // Sends SMS, then Email.
```

**Relation to ASP.NET Core Middleware:**
ASP.NET Core Middleware is effectively a sophisticated implementation of the Decorator pattern (often called the Chain of Responsibility). 
Every piece of middleware (Authentication, Routing, CORS) acts as a decorator around the HTTP request pipeline. It receives the `HttpContext`, can perform work *before* passing it to the `next()` middleware in the chain, and can perform work *after* the `next()` middleware returns.

---

## Scenario — Question 1

**Q1: You are building an e-commerce checkout system. Depending on the user's country, the system must calculate shipping costs using completely different logic (e.g., FedEx API for US, Royal Mail for UK, flat rate for Canada). You currently have a massive `switch` statement in your `CheckoutService`. How do you refactor this using design patterns?**

A massive `switch` statement that controls completely different algorithmic behaviors based on a condition is the textbook use case for the **Strategy Pattern**.

**The Refactoring:**
1. **Define an Interface:** Create an `IShippingStrategy` with a method `decimal CalculateShipping(Order order)`.
2. **Implement Strategies:** Create concrete classes for each algorithm: `FedExShippingStrategy`, `RoyalMailShippingStrategy`, and `FlatRateShippingStrategy`.
3. **Inject the Strategy:** The `CheckoutService` (the Context) no longer contains any shipping logic. Instead, it expects to be provided an `IShippingStrategy`.
4. **The Factory:** You use a **Factory Pattern** (or DI container logic) to determine *which* strategy to instantiate based on the user's country, and pass that specific strategy to the `CheckoutService`.

```csharp
public class CheckoutService {
    // The CheckoutService doesn't know HOW to calculate shipping, 
    // it just knows that the strategy WILL calculate it.
    public void ProcessOrder(Order order, IShippingStrategy shippingStrategy) {
        decimal cost = shippingStrategy.CalculateShipping(order);
        order.Total += cost;
        // Proceed with payment...
    }
}
```

**Why this is better (Open/Closed Principle):**
When the company expands to Australia next month, you do not touch the `CheckoutService`. You create a new `AustraliaPostShippingStrategy` and register it in your factory. The core business logic remains closed to modification but open to extension.

---

## Scenario — Question 2

**Q2: You have an older legacy application with an `IUserAccount` interface. You recently purchased a modern, highly optimized third-party authentication library, but its main class `ModernAuthSystem` does not implement `IUserAccount` and its methods have completely different names (`LoginUser` vs `AuthenticateAsync`). You cannot modify the third-party code, but you want to use it without rewriting your entire application. Which pattern solves this?**

This is the perfect scenario for the **Adapter Pattern** (also known as a Wrapper).

**The Concept:**
The Adapter pattern acts as a bridge between two incompatible interfaces. Just like a physical power adapter lets you plug a US laptop into a UK wall socket, a software adapter lets your old code talk to the new library.

**The Mechanism:**
You create a new class (the Adapter) that implements your *existing* `IUserAccount` interface. Inside the Adapter, you inject the incompatible `ModernAuthSystem`. When the legacy application calls `LoginUser` on the Adapter, the Adapter translates that call into `AuthenticateAsync` on the modern system.

```csharp
// 1. The interface your legacy app expects
public interface IUserAccount {
    bool LoginUser(string user, string pass);
}

// 2. The incompatible third-party library
public class ModernAuthSystem {
    public async Task<bool> AuthenticateAsync(AuthRequest request) { /* ... */ }
}

// 3. The Adapter
public class ModernAuthAdapter : IUserAccount {
    private readonly ModernAuthSystem _modernSystem;
    
    public ModernAuthAdapter(ModernAuthSystem modernSystem) {
        _modernSystem = modernSystem;
    }

    // Translates the old interface call into the new implementation
    public bool LoginUser(string user, string pass) {
        var request = new AuthRequest { Username = user, Password = pass };
        // Note: .Result used for simplicity in this synchronous example
        return _modernSystem.AuthenticateAsync(request).Result; 
    }
}
```

**The Result:**
Your legacy application continues to use `IUserAccount` completely unaware that the underlying implementation has been replaced with a modern, third-party library.

---

## Scenario — Question 3

**Q3: You are building an API that allows users to order custom PCs. A PC has over 20 optional components (RAM, GPU, Cooling, RGB, etc.). Currently, developers are creating PCs using a massive constructor with 20 parameters, most of which are `null`. This is unreadable and prone to errors. How do you refactor this object creation?**

This is the classic "Telescoping Constructor" anti-pattern. The best solution is the **Builder Pattern**.

**The Solution:**
The Builder pattern separates the construction of a complex object from its representation, allowing you to create different representations using the same construction code.

**The Mechanism:**
1. You remove the giant constructor from the `Computer` class.
2. You create a `ComputerBuilder` class with a fluent interface (methods that return `this`).
3. The developer chains method calls together to specify only the parts they want.
4. Finally, they call `.Build()` to instantiate and return the fully constructed `Computer` object.

```csharp
var myPc = new ComputerBuilder()
    .SetCPU("Intel Core i9")
    .SetRAM(32)
    .SetGPU("NVIDIA RTX 4090")
    // Notice we skip WaterCooling and RGB entirely
    .Build();
```

**Why it's better:**
It makes the code infinitely more readable, entirely eliminates `null` parameter spam, and allows you to enforce validation logic inside the `.Build()` method before the object is ever created (e.g., throwing an exception if a CPU was not set).

---

## Scenario — Question 4

**Q4: Your system fetches heavy financial data from a slow third-party API. To improve performance, you write a `CachedFinancialApi` class. It checks a local dictionary for the data. If it exists, it returns it; if not, it calls the real `FinancialApi`, stores the result, and returns it. Both classes implement `IFinancialApi`. Which design pattern does this implement?**

This is a textbook implementation of the **Proxy Pattern**.

**The Concept:**
The Proxy pattern provides a surrogate or placeholder for another object to control access to it. It has the exact same interface as the real object, meaning the client is completely unaware that they are talking to a proxy.

**The Mechanism:**
In this specific case, it is a **Caching Proxy**. 
1. The `CachedFinancialApi` (Proxy) implements `IFinancialApi`.
2. It holds a reference to the real `FinancialApi` object.
3. When the client calls `GetStockPrice()`, the proxy intercepts the call.
4. It performs its caching logic. Only if necessary does it forward the call to the real object.

**How it differs from Decorator:**
While structurally identical (both wrap an object and implement its interface), their *intent* is different. A Decorator *adds behavior* (like logging or formatting) to an object dynamically at runtime. A Proxy *controls access* (lazy loading, caching, security checks) to an object, often managing the lifecycle of the real object itself.

---

## Beginner — Question 2

**Q2: Explain the Observer pattern and where it shows up in everyday .NET code.**

The Observer pattern defines a one-to-many dependency: when one object (the *subject*) changes state, all its registered *observers* are automatically notified, without the subject needing to know any concrete details about who's listening.

**The Mechanism:**
```csharp
public class StockTicker {
    public event Action<decimal> PriceChanged; // the "subject" exposes a notification point

    public void UpdatePrice(decimal newPrice) {
        PriceChanged?.Invoke(newPrice); // notifies every subscribed observer
    }
}

var ticker = new StockTicker();
ticker.PriceChanged += price => Console.WriteLine($"Dashboard: {price}");
ticker.PriceChanged += price => Console.WriteLine($"Logger: price changed to {price}");
```

**Where it's already built into .NET:**
- C# **events and delegates** are a first-class language implementation of Observer — you rarely hand-roll the classic GoF `IObserver`/`ISubject` interfaces.
- `IObservable<T>` / `IObserver<T>` (System.Reactive / Rx.NET) is the formalized, composable version — with operators for filtering, throttling, and combining event streams.
- ASP.NET Core's `IHostApplicationLifetime` events (`ApplicationStarted`, `ApplicationStopping`) are Observer under the hood.

**Common Pitfall:** forgetting to unsubscribe (`-=`) when the observer's lifetime is shorter than the subject's — the subject holds a reference to every subscribed observer, which keeps them alive and causes a memory leak (the same "lapsed listener" problem covered under event handler leaks).

---

## Beginner — Question 3

**Q3: Explain the Facade pattern and how it differs from just "a class with a lot of methods."**

The Facade pattern provides a single, simplified interface to a larger, more complex subsystem made up of multiple interacting classes — the goal is to hide complexity, not to add new capability.

**The Mechanism:**
```csharp
// The complex subsystem — several classes that must be coordinated in the right order
public class InventoryService { public bool Reserve(int productId) => true; }
public class PaymentService { public bool Charge(decimal amount) => true; }
public class ShippingService { public void Schedule(int orderId) { } }

// The Facade — one entry point that coordinates all three correctly
public class OrderFacade {
    private readonly InventoryService _inventory = new();
    private readonly PaymentService _payment = new();
    private readonly ShippingService _shipping = new();

    public bool PlaceOrder(int productId, decimal amount, int orderId) {
        if (!_inventory.Reserve(productId)) return false;
        if (!_payment.Charge(amount)) return false;
        _shipping.Schedule(orderId);
        return true;
    }
}

// The caller doesn't need to know 3 subsystems exist or in what order to call them
new OrderFacade().PlaceOrder(productId: 5, amount: 99.99m, orderId: 1001);
```

**How this differs from "just a class with a lot of methods":** a Facade doesn't add new business logic of its own — it only *orchestrates* calls into an existing subsystem in the correct sequence. The individual subsystem classes (`InventoryService`, `PaymentService`, `ShippingService`) remain fully usable on their own for callers who need finer-grained control; the Facade is purely an optional convenience layer, not a replacement.

**Common Pitfall:** letting a Facade slowly accumulate actual business logic over time until it becomes a God Object itself — a Facade should stay a thin coordination layer, not grow decision-making responsibilities that belong in the subsystem classes.

---

## Intermediate — Question 3

**Q3: Explain the Prototype pattern and when cloning is preferable to constructing a new object.**

The Prototype pattern creates new objects by **copying an existing instance** (a "prototype") rather than constructing one from scratch, useful when object creation is expensive or when you want a new object that starts as a variation of a known-good configuration.

**The Mechanism (via .NET's `ICloneable` or a custom `Clone()` method):**
```csharp
public class EnemyTemplate {
    public string Type { get; set; }
    public int Health { get; set; }
    public List<string> Abilities { get; set; } = new();

    public EnemyTemplate Clone() => new EnemyTemplate {
        Type = Type,
        Health = Health,
        Abilities = new List<string>(Abilities) // deep-copy the list, not just the reference
    };
}

var bossTemplate = new EnemyTemplate { Type = "Dragon", Health = 1000, Abilities = { "Fire Breath" } };
var boss1 = bossTemplate.Clone(); // fast — no re-running expensive setup logic
var boss2 = bossTemplate.Clone();
boss2.Health = 1500; // customize the copy without touching the template or boss1
```

**When Prototype beats a plain constructor:**
- The object's construction is expensive (e.g., loaded from a database, computed via a complex algorithm, or built via many configuration steps) and you need many near-identical variations.
- You want to spawn objects based on a runtime-configured "template" rather than a fixed, compile-time-known constructor signature (e.g., a level editor that spawns enemies from data-driven templates).

**Common Pitfall:** implementing `Clone()` as a shallow copy by default (`MemberwiseClone()`) when the object contains mutable reference-type fields — as with the general shallow-vs-deep-copy issue, forgetting to deep-clone a nested list or object means the "clone" still shares mutable state with the original, causing changes to one to unexpectedly affect the other.

---

## Beginner — Question 4

**Q4: Explain the Template Method pattern and how it differs from the Strategy pattern.**

Template Method defines the *skeleton* of an algorithm in a base class, with specific steps deferred to subclasses via overridable methods — the overall sequence of steps is fixed, only individual steps vary.

**The Mechanism:**
```csharp
public abstract class DataExporter
{
    // The Template Method -- defines the FIXED overall algorithm shape
    public void Export()
    {
        var data = FetchData();
        var formatted = FormatData(data);   // varies per subclass
        WriteOutput(formatted);              // varies per subclass
    }

    protected abstract string FormatData(List<string> data);
    protected abstract void WriteOutput(string content);
    private List<string> FetchData() => new() { "row1", "row2" }; // shared, not overridable
}

public class CsvExporter : DataExporter
{
    protected override string FormatData(List<string> data) => string.Join(",", data);
    protected override void WriteOutput(string content) => File.WriteAllText("out.csv", content);
}
```
Calling `csvExporter.Export()` always runs `FetchData` → `FormatData` → `WriteOutput` in that fixed order — subclasses can't reorder or skip steps, only supply their own implementation for the designated overridable ones.

**How this differs from Strategy:** Strategy (covered earlier) swaps out an *entire algorithm* as one interchangeable unit via composition — the context holds a reference to a strategy object and delegates the whole operation to it. Template Method instead fixes the overall *sequence* in a base class and only lets subclasses customize individual *steps* within that sequence, via inheritance rather than composition.

**Common Pitfall:** using Template Method where the "steps" actually need to vary independently of each other in ways inheritance can't cleanly express (e.g., mixing and matching different `FormatData` and `WriteOutput` combinations across many exporters) — that combinatorial need is a sign Strategy (composing independent, swappable pieces) fits better than a single rigid inheritance hierarchy.

---

## Intermediate — Question 4

**Q4: Explain the Chain of Responsibility pattern, and how ASP.NET Core middleware is a concrete implementation of it.**

Chain of Responsibility passes a request along a chain of potential handlers, where each handler decides either to process the request itself, pass it to the next handler in the chain, or both — the sender doesn't need to know which handler (if any) will ultimately deal with it.

**The Mechanism:**
```csharp
public abstract class SupportHandler
{
    protected SupportHandler? Next;
    public SupportHandler SetNext(SupportHandler next) { Next = next; return next; }
    public abstract void Handle(Ticket ticket);
}

public class Tier1Support : SupportHandler
{
    public override void Handle(Ticket ticket)
    {
        if (ticket.Severity <= 1) { Console.WriteLine("Tier 1 resolved it"); return; }
        Next?.Handle(ticket); // pass it along if this handler can't deal with it
    }
}
public class Tier2Support : SupportHandler
{
    public override void Handle(Ticket ticket)
    {
        if (ticket.Severity <= 2) { Console.WriteLine("Tier 2 resolved it"); return; }
        Next?.Handle(ticket);
    }
}

var tier1 = new Tier1Support();
tier1.SetNext(new Tier2Support());
tier1.Handle(new Ticket { Severity = 2 }); // Tier 1 passes it to Tier 2, which resolves it
```

**Why ASP.NET Core middleware IS this pattern:** each middleware component is a "handler" that receives the `HttpContext`, decides whether to handle it and short-circuit (e.g., return a cached response) or call `next()` to pass it further down the chain, exactly matching the pattern's shape.
```csharp
app.Use(async (context, next) =>
{
    if (context.Request.Headers.ContainsKey("X-Cached-Response"))
    {
        await context.Response.WriteAsync("cached"); // handles it, does NOT call next()
        return;
    }
    await next(); // pass to the next middleware in the chain
});
```

**Common Pitfall:** building a chain where handlers have hidden, order-dependent assumptions about each other (e.g., Handler C assumes Handler A already set some contextual state) — this quietly breaks the pattern's core promise that handlers can be reordered or removed independently, turning what should be a flexible chain into a fragile, implicitly-coupled sequence.

---

## Advanced — Question 3

**Q3: Explain the Mediator pattern, and why MediatR (a popular .NET library) is built around it for implementing CQRS.**

The Mediator pattern centralizes communication between a set of objects behind a single mediator object, so those objects communicate *through* the mediator rather than referencing each other directly — reducing a tangled web of many-to-many object references down to a hub-and-spoke shape.

**Without a Mediator — components reference each other directly:**
```csharp
public class OrderController
{
    private readonly OrderValidator _validator;
    private readonly InventoryService _inventory;
    private readonly EmailService _email;
    // The controller must know about and directly wire up EVERY collaborator
}
```

**With a Mediator (MediatR) — the controller only knows about `IMediator`:**
```csharp
public class OrdersController : ControllerBase
{
    private readonly IMediator _mediator; // the ONLY dependency

    [HttpPost]
    public async Task<IActionResult> Create(CreateOrderCommand command)
    {
        var result = await _mediator.Send(command); // MediatR routes this to the correct handler
        return Ok(result);
    }
}

public class CreateOrderCommandHandler : IRequestHandler<CreateOrderCommand, OrderResult>
{
    // THIS class knows about the validator, inventory service, etc. -- the controller doesn't
    public async Task<OrderResult> Handle(CreateOrderCommand request, CancellationToken ct) { ... }
}
```
The controller is completely decoupled from *which* class actually handles the command, or what that handler's own dependencies are — it only depends on the generic `IMediator` abstraction.

**Why this fits CQRS naturally:** CQRS already wants a clean separation between "here's a Command/Query" and "here's the code that handles it" — MediatR's `IRequestHandler<TRequest, TResponse>` convention gives every command and query its own dedicated, single-responsibility handler class, found and invoked automatically via `_mediator.Send()`, without controllers accumulating a dozen injected service dependencies as the application grows.

**Common Pitfall:** treating MediatR as a mandatory "best practice" for every project regardless of size — for a small application with few use cases, the indirection of "the controller sends a command to a mediator which finds a handler" adds a layer of ceremony (an extra file per operation, harder to `Ctrl+Click` and jump straight to the handling code) that a simple direct service-injection approach could handle just as well with less machinery.

---

## Beginner — Question 5

**Q5: Explain the Adapter pattern versus the Facade pattern — both "wrap" something, so what's the actual difference in intent?**

Both patterns put a class in front of existing code, which makes them easy to confuse — but they solve different problems: Adapter makes an **incompatible interface compatible**; Facade makes a **complex interface simple**.

**Adapter — translates between two interfaces that don't match:**
```csharp
public interface IPaymentProcessor { void Charge(decimal amount); }

public class LegacyBillingSystem { public void ProcessPayment(int cents) { /* ... */ } } // different signature/units entirely

public class LegacyBillingAdapter : IPaymentProcessor
{
    private readonly LegacyBillingSystem _legacy;
    public LegacyBillingAdapter(LegacyBillingSystem legacy) => _legacy = legacy;
    public void Charge(decimal amount) => _legacy.ProcessPayment((int)(amount * 100)); // translates dollars -> cents
}
```
The problem here is purely **incompatibility** — two interfaces that mean roughly the same thing but don't match in shape (different method names, different units, different parameter types); the Adapter's whole job is bridging that specific mismatch.

**Facade — simplifies a complex, multi-step subsystem behind one easy entry point (already covered in depth earlier):**
```csharp
public class CheckoutFacade
{
    public void CompleteCheckout(Order order)
    {
        _inventory.Reserve(order);   // subsystem step 1
        _payment.Charge(order);      // subsystem step 2
        _shipping.Schedule(order);   // subsystem step 3
    }
}
```
Here, there's no interface *mismatch* at all — every subsystem method works fine on its own. The problem Facade solves is **complexity and number of steps**, not incompatibility.

**The one-sentence distinction:** Adapter answers "these two things don't fit together, how do I make them fit?" Facade answers "this is fine but has too many pieces to coordinate, how do I make it simple to use?"

**Common Pitfall:** calling any wrapper class an "Adapter" regardless of what problem it's actually solving — if the wrapped thing already has a perfectly usable, single-entry-point interface and the wrapper is purely reducing the number of calls a client has to make, that's a Facade, not an Adapter, even though both are structurally "a class wrapping other classes."

---

## Intermediate — Question 5

**Q5: Explain the Composite pattern, and how it lets client code treat an individual object and a collection of objects through the exact same interface.**

Composite lets you build tree structures of objects (a folder containing files and other folders; a UI panel containing controls and other panels) where client code can treat a single leaf item and an entire branch of nested items **identically**, through one shared interface — without needing to special-case "is this a single item or a group?" everywhere.

**The Mechanism:**
```csharp
public interface IFileSystemItem { long GetSize(); }

public class File : IFileSystemItem
{
    private readonly long _size;
    public File(long size) => _size = size;
    public long GetSize() => _size; // a LEAF -- no children
}

public class Folder : IFileSystemItem
{
    private readonly List<IFileSystemItem> _children = new();
    public void Add(IFileSystemItem item) => _children.Add(item);

    public long GetSize() => _children.Sum(c => c.GetSize()); // a COMPOSITE -- delegates to children
}
```

**Using it — the client code doesn't know or care whether it's holding a single File or an entire nested Folder tree:**
```csharp
var root = new Folder();
root.Add(new File(100));
var subfolder = new Folder();
subfolder.Add(new File(200));
subfolder.Add(new File(50));
root.Add(subfolder);

long totalSize = root.GetSize(); // 350 -- recursively sums the ENTIRE tree, client calls ONE method
```
`root.GetSize()` looks identical whether `root` is a single file or an arbitrarily deep folder tree — the recursive delegation (`Folder.GetSize()` calling `GetSize()` on each of its own children, which might themselves be Folders) is what makes arbitrary nesting depth transparent to the caller.

**Why this matters architecturally:** without Composite, client code handling "a file or a folder" would need explicit type checks and separate logic paths (`if (item is File) ... else if (item is Folder) recursively sum children ...`) scattered everywhere a file-system item is used — Composite pushes that recursive-handling logic into the `Folder` class itself, once, so every caller just sees one uniform interface regardless of tree depth.

**Common Pitfall:** adding operations to the `IFileSystemItem` interface that only make sense for one side (e.g., `AddChild()` only makes sense for `Folder`, not `File`) — this forces `File` to implement a meaningless method (throwing `NotSupportedException`, echoing the earlier Interface Segregation Principle discussion), which is a common tension in Composite implementations; some designs accept this trade-off deliberately for full interface uniformity, others split the interface to avoid it.

---

## Advanced — Question 4

**Q4: Explain the Flyweight pattern, and how it reduces memory usage by sharing common state across many logically-distinct objects.**

Flyweight splits an object's data into **intrinsic** state (shared, identical across many instances, safe to reuse) and **extrinsic** state (unique per instance, supplied by the caller) — letting a system represent millions of logical objects while only actually allocating memory for the relatively small number of *distinct* intrinsic states among them.

**The problem — naively, every character in a text document is its own object:**
```csharp
public class Character
{
    public char Symbol;
    public string FontFamily;   // "Arial" -- repeated identically across THOUSANDS of characters
    public int FontSize;        // 12 -- also repeated identically
    public int X, Y;            // UNIQUE per character -- its specific position
}
// A 10,000-character document naively allocates 10,000 separate FontFamily strings, FontSize ints, etc.
// even though there might only be 3 distinct (font, size) combinations used throughout the whole document
```

**Flyweight — share the repeated (intrinsic) part, keep only the unique (extrinsic) part per instance:**
```csharp
public class CharacterStyle // the FLYWEIGHT -- intrinsic, shared, immutable
{
    public readonly string FontFamily;
    public readonly int FontSize;
    public CharacterStyle(string font, int size) { FontFamily = font; FontSize = size; }
}

public class CharacterStyleFactory
{
    private readonly Dictionary<string, CharacterStyle> _cache = new();
    public CharacterStyle GetStyle(string font, int size)
    {
        var key = $"{font}-{size}";
        if (!_cache.TryGetValue(key, out var style))
            _cache[key] = style = new CharacterStyle(font, size); // created ONCE per distinct combination
        return style;
    }
}

public class Character // holds only the UNIQUE, per-instance (extrinsic) data + a reference to a SHARED flyweight
{
    public char Symbol;
    public int X, Y;                 // unique per character
    public CharacterStyle Style;     // SHARED reference -- same object across thousands of characters
}
```
If a document has 10,000 characters but only 3 distinct `(font, size)` combinations actually used, only 3 `CharacterStyle` objects ever get created — every one of the 10,000 `Character` instances holds a *reference* to one of those 3 shared objects, rather than its own private copy of the font/size data.

**Common Pitfall:** making the shared flyweight object **mutable** — since a flyweight instance is referenced by potentially thousands of different logical objects simultaneously, mutating it in place would silently change the appearance/behavior of every one of them at once; flyweight objects must be treated as immutable once created, or the sharing that makes the pattern work becomes a correctness hazard instead of a memory optimization.

---
