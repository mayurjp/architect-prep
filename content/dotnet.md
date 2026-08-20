# dotnet — Q&A


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

**Q4: Difference between `string` and `StringBuilder`**


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

## Intermediate — Question 1

**Q1: What are events and how do they differ from delegates?**


An event is controlled publisher/subscriber access to a delegate. The `event` keyword restricts outside code to `+=` / `-=` only; only the declaring class can raise it. Standard pattern uses `EventHandler` / `EventHandler<T>` and a `protected virtual OnXxx` method.

```csharp
public class Button {
    public event EventHandler Clicked;
    protected void OnClick() => Clicked?.Invoke(this, EventArgs.Empty);
}
```

Unsubscribe handlers when done — lingering subscriptions are a common memory leak.

---

## Intermediate — Question 2

**Q2: Difference between `IEnumerable` and `IQueryable`**


`IEnumerable<T>` — in-memory iteration (LINQ to Objects); operators take delegates; filtering happens in app memory. `IQueryable<T>` — builds expression trees a provider translates (e.g., to SQL); filtering happens at the data source, returning only matching rows.

```csharp
IQueryable<User> q = db.Users.Where(u => u.Age > 30);      // filters in DB
IEnumerable<User> e = db.Users.AsEnumerable().Where(u => u.Age > 30); // pulls all rows first
```

Calling `.AsEnumerable()`/`.ToList()` too early is a classic performance bug.

---

## Intermediate — Question 3

**Q3: Explain garbage collection and generations (Gen 0, 1, 2)**


The GC reclaims unreachable heap memory (roots: locals, statics, registers) and compacts the heap. Generational model: **Gen 0** (new, short-lived, collected often/cheap), **Gen 1** (buffer), **Gen 2** (long-lived, collected rarely/expensive). Large objects (≥85,000 bytes) go on the **LOH**, collected with Gen 2, not compacted by default. Keeping objects short-lived is good for performance.

---

## Intermediate — Question 4

**Q4: What is `IDisposable` and the `using` statement?**


`IDisposable.Dispose()` deterministically releases unmanaged/expensive resources the GC doesn't manage promptly. `using` guarantees `Dispose()` even on exception (compiles to try/finally).

```csharp
using (var conn = new SqlConnection(cs)) { conn.Open(); }
using var file = new StreamReader("data.txt"); // C# 8+ using declaration
```

Failing to dispose causes connection-pool exhaustion and file locks.

---

## Intermediate — Question 5

**Q5: Difference between `Task`, `Thread`, and `async/await`**


**`Thread`** — low-level OS thread, expensive (~1 MB stack). **`Task`** — higher-level async operation, usually scheduled on the thread pool; composable. **`async/await`** — compiler syntax to consume tasks without blocking; for I/O-bound work `await` frees the thread entirely while waiting.

```csharp
int result = await Task.Run(() => HeavyComputation()); // CPU-bound
string html = await httpClient.GetStringAsync(url);    // I/O-bound, no thread blocked
```

Use async/await for I/O; `Task.Run` to offload CPU work; raw `Thread` almost never.

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

**Q3: How does `ConfigureAwait(false)` work and when to use it?**


Tells the awaiter not to capture/resume on the original synchronization context; the continuation runs on any thread-pool thread. Prevents the classic UI/ASP.NET deadlock when code blocks on async with `.Result`/`.Wait()`. Use throughout **library** code that doesn't need the context; don't use in UI code that must touch controls after awaiting. ASP.NET Core has no sync context, so it's less critical there.

---

## Advanced — Question 4

**Q4: Explain `Span<T>` and `Memory<T>`**


Both are views over contiguous memory enabling slicing without copying. `Span<T>` is a stack-only `ref struct` (fast; can't be a field, boxed, captured, or used across `await`/`yield`). `Memory<T>` is heap-friendly and usable in async methods; call `.Span` when operating.

```csharp
ReadOnlySpan<char> span = "12345,67890".AsSpan();
int value = int.Parse(span.Slice(0, 5));   // no new string allocated
```

Use `Span<T>` for synchronous hot paths; `Memory<T>` when the view crosses async boundaries or lives on the heap.

---

## Advanced — Question 5

**Q5: What is the difference between `lock`, `Mutex`, and `SemaphoreSlim` in C#?**

These are all synchronization primitives used to control access to shared resources in multithreaded applications.

1. **`lock` (Monitor):**
   - **Scope:** Local to the current AppDomain (single process).
   - **Mechanism:** It provides mutual exclusion (only one thread can enter the locked block). Under the hood, the C# `lock(obj)` is syntactic sugar for `Monitor.Enter(obj)` and `Monitor.Exit(obj)` wrapped in a `try/finally` block.
   - **Important Limitation:** You **cannot** use `await` inside a `lock` block.

2. **`Mutex` (Mutual Exclusion):**
   - **Scope:** Can be local, but is most famous for being **cross-process** (OS-level).
   - **Mechanism:** If you name a Mutex (e.g., `new Mutex(false, "Global\\MyMutex")`), it uses the Windows kernel. You can use it to ensure only one instance of an executable (like a background service or desktop app) runs on the entire machine at once.
   - **Performance:** Much slower than `lock` because it requires a context switch to the OS kernel.

3. **`SemaphoreSlim`:**
   - **Scope:** Local to the current process.
   - **Mechanism:** Unlike a lock (which allows 1 thread), a semaphore allows *N* threads to enter concurrently (e.g., throttling database connections to max 5 at a time).
   - **The Killer Feature:** It provides an asynchronous `WaitAsync()` method, meaning you **can** use `await` with it. It is the standard replacement for `lock` when you need to serialize asynchronous operations.

---

## Scenario — Question 1

**Q1: You are building a high-performance socket server in .NET. It reads thousands of small messages per second from the network into `byte[]` arrays, parses them, and immediately discards the arrays. The application is suffering from massive latency spikes. Why is this happening, and how do you fix it?**

This is the classic symptom of **Garbage Collection (GC) Pressure**, specifically in Generation 0. Allocating thousands of short-lived byte arrays per second overwhelms the GC, forcing it to constantly pause the application to clean up memory.

**The Solution: Array Pooling**
Instead of allowing the GC to manage these short-lived arrays, you should recycle them yourself using `System.Buffers.ArrayPool<T>`.

**The Mechanism:**
1. When you need a buffer to read from the socket, you **rent** an array from the shared pool: 
   `byte[] buffer = ArrayPool<byte>.Shared.Rent(1024);`
2. You read data from the socket into this buffer and process it.
3. Crucially, when you are finished, you **return** the array to the pool so it can be reused by the next incoming socket message:
   `ArrayPool<byte>.Shared.Return(buffer);`

**Result:**
By reusing the same block of memory over and over, you drastically reduce the number of objects instantiated on the heap. This eliminates Gen 0 GC pauses entirely, transforming a stuttering server into one with smooth, predictable microsecond latency.

*Note: Always use a `try/finally` block to ensure `Return()` is called even if parsing the message throws an exception.*

---

## Scenario — Question 2

**Q2: You have an ASP.NET Core API endpoint that makes a database call using Entity Framework. The endpoint is `async Task<IActionResult> GetUser(int id)`. A junior developer writes the code as `var user = _db.Users.Find(id); return Ok(user);` omitting `async/await` and using the synchronous `Find` method. They argue it's faster because it avoids the overhead of the async state machine. Why is this argument fatally flawed in the context of a web server?**

The junior developer is confusing *single-request latency* with *server throughput and scalability*.

**The Flaw (Thread Starvation):**
When the synchronous `Find()` method is called, it makes a network call to the SQL database. The database might take 50ms to respond. During those 50ms, the ASP.NET Core Thread Pool thread handling that specific HTTP request is **blocked**. It is forced to wait, doing absolutely nothing, until the data returns.
If the server receives 1,000 concurrent requests, 1,000 threads in the Thread Pool will instantly become blocked waiting on the database. The Thread Pool is finite. Once all threads are blocked, new incoming HTTP requests are queued. The server appears to lock up and eventually throws `503 Service Unavailable` errors. This is known as **Thread Pool Starvation**.

**The Solution:**
You must use `await _db.Users.FindAsync(id);`.

**The Mechanism:**
When `await` hits an I/O boundary (the network call to SQL Server), the compiler-generated state machine immediately returns control to the caller. The ASP.NET Core Thread Pool thread is immediately **freed** and released back to the pool. It can instantly begin processing a different incoming HTTP request while the network card handles waiting for the database bytes. When the database responds 50ms later, a random thread from the pool is grabbed to resume the method and return the data.

**Result:**
While avoiding the async state machine might save 1 microsecond of CPU time on a single request, blocking the thread destroys the server's ability to scale. Using `async/await` allows a web server with only 50 threads to easily handle thousands of concurrent I/O-bound requests.

---

## Scenario — Question 3

**Q3: You are designing an ASP.NET Core application that calculates highly complex financial reports using large data sets in memory. This calculation takes 10 seconds of 100% CPU usage. You wrap the method call in `await Task.Run(() => CalculateReport())` in your API controller. While testing, you notice that if 20 users request a report simultaneously, the entire web application becomes completely unresponsive, and simple health check endpoints timeout. Why?**

This is the anti-pattern of using `Task.Run` for CPU-bound work on a web server thread pool.

**The Flaw:**
`Task.Run` queues the work to the Thread Pool. ASP.NET Core relies on this exact same Thread Pool to process incoming HTTP requests. 
When 20 users request the report, 20 Thread Pool threads are instantly consumed and locked at 100% CPU for 10 seconds. If your Thread Pool only has 20 active threads, there are zero threads left to accept new incoming HTTP connections. The server is completely starved and deadlocks until a calculation finishes.

**The Solution:**
Web servers should *never* execute long-running, CPU-bound work on the Thread Pool.

1. **Background Service / Worker Service:** The most robust solution is to offload the calculation entirely. The API controller should drop a message into a queue (like RabbitMQ) and immediately return a `202 Accepted`. A separate Worker Service (running in a different process or even on a different machine) listens to the queue, performs the heavy CPU calculation, and saves the result to a database or cache.
2. **Dedicated Threads (If it must be in-process):** If you absolutely must process it within the web application, you should spawn a dedicated background thread (`new Thread()`) with a lower priority, explicitly keeping it off the Thread Pool so ASP.NET Core can continue serving normal web requests unhindered.
