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

---

## Scenario — Question 4

**Q4: Your ASP.NET Core service runs fine under normal load, but once every few minutes a request takes 200-500ms longer than usual for no apparent reason — CPU and memory both look completely normal, and there's no obvious database slowness. `dotnet-counters` shows periodic spikes in "% Time in GC" that line up with the slow requests. What's happening, and how do you address it?**

Occasional, brief latency spikes correlated with GC activity — while CPU/memory look otherwise fine — is the signature of a **Gen 2 (or "blocking") garbage collection** pausing the application, as opposed to the far cheaper, near-continuous Gen 0 collections that don't produce noticeable pauses.

**Why this specific pattern points to Gen 2:**
```text
Gen 0 collections: happen constantly, microseconds each, invisible in request latency
Gen 1 collections: happen less often, still sub-millisecond typically
Gen 2 collections: happen rarely, but must trace the ENTIRE live object graph --
                   can take tens to hundreds of milliseconds on a service with a
                   large working set, and (without Background/Concurrent GC) they
                   fully pause all application threads while they run
```
A request that happens to be in-flight exactly when a Gen 2 collection kicks in gets its processing paused mid-request for however long that collection takes — explaining why it's intermittent (only requests overlapping a Gen 2 pause are affected) rather than a constant, evenly-distributed slowdown.

**Diagnosing it further:**
```bash
dotnet-counters monitor -p <pid> --counters System.Runtime
# Watch "Gen 2 GC Count" ticking up in lockstep with the latency spikes,
# and "% Time in GC" spiking specifically at those moments
```

**The fixes, roughly in order of effort:**
1. **Enable Background (Concurrent) GC if not already on** — lets most of the Gen 2 collection's tracing work happen on a dedicated GC thread *while application threads keep running*, only pausing briefly for the final short "stop-the-world" phase rather than the entire collection.
```xml
<ConcurrentGarbageCollection>true</ConcurrentGarbageCollection> <!-- default true in most templates, worth confirming -->
```
2. **Reduce Gen 2 promotion pressure** — objects only reach Gen 2 by surviving multiple earlier collections; a common root cause is holding references to objects longer than necessary (an ever-growing cache, a large object graph kept alive by a static collection), artificially aging objects into the expensive generation that should have been collected cheaply in Gen 0/1.
3. **Consider Server GC with multiple heaps** — if the service runs on a multi-core machine, Server GC parallelizes collection work across per-core heaps, often reducing the wall-clock pause duration of any given Gen 2 collection compared to Workstation GC's single-heap model.

**Common Pitfall:** chasing this as an application logic bug (profiling business logic code paths) when the actual cause is entirely in memory/object-lifetime management — the fix lives in *what's being held alive and for how long*, not in the code path that happens to be running when the pause occurs; that code is simply an innocent bystander paused by the runtime.

---

---

## Intermediate — Question 6

**Q6: What is the difference between Workstation GC and Server GC in .NET, and when does it matter?**

The .NET Garbage Collector runs in one of two fundamentally different modes, configured via `<ServerGarbageCollection>` in the project file (or `runtimeconfig.json`).

**Workstation GC (default for most apps):**
- Optimized for low latency on a client machine with few cores.
- Uses a single heap and (by default) runs GC work on the same thread that triggered the collection, briefly pausing the app.
- Best for desktop apps, CLI tools, and anything where minimizing per-collection pause time matters more than raw throughput.

**Server GC (default for ASP.NET Core when hosted):**
- Creates **one heap per logical CPU core** and collects them in parallel on dedicated GC threads.
- Optimized for throughput on multi-core server hardware, at the cost of higher memory usage (each heap reserves its own segment).
- Also has a **Concurrent** (background) variant that lets Gen 2 collections run alongside app threads instead of fully pausing them.

```xml
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

**Common Pitfall:** Running Server GC inside a container with a low CPU limit (e.g., `limits.cpu: "1"` in Kubernetes) can backfire — .NET may still see the *host's* full core count and spin up far more heaps/threads than the container can actually use, wasting memory. Modern .NET respects cgroup limits much better than older versions, but it's still worth verifying `Environment.ProcessorCount` inside the container matches what you expect.

#### Follow-up: How do you check which GC mode is active at runtime?
`System.Runtime.GCSettings.IsServerGC` returns a bool. You can also inspect `DOTNET_gcServer` / `COMPlus_gcServer` environment variables, which override the project-file setting without a rebuild — useful for A/B testing GC modes in production.

---

## Advanced — Question 6

**Q6: What is the difference between an `AppDomain` and an `AssemblyLoadContext` (ALC) in modern .NET?**

`AppDomain` was the .NET Framework's isolation boundary: multiple AppDomains could run in one process, each with its own loaded assemblies, and one could be unloaded without killing the process. **.NET (Core) 5+ removed multi-AppDomain support entirely** — there is only ever one AppDomain per process now.

**The replacement: `AssemblyLoadContext` (ALC).**
An ALC is a lighter-weight unit for loading and, critically, **unloading** assemblies within that single AppDomain/process.

```csharp
public class PluginLoadContext : AssemblyLoadContext
{
    private readonly AssemblyDependencyResolver _resolver;

    public PluginLoadContext(string pluginPath) : base(isCollectible: true)
    {
        _resolver = new AssemblyDependencyResolver(pluginPath);
    }

    protected override Assembly? Load(AssemblyName name)
    {
        string? path = _resolver.ResolveAssemblyToPath(name);
        return path != null ? LoadFromAssemblyPath(path) : null;
    }
}

var context = new PluginLoadContext("plugins/MyPlugin.dll");
var assembly = context.LoadFromAssemblyPath("plugins/MyPlugin.dll");
// ... use the plugin ...
context.Unload(); // marks it collectible; GC reclaims it once nothing holds a reference
```

**Key differences:**
- ALCs don't isolate *security* or *configuration* the way AppDomains did — there's no `AppDomain.SetPrincipalPolicy` equivalent. They isolate **type identity and assembly versions** (you can load two different versions of the same assembly side-by-side, each in its own ALC, without them clashing).
- `isCollectible: true` is what makes an ALC unloadable — without it, assemblies loaded into it live for the process lifetime just like the default ALC.

**Common Pitfall:** Unloading an ALC doesn't happen instantly — `Unload()` only marks it eligible. If any object created from a type in that ALC (or even an open `FileStream` opened by plugin code) is still referenced anywhere in your app, the GC can't collect it, and the "unloaded" plugin assembly silently stays resident. Plugin hosts typically use a `WeakReference` to the ALC itself and poll `IsAlive` in tests to catch leaks.

---

## Intermediate — Question 7

**Q7: What is the difference between `Task.WhenAll` and `Task.WhenAny`, and when do you use each?**

Both combine multiple in-flight `Task`s into a single awaitable, but they answer different questions: "wait for everything" versus "wait for whichever finishes first."

**`Task.WhenAll` — wait for every task to complete, run them concurrently:**
```csharp
var productsTask = GetProductsAsync();
var categoriesTask = GetCategoriesAsync();
var reviewsTask = GetReviewsAsync();

await Task.WhenAll(productsTask, categoriesTask, reviewsTask); // waits for ALL three

var products = await productsTask;     // already completed, returns instantly
var categories = await categoriesTask;
var reviews = await reviewsTask;
```
All three requests fire concurrently rather than sequentially — total wait time is roughly the *slowest* of the three, not the sum of all three, which is the whole point of using it over three separate sequential `await` calls.

**`Task.WhenAny` — proceed as soon as the FIRST task finishes, others keep running:**
```csharp
var primaryApi = CallPrimaryServiceAsync();
var fallbackApi = CallFallbackServiceAsync();

var firstCompleted = await Task.WhenAny(primaryApi, fallbackApi);
var result = await firstCompleted; // get the result of whichever one actually finished first
```
Useful for racing multiple redundant sources (hedged requests) or implementing a timeout pattern: `await Task.WhenAny(actualWork, Task.Delay(TimeSpan.FromSeconds(5)))` lets you detect "5 seconds passed before the real work finished" without cancelling the real work outright.

**Common Pitfall with `WhenAll`:** if one of the tasks throws, `Task.WhenAll` still waits for *all* tasks to finish (successful or not) before throwing — and it only surfaces the **first** exception via `await`, silently discarding others unless you inspect `Task.Exception.InnerExceptions` on the aggregate afterward. A team debugging "why did only one exception show up when three tasks failed" often doesn't realize `WhenAll`'s awaited result swallows the rest by default.

---

## Advanced — Question 7

**Q7: What is Large Object Heap (LOH) fragmentation, and why can a .NET service's memory usage grow indefinitely even without a genuine memory leak?**

Objects ≥ 85,000 bytes are allocated directly on the **Large Object Heap**, a separate GC-managed heap segment from Gen 0/1/2, and — critically — the LOH is **not compacted by default**. That single fact is the root of LOH fragmentation.

**The Mechanism:**
```text
LOH state over time (■ = live object, □ = freed gap):
[■■■■■][□□□□□][■■■■■][□□□□□□□□□][■■■■■]
   A      (freed)   B     (freed)    C
```
When object B is freed, the GC does *not* slide C leftward to close the gap the way it compacts the regular (small-object) generations — it just marks that region as free space to be reused *if* a future allocation happens to fit exactly in that gap. If incoming large objects are all slightly bigger than the available gaps, the GC has no choice but to grow the LOH segment further, even though there's technically "enough" free memory scattered across unusable-sized gaps.

**Why this happens in practice:** a common trigger is allocating variably-sized large buffers (e.g., processing uploaded files or building large JSON responses as `byte[]`) where sizes vary just enough that freed gaps rarely fit the next allocation cleanly — over hours or days, the LOH segment can balloon in *reserved* size even though *live* data stays roughly constant, looking exactly like a memory leak in a process memory graph.

**Mitigations:**
1. **`GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce`** — explicitly requests the next Gen 2 collection to compact the LOH once, useful as a targeted remediation after a known allocation spike.
2. **Avoid large, variably-sized allocations in hot paths** — use `ArrayPool<T>.Shared` to rent/return same-sized buffers repeatedly instead of allocating fresh `byte[]` arrays of varying size each time, which sidesteps LOH fragmentation entirely by reusing fixed-size buffers.
3. **Reduce the object size below the 85,000-byte LOH threshold** where feasible (e.g., processing data in smaller chunks) so allocations land on the compacted Gen 0-2 heaps instead.

**Common Pitfall:** treating LOH growth purely as "needs more RAM" and vertically scaling the container/VM — that buys temporary headroom but doesn't address the underlying allocation pattern, and the same fragmentation dynamic reproduces at the new, larger memory ceiling.

---
