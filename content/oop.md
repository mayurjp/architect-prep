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
