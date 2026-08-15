# C# & .NET Fundamentals — Q&A

## Beginner — Question 1

**Q1: Difference between value types and reference types**


Value types include the primitives (`int`, `double`, `bool`, `char`), `struct`, and `enum`. They store their actual data directly in the memory location where the variable lives — on the stack for local variables, or inline within the containing object on the heap. When you assign one value type to another or pass it to a method, the entire value is *copied*, so the two variables are independent.

Reference types include `class`, `string`, `array`, `delegate`, and `interface`. The variable holds a *reference* (a pointer) to an object stored on the managed heap. When you assign or pass a reference type, only the reference is copied — both variables now point to the *same* object.

```csharp
struct PointS { public int X; }
class PointC { public int X; }

var a = new PointS { X = 1 };
var b = a;  b.X = 99;   // a.X is still 1 (copy)

var c = new PointC { X = 1 };
var d = c;  d.X = 99;   // c.X is now 99 (same object)
```

**Deep dive:** Every type is either a value type (derives from `System.ValueType`) or a reference type (derives directly from `System.Object`). Reference type objects carry heap overhead (object header + method table pointer, ~16 bytes) before fields; value types have no per-instance overhead.

**Mutable structs are dangerous** — `list[0].Inc()` mutates a copy. Guidance: make structs immutable (`readonly struct`). Use a struct only when the type is small (≈16 bytes), logically a single value, immutable, and rarely boxed.

**Memory nuance (correcting the oversimplification):** "value types on stack, reference types on heap" is incomplete. Accurate rules: a value type local → stack; a value type field of a class → heap (inline in the object); a boxed or closure-captured value type → heap; a reference type object → always heap, with its reference wherever the variable lives.

**Follow-ups:** `string` is a reference type but behaves value-like for equality. Arrays are reference types even `int[]`, though elements are stored inline.

---

## Beginner — Question 2

**Q2: What is boxing and unboxing?**


Boxing wraps a value type inside a heap-allocated object so it can be treated as `object` or an interface. Unboxing extracts the value back out with an explicit, type-strict cast.

```csharp
int i = 42;
object o = i;       // BOX: heap allocation, value copied in
int j = (int)o;     // UNBOX: type-checked, value copied out
```

**Type-strictness gotcha:** unboxing must be to the exact boxed type — no implicit conversions.

```csharp
object o = 42;          // boxed int
long l = (long)o;       // ❌ InvalidCastException
long l2 = (long)(int)o; // ✅ unbox to int, then convert
```

**Where boxing sneaks in:** non-generic collections (`ArrayList`, `Hashtable`); string formatting/concatenation with value types; value type used via an interface (`IComparable c = 5;`); enumeration over non-generic sequences.

**Why it matters:** each box is a heap allocation → Gen 0 garbage → more frequent GC → throughput loss in hot paths.

**Avoiding it:** use generics (`List<int>`), generic constraints, `IEquatable<T>`, `EqualityComparer<T>.Default`.

**Follow-up:** passing a struct to `Foo<T>(T x)` does **not** box — generics preserve the concrete type.

---

## Beginner — Question 3

**Q3: Difference between `const`, `readonly`, and `static`**


**`const`** — compile-time constant, value inlined into every call site, implicitly `static`, limited to primitives/strings/null. Causes a **versioning trap**: consumers bake in the literal value and must be recompiled to see a change.

**`readonly`** — runtime constant, assignable only at declaration or in a constructor, can be any type, can differ per instance. Protects the *field*, not the pointed-to object (a `readonly List` can still be `.Add()`-ed).

**`static`** — belongs to the type, one shared copy for all instances (orthogonal to const/readonly).

```csharp
public const double Pi = 3.14159;                       // compile-time, inlined
public static readonly DateTime Start = DateTime.Now;   // runtime, one shared value
public readonly int Id;                                 // set per instance in constructor
```

**Decision guide:** internal primitive that never changes → `const`; fixed but runtime-computed / object / public API → `static readonly`; fixed per object → `readonly`.

**Follow-ups:** a `DateTime` can't be `const` (not a compile-time constant type). Static readonly fields are initialized by the type initializer, lazily and thread-safely before first access.

---

## Beginner — Question 4

**Q4: What are access modifiers (public, private, protected, internal)?**

*(Planned — not yet answered.)*

---

## Beginner — Question 5

**Q5: Difference between `string` and `StringBuilder`**


`string` is immutable — every "modification" returns a new object. `StringBuilder` maintains a mutable, resizable buffer appended in place.

**Why loops are the killer:** `result += i` in a loop allocates a new string each iteration, copying all prior characters → O(n²) time and allocations.

```csharp
// Inefficient
string result = "";
for (int i = 0; i < n; i++) result += i;

// Efficient — amortized O(1) appends, O(n) total
var sb = new StringBuilder();
for (int i = 0; i < n; i++) sb.Append(i);
string result2 = sb.ToString();
```

**When NOT to use StringBuilder:** for a small fixed number of pieces, the compiler folds `a + b + c` into a single `String.Concat`; use concatenation, interpolation, or `string.Join`. The O(n²) trap only appears with concatenation *inside a loop*.

**Tips:** pass an initial capacity to avoid regrowth; `StringBuilder` isn't thread-safe.

**Follow-up:** compile-time string literals are interned (deduplicated); runtime-computed strings are not unless you call `String.Intern`.

---

## Beginner — Question 6

**Q6: What is the difference between `==` and `.Equals()`?**


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

## Beginner — Question 7

**Q7: Explain `ref` vs `out` parameters**


Both pass by reference. `ref` requires initialization before the call (two-way). `out` doesn't require prior initialization but the method must assign it before returning (output-only).

```csharp
void Increment(ref int x) => x++;
bool TryParse(string s, out int result) { result = 0; return int.TryParse(s, out result); }
```

Modern C# also has `in` parameters (pass by reference, read-only) for passing large structs efficiently without allowing modification.

---

## Beginner — Question 8

**Q8: What is a nullable type?**


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

**Q2: What are events and how do they differ from delegates?**


An event is controlled publisher/subscriber access to a delegate. The `event` keyword restricts outside code to `+=` / `-=` only; only the declaring class can raise it. Standard pattern uses `EventHandler` / `EventHandler<T>` and a `protected virtual OnXxx` method.

```csharp
public class Button {
    public event EventHandler Clicked;
    protected void OnClick() => Clicked?.Invoke(this, EventArgs.Empty);
}
```

Unsubscribe handlers when done — lingering subscriptions are a common memory leak.

---

## Intermediate — Question 3

**Q3: Difference between `IEnumerable` and `IQueryable`**


`IEnumerable<T>` — in-memory iteration (LINQ to Objects); operators take delegates; filtering happens in app memory. `IQueryable<T>` — builds expression trees a provider translates (e.g., to SQL); filtering happens at the data source, returning only matching rows.

```csharp
IQueryable<User> q = db.Users.Where(u => u.Age > 30);      // filters in DB
IEnumerable<User> e = db.Users.AsEnumerable().Where(u => u.Age > 30); // pulls all rows first
```

Calling `.AsEnumerable()`/`.ToList()` too early is a classic performance bug.

---

## Intermediate — Question 4

**Q4: Explain LINQ deferred vs immediate execution**


The query isn't run when defined, only when enumerated (`foreach`, `ToList`, `Count`, `First`, `Sum`). Operators like `Where`/`Select`/`OrderBy` are deferred; materializers force execution.

```csharp
var query = numbers.Where(n => n > 5);  // nothing runs
numbers.Add(100);                        // included
foreach (var n in query) { }             // executes now
```

Consequences: re-executes on each enumeration; reflects current source state. Call `.ToList()` to snapshot.

---

## Intermediate — Question 5

**Q5: Difference between `abstract class` and `interface`**


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

## Intermediate — Question 6

**Q6: Explain garbage collection and generations (Gen 0, 1, 2)**


The GC reclaims unreachable heap memory (roots: locals, statics, registers) and compacts the heap. Generational model: **Gen 0** (new, short-lived, collected often/cheap), **Gen 1** (buffer), **Gen 2** (long-lived, collected rarely/expensive). Large objects (≥85,000 bytes) go on the **LOH**, collected with Gen 2, not compacted by default. Keeping objects short-lived is good for performance.

---

## Intermediate — Question 7

**Q7: What is `IDisposable` and the `using` statement?**


`IDisposable.Dispose()` deterministically releases unmanaged/expensive resources the GC doesn't manage promptly. `using` guarantees `Dispose()` even on exception (compiles to try/finally).

```csharp
using (var conn = new SqlConnection(cs)) { conn.Open(); }
using var file = new StreamReader("data.txt"); // C# 8+ using declaration
```

Failing to dispose causes connection-pool exhaustion and file locks.

---

## Intermediate — Question 8

**Q8: Difference between `Task`, `Thread`, and `async/await`**


**`Thread`** — low-level OS thread, expensive (~1 MB stack). **`Task`** — higher-level async operation, usually scheduled on the thread pool; composable. **`async/await`** — compiler syntax to consume tasks without blocking; for I/O-bound work `await` frees the thread entirely while waiting.

```csharp
int result = await Task.Run(() => HeavyComputation()); // CPU-bound
string html = await httpClient.GetStringAsync(url);    // I/O-bound, no thread blocked
```

Use async/await for I/O; `Task.Run` to offload CPU work; raw `Thread` almost never.

---

## Intermediate — Question 9

**Q9: What are extension methods?**


Static methods in a static class whose first parameter is marked `this`, letting you call them with instance syntax on an existing type without modifying it. LINQ is built as extension methods on `IEnumerable<T>`.

```csharp
public static class StringExtensions {
    public static bool IsNullOrEmpty(this string s) => string.IsNullOrEmpty(s);
}
```

Resolved at compile time; can't access private members; instance methods take precedence on name clash.

---

## Advanced — Question 1

**Q1: Explain the internals of `async/await` (state machine)**


The compiler rewrites an `async` method into a **state machine** (`IAsyncStateMachine`), splitting the body at each `await` and hoisting locals to fields. At an `await`, if the task isn't complete, it registers a continuation and returns control to the caller (releasing the thread); on completion it resumes at the saved state (by default on the captured `SynchronizationContext`). Blocking on the task (`.Result`) while its continuation needs the same context causes a deadlock.

---

## Advanced — Question 2

**Q2: `struct` vs `class` memory allocation (stack vs heap)**


Value type **local** → stack. Value type **field of a class** → heap (inline in the object). **Boxed / closure-captured** value type → heap. Reference type **object** → always heap; its **reference** wherever the variable lives. Iterator/async locals get hoisted to the heap. Small short-lived structs avoid GC, but large structs cause expensive copying — it's a trade-off.

---

## Advanced — Question 3

**Q3: Explain covariance and contravariance**


**Covariance** (`out`) — use a more derived type argument; valid when `T` is only produced/output (`IEnumerable<out T>`). **Contravariance** (`in`) — use a more generic type argument; valid when `T` is only consumed/input (`Action<in T>`).

```csharp
IEnumerable<object> objs = new List<string>();   // covariance
Action<string> s = (Action<object>)(o => { });   // contravariance
```

Mnemonic: `out` = covariant = producer; `in` = contravariant = consumer. `List<T>` is invariant (both produces and consumes).

---

## Advanced — Question 4

**Q4: How does `ConfigureAwait(false)` work and when to use it?**


Tells the awaiter not to capture/resume on the original synchronization context; the continuation runs on any thread-pool thread. Prevents the classic UI/ASP.NET deadlock when code blocks on async with `.Result`/`.Wait()`. Use throughout **library** code that doesn't need the context; don't use in UI code that must touch controls after awaiting. ASP.NET Core has no sync context, so it's less critical there.

---

## Advanced — Question 5

**Q5: Explain `Span<T>` and `Memory<T>`**


Both are views over contiguous memory enabling slicing without copying. `Span<T>` is a stack-only `ref struct` (fast; can't be a field, boxed, captured, or used across `await`/`yield`). `Memory<T>` is heap-friendly and usable in async methods; call `.Span` when operating.

```csharp
ReadOnlySpan<char> span = "12345,67890".AsSpan();
int value = int.Parse(span.Slice(0, 5));   // no new string allocated
```

Use `Span<T>` for synchronous hot paths; `Memory<T>` when the view crosses async boundaries or lives on the heap.

---

## Advanced — Question 6

**Q6: Thread synchronization (lock, Monitor, Mutex, Semaphore)**


- **`lock`/`Monitor`** — mutual exclusion within a process; lock on a private object.
- **`Mutex`** — cross-process mutual exclusion (kernel object, heavier).
- **`Semaphore`/`SemaphoreSlim`** — limit concurrent access to N; `SemaphoreSlim` supports `WaitAsync`.
- **`ReaderWriterLockSlim`** — many readers / one writer.
- **`Interlocked`** — atomic increment/exchange without a full lock.
- **`AutoResetEvent`/`ManualResetEvent(Slim)`** — signaling.

```csharp
private readonly object _gate = new();
lock (_gate) { _counter++; }

private readonly SemaphoreSlim _sem = new(3);
await _sem.WaitAsync();
try { await CallApiAsync(); } finally { _sem.Release(); }
```

Prefer the lightest primitive that fits; keep locked regions small; lock in a consistent order to avoid deadlocks; never `await` inside a `lock` (use `SemaphoreSlim`).

---

# PART B — Question Banks (Basic / Intermediate / Advanced)

## C# / .NET

**Basic**
- Difference between value types and reference types
- What is boxing and unboxing?
- Difference between `const`, `readonly`, and `static`
- What are access modifiers (public, private, protected, internal)?
- Difference between `string` and `StringBuilder`
- What is the difference between `==` and `.Equals()`?
- Explain `ref` vs `out` parameters
- What is a nullable type?

**Intermediate**
- Explain delegates, `Func`, `Action`, `Predicate`
- What are events and how do they differ from delegates?
- Difference between `IEnumerable` and `IQueryable`
- Explain LINQ deferred vs immediate execution
- Difference between `abstract class` and `interface`
- Explain garbage collection and generations (Gen 0, 1, 2)
- What is `IDisposable` and the `using` statement?
- Difference between `Task`, `Thread`, and `async/await`
- What are extension methods?

**Advanced**
- Explain the internals of `async/await` (state machine)
- `struct` vs `class` memory allocation (stack vs heap)
- Explain covariance and contravariance
- How does `ConfigureAwait(false)` work and when to use it?
- Explain `Span<T>` and `Memory<T>`
- Thread synchronization (lock, Monitor, Mutex, Semaphore)
- Explain the dispose pattern (finalizer + `Dispose`)
- What causes memory leaks in managed code?
- Difference between `Task.Run` and `Task.Factory.StartNew`

## ASP.NET MVC

**Basic**
- What is MVC and its components?
- Explain the MVC request lifecycle
- Difference between `ViewBag`, `ViewData`, and `TempData`
- What are Action Results (`ViewResult`, `JsonResult`, etc.)?
- Difference between `GET` and `POST`
- What is routing?

**Intermediate**
- Difference between `RedirectToAction` and `Redirect`
- What are Action Filters? (Authorization, Action, Result, Exception)
- Explain model binding and validation (Data Annotations)
- `Html.Partial` vs `Html.RenderPartial` vs `Html.Action`
- What is the anti-forgery token (`ValidateAntiForgeryToken`)?
- Explain areas in MVC

**Advanced**
- How does dependency injection work in MVC?
- Explain custom model binders
- Attribute routing vs convention routing
- How do you handle exceptions globally?
- Explain output caching strategies
- ASP.NET MVC vs ASP.NET Core MVC (middleware pipeline)

## ASP.NET Web API

**Basic**
- What is a RESTful API?
- Difference between Web API and MVC controllers
- Explain HTTP verbs (GET, POST, PUT, PATCH, DELETE)
- Common HTTP status codes (200, 201, 400, 401, 404, 500)
- What is content negotiation?

**Intermediate**
- How do you version a Web API?
- Authentication vs authorization
- What is JWT and how does token-based auth work?
- `IHttpActionResult` vs `HttpResponseMessage`
- How do you handle CORS?
- Explain media formatters

**Advanced**
- Explain the Web API pipeline (message handlers, delegating handlers)
- How do you implement rate limiting / throttling?
- Explain OAuth 2.0 flows
- How do you secure an API (HTTPS, tokens, API keys)?
- Explain idempotency in REST
- Exception filters and global error handling

## SQL Server

**Basic**
- Difference between `WHERE` and `HAVING`
- Types of JOINs (INNER, LEFT, RIGHT, FULL, CROSS)
- Difference between `DELETE`, `TRUNCATE`, and `DROP`
- Primary key vs unique key
- What is a foreign key?
- `CHAR` vs `VARCHAR`

**Intermediate**
- What are indexes? Clustered vs non-clustered
- Stored procedures vs functions
- What are views? Advantages?
- Explain `GROUP BY` and aggregate functions
- What are triggers?
- `UNION` vs `UNION ALL`
- What is a CTE (Common Table Expression)?

**Advanced**
- Explain query execution plans and optimization
- Indexing strategy: covering index, included columns
- Transactions and ACID properties
- Isolation levels (Read Uncommitted, Committed, Repeatable Read, Serializable)
- Deadlocks and how to prevent them
- Temp tables vs table variables vs CTEs
- Window functions (`ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LEAD`, `LAG`)
- Database normalization (1NF, 2NF, 3NF)

---

*Prepared as a study reference. Part A answers are expanded in depth; Part B lists the full question bank to be expanded next.*

---

## Advanced — Question 7

**Q7: Explain the dispose pattern (finalizer + `Dispose`)**


Implement `Dispose()` (calls `Dispose(true)` + `GC.SuppressFinalize(this)`), a `protected virtual Dispose(bool disposing)` (free managed only when `disposing`; free unmanaged always), and a finalizer `~T() => Dispose(false)` as a fallback. In the finalizer path you must not touch managed objects (they may be collected). For a single unmanaged resource, prefer `SafeHandle` (removes the need for a finalizer).

---

## Advanced — Question 8

**Q8: What causes memory leaks in managed code?**


- **Event handlers** — publisher holds subscriber alive; unsubscribe with `-=`.
- **Static references** — live for the app domain's lifetime; unbounded static caches grow forever.
- **Undisposed disposables** — leak unmanaged resources, exhaust pools.
- **Closures** — captured variables kept alive by long-lived lambdas.
- **Timers / background tasks** — hold their callback target alive.

Use memory profilers (dotMemory, VS diagnostics) to find roots keeping objects alive.

---

## Advanced — Question 9

**Q9: Difference between `Task.Run` and `Task.Factory.StartNew`**


`Task.Run` is a safe shortcut with sensible defaults (thread pool, `DenyChildAttach`, `Default` scheduler). `StartNew` is configurable but has two traps: with async delegates it returns `Task<Task>` (needs `.Unwrap()`), and it uses `TaskScheduler.Current` (not `.Default`). Prefer `Task.Run` unless you need an option only `StartNew` provides (e.g., `LongRunning`).

---
