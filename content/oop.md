# Object-Oriented Programming — Q&A

## Beginner — Question 1

**Q1: What are the four main principles of Object-Oriented Programming (OOP)?**

Object-Oriented Programming (OOP) in C# is built on four foundational pillars:
1. **Encapsulation**: Bundling data (state) and the methods that operate on that data into a single unit (class), while hiding internal details and exposing only what is necessary (using access modifiers like `private` and `public`).
2. **Inheritance**: The mechanism by which a new class (derived class) inherits properties and behaviors from an existing class (base class), promoting code reuse and establishing an "is-a" relationship.
3. **Polymorphism**: The ability of different objects to respond to the same method call in their own specific way. This is achieved through method overriding (runtime) or method overloading (compile-time).
4. **Abstraction**: Hiding complex implementation details behind a simplified interface. This allows developers to interact with an object based on *what* it does, rather than *how* it does it, typically using interfaces or abstract classes.

These principles allow for more modular, maintainable, and reusable code.

#### Follow-up: Why is Encapsulation so important in C#?
Encapsulation protects the internal state of an object from unintended interference. In C#, this is commonly implemented using **Properties** with private backing fields. It ensures that any logic (like validation) required when setting a value is strictly enforced.

---

## Beginner — Question 2

**Q2: What is the difference between an Interface and an Abstract Class?**

Both interfaces and abstract classes are used for abstraction, but they serve different purposes:

**Interface (`interface`):**
- Defines a strict contract. It only contains the *signatures* of methods, properties, events, or indexers (though C# 8.0 introduced default interface methods).
- A class or struct can implement **multiple** interfaces.
- Used to define a "can-do" relationship (e.g., `IEnumerable`, `IDisposable`).

**Abstract Class (`abstract class`):**
- Can contain both abstract methods (without implementation) and fully implemented methods or fields.
- A class can inherit from only **one** abstract class (C# does not support multiple class inheritance).
- Used to define an "is-a" relationship and provide a common base implementation for derived classes.

```csharp
// Interface: strict contract
public interface IMovable {
    void Move(); 
}

// Abstract class: shared state and behavior
public abstract class Animal {
    public string Name { get; set; }
    
    // Abstract method to be overridden
    public abstract void MakeSound();
    
    // Implemented method
    public void Sleep() {
        Console.WriteLine("Zzz...");
    }
}
```

**When to use what:** Use an interface when you want to define behavior across completely unrelated types. Use an abstract class when creating a family of closely related objects that share common logic.

---

## Intermediate — Question 1

**Q1: How does Polymorphism work internally at runtime (Virtual Method Table)?**

Polymorphism allows a derived class to override a base class's method. At runtime, the CLR determines the actual object type and calls the correct overridden method. This is powered by the **Virtual Method Table (vtable)**.

When a class defines a `virtual` method, the compiler generates a vtable for that class—an array of function pointers. Every instance of the class contains a hidden pointer (the Type Handle) to its type's metadata, which includes the vtable.

1. When a derived class `override`s a virtual method, its vtable entry for that method is updated to point to the derived implementation.
2. If the derived class does not override it, the pointer remains pointing to the base class's implementation.
3. At runtime, when you call `animal.MakeSound()`, the CLR follows the pointer from the object instance -> Type Handle -> vtable -> invokes the exact method pointer stored there.

```csharp
public class Animal {
    public virtual void MakeSound() => Console.WriteLine("Generic animal sound");
}
public class Dog : Animal {
    public override void MakeSound() => Console.WriteLine("Bark");
}

Animal myDog = new Dog();
myDog.MakeSound(); // Outputs: Bark (resolved via vtable at runtime)
```

**Common Pitfalls:** 
Forgetting the `override` keyword and using `new` (method hiding) instead. If you use `new`, the vtable is *not* updated. The method called will depend on the reference type at compile time, completely breaking runtime polymorphism.

#### Follow-up: What happens if you use the `new` keyword instead of `override`?
Using `new` hides the base class method. It creates a completely separate method that happens to have the same name. If you call it through a base class reference, the base class method will execute. If you call it through the derived class reference, the derived method executes. This is known as **shadowing**.

---

## Intermediate — Question 2

**Q2: What is the difference between early binding and late binding?**

**Early Binding (Compile-time):**
The compiler resolves the exact method, property, or type at compile time. This includes standard method calls, overloaded methods, and generic type resolutions.
- **Benefits:** Type safety, fast execution (no runtime lookup overhead), and IntelliSense support in IDEs.
- **Example:** Method Overloading (compile-time polymorphism). The compiler looks at the method signature and wires up the exact call immediately.

**Late Binding (Runtime):**
The resolution of the method or property is deferred until the application is actually running. The compiler does not know if the method exists.
- **Benefits:** Flexibility (e.g., interacting with COM objects, plugins, or dynamic JSON).
- **Mechanism in C#:** Primarily achieved using the `dynamic` keyword, Reflection (`MethodInfo.Invoke`), or virtual method dispatch (though virtual dispatch is often considered a highly optimized hybrid).
- **Example:**
```csharp
// Late Binding via dynamic
dynamic obj = GetUnknownObject();
// The compiler assumes 'Speak' exists. If it doesn't, a RuntimeBinderException is thrown at execution.
obj.Speak(); 
```

**Trade-offs:** Late binding incurs a significant performance penalty because the runtime (often the DLR - Dynamic Language Runtime) must inspect the object, verify the method exists, check access permissions, and then execute it, bypassing compile-time safety.

---

## Advanced — Question 1

**Q1: Explain the Liskov Substitution Principle (LSP) and how violating it causes subtle bugs in OOP.**

The Liskov Substitution Principle (the "L" in SOLID) states that objects of a superclass should be replaceable with objects of its subclasses without breaking the application. In other words, a derived class must completely honor the contract established by the base class.

**The Mechanism of Violation:**
When a derived class alters the expected behavior (e.g., throwing a `NotImplementedException`, tightening validation rules unexpectedly, or changing side effects), the client code relying on the base class abstraction will fail. The compiler won't catch this because the method signatures match perfectly—the violation is purely behavioral.

**Classic Example: The Square-Rectangle Problem**
```csharp
public class Rectangle {
    public virtual int Width { get; set; }
    public virtual int Height { get; set; }
    public int Area => Width * Height;
}

public class Square : Rectangle {
    // Violates LSP: Changing Width also unexpectedly changes Height
    public override int Width {
        set { base.Width = value; base.Height = value; }
    }
    public override int Height {
        set { base.Height = value; base.Width = value; }
    }
}
```

**Why it fails:**
```csharp
void Resize(Rectangle rect) {
    rect.Width = 10;
    rect.Height = 5;
    // Expected area: 50. But if rect is a Square, Area becomes 25.
    Assert.AreEqual(50, rect.Area); // Fails!
}
```

**How to fix it:**
If a `Square` cannot adhere to the behavioral contract of a `Rectangle` where Width and Height mutate independently, it should not inherit from `Rectangle`. Instead, they might both implement a read-only `IShape` interface, or use composition.

#### Follow-up: How do you enforce LSP in a large codebase?
LSP is behavioral, so it cannot be enforced by the C# compiler. It is enforced through **unit testing** and **Design by Contract**. You should write test suites against the *base class* or *interface*, and run those exact same tests against all derived implementations to ensure they fulfill the inherited assumptions.

---

## Advanced — Question 2

**Q2: What is the "Diamond Problem" in multiple inheritance, and how does C# solve it using interfaces?**

The Diamond Problem is an ambiguity that arises in programming languages (like C++) that allow a class to inherit state and behavior from more than one base class.

**The Problem:**
Imagine class `A` has a method `Speak()`. 
Classes `B` and `C` both inherit from `A` and override `Speak()`. 
Class `D` inherits from *both* `B` and `C`.
If you call `D.Speak()`, which implementation should execute? `B`'s or `C`'s? The compiler has no way to resolve the conflict.

**The C# Solution (No Multiple Class Inheritance):**
C# strictly forbids inheriting from more than one `class` to completely avoid this problem regarding state (fields) and concrete implementations.

However, C# *does* allow a class to implement multiple `interface`s. Because traditional interfaces have no implementation, there is no conflict—class `D` must provide its own single implementation.

**The Complication (C# 8.0 Default Interface Methods):**
C# 8 introduced Default Interface Methods, allowing interfaces to have implementations. If `IB` and `IC` both provide a default implementation for `Speak()`, and class `D` implements both without writing its own `Speak()`, the Diamond Problem returns!
C# solves this by explicitly failing at **compile time**. The compiler forces class `D` to provide its own `Speak()` implementation to explicitly resolve the ambiguity.

---

## Scenario — Question 1

**Q1: You are reviewing code where a developer has created an `Employee` base class with a `CalculateBonus()` method. They then created `FullTimeEmployee`, `PartTimeEmployee`, and `Contractor` classes inheriting from it. However, contractors don't get bonuses, so the `Contractor` class overrides `CalculateBonus()` to throw a `NotSupportedException`. Why is this a major architectural flaw, and how would you fix it?**

This is a textbook violation of the **Liskov Substitution Principle (LSP)**. 

**The Flaw:**
Client code consuming an `Employee` base class expects all employees to be able to calculate a bonus. If the system loops through a list of `Employee` objects to generate payroll, the application will suddenly crash when it hits a `Contractor`. The derived class broke the behavioral contract of the base class.

**The Fix (Interface Segregation):**
Inheritance should only model strict "is-a" relationships where all base behaviors apply. If a behavior doesn't universally apply, it should be extracted into an interface.

1. **Remove `CalculateBonus()`** from the `Employee` base class.
2. **Create an Interface:** Create `IBonusEligible` with the `CalculateBonus()` method.
3. **Apply the Interface selectively:** Have only `FullTimeEmployee` and `PartTimeEmployee` implement `IBonusEligible`. The `Contractor` class remains just an `Employee`.
4. **Update Client Code:** The payroll engine should only attempt to calculate bonuses on a list of `IBonusEligible` objects, or use pattern matching:
   ```csharp
   foreach (var employee in employees) {
       if (employee is IBonusEligible bonusEmployee) {
           totalBonuses += bonusEmployee.CalculateBonus();
       }
   }
   ```

---

## Scenario — Question 2

**Q2: You have a class `OrderProcessor` that creates a new `DatabaseLogger` instance inside its constructor. Whenever an order is processed, it calls `_logger.Log("Order saved")`. The company mandates a switch from the database logger to a file logger. Why is this current design problematic, and how do you fix it using SOLID principles?**

The current design tightly couples `OrderProcessor` to the concrete `DatabaseLogger` class. This is a violation of the **Dependency Inversion Principle (DIP)**.

**The Flaw:**
Because `OrderProcessor` instantiates the logger itself (`new DatabaseLogger()`), it controls the lifecycle and the specific implementation. You cannot change the logger to a `FileLogger` without modifying the `OrderProcessor` class code (which also violates the Open/Closed Principle). Furthermore, it is impossible to unit test `OrderProcessor` without a live database connection, because you cannot mock the logger.

**The Fix:**
You must invert the dependency. High-level modules (`OrderProcessor`) should not depend on low-level modules (`DatabaseLogger`). Both should depend on abstractions (interfaces).

1. **Create an Abstraction:** Extract an interface `ILogger` with a `Log()` method.
2. **Implement the Abstraction:** Ensure both `DatabaseLogger` and `FileLogger` implement `ILogger`.
3. **Dependency Injection (Constructor Injection):** Modify the `OrderProcessor` to accept `ILogger` via its constructor, completely removing the `new` keyword.

```csharp
public class OrderProcessor {
    private readonly ILogger _logger; // Depends on abstraction

    // The specific implementation is injected from the outside
    public OrderProcessor(ILogger logger) {
        _logger = logger;
    }

    public void ProcessOrder() {
        // ... logic
        _logger.Log("Order processed");
    }
}
```

**Result:**
You can now easily switch to `FileLogger` by configuring your DI container at application startup. For unit testing, you can inject a mock `ILogger` that writes to memory, making the tests fast and reliable without database dependencies.

---

## Scenario — Question 3

**Q3: A developer implements an `Invoice` class that contains methods to calculate the total (`CalculateTotal()`), format the invoice as a PDF (`PrintPDF()`), and save the invoice to the database (`SaveToDb()`). Over time, the class grows to 2,000 lines. Bugs introduced in the PDF formatting logic are now accidentally breaking the tax calculation logic. Which SOLID principle is violated, and how do you fix it?**

This design violates the **Single Responsibility Principle (SRP)**.

**The Flaw:**
SRP states that a class should have one, and only one, reason to change. The `Invoice` class currently has three entirely separate reasons to change:
1. Business Rules (Tax laws change).
2. Presentation/Formatting (The PDF layout needs a new logo).
3. Persistence (Switching from SQL Server to MongoDB).

By bundling all these into one class, the code becomes extremely fragile. A developer changing the PDF formatting might accidentally modify a shared private field used by the tax calculator, causing financial errors.

**The Fix:**
You must decompose the class into separate, cohesive classes based on their responsibility.

1. **The Domain Model:** The `Invoice` class should *only* contain data (LineItems, Date) and pure business logic (`CalculateTotal()`).
2. **The Output Service:** Create an `InvoicePdfFormatter` class whose sole responsibility is taking an `Invoice` object and returning a PDF stream.
3. **The Repository:** Create an `InvoiceRepository` class whose sole responsibility is handling the database INSERT/UPDATE operations.

By splitting these responsibilities, a bug introduced while updating the PDF logo physically cannot affect the tax calculation logic, making the system much more robust.

---

## Beginner — Question 3

**Q3: What is the difference between method overloading and method overriding?**

Both let a class present multiple behaviors under related signatures, but they operate at completely different times and for different reasons.

**Method Overloading (compile-time polymorphism):**
- Multiple methods in the *same* class share a name but differ in parameter list (count, types, or order).
- The compiler picks which one to call based on the argument types at the call site — resolved entirely at compile time.

```csharp
public class Calculator {
    public int Add(int a, int b) => a + b;
    public double Add(double a, double b) => a + b;
    public int Add(int a, int b, int c) => a + b + c;
}
```

**Method Overriding (runtime polymorphism):**
- A derived class provides a *new implementation* of a `virtual`/`abstract` method inherited from a base class, using the `override` keyword — same name, same signature.
- The actual implementation invoked is resolved at runtime based on the object's real type (via the vtable), not the reference type used to call it.

```csharp
public class Shape { public virtual double Area() => 0; }
public class Circle : Shape { public override double Area() => Math.PI * Radius * Radius; }
```

**Common Pitfall:** confusing overloading with overriding when a derived class redeclares a method with a *different* signature than the base — that's just a new overload on the derived class, not an override, and it won't participate in polymorphic dispatch through a base-class reference.

---

## Intermediate — Question 3

**Q3: What is the difference between a shallow copy and a deep copy of an object, and how do you implement each in C#?**

When you copy an object that contains reference-type fields (like a `List<T>` or a nested class), "copying" is ambiguous — do the copies share the nested objects, or each get their own?

**Shallow Copy:**
Creates a new object, but copies reference-type fields *by reference* — both the original and the copy point to the same nested objects. `MemberwiseClone()` (protected, from `System.Object`) always performs a shallow copy.

```csharp
public class Order : ICloneable {
    public List<string> Items { get; set; } = new();
    public object Clone() => MemberwiseClone(); // shallow: Items list is SHARED
}

var a = new Order();
a.Items.Add("Book");
var b = (Order)a.Clone();
b.Items.Add("Pen");
Console.WriteLine(a.Items.Count); // 2 — both share the same List<string> instance!
```

**Deep Copy:**
Recursively copies every referenced object too, so the copy is fully independent of the original. There's no built-in "deep clone" in .NET — you implement it explicitly, typically by cloning each nested member yourself or via serialization round-tripping.

```csharp
public object DeepClone() {
    var copy = (Order)MemberwiseClone();
    copy.Items = new List<string>(Items); // new list instance, independent
    return copy;
}
```

**Common Pitfall:** assuming `MemberwiseClone()` or a naive copy constructor gives you full independence — it silently shares any reference-type field several levels deep unless you explicitly clone each one, which is a frequent source of "mutating a copy also changed the original" bugs.

#### Follow-up: Is record `with` expression a shallow or deep copy?
Shallow — `with` copies all property values, but if a property is itself a reference type (e.g., a `List<T>`), the new record shares that same list instance with the original, same as `MemberwiseClone()`.

---

## Advanced — Question 3

**Q3: What is a "Composition Root," and why does it matter for keeping OOP code testable in a Dependency Injection-based application?**

The Composition Root is the single, specific location in an application (typically near the entry point — `Program.cs` in ASP.NET Core) where all the concrete implementations are wired up to their abstractions and objects are actually constructed.

**The Principle:**
Everywhere *else* in the codebase, classes should depend only on interfaces/abstractions and receive their dependencies via constructor injection — they should never call `new SomeConcreteClass()` themselves for a collaborator, and they should never reach into a container to resolve their own dependencies. The Composition Root is the *one* deliberate exception: it's allowed (and expected) to know about concrete types, because its entire job is object-graph construction.

```csharp
// Program.cs — the Composition Root
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddScoped<IOrderRepository, SqlOrderRepository>();
builder.Services.AddScoped<IPaymentGateway, StripePaymentGateway>();
builder.Services.AddScoped<OrderProcessor>(); // depends only on the interfaces above
var app = builder.Build();
```

**Why it matters:**
- **Testability:** every class outside the root can be unit tested by injecting fakes/mocks for its interfaces, because it never hardcodes a concrete dependency.
- **Single point of change:** swapping `SqlOrderRepository` for `MongoOrderRepository` touches exactly one line, in exactly one file.
- **Prevents the Service Locator anti-pattern:** if classes resolve dependencies from a container themselves (`serviceProvider.GetService<T>()`) scattered throughout the codebase, you effectively have *many* composition roots hiding dependencies, which defeats the purpose of DI entirely.

**Common Pitfall:** treating a DI container's `.Resolve<T>()` call as acceptable anywhere convenient "since the container is already there." If it happens outside the Composition Root, it's the Service Locator anti-pattern wearing a DI container's clothing — the class's real dependencies are hidden from its constructor signature, making it harder to reason about and test.

---

## Beginner — Question 4

**Q4: What is the difference between an "is-a" relationship and a "has-a" relationship in OOP, and why does mixing them up lead to bad designs?**

These are the two fundamental ways one class can relate to another — inheritance (is-a) versus composition (has-a) — and choosing the wrong one for a given relationship is one of the most common sources of fragile object models.

**"Is-a" — inheritance, for genuine specialization:**
```csharp
public class Animal { public virtual void Eat() { } }
public class Dog : Animal { } // "a Dog IS an Animal" -- a Dog can be used anywhere an Animal is expected
```
This should only be used when the derived type is *substitutable* for the base type in every context (the Liskov Substitution Principle) — a `Dog` really is a kind of `Animal`, with all the same fundamental behaviors, just specialized.

**"Has-a" — composition, for a part/capability relationship:**
```csharp
public class Car
{
    private readonly Engine _engine; // "a Car HAS an Engine" -- not a kind of Engine
    public Car(Engine engine) => _engine = engine;
    public void Start() => _engine.Ignite();
}
```
A `Car` is not a specialized kind of `Engine` — it *contains* one and delegates to it. Modeling this as inheritance (`class Car : Engine`) would be nonsensical and would expose `Engine`'s internal methods on `Car` inappropriately.

**Why mixing them up causes real problems:** the classic anti-pattern is inheriting purely for **code reuse** rather than genuine substitutability — e.g., making `Square` inherit from `Rectangle` because "it's almost the same code," when a `Square` cannot actually honor `Rectangle`'s behavioral contract (independently settable width/height) without breaking callers, as covered in the Liskov Substitution Principle. The fix in cases like that is almost always to switch from inheritance to composition or a shared interface.

**Common Pitfall:** choosing inheritance because it "saves typing" a delegating wrapper method, without checking whether the "is-a" relationship genuinely holds in every case a caller might use it — composition is more verbose upfront but far more flexible and safe when the relationship isn't a true specialization.

---

## Intermediate — Question 4

**Q4: What is method overloading resolution, and how does the C# compiler decide which overload to call when multiple candidates could match?**

When a class has several methods with the same name but different parameter lists, the compiler must pick exactly one at compile time using a specific, deterministic set of rules — understanding this matters because subtle ambiguity or surprising overload choices are a real source of bugs.

**The resolution process, roughly:**
```csharp
void Process(int x) { Console.WriteLine("int"); }
void Process(long x) { Console.WriteLine("long"); }
void Process(object x) { Console.WriteLine("object"); }

Process(5);        // "int" -- exact type match wins
Process(5L);       // "long" -- exact type match wins
Process("hello");  // "object" -- no exact match, but string converts to object
```
The compiler first looks for an exact type match; if none exists, it looks for the "most specific" applicable conversion — a narrower/more derived parameter type beats a broader one when multiple conversions are possible.

**Where this gets genuinely tricky — nullable and generic overloads:**
```csharp
void Process(int? x) { } // nullable int
void Process(int x) { }

Process(5); // calls Process(int) -- the compiler prefers the non-nullable exact match
```

**A common ambiguity bug — extension methods vs instance methods:**
```csharp
public static class StringExtensions
{
    public static bool IsValid(this string s) => !string.IsNullOrEmpty(s);
}
public class MyString
{
    public bool IsValid() => true; // instance method with the SAME name
}
```
Instance methods **always** win over extension methods with the same signature, regardless of which one a developer "intended" to call — extension method resolution only kicks in when no applicable instance method exists at all, which can silently mask a bug if a developer assumed their extension method was being called.

**Common Pitfall:** adding a new, more general overload to an existing class (e.g., adding `Process(object x)` to a class that previously only had `Process(int x)`) — for a call site passing an `int`, `Process(int)` still wins (exact match beats the new broader overload), but this can still create genuinely ambiguous compiler errors in edge cases involving implicit conversions across multiple candidate overloads, which is why overload sets should be designed deliberately rather than grown ad hoc.

---

## Advanced — Question 4

**Q4: What is the difference between `sealed` classes/methods and access modifiers, and what performance and design benefits does `sealed` actually provide?**

`sealed` prevents further inheritance (on a class) or further overriding (on a method) — a fundamentally different kind of restriction than access modifiers (`private`/`protected`/`public`), which control *visibility*, not *extensibility*.

**Sealing a class — no one can inherit from it at all:**
```csharp
public sealed class Money
{
    public decimal Amount { get; }
    public string Currency { get; }
    // No class can ever do: public class SpecialMoney : Money { }
}
```

**Sealing an overridden method — stops further overriding down the hierarchy:**
```csharp
public class Base { public virtual void Method() { } }
public class Middle : Base { public sealed override void Method() { } } // seals it HERE
public class Derived : Middle { public override void Method() { } } // COMPILE ERROR -- can't override a sealed override
```
This lets `Middle` guarantee its specific implementation of `Method()` can never be replaced by any further subclass, even though the original `Base.Method()` was `virtual` and overridable in general.

**The performance benefit — devirtualization:** when the JIT compiler can prove a method can never be overridden (because the class is `sealed`, or the method itself is sealed), it can sometimes skip the virtual method table (vtable) lookup entirely and call the method directly — a "devirtualized" call, which is measurably faster in hot paths, though the JIT already does significant devirtualization analysis on its own even without `sealed` in many cases.

**The design benefit — protecting invariants:** a class that carefully enforces invariants in its constructor and methods (like `Money` above, ensuring `Amount` and `Currency` always stay consistent) can be undermined by an unexpected subclass overriding a method and violating those invariants in a way the original author never anticipated. Sealing communicates "this class's behavior is complete and intentional — extend via composition, not inheritance" (matching the earlier "composition over inheritance" guidance).

**Common Pitfall:** sealing classes reflexively "for performance" across an entire codebase without considering whether genuine extension points are needed — over-sealing can force consumers into awkward composition-based workarounds for cases where controlled inheritance would have been the cleaner design; `sealed` is best applied deliberately to types whose behavior genuinely must not be altered (value-like types, security-sensitive classes), not as a blanket default.

---

## Beginner — Question 5

**Q5: What is the difference between a Constructor and a Static Factory Method for creating objects, and when would you prefer the latter?**

A constructor is the default, language-level way to create an instance. A Static Factory Method is an ordinary static method (often named `Create`, `Of`, or something domain-specific) that returns an instance instead — offering flexibility a constructor structurally can't provide.

**A constructor — always returns a new instance of exactly this type:**
```csharp
public class Connection
{
    public Connection(string connectionString) { ... } // MUST return a new Connection
}
```

**A Static Factory Method — can return a cached instance, a subtype, or even null:**
```csharp
public class Connection
{
    private Connection(string connectionString) { ... } // constructor made private

    public static Connection? Create(string connectionString)
    {
        if (!IsValid(connectionString)) return null;          // constructors can't do this
        if (_pool.TryGet(connectionString, out var existing))
            return existing;                                   // return a CACHED instance
        return new Connection(connectionString);                // or a genuinely new one
    }
}
```

**Why this flexibility matters:** a constructor in C# is required to either fully construct a new object or throw an exception — it cannot return `null`, return an already-existing cached instance, or return an instance of a *different* (derived) type. A static factory method faces none of these restrictions, since it's just an ordinary method that happens to produce instances.

**A named factory method can also be more descriptive than an overloaded constructor:**
```csharp
// Ambiguous which "Point" this represents
var p1 = new Point(3, 4);            // Cartesian? Polar?

// Self-documenting via named factory methods instead of ambiguous constructor overloads
var p2 = Point.FromCartesian(3, 4);
var p3 = Point.FromPolar(radius: 5, angle: 0.93);
```

**Common Pitfall:** overusing static factory methods purely out of habit for types that have no genuine need for caching, subtype selection, or validation-that-returns-null — for a simple, always-succeeding, always-distinct object, a plain constructor is more idiomatic and doesn't hide object creation behind an extra layer of indirection for no real benefit.

---

## Intermediate — Question 5

**Q5: What is the Liskov Substitution Principle's connection to "Design by Contract," and how do preconditions/postconditions formalize what it means for a subtype to be substitutable?**

Design by Contract, a concept from Bertrand Meyer, frames a method's obligations as a formal **contract**: preconditions (what must be true before calling it) and postconditions (what it guarantees will be true after it returns). LSP can be precisely restated in this vocabulary: a subtype must not strengthen preconditions or weaken postconditions relative to its base type.

**A subtype violating LSP by strengthening a precondition:**
```csharp
public class Rectangle
{
    public virtual void SetDimensions(int width, int height) { Width = width; Height = height; }
    // Precondition (implicit): width and height can be ANY positive integers
}

public class ValidatedRectangle : Rectangle
{
    public override void SetDimensions(int width, int height)
    {
        if (width > 1000) throw new ArgumentException("Too wide"); // STRENGTHENED precondition!
        base.SetDimensions(width, height);
    }
}
```
Client code written against `Rectangle` that previously worked fine calling `SetDimensions(2000, 5)` now unexpectedly throws when handed a `ValidatedRectangle` instead — the subtype demanded *more* from its callers than the base type ever did, breaking substitutability, since a caller relying on the base contract has no reason to expect this extra restriction.

**A subtype violating LSP by weakening a postcondition:**
```csharp
public class Repository
{
    public virtual List<Order> GetAll() // Postcondition (implicit): NEVER returns null, may return empty list
        => _db.Orders.ToList();
}

public class CachedRepository : Repository
{
    public override List<Order>? GetAll() // WEAKENED postcondition -- can now return null!
        => _cache.TryGetValue("orders", out var cached) ? cached : null;
}
```
Callers written against the base type's guarantee ("this never returns null") now face a `NullReferenceException` when handed the subtype instead — the subtype provides *less* guarantee than callers were promised by the base type's contract.

**Why this framing is useful beyond LSP's usual "Square/Rectangle" example:** it gives a precise, checkable rule — "can I strengthen this?" (no, for preconditions) and "can I weaken this?" (no, for postconditions) — rather than relying purely on intuition about whether a subtype "feels like" a valid specialization.

**Common Pitfall:** assuming any additional validation in an override is automatically an LSP violation — the actual rule is specifically about *strengthening beyond what the base type's contract already promised callers*; if the base type's own documented contract already implied that restriction (even if not enforced in code), the override is just correctly enforcing an existing contract, not violating LSP.

---

## Advanced — Question 5

**Q5: What is Double Dispatch, and how does the Visitor pattern use it to add new operations to a class hierarchy without modifying the hierarchy itself?**

Ordinary virtual method calls in C# are **single dispatch** — the method that executes is chosen based on the runtime type of exactly one object (the receiver). Double Dispatch selects behavior based on the runtime types of **two** objects — the Visitor pattern is the classic technique for achieving this in a single-dispatch language like C#.

**The problem Double Dispatch solves — behavior that depends on TWO types, not one:**
```csharp
public abstract class Shape { }
public class Circle : Shape { }
public class Square : Shape { }

// You want DIFFERENT rendering logic depending on the COMBINATION of (Shape type, Renderer type)
// e.g., rendering a Circle to SVG differs from rendering a Circle to a raster image
```
A single virtual method on `Shape` alone can dispatch based on the shape's type, but not simultaneously on which renderer is being used — that requires two dispatch decisions working together.

**The Visitor pattern achieving Double Dispatch:**
```csharp
public interface IShapeVisitor { void Visit(Circle c); void Visit(Square s); }

public abstract class Shape { public abstract void Accept(IShapeVisitor visitor); }
public class Circle : Shape { public override void Accept(IShapeVisitor v) => v.Visit(this); }
public class Square : Shape { public override void Accept(IShapeVisitor v) => v.Visit(this); }

public class SvgRenderer : IShapeVisitor
{
    public void Visit(Circle c) { /* SVG-specific circle rendering */ }
    public void Visit(Square s) { /* SVG-specific square rendering */ }
}
```
Calling `shape.Accept(svgRenderer)` triggers **two** virtual dispatches in sequence: first, `Accept` dispatches based on `shape`'s actual runtime type (Circle vs Square), calling the right `Visit(this)` overload; then, that call itself dispatches to the correct `Visit` method based on the *visitor's* runtime type (via method overload resolution combined with `this`'s now-known concrete type) — together, the combination selects behavior based on both types simultaneously.

**Why this matters architecturally:** it lets you add an entirely new operation (a new `IShapeVisitor` implementation, like a `RasterRenderer`) **without modifying `Circle` or `Square` at all** — new behaviors are added by writing new visitor classes, while the shape hierarchy itself stays closed to modification (an application of the Open/Closed Principle specifically for the "add new operations to an existing hierarchy" axis of change).

**Common Pitfall:** reaching for the Visitor pattern when the class hierarchy itself changes frequently (adding new shape types) rather than the operations — Visitor makes adding new *operations* cheap but adding a new *type* to the hierarchy expensive (every existing visitor implementation must be updated to handle the new type), the exact inverse trade-off of ordinary polymorphism; it fits scenarios where the type hierarchy is stable but operations on it grow over time.

---
