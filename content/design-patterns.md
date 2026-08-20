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
