# csharp — Q&A


## Beginner — Question 1

**Q1: What are access modifiers (public, private, protected, internal)?**

Access modifiers define the visibility and accessibility of classes, methods, and other members in C#.

1. **`public`**: The member is accessible from anywhere (any assembly or class).
2. **`private`**: The member is accessible *only* within the body of the class or struct in which it is declared. This is the default for class members.
3. **`protected`**: The member is accessible within its own class and any class that inherits from it (derived classes).
4. **`internal`**: The member is accessible only within the same assembly (.dll or .exe). This is the default for top-level classes.
5. **`protected internal`**: Accessible from the same assembly *OR* from derived classes in other assemblies.
6. **`private protected`**: Accessible from the same assembly *AND* only by derived classes.

```csharp
public class Employee {
    public string Name { get; set; }      // Anyone can read/write
    private decimal Salary { get; set; }  // Only Employee can read/write
    protected void CalculateBonus() {}    // Employee and inherited classes can call
}
```

#### Follow-up: What is the default access modifier for a class and its members?
By default, top-level types (classes, structs, interfaces) are `internal`. The default for members inside those types (fields, properties, methods) is `private`.

---

## Beginner — Question 2

**Q2: What is the difference between `==` and `.Equals()`?**


`==` is a **static operator** resolved at **compile time** from the operands' compile-time types (overloadable). `.Equals()` is a **virtual method** resolved at **runtime** via the actual type (overridable).

```csharp
object x = "hello";
object y = "hel" + Console.ReadLine();  // runtime "hello"

x == y;         // OBJECT ==, reference equality → likely false
x.Equals(y);    // virtual → String.Equals → value equality → true
```

**Defaults:** reference types → both do reference equality unless overridden; `string` overloads both for value equality; value types get field-by-field `ValueType.Equals` (reflection-based, slow — override it). `ReferenceEquals` always checks identity.

**Nuances:** `double.NaN == double.NaN` is false, but `.Equals` returns true. Nullable `null == null` is true (lifted operator).

**Contract:** if you override `Equals`, also override `GetHashCode` (equal objects must have equal hashes) and ideally implement `IEquatable<T>` and overload `==`/`!=`.

```csharp
public sealed class Money : IEquatable<Money> {
    public decimal Amount { get; }
    public string Currency { get; }
    public bool Equals(Money? o) => o is not null && Amount == o.Amount && Currency == o.Currency;
    public override bool Equals(object? o) => Equals(o as Money);
    public override int GetHashCode() => HashCode.Combine(Amount, Currency);
    public static bool operator ==(Money? a, Money? b) => Equals(a, b);
    public static bool operator !=(Money? a, Money? b) => !Equals(a, b);
}
```

`record` types auto-generate value-based equality.

---

## Beginner — Question 3

**Q3: Explain `ref` vs `out` parameters**


Both pass by reference. `ref` requires initialization before the call (two-way). `out` doesn't require prior initialization but the method must assign it before returning (output-only).

```csharp
void Increment(ref int x) => x++;
bool TryParse(string s, out int result) { result = 0; return int.TryParse(s, out result); }
```

Modern C# also has `in` parameters (pass by reference, read-only) for passing large structs efficiently without allowing modification.

---

## Beginner — Question 4

**Q4: What is a nullable type?**


A nullable value type (`int?` = `Nullable<int>`) can hold all normal values plus `null` — essential for DB columns allowing NULL. Members: `.HasValue`, `.Value` (throws if null); operators `??` (coalesce) and `?.` (null-conditional).

```csharp
int? age = null;
int safeAge = age ?? 18;
```

Distinct from nullable *reference* types (C# 8+), a compile-time feature (`string?` vs `string`) that helps catch null-reference bugs without changing runtime behavior.

---

## Intermediate — Question 1

**Q1: Explain delegates, `Func`, `Action`, `Predicate`**


A delegate is a type-safe function pointer. Built-in generics: `Func<...,TResult>` (returns a value), `Action<...>` (returns void), `Predicate<T>` (returns bool). They underpin callbacks, events, and LINQ. Delegates can be multicast (`+=`).

```csharp
Func<int, int, int> add = (a, b) => a + b;
Action<string> log = Console.WriteLine;
Predicate<int> isEven = n => n % 2 == 0;
```

---

## Intermediate — Question 2

**Q2: Explain LINQ deferred vs immediate execution**


The query isn't run when defined, only when enumerated (`foreach`, `ToList`, `Count`, `First`, `Sum`). Operators like `Where`/`Select`/`OrderBy` are deferred; materializers force execution.

```csharp
var query = numbers.Where(n => n > 5);  // nothing runs
numbers.Add(100);                        // included
foreach (var n in query) { }             // executes now
```

Consequences: re-executes on each enumeration; reflects current source state. Call `.ToList()` to snapshot.

---

## Intermediate — Question 3

**Q3: Difference between `abstract class` and `interface`**


**Abstract class** — can't be instantiated; mixes abstract and concrete members, fields, constructors, access modifiers; single inheritance; use for shared identity + implementation ("is-a").

**Interface** — a contract; (traditionally) no implementation/fields/constructors; multiple implementation; use for capabilities unrelated types share ("can-do").

```csharp
abstract class Animal {
    public string Name { get; set; }
    public void Sleep() => Console.WriteLine("Zzz");
    public abstract void Speak();
}
interface IFlyable { void Fly(); }
class Bird : Animal, IFlyable {
    public override void Speak() => Console.WriteLine("Tweet");
    public void Fly() => Console.WriteLine("Flap");
}
```

Since C# 8, interfaces allow default method implementations, but still can't hold instance state. Single-inheritance vs multiple-implementation remains the key decision.

---

## Intermediate — Question 4

**Q4: What are extension methods?**


Static methods in a static class whose first parameter is marked `this`, letting you call them with instance syntax on an existing type without modifying it. LINQ is built as extension methods on `IEnumerable<T>`.

```csharp
public static class StringExtensions {
    public static bool IsNullOrEmpty(this string s) => string.IsNullOrEmpty(s);
}
```

Resolved at compile time; can't access private members; instance methods take precedence on name clash.

---

## Advanced — Question 1

**Q1: Explain covariance and contravariance**


**Covariance** (`out`) — use a more derived type argument; valid when `T` is only produced/output (`IEnumerable<out T>`). **Contravariance** (`in`) — use a more generic type argument; valid when `T` is only consumed/input (`Action<in T>`).

```csharp
IEnumerable<object> objs = new List<string>();   // covariance
Action<string> s = (Action<object>)(o => { });   // contravariance
```

Mnemonic: `out` = covariant = producer; `in` = contravariant = consumer. `List<T>` is invariant (both produces and consumes).

---

## Scenario — Question 1

**Q1: You have a high-performance C# application processing millions of incoming string messages per second. The application is experiencing massive Garbage Collection (GC) pauses because it's constantly allocating small `substring` objects when parsing the messages. How can you parse these strings without triggering the Garbage Collector?**

This is the classic scenario for using `Span<T>` and `Memory<T>`.

**The Problem:**
Historically, if you wanted to parse a specific part of a string (e.g., extracting an ID from `"MessageID: 12345"`), you used `string.Substring()`. Because strings are immutable in C#, `Substring()` allocates a brand new string on the Managed Heap. Creating millions of these small strings creates immense memory pressure, forcing the Garbage Collector to freeze the application to clean them up.

**The Solution:**
You use `ReadOnlySpan<char>`. 

**The Mechanism:**
`Span<T>` is a `ref struct` that provides a type-safe, memory-safe representation of a contiguous region of arbitrary memory. It acts as a "window" over the existing memory.
When you call `myString.AsSpan().Slice(start, length)`, you are NOT allocating a new string on the heap. You are simply creating a tiny struct on the *Stack* that contains a pointer to the middle of the original string and a length. 
You can then pass this `Span` to parsing methods (like `int.Parse()`) which natively accept spans.

```csharp
string message = "MessageID: 12345";
// Zero allocations on the heap!
ReadOnlySpan<char> idSpan = message.AsSpan().Slice(11); 
int id = int.Parse(idSpan);
```

**Why this matters:**
By using `Span<T>`, you completely eliminate heap allocations for the parsing logic. The GC has nothing to clean up, resulting in zero GC pauses and dramatically increased throughput.

---

## Scenario — Question 2

**Q2: You have a long-running desktop application. A specific button click fires an event that calls a massive computation, updating a UI element. Over hours of use, the application consumes gigs of RAM and eventually crashes with an `OutOfMemoryException`. Profiling shows millions of uncollected Form instances. What is the root cause and how do you fix it?**

This is the classic **Event Handler Memory Leak** (also known as the "Lapsed Listener" problem).

**The Root Cause:**
When a short-lived object (like a transient child Form or a DataGrid row) subscribes to an event on a long-lived object (like a static Publisher or the main Application shell), the long-lived object holds a hard reference to the short-lived object via the event's delegate list.
```csharp
// ChildForm.cs
public ChildForm(MainApp shell) {
    // shell now holds a reference to ChildForm
    shell.DataUpdated += HandleUpdate; 
}
```
When the user closes `ChildForm`, the .NET Garbage Collector tries to clean it up. However, it sees that `shell` (which is still alive) has a pointer to `ChildForm` inside its `DataUpdated` delegate invocation list. Because of this strong reference, the GC refuses to collect `ChildForm`. Every time the user opens and closes a form, a new instance is permanently leaked.

**The Solution:**
You must break the reference chain.
1. **Unsubscribe Explicitly:** The most common fix is to implement `IDisposable` or handle the Form's `FormClosed` event, and explicitly unsubscribe:
   ```csharp
   protected override void OnFormClosed(FormClosedEventArgs e) {
       shell.DataUpdated -= HandleUpdate;
       base.OnFormClosed(e);
   }
   ```
2. **Weak Events:** If explicit unsubscription is impossible or unwieldy, implement the Weak Event Pattern (e.g., using `WeakEventManager` in WPF/WinUI). This allows the publisher to maintain a `WeakReference` to the subscriber, which does not prevent the GC from collecting it.

---

## Scenario — Question 3

**Q3: You have an ASP.NET MVC application (not Core) or a WPF application. A developer writes the following code to call an async method synchronously: `var user = _userService.GetUserAsync(id).Result;`. The application instantly freezes and becomes completely unresponsive. What causes this deadlock, and how do you fix it?**

This is the classic **SynchronizationContext Deadlock**.

**The Flaw:**
In environments with a `SynchronizationContext` (like UI threads in WPF/WinForms or ASP.NET classic request threads), when you `await` a Task, the compiler attempts to resume the rest of the method on that exact same original thread.
1. The main UI/Request thread calls `GetUserAsync()`.
2. `GetUserAsync` hits an `await` (e.g., an HTTP call). It yields control back to the caller.
3. The developer called `.Result` on the Task. This blocks the main UI/Request thread, forcing it to wait until the Task is completely finished.
4. The HTTP call finishes. The Task tries to resume the rest of `GetUserAsync` on the original context (the main thread).
5. The main thread is currently blocked waiting for the Task to finish. The Task is waiting for the main thread to become free so it can finish. **Deadlock.**

**The Solutions:**
1. **Async All The Way (Preferred):** Never block on async code. Change the calling method to `async` and use `await _userService.GetUserAsync(id)`.
2. **ConfigureAwait(false):** If you are writing a library, you should append `.ConfigureAwait(false)` to your awaits (e.g., `await _client.GetAsync(url).ConfigureAwait(false);`). This tells the Task that it does *not* need to resume on the original context; it can resume on any random Thread Pool thread. This prevents the deadlock, as the Task no longer waits for the blocked main thread.
