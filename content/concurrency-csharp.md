# Concurrency in C# — Q&A

## Beginner — Question 1

**Q1: What is the actual difference between a `Thread` and a `Task` in .NET?**

A `System.Threading.Thread` is a thin wrapper around an actual OS thread — a real, scheduled unit of execution with its own stack (~1MB by default on Windows), its own register set, and a kernel-level context-switching cost. Creating a `new Thread(...)` and calling `.Start()` creates a brand-new OS thread dedicated to that work until it finishes.

A `System.Threading.Tasks.Task` is a much higher-level abstraction: it represents *a unit of work and its eventual result/completion*, not a thread. A `Task` does not own a thread of its own. When you run `Task.Run(() => DoWork())`, the runtime queues that work onto the shared **Thread Pool**, and whichever pooled thread happens to be free picks it up, runs it, and returns to the pool afterward — the same thread might serve dozens of unrelated tasks over its lifetime. For an `async` method awaiting I/O (e.g., a network call), the `Task` representing that operation may not be running on *any* thread at all while it's in flight — the OS is doing the work via I/O completion ports, and no thread is blocked waiting.

**Practical distinction:**
- `Thread`: heavyweight, 1:1 with an OS thread, appropriate only for rare cases needing a dedicated, long-lived, possibly foreground thread (e.g., a `STA` UI thread, or truly `LongRunning` CPU work you want isolated from the pool).
- `Task`: lightweight, reusable, composable (`ContinueWith`, `WhenAll`, `WhenAny`), and the vocabulary that `async`/`await` is built on. It is the default choice for essentially all concurrent work in modern C#.

**Common pitfall:** assuming `Task.Run` "creates a thread." It doesn't — it schedules work onto existing pooled threads, and under load, if the pool is saturated, your task sits queued rather than running immediately.

#### Follow-up: What is the Thread Pool, and why does .NET use it instead of spawning a new `Thread` per unit of work?

The Thread Pool is a runtime-managed collection of pre-existing OS worker threads shared across the whole process. Spawning an OS thread is expensive (stack allocation, kernel object creation, context-switch overhead) — doing that for every short-lived unit of work would dominate the actual work's cost. The pool amortizes that cost: threads are created once, kept warm, and reused for many `Task.Run` calls, timer callbacks, and I/O completions over the process's lifetime. The pool also self-tunes: it starts with a small number of threads and grows (via a hill-climbing algorithm, with a deliberate half-second-per-new-thread injection throttle) when queued work isn't being drained fast enough — which is exactly the mechanism behind thread-pool-starvation bugs (see the Scenario tier).

---

## Beginner — Question 2

**Q2: `async`/`await` is often described as making code "asynchronous," but people frequently conflate that with "parallel." What's the actual difference?**

**Parallel** means multiple pieces of work execute *literally at the same time*, using multiple CPU cores (e.g., `Parallel.For`, `Task.Run` spreading CPU-bound work across threads). It requires multiple threads and genuinely increases CPU utilization.

**Asynchronous** means a piece of work can be *started without blocking the calling thread while it's in progress*, and the calling thread is freed up to do other things until the work completes. Crucially, `async`/`await` by itself does **not** create new threads and does **not** imply parallelism. `await someHttpClient.GetAsync(url)` does not spin up a thread to "wait" on your behalf — the request is handed to the OS network stack, and the current thread is released back to whatever it was doing (in a UI app, back to pumping the message loop; in ASP.NET Core, back to the thread pool to serve another request) until the I/O completes, at which point a thread pool thread resumes your method from where it left off.

```csharp
// This is asynchronous (frees the thread while waiting) but NOT parallel — only one
// logical operation is "in flight" and no CPU core is busy during the await.
async Task<string> FetchAsync(HttpClient client, string url)
{
    var response = await client.GetAsync(url); // thread is released here, not blocked
    return await response.Content.ReadAsStringAsync();
}
```

**Common pitfall:** believing `async` methods automatically run on a background thread, or that marking a CPU-bound loop `async` makes it faster. It doesn't — for CPU-bound work, `async`/`await` alone changes nothing about how many cores are used; you need actual parallelism (`Task.Run`, `Parallel.For`) for that. `async`/`await`'s value is in *not wasting a thread while waiting on something external* (network, disk, database) — it's a scalability tool for I/O-bound work, not a speed tool for CPU-bound work.

---

## Beginner — Question 3

**Q3: For an I/O-bound operation that already has an async API (e.g., `HttpClient.GetAsync`), should you wrap it in `Task.Run`, or just `await` it directly? Why?**

Always `await` it directly — never wrap a genuinely asynchronous, I/O-bound call in `Task.Run`.

```csharp
// Correct: no extra thread consumed; the calling thread is freed during the network wait.
public async Task<string> GetDataAsync(HttpClient client) =>
    await client.GetStringAsync("https://api.example.com/data");

// Wasteful and pointless: this occupies a thread-pool thread just to synchronously
// block on I/O that was already awaitable — you get all the downsides (thread
// consumption) with none of the upside (parallelism doesn't help I/O-bound work).
public async Task<string> GetDataBadAsync(HttpClient client) =>
    await Task.Run(() => client.GetStringAsync("https://api.example.com/data").Result);
```

**Why `Task.Run` is the wrong tool here:** `Task.Run` exists to offload *CPU-bound* work onto a thread-pool thread so the calling thread isn't blocked doing computation. I/O-bound work doesn't need a thread at all while it's "in progress" — the whole point of `async` I/O APIs (built on the OS's I/O completion ports / `IOCP` on Windows) is that no thread is consumed during the wait. Wrapping an already-async call in `Task.Run` pulls a thread-pool thread out of the pool for no benefit, and in the bad example above it's worse still because `.Result` blocks that thread synchronously — defeating the purpose entirely and reintroducing the deadlock risk covered later.

**The rule of thumb:** `Task.Run` is for offloading synchronous, CPU-intensive work (parsing a huge file, running a hash, an ML inference) that has no async version, typically from a UI thread that must stay responsive. For anything that already exposes a `*Async` method backed by real I/O, `await` it directly with no `Task.Run` in between. In server code (ASP.NET Core) this distinction matters even more — the Scenario tier of this file shows what happens when it's violated at scale (thread-pool starvation from `Task.Run`-wrapping synchronous calls across many concurrent requests).

---

## Beginner — Question 4

**Q4: What is a race condition, and how does the C# `lock` statement address it?**

A race condition occurs when two or more threads access shared mutable state concurrently, and the final outcome depends on the unpredictable timing/interleaving of their operations — producing incorrect results that may only show up intermittently, often just under load or in production, never in a debugger.

```csharp
private int _counter = 0;

public void Increment() => _counter++; // NOT atomic!
```

`_counter++` looks like one operation but is actually three: read the current value, add one, write it back. If two threads both read `_counter = 5` before either writes back, both compute `6` and write `6` — one increment is silently lost. Run this from many threads concurrently and the final count will be less than the true number of increments, non-deterministically.

**The `lock` statement** provides mutual exclusion: only one thread at a time may hold the lock on a given object, and any other thread attempting to `lock` the same object blocks until the first releases it.

```csharp
private readonly object _sync = new();
private int _counter = 0;

public void Increment()
{
    lock (_sync)
    {
        _counter++; // now safe — only one thread executes this at a time
    }
}
```

`lock` is syntactic sugar over `System.Threading.Monitor.Enter`/`Exit` wrapped in a `try`/`finally`, guaranteeing the lock is released even if an exception is thrown inside the block.

**Common pitfalls:** locking on `this` or on a public/mutable field (external code can lock the same object, creating unexpected contention or deadlocks) — always use a dedicated `private readonly object` created solely for locking. Never lock on a boxed value type, a `string` literal (strings can be interned and shared across the whole process, causing unrelated code to contend on "the same" lock), or a `Type` object. Also, `lock` cannot be used around `await` — the compiler will refuse it, because holding a lock across a suspension point is almost always a deadlock or contention bug waiting to happen; `SemaphoreSlim.WaitAsync` is the async-compatible alternative (see Intermediate tier).

---

## Intermediate — Question 1

**Q1: What does the C# compiler actually generate for an `async` method? Walk through the state machine.**

An `async` method is a compiler transformation, not a runtime feature by itself. The compiler rewrites the method body into a compiler-generated struct (or class, if it captures more than the struct-optimization threshold allows) that implements `IAsyncStateMachine`, with a `MoveNext()` method containing the original code split into segments at each `await`.

```csharp
public async Task<int> ComputeAsync()
{
    Console.WriteLine("start");
    int a = await Step1Async();   // suspension point 1
    Console.WriteLine("middle");
    int b = await Step2Async(a);  // suspension point 2
    return a + b;
}
```

Conceptually, the compiler produces something like:

```csharp
struct ComputeAsyncStateMachine : IAsyncStateMachine
{
    public int _state; // -1 = not started/running, 0/1/... = which await it's suspended at
    public AsyncTaskMethodBuilder<int> _builder;
    private TaskAwaiter<int> _awaiter1, _awaiter2;
    private int _a;

    public void MoveNext()
    {
        switch (_state)
        {
            case -1:
                Console.WriteLine("start");
                _awaiter1 = Step1Async().GetAwaiter();
                if (!_awaiter1.IsCompleted)
                {
                    _state = 0;
                    _builder.AwaitUnsafeOnCompleted(ref _awaiter1, ref this); // registers continuation, RETURNS to caller
                    return;
                }
                goto case 0;
            case 0:
                _a = _awaiter1.GetResult(); // resumes here when Step1Async completes
                Console.WriteLine("middle");
                // ... similarly for Step2Async, then _builder.SetResult(a + b)
                break;
        }
    }
}
```

The key mechanism: when an `await` hits an incomplete `Task`, `MoveNext()` registers itself as a continuation via `AwaitUnsafeOnCompleted` and **returns control to the caller immediately** — this is the "asynchronous" part. The calling `Task<int>` returned by `ComputeAsync()` is created up front by the `AsyncTaskMethodBuilder` and represents the whole operation's eventual completion; the caller can `await` it, and when the awaited sub-operation later completes (on a thread-pool thread, an I/O completion callback, etc.), that thread calls `MoveNext()` again, which resumes execution exactly at the suspension point via the `switch` on `_state`.

**Practical implication:** this is why `await` doesn't block — the method literally returns to its caller at every `await`, and local variables that must survive the suspension become fields of the state machine (heap-allocated, in the common class-generated case) rather than true stack locals.

---

## Intermediate — Question 2

**Q2: What does `ConfigureAwait(false)` actually do, and why does it matter differently for library code versus ASP.NET Core / UI apps?**

Every `await` captures the current `SynchronizationContext` (if one exists — e.g., `WindowsFormsSynchronizationContext`, `DispatcherSynchronizationContext` for WPF) or, absent one, the current `TaskScheduler` if it's not the default. By default, when the awaited operation completes, the continuation (the rest of your method) is scheduled back onto that captured context — so a WPF event handler that `await`s something automatically resumes on the UI thread afterward, letting you safely touch UI controls without an explicit `Dispatcher.Invoke`.

`ConfigureAwait(false)` tells the awaiter: "don't bother capturing/restoring that context — just resume on whatever thread-pool thread happens to be available when the operation completes."

```csharp
public async Task<string> LoadAsync()
{
    var data = await httpClient.GetStringAsync(url).ConfigureAwait(false);
    var parsed = await ParseAsync(data).ConfigureAwait(false);
    return parsed; // this line may run on a totally different thread than the caller
}
```

**Why library code should use it:** a library has no idea what context its caller runs under, and forcing every continuation to marshal back to a UI or request context it doesn't need adds pure overhead and, in the worst case, contributes to deadlocks (see Advanced tier). By convention, reusable library/domain code awaits with `ConfigureAwait(false)` everywhere, since it never needs to touch UI controls or `HttpContext`.

**Why it matters less in ASP.NET Core specifically:** ASP.NET Core deliberately has **no `SynchronizationContext`** at all (unlike classic ASP.NET, which used `AspNetSynchronizationContext` to preserve `HttpContext.Current` and request identity across awaits). Since there's nothing to capture, `ConfigureAwait(false)` in ASP.NET Core application/controller code is effectively a no-op — it doesn't hurt, but it also doesn't do anything meaningful there. It still matters in the shared libraries that code calls into, and it absolutely still matters for WPF/WinForms/classic ASP.NET, where a real context exists and gets captured by default.

**Common pitfall:** thinking `ConfigureAwait(false)` prevents deadlocks by itself. It reduces the *likelihood* in some patterns but is not a substitute for simply not blocking on async code (`.Result`/`.Wait()`) in the first place.

---

## Intermediate — Question 3

**Q3: What is `ValueTask<T>`, and when does it actually provide a meaningful benefit over `Task<T>`?**

`Task<T>` is a reference type — every call to an `async Task<T>` method that doesn't synchronously short-circuit allocates a `Task<T>` object on the heap to represent the pending operation. For a method that, in the common/hot path, can complete **synchronously** (e.g., a cache lookup that usually hits), that per-call allocation is pure overhead repeated on every call.

`ValueTask<T>` is a struct that can wrap either an already-available result directly (no allocation) or, if the operation is genuinely asynchronous, an underlying `Task<T>`/pooled `IValueTaskSource<T>`. This lets a "usually synchronous, occasionally asynchronous" method avoid allocating on its fast path.

```csharp
private readonly Dictionary<int, string> _cache = new();

public ValueTask<string> GetValueAsync(int key)
{
    if (_cache.TryGetValue(key, out var cached))
        return new ValueTask<string>(cached); // synchronous path: zero Task allocation

    return new ValueTask<string>(LoadFromDbAsync(key)); // genuinely async path: wraps a Task
}
```

**Why it is NOT a drop-in replacement for `Task<T>` everywhere** — `ValueTask<T>` comes with strict usage rules that `Task<T>` does not:
- It must be awaited **exactly once**. Awaiting it twice, or calling both `.Result` and `await` on it, is undefined behavior — some `IValueTaskSource` implementations are pooled and reused after the first await completes them.
- You generally should not call `.AsTask()` more than once, cache it in a variable and `await` it from multiple places, or use it with `Task.WhenAll`/`WhenAny` without first converting to `Task` (which reintroduces the allocation you were avoiding).
- It has a larger struct footprint than a `Task` reference, so passing it around casually (rather than awaiting immediately) can itself add copying overhead.

**Practical guidance:** default to `Task<T>` for public APIs and anywhere the caller might store, re-await, or combine the result with other tasks. Reach for `ValueTask<T>` only in performance-sensitive, high-call-frequency code (e.g., a hot interface implemented deep in a serializer or a pipeline) where profiling shows `Task<T>` allocations are actually a measurable cost, and where the immediate-single-await usage pattern is guaranteed.

---

## Intermediate — Question 4

**Q4: How does exception handling work across `await`? Why do people talk about `AggregateException` here, and does `await` actually surface it that way?**

`Task` and `Task<T>` can fault, and a faulted `Task` stores its exception(s) internally as an `AggregateException` (because a single `Task` can, in principle, aggregate multiple faults — most visibly from `Task.WhenAll`, where several parallel tasks can each fail independently).

**The key nuance:** when you access a faulted task synchronously via `.Result` or `.Wait()`, you get the raw `AggregateException`, potentially wrapping multiple inner exceptions. But when you `await` a faulted task, the compiler-generated awaiter's `GetResult()` specifically **unwraps and rethrows only the first inner exception**, as itself — not wrapped in `AggregateException`. This is a deliberate ergonomic choice so `try`/`catch` around an `await` behaves the way developers naturally expect.

```csharp
async Task Demo()
{
    try
    {
        await Task.FromException(new InvalidOperationException("boom"));
    }
    catch (InvalidOperationException ex)
    {
        // caught directly — NOT wrapped in AggregateException, because we used await
        Console.WriteLine(ex.Message);
    }
}

void BadDemo()
{
    try
    {
        Task.FromException(new InvalidOperationException("boom")).Wait();
    }
    catch (AggregateException ex)
    {
        // .Wait()/.Result surfaces the raw AggregateException instead
        Console.WriteLine(ex.InnerException?.Message);
    }
}
```

**The `Task.WhenAll` edge case:** if you `await Task.WhenAll(t1, t2)` and *both* tasks fault, `await` still only rethrows the **first** task's exception directly — the other failure isn't lost, but it's silently not thrown at that point. To inspect all failures, check `whenAllTask.Exception` (an `AggregateException` containing every inner exception) before or instead of awaiting directly:

```csharp
var whenAllTask = Task.WhenAll(t1, t2);
try { await whenAllTask; }
catch { foreach (var ex in whenAllTask.Exception!.InnerExceptions) LogError(ex); }
```

**Common pitfall:** assuming `try`/`catch` around `Task.WhenAll` sees every failure — it doesn't, by default; you must inspect `.Exception` explicitly if all failures matter, not just the first.

---

## Intermediate — Question 5

**Q5: How does cooperative cancellation with `CancellationToken` work, and what's the difference between `token.IsCancellationRequested` and `token.ThrowIfCancellationRequested()`?**

.NET has no mechanism to forcibly abort a thread/task safely (`Thread.Abort` existed historically and is now unsupported/obsolete because it can corrupt state mid-operation). Instead, cancellation in .NET is **cooperative**: a `CancellationTokenSource` is created by whoever "owns" the operation, its `.Token` is passed down through the call chain, and code voluntarily checks that token and stops itself.

```csharp
public async Task ProcessAsync(IEnumerable<int> items, CancellationToken token)
{
    foreach (var item in items)
    {
        token.ThrowIfCancellationRequested(); // throws OperationCanceledException if cancelled
        await ProcessItemAsync(item, token);  // pass the token further down
    }
}

// Caller controls the cancellation:
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30)); // auto-cancels after 30s
try
{
    await ProcessAsync(items, cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("Cancelled or timed out.");
}
```

`IsCancellationRequested` is a plain boolean check — useful when you want to react without throwing (e.g., break a loop cleanly, or decide whether to attempt one more retry). `ThrowIfCancellationRequested()` checks the same flag but throws `OperationCanceledException` (specifically `TaskCanceledException`, its subclass, when it originates from a `Task`) if it's set — the conventional way to unwind out of deep call stacks and let the cancellation propagate as an exception that calling code (or the ASP.NET Core pipeline) recognizes and handles distinctly from a genuine error (canceled requests are typically not logged as failures).

Many built-in async APIs (`Task.Delay`, `HttpClient.SendAsync`, `Stream.ReadAsync`, EF Core's `*Async` methods) accept a `CancellationToken` directly and will throw the same way internally — always pass the token through rather than only checking it yourself, so cancellation actually stops the expensive I/O in flight, not just your own loop.

**Common pitfall:** creating a "cancellation" mechanism with a plain `bool` flag instead of `CancellationToken` — this reinvents a worse version of a well-understood, composable primitive (tokens can be linked via `CreateLinkedTokenSource`, combined with timeouts, and are honored throughout the BCL).

---

## Intermediate — Question 6

**Q6: How do you use `SemaphoreSlim` to limit concurrency in async code, and how is it different from `lock` in that context?**

`lock` cannot wrap an `await` — the compiler rejects it, because holding a `Monitor` lock across a suspension point risks a different thread resuming and even deadlocking, since `Monitor` locks are thread-affine (only the thread that acquired the lock may release it, but after an `await`, a *different* thread pool thread may resume the continuation).

`SemaphoreSlim` is the async-safe equivalent for controlling concurrent access, and unlike `Monitor`, it's not thread-affine — any thread can call `Release()`, which is exactly what's needed after an `await` resumes on a possibly different thread. Its `WaitAsync()` method is a genuine non-blocking async wait.

```csharp
public class DownloadThrottler
{
    // Only allow 5 concurrent downloads, regardless of how many callers request one.
    private readonly SemaphoreSlim _gate = new(initialCount: 5, maxCount: 5);

    public async Task<byte[]> DownloadAsync(string url, HttpClient client)
    {
        await _gate.WaitAsync();      // asynchronously waits for a free slot — no thread blocked
        try
        {
            return await client.GetByteArrayAsync(url);
        }
        finally
        {
            _gate.Release();          // always release, even on exception
        }
    }
}
```

With `initialCount` and `maxCount` both set to 5, at most 5 callers can be inside the critical section concurrently; a 6th caller's `WaitAsync()` completes only once one of the first 5 calls `Release()`. This is the standard pattern for bounding fan-out concurrency (see the Scenario tier's 50-downstream-calls problem) — it prevents overwhelming a downstream service or the local thread pool while still running work concurrently rather than one-at-a-time.

**Practical guidance:** use `SemaphoreSlim(1, 1)` as an async-compatible mutual-exclusion lock when you need to guard a critical section that itself contains an `await`; use it with a count > 1 specifically to throttle concurrency to a bounded degree. Don't forget the `try`/`finally` around `Release()` — an exception between `WaitAsync()` and `Release()` without it permanently leaks a permit.

---

## Intermediate — Question 7

**Q7: When should you reach for `ConcurrentDictionary`/`ConcurrentQueue` instead of locking a regular `Dictionary`/`Queue` yourself, and what does `Interlocked` add on top of that?**

`Dictionary<TKey,TValue>` and `Queue<T>` are not thread-safe — concurrent reads and writes can corrupt their internal structures (not just produce wrong values, but throw or infinite-loop). The naive fix is wrapping every access in `lock`:

```csharp
private readonly Dictionary<string, int> _counts = new();
private readonly object _sync = new();

public void Increment(string key)
{
    lock (_sync)
    {
        _counts[key] = _counts.TryGetValue(key, out var v) ? v + 1 : 1;
    }
}
```

This works, but a single coarse lock around the whole dictionary serializes *every* access from *every* thread, even ones touching unrelated keys — under high contention this becomes a throughput bottleneck.

`ConcurrentDictionary<TKey,TValue>` internally uses lock striping (multiple internal locks, each covering a subset of hash buckets), so unrelated keys usually don't contend at all, and it exposes atomic composite operations directly:

```csharp
private readonly ConcurrentDictionary<string, int> _counts = new();

public void Increment(string key) =>
    _counts.AddOrUpdate(key, addValue: 1, updateValueFactory: (_, existing) => existing + 1);
```

`ConcurrentQueue<T>`/`ConcurrentStack<T>`/`ConcurrentBag<T>` similarly provide lock-free or fine-grained-locked thread-safe collections purpose-built for producer/consumer patterns.

**`Interlocked`** goes a level lower still: for simple numeric operations (increment, decrement, add, compare-and-swap) on a single field, `Interlocked.Increment(ref _counter)` uses a genuine hardware-level atomic CPU instruction — no lock object, no kernel involvement, dramatically cheaper than any lock for exactly this narrow case.

```csharp
private long _requestCount;
public void RecordRequest() => Interlocked.Increment(ref _requestCount);
```

**Practical guidance:** for a single counter/flag, use `Interlocked`. For a shared collection under concurrent access, prefer the `System.Collections.Concurrent` type over hand-rolled locking — it's both less error-prone and typically faster under contention. Reach for a manual `lock` only when you need to atomically coordinate *multiple* related pieces of state together (e.g., updating two dictionaries consistently), which no single concurrent collection type can express by itself.

---

## Advanced — Question 1

**Q1: Explain the classic `.Result`/`.Wait()` deadlock in a `SynchronizationContext`-based app (legacy ASP.NET, WPF). Why doesn't the same code deadlock in ASP.NET Core?**

```csharp
// Classic ASP.NET (System.Web) controller action:
public ActionResult Get()
{
    var result = GetDataAsync().Result; // DEADLOCK, reliably, under real request load
    return View(result);
}

async Task<string> GetDataAsync()
{
    await httpClient.GetStringAsync(url); // captures the ASP.NET SynchronizationContext by default
    return "done";
}
```

**The mechanism:** classic ASP.NET installs `AspNetSynchronizationContext`, which — like the WPF/WinForms UI contexts — allows only **one thread of execution "in" the context at a time** (this is what lets classic ASP.NET preserve `HttpContext.Current`, culture, and identity across an async call without you passing them explicitly).

1. The request thread calls `.Result`, which **synchronously blocks** that thread until `GetDataAsync()`'s returned `Task` completes.
2. Inside `GetDataAsync`, the `await` on `GetStringAsync` captures the current `SynchronizationContext` before suspending.
3. When the HTTP call completes (on a thread-pool I/O completion thread), the continuation (the rest of `GetDataAsync`, i.e., `return "done"`) needs to run back on that captured context — because that's the default marshaling behavior.
4. But the context only allows one thread "inside" it at a time, and the **original request thread is already inside it, blocked on `.Result`**, waiting for `GetDataAsync` to finish.
5. The continuation can never get permission to run because the thread that would let it in is itself waiting for the continuation to finish. Neither side can proceed — deadlock, every time, deterministically (not a rare race).

**Why ASP.NET Core doesn't have this problem the same way:** ASP.NET Core deliberately has **no `SynchronizationContext`** installed for request-handling code at all (`Current` is `null` throughout a request). Continuations after an `await` in ASP.NET Core simply resume on whatever thread-pool thread is available — there's no single-threaded gate to contend for, so `.Result`/`.Wait()` on an async call in ASP.NET Core will typically still complete (though it still wastes a thread by blocking it, and remains bad practice for scalability and can still contribute to thread-pool exhaustion under load — it just doesn't reliably deadlock the way it does under a captured context).

**Fix in all cases:** `await` all the way up the call stack instead of blocking; if you truly must call async code from a synchronous context you cannot change, use `.ConfigureAwait(false)` throughout the awaited chain (reduces but does not eliminate risk), or better, run it via a dedicated single-purpose thread/`Task.Run().GetAwaiter().GetResult()` off the captured context entirely.

---

## Advanced — Question 2

**Q2: What does `volatile` actually do in C#, and what memory-visibility problem does it solve that `lock`/`Interlocked` also solve, but differently?**

Modern CPUs and the JIT compiler are both permitted to reorder memory reads/writes and cache values in CPU registers or per-core caches for performance, as long as the reordering is invisible *within a single thread's own view of its own execution*. Across threads, without synchronization, that reordering becomes visible and can produce genuinely surprising bugs: one thread's write to a field may not be observed by another thread for an unbounded amount of time (or effectively "never," if that field's value got cached in a register), and the *order* of two writes as seen by another thread isn't guaranteed to match the order they were issued.

```csharp
private bool _running = true; // no volatile

public void Worker()
{
    while (_running) { /* do work */ } // JIT may hoist this read out of the loop entirely,
                                        // caching it once in a register — the loop never
                                        // observes another thread setting _running = false
}

public void Stop() => _running = false; // called from another thread
```

`volatile` on a field instructs the compiler and JIT: never cache this field's value in a register across reads, and enforce specific memory-ordering guarantees around accesses to it (roughly, a volatile write has "release" semantics and a volatile read has "acquire" semantics, preventing certain reorderings around that access).

```csharp
private volatile bool _running = true; // now the loop reliably observes changes from other threads
```

**How this differs from `lock`/`Interlocked`:** those provide **mutual exclusion or atomicity** (only one thread modifies the value at a time, or the operation is indivisible) *in addition to* the necessary memory barriers — `lock` and `Interlocked` operations are always also full memory barriers. `volatile` provides **only** visibility/ordering guarantees for reads and writes of that one field — it does **not** make compound operations like `_counter++` atomic. `volatile int _counter; _counter++;` is still a read-modify-write race.

**Practical guidance:** `volatile` is narrow and easy to misuse — it's appropriate for simple flags (like the loop above) or the double-checked-locking pattern's guard field, not as a general substitute for locking. In most application code, `Interlocked`, `lock`, or a proper concurrent primitive is the safer default; reach for bare `volatile` only when you specifically understand the visibility semantics needed and the operation is a single, simple read/write.

---

## Advanced — Question 3

**Q3: Compare `lock`, `Monitor`, `Mutex`, and `SemaphoreSlim`. When is each actually the right tool, including across-process scenarios?**

**`lock` / `Monitor`:** `lock (obj) { ... }` is literally syntactic sugar for `Monitor.Enter(obj)` / `Monitor.Exit(obj)` wrapped in `try`/`finally` (with `Monitor.Enter` also usable directly when you need `TryEnter` with a timeout, or separate lock-acquisition from a `using` block). `Monitor` is **thread-affine** — only the thread that entered may exit — and is **process-local**: it synchronizes threads within the same process only, using a lightweight, purely in-memory/kernel-hybrid mechanism (spins briefly, then falls back to a kernel wait if contended). It cannot be awaited across (no async support).

```csharp
private readonly object _sync = new();
lock (_sync) { /* only one thread in this process, at a time */ }
```

**`Mutex`:** a kernel-object-backed mutual-exclusion primitive, meaningfully heavier than `Monitor` because every acquire/release potentially involves a kernel transition. Its distinguishing capability: a **named** `Mutex` is visible system-wide and can synchronize across **separate processes** — e.g., ensuring only one instance of an application runs on a machine, or coordinating two unrelated processes writing to the same file.

```csharp
using var mutex = new Mutex(initiallyOwned: false, name: @"Global\MyApp_SingleInstance");
if (!mutex.WaitOne(TimeSpan.Zero))
{
    Console.WriteLine("Another instance is already running.");
    return;
}
```

**`SemaphoreSlim`:** as covered in the Intermediate tier, this is the modern, lightweight, **async-aware** primitive — `WaitAsync()` doesn't block a thread, `Release()` isn't thread-affine, and it naturally supports a count > 1 for throttling concurrency, not just exclusive access. It is process-local only (there is a named, cross-process `Semaphore` class too, but it lacks the async API `SemaphoreSlim` provides).

**Decision guide:**
- Pure in-process exclusive access, no `await` inside: `lock`/`Monitor`.
- Pure in-process exclusive access **with** `await` inside, or need to bound concurrency to N: `SemaphoreSlim`.
- Cross-process coordination (single-instance app, shared file/resource across processes): named `Mutex` (or named `Semaphore` for a cross-process counting semaphore).

**Common pitfall:** reaching for `Mutex` inside a single process "to be safe" — it's needlessly heavier than `Monitor`/`SemaphoreSlim` for that case, since kernel-object overhead only pays for itself when you actually need cross-process visibility.

---

## Advanced — Question 4

**Q4: Why is `async void` considered dangerous, and when is it actually the correct choice?**

`async Task` methods return a `Task` that represents the operation, which callers can `await`, attach continuations to, and — critically — through which exceptions propagate as a faulted `Task` that the caller observes when it awaits.

`async void` methods have no such object. There is nothing for a caller to `await`, meaning:

1. **The caller cannot know when the operation completes.** Fire-and-forget by construction — code after calling an `async void` method runs immediately, without waiting for it, with no way to opt into waiting.
2. **Unhandled exceptions cannot be caught by the caller.** An exception thrown inside an `async void` method is instead raised directly on the `SynchronizationContext` that was active when the method started — in most hosts this crashes the process (unhandled exception on a thread-pool thread) rather than propagating to any `try`/`catch` around the call site:

```csharp
async void RiskyOperation()
{
    await Task.Delay(100);
    throw new InvalidOperationException("boom"); // this will crash the process —
                                                  // no surrounding try/catch can catch it
}

try
{
    RiskyOperation(); // returns immediately; exception surfaces later, uncatchably, here
}
catch (Exception ex)
{
    // never reached for the exception thrown inside RiskyOperation
}
```

**The one legitimate use case:** UI/event-handler signatures that the framework itself defines as `void` and calls directly — e.g., a WPF `Button.Click` event handler, which the framework invokes as `void Handler(object sender, RoutedEventArgs e)`. You cannot change that signature to return `Task`, since the event's delegate type demands `void`. In that specific case, `async void` is the only option, and the accepted mitigation is to wrap the entire body in `try`/`catch` yourself so exceptions are handled locally rather than crashing the app.

```csharp
private async void OnButtonClick(object sender, RoutedEventArgs e)
{
    try { await LoadDataAsync(); }
    catch (Exception ex) { ShowError(ex); } // must catch here — no other path handles it
}
```

**Rule of thumb:** every `async` method should be `async Task` (or `async Task<T>`) unless the method signature is dictated by a framework event handler with no `Task`-returning overload — and even then, wrap the body defensively.

---

## Advanced — Question 5

**Q5: When is `Parallel.For`/PLINQ appropriate, and specifically when should you avoid them?**

`Parallel.For`, `Parallel.ForEach`, and PLINQ (`.AsParallel()`) partition a workload across multiple threads from the thread pool to run genuinely concurrently on multiple CPU cores, then (for `Parallel.For`/`ForEach`) block the calling thread until all partitions finish.

```csharp
// Good use: CPU-bound, independent, no shared mutable state written per-iteration.
Parallel.For(0, images.Count, i =>
{
    images[i] = ApplyFilter(images[i]); // pure CPU work, each iteration independent
});
```

**When they're the right tool:** genuinely CPU-bound work (image processing, numeric computation, hashing) where each unit of work is independent (or safely partitionable) and the machine has spare cores to exploit. The overhead of partitioning and coordinating threads only pays off when the per-item work is substantial enough to outweigh that coordination cost.

**When NOT to use them — I/O-bound work:**

```csharp
// BAD: blocks a thread-pool thread per item on synchronous I/O, and Parallel.For itself
// blocks the calling thread until everything finishes — no async support at all.
Parallel.ForEach(urls, url =>
{
    var data = httpClient.GetStringAsync(url).Result; // .Result blocks a thread pool thread
    Process(data);
});
```

`Parallel.For`/`ForEach` have no built-in concept of asynchronous work — their delegates are synchronous `Action`s. Using them over I/O-bound work forces you into blocking calls (`.Result`) inside each partition, which ties up thread-pool threads for the entire duration of the I/O (potentially seconds), rather than releasing them the way `await` would. For a large number of I/O-bound operations, this both wastes threads unnecessarily and can trigger the exact thread-pool-starvation problem described in the Scenario tier. The correct tool for concurrent I/O-bound work is `Task.WhenAll` over a set of genuinely async tasks (optionally bounded by `SemaphoreSlim`), not `Parallel.For`.

**Other pitfalls:** writing to shared, unsynchronized state from inside a `Parallel.For` body (a classic race condition, same as any multithreading); assuming more cores always means faster — for small collections or cheap per-item work, the partitioning/coordination overhead can make `Parallel.For` slower than a plain sequential loop. Always measure.

---

## Advanced — Question 6

**Q6: What is `System.Threading.Channels.Channel<T>`, and how does it model a producer/consumer pipeline better than a manually-locked queue?**

`Channel<T>` is a purpose-built, fully async-aware, thread-safe pipe between one or more producers and one or more consumers, replacing the old pattern of a manually-locked `Queue<T>` plus a `ManualResetEvent`/polling loop to signal availability.

```csharp
var channel = Channel.CreateBounded<int>(new BoundedChannelOptions(capacity: 100)
{
    FullMode = BoundedChannelFullMode.Wait // producer awaits (backpressure) when full
});

// Producer
async Task ProduceAsync()
{
    for (int i = 0; i < 1000; i++)
    {
        await channel.Writer.WriteAsync(i); // asynchronously waits if the channel is full
    }
    channel.Writer.Complete(); // signals no more items are coming
}

// Consumer
async Task ConsumeAsync()
{
    await foreach (var item in channel.Reader.ReadAllAsync())
    {
        Process(item); // stops automatically once the writer completes and all items drain
    }
}

await Task.WhenAll(ProduceAsync(), ConsumeAsync());
```

**Why this is better than a locked `Queue<T>` + polling/`ManualResetEvent`:**
- `WriteAsync`/`ReadAsync`/`await foreach` are fully async — no thread is blocked waiting for space (producer) or an item (consumer), unlike a naive `lock`+spin-wait or a blocking `Monitor.Wait`.
- **Backpressure is built in.** `Channel.CreateBounded` with `FullMode = Wait` naturally slows a fast producer down to the consumer's pace, instead of letting an unbounded queue grow without limit and exhaust memory — you'd have to hand-roll this coordination yourself with raw locking.
- `Writer.Complete()` plus `ReadAllAsync()`'s automatic termination cleanly models "no more items are coming" without a separate sentinel value or shared "done" flag that both sides must check correctly.
- Supports multiple producers and/or multiple consumers safely out of the box (`SingleReader`/`SingleWriter` options let you opt into faster internal paths when you know only one side is used).

**Practical guidance:** reach for `Channel<T>` whenever you have a genuine producer/consumer pipeline with different production and consumption rates — background job queues, log/event pipelines, batching incoming work before writing to a database. It's the modern, async-native replacement for `BlockingCollection<T>` (which is synchronous/thread-blocking) in that role.

---

## Scenario — Question 1

**Q1: A legacy ASP.NET (System.Web, not Core) MVC application has a controller action that hangs indefinitely under real traffic — it works fine when you step through it in the debugger with a single request, but under load, requests to that action simply never return until they eventually time out. The action is:**

```csharp
public ActionResult Dashboard()
{
    var stats = _statsService.GetStatsAsync().Result;
    return View(stats);
}
```

**Diagnose the root cause and provide the fix.**

This is the textbook `SynchronizationContext` deadlock described in the Advanced tier, and the "works fine in the debugger with one request, hangs under real load" symptom is its signature: with a single stepped-through request there's often enough time between debugger steps for the context to clear, or the debugger itself alters timing enough to mask it — under real concurrent traffic it reproduces reliably.

**Root cause:** `.Result` blocks the current request thread synchronously. `GetStatsAsync()`'s internal `await` captured `AspNetSynchronizationContext`, which permits only one thread inside it at a time. When the awaited operation completes, its continuation needs that same context to resume — but the request thread that owns it is stuck blocked on `.Result`, waiting for exactly that continuation to finish. Neither side can make progress: a deterministic deadlock, not a race condition, which is why every request to this action eventually times out (typically visible as a growing count of blocked threads in the Application Pool, and the whole app becoming unresponsive as more requests pile up behind the same pattern).

**The fix — make the whole chain async, don't block on it:**

```csharp
public async Task<ActionResult> Dashboard()
{
    var stats = await _statsService.GetStatsAsync();
    return View(stats);
}
```

Classic ASP.NET MVC controller actions support returning `Task<ActionResult>` natively — the framework `await`s it itself rather than requiring you to block. This removes the synchronous block entirely, so there's no thread stuck holding the context hostage.

**If touching the action signature genuinely isn't possible** (e.g., a third-party framework contract forcing a synchronous method): apply `.ConfigureAwait(false)` to every `await` inside `GetStatsAsync()` and everything it calls, so none of them try to resume on the captured context — this breaks the deadlock cycle (the continuation no longer needs permission from the blocked thread) but is a strictly worse workaround than simply going async all the way up, since it's easy to miss one `await` deep in the call graph and reintroduce the bug. The durable fix is always to stop blocking on async code and let `async` propagate through the call stack.

---

## Scenario — Question 2

**Q2: A background worker service dequeues items from an in-memory queue on one thread and periodically snapshots/aggregates statistics from a shared `Dictionary<string, int>` on another timer-driven thread. Occasionally — a few times a day, under real load — the service throws a `NullReferenceException` or `InvalidOperationException` deep inside `Dictionary` internals, and once, the aggregation produced numbers that couldn't possibly be correct. What's the underlying bug, and how do you fix it with minimal added contention?**

**Root cause:** two threads are reading and writing a plain `Dictionary<string, int>` concurrently with no synchronization at all. `Dictionary<TKey,TValue>` is explicitly documented as not thread-safe for any concurrent write, or a concurrent read alongside a write — its internal bucket/entry arrays can be mutated mid-read by another thread, which can corrupt internal state enough to throw seemingly-unrelated exceptions (`NullReferenceException`, `IndexOutOfRangeException`, infinite loops on resize) rather than failing cleanly. The wrong-numbers symptom is a plain race condition: the aggregation thread reads values mid-update from the worker thread, capturing an inconsistent partial state.

```csharp
// The bug: two threads touching this dictionary with zero coordination.
private readonly Dictionary<string, int> _stats = new();

void OnItemProcessed(string key) => _stats[key] = _stats.GetValueOrDefault(key) + 1; // worker thread

void OnAggregationTick() // timer thread, runs concurrently
{
    foreach (var kvp in _stats) Aggregate(kvp); // enumerating while another thread mutates
}
```

**The fix, favoring minimal contention:** switch to `ConcurrentDictionary<string,int>`, which is built for exactly this shape of access (many small independent updates from one side, periodic iteration from the other) and uses internal lock striping so unrelated keys don't contend, rather than one coarse lock serializing everything:

```csharp
private readonly ConcurrentDictionary<string, int> _stats = new();

void OnItemProcessed(string key) => _stats.AddOrUpdate(key, 1, (_, v) => v + 1);

void OnAggregationTick()
{
    // Snapshot enumeration is safe on ConcurrentDictionary — it won't throw, though it may
    // reflect a point-in-time view that's slightly stale for entries mutated mid-enumeration.
    foreach (var kvp in _stats) Aggregate(kvp);
}
```

If a fully consistent, atomic *point-in-time* snapshot across all keys together is required (e.g., the aggregation must never see a partially-updated set), a single coarse `lock` around both the write path and a copy-then-release read path is the correct, if higher-contention, alternative — but for simple per-key counters, `ConcurrentDictionary`'s built-in atomic composite operations (`AddOrUpdate`, `GetOrAdd`) are the minimal-contention fix and eliminate both the crashes and the corrupted aggregation.

---

## Scenario — Question 3

**Q3: An API endpoint fans out to 50 downstream HTTP services to assemble a response. It's implemented as:**

```csharp
public async Task<IActionResult> GetAggregate()
{
    var tasks = downstreamUrls.Select(url =>
        Task.Run(() => httpClient.GetStringAsync(url).Result)
    ).ToList();

    var results = await Task.WhenAll(tasks);
    return Ok(results);
}
```

**Under moderate concurrent traffic (multiple users hitting this endpoint at once), the whole application starts responding slowly to completely unrelated requests, and `dotnet-counters` shows a growing thread-pool queue length. Diagnose and fix.**

**Root cause: thread-pool starvation from two compounding mistakes.** First, `httpClient.GetStringAsync(url).Result` blocks a thread-pool thread for the full duration of each HTTP call instead of releasing it — this alone wastes threads unnecessarily since the async version already exists. Second, wrapping that blocking call in `Task.Run` doesn't fix anything — it just moves the blocking onto a *different* thread-pool thread, so it still consumes one for the whole HTTP round-trip. With 50 downstream calls per request and multiple concurrent users, each request instantaneously demands 50 thread-pool threads, all held hostage (blocked, not doing anything) for however long the slowest downstream call takes.

The thread pool only grows slowly under sustained demand (its injection algorithm adds roughly one new thread every ~500ms once the pool judges itself under-provisioned), so a sudden demand for hundreds of blocked threads outpaces how fast the pool can grow — the queue backs up, and *every* unrelated request in the process (health checks, other endpoints) gets stuck waiting behind this queue too, because they all share the same thread pool.

**The fix — use genuine async I/O, no `Task.Run`, no `.Result`:**

```csharp
public async Task<IActionResult> GetAggregate()
{
    var tasks = downstreamUrls.Select(url => httpClient.GetStringAsync(url));
    var results = await Task.WhenAll(tasks);
    return Ok(results);
}
```

Now no thread is blocked at all during the 50 concurrent HTTP calls — they're genuinely in flight via async I/O, and the thread pool is completely free to serve other requests in the meantime.

**If 50-way unbounded fan-out is itself a concern** (overwhelming a downstream service, or you want to cap in-flight concurrency regardless of how many URLs there are), bound it with `SemaphoreSlim` rather than removing the parallelism entirely:

```csharp
var gate = new SemaphoreSlim(10); // at most 10 concurrent downstream calls
var tasks = downstreamUrls.Select(async url =>
{
    await gate.WaitAsync();
    try { return await httpClient.GetStringAsync(url); }
    finally { gate.Release(); }
});
var results = await Task.WhenAll(tasks);
```

This still uses zero blocked threads while capping how many downstream calls are truly concurrent.

---

## Scenario — Question 4

**Q4: A read-through cache is implemented with `ConcurrentDictionary<string, Product>.GetOrAdd`, where the factory calls an expensive database query. Under load, you notice the "expensive" database query — which should run once per key, ever — is sometimes executed 2-3 times concurrently for the same key. Why does this happen despite using `ConcurrentDictionary`, and how do you fix it?**

```csharp
private readonly ConcurrentDictionary<string, Product> _cache = new();

public Product GetProduct(string id) =>
    _cache.GetOrAdd(id, key => _db.LoadExpensiveProduct(key)); // factory can run more than once!
```

**Root cause:** `ConcurrentDictionary` guarantees the *dictionary's own internal state* stays consistent under concurrent access — it does **not** guarantee the factory delegate passed to `GetOrAdd` runs only once per key. The documented behavior is explicit: if multiple threads call `GetOrAdd` for the same missing key concurrently, the factory may be invoked by more than one of them (only one of the resulting values actually gets stored — the "losing" threads' computed values are discarded — but any *side effect* the factory caused, like an expensive DB round-trip, already happened for each concurrent caller before the race was resolved). This is a very common and easy-to-miss gotcha: the dictionary itself is thread-safe, but "run this expensive thing exactly once" is a stronger guarantee that `GetOrAdd` alone does not provide.

**The fix — wrap the value in `Lazy<T>` so the expensive work itself is deduplicated, not just the dictionary slot:**

```csharp
private readonly ConcurrentDictionary<string, Lazy<Product>> _cache = new();

public Product GetProduct(string id)
{
    var lazy = _cache.GetOrAdd(id, key =>
        new Lazy<Product>(() => _db.LoadExpensiveProduct(key), LazyThreadSafetyMode.ExecutionAndPublication));
    return lazy.Value; // triggers the DB call only on first actual access, synchronized internally
}
```

Now, `GetOrAdd`'s factory only constructs a **cheap** `Lazy<Product>` wrapper (no DB call yet, so it's harmless if it runs more than once for concurrent misses — only one `Lazy` instance ends up published either way). The actual expensive work happens inside `lazy.Value`, and `Lazy<T>` with `ExecutionAndPublication` mode guarantees its factory runs **exactly once**, with every concurrent caller blocking until the first caller's evaluation completes and then all sharing that single computed result.

**For the async equivalent** (an `async Task<Product>` factory), the same pattern applies using `Lazy<Task<Product>>` — callers `await` the shared task rather than block, so concurrent callers all await the same in-flight database call instead of each triggering their own.

**Pitfall to watch for:** if the factory can throw, `Lazy<T>` by default caches the exception too (subsequent `.Value` accesses rethrow the same cached exception forever) — use `LazyThreadSafetyMode` combined with re-creating the cache entry on failure (or `Lazy<T>`'s newer retry-on-exception support) if a failed load should be retried rather than permanently poisoning that cache key.

---

## Beginner — Question 5

**Q5: "Concurrency" and "parallelism" are often used interchangeably, but they mean different things. What's the distinction, and why is `async`/`await` in C# primarily a concurrency tool rather than a parallelism tool?**

**Concurrency** means multiple pieces of work are *in progress* over the same period of time, but not necessarily executing at the exact same instant — a single core can be concurrent by rapidly switching between tasks (interleaving), doing a slice of one, then a slice of another, giving the illusion of simultaneity. **Parallelism** means multiple pieces of work are executing *literally at the same time*, on genuinely separate CPU cores. Parallelism requires multiple cores; concurrency does not — it's fundamentally about *structure* (can these things be interleaved/managed together), not about *how many cores are burning*.

A helpful mental model: a single chef who takes an order, puts a pot on to boil, and while it boils starts chopping vegetables for a different dish, is being **concurrent** — one chef, multiple tasks in flight, interleaved based on what's currently waiting versus ready. Two chefs each cooking their own dish simultaneously is **parallelism**.

```csharp
// Concurrency: a single logical thread of control juggles two in-flight I/O operations by
// interleaving — no two lines of *your* code ever literally run at the same instant here.
async Task RunAsync()
{
    var t1 = client.GetStringAsync(url1); // started, not blocked on
    var t2 = client.GetStringAsync(url2); // started while t1 is still in flight
    await Task.WhenAll(t1, t2);           // both awaited concurrently, not necessarily in parallel
}
```

**Why `async`/`await` is a concurrency tool, not a parallelism tool:** as covered in Q2, `await`ing an I/O operation doesn't consume a thread at all while it's pending — there's no second core "working" on it; the OS is handling the I/O, and your one logical flow of control is simply free to do other things or wait efficiently. Even the example above, with two HTTP calls "concurrently" in flight, involves zero extra CPU work happening in parallel — no core is busy computing anything for either request while they're pending. Real parallelism (`Parallel.For`, `Task.Run` spreading CPU-bound work) is about exploiting multiple cores for CPU-bound work; `async`/`await` is about not wasting a thread while waiting on something external. They're complementary, not synonyms, and conflating them leads to the common mistake of expecting `async` alone to make CPU-heavy code faster (it won't — see Q2's follow-up).

**Common pitfall:** describing `await Task.WhenAll(...)` as "running things in parallel." It's more precise to say the operations are running *concurrently* — they overlap in time, but for I/O-bound work no core is doing simultaneous computation; true parallelism only enters the picture for CPU-bound work spread across threads.

---

## Beginner — Question 6

**Q6: What does it actually mean for a piece of code, or a class, to be "thread-safe"? How is that different from code that merely happens to work when you test it single-threaded?**

"Thread-safe" has a precise meaning: a type or a piece of code is thread-safe if it behaves correctly — produces consistent, non-corrupted results and never throws unexpected exceptions — when called from **multiple threads simultaneously, with no additional synchronization imposed by the caller**. The guarantee has to hold under arbitrary interleavings, including the worst-case timing, not just the interleavings that happen to occur during your local testing.

```csharp
public class Counter
{
    private int _value;
    public void Increment() => _value++; // NOT thread-safe: read-modify-write, not atomic
    public int Value => _value;
}
```

Run `Increment()` from a single thread in a unit test, a thousand times in a loop, and it will produce exactly the expected result every time — the test passes, and it looks correct. That's precisely the trap: single-threaded correctness proves nothing about thread safety, because the race condition in `_value++` (read, add, write — three separate steps) only manifests when two threads interleave those three steps against each other, which single-threaded execution can never do. A class can pass every test you write and still be fundamentally unsafe for concurrent use.

**What "thread-safe" requires in practice:** either the type internally synchronizes all access to its mutable state (e.g., `ConcurrentDictionary` takes out its own internal locks so callers don't have to), or the type is immutable (nothing can race over state that never changes after construction — immutable types are trivially thread-safe), or it's explicitly documented as *not* thread-safe, placing the burden of external synchronization (`lock`, `SemaphoreSlim`) on the caller.

**The pitfall this question is really getting at:** most .NET BCL collection types (`List<T>`, `Dictionary<TKey,TValue>`, `HashSet<T>`) are deliberately **not** thread-safe by design (synchronization has a cost, and single-threaded use is the overwhelmingly common case) — using them from multiple threads without your own `lock` around every access is a latent bug that local, single-threaded, or low-concurrency testing will not surface. Documentation for a type or method should always be checked explicitly for a thread-safety statement rather than assumed; "it worked in my tests" is not evidence of thread safety, only evidence that your tests didn't exercise a genuinely concurrent interleaving.

---

## Intermediate — Question 8

**Q8: What is `IAsyncEnumerable<T>` and `await foreach`, and when is streaming results this way the right choice over just returning `Task<List<T>>`?**

`IAsyncEnumerable<T>` is the asynchronous counterpart to `IEnumerable<T>`: instead of producing items synchronously one at a time via `MoveNext()`, it produces them **asynchronously** one at a time via `MoveNextAsync()`, letting a producer method `yield return` items as they become available, potentially awaiting I/O between each one — and letting a consumer start processing the first item before the rest exist yet.

```csharp
public async IAsyncEnumerable<Order> GetOrdersAsync(
    [EnumeratorCancellation] CancellationToken ct = default)
{
    await using var reader = await _db.OpenStreamingReaderAsync("SELECT * FROM Orders", ct);
    while (await reader.ReadNextAsync(ct))
    {
        yield return reader.MapToOrder(); // one row surfaces to the consumer at a time
    }
}

// Consumer:
await foreach (var order in GetOrdersAsync(cancellationToken))
{
    Process(order); // starts as soon as the FIRST row arrives, not after all rows are loaded
}
```

**Contrast with `Task<List<T>>`:**

```csharp
public async Task<List<Order>> GetOrdersAsListAsync()
{
    var all = new List<Order>();
    await using var reader = await _db.OpenStreamingReaderAsync("SELECT * FROM Orders");
    while (await reader.ReadNextAsync()) all.Add(reader.MapToOrder());
    return all; // caller waits for EVERY row before getting anything
}
```

This version must fully materialize the entire result set in memory before returning — the caller sees nothing until the last row has been read. For a large or unbounded result set, that's both a latency problem (nothing happens until everything is ready) and a memory problem (the whole set is held at once).

**When `IAsyncEnumerable<T>`/`await foreach` is the right tool:** large or streaming result sets (paging through a huge DB query, reading a large file line by line, consuming a live event/message feed) where the consumer can usefully start processing before production finishes, or where materializing the full set at once would use excessive memory. It also composes naturally with `CancellationToken` (via `[EnumeratorCancellation]`) to stop mid-stream cheaply.

**When `Task<List<T>>` is still preferable:** small, bounded result sets where the caller needs the whole collection anyway before doing anything useful (e.g., needs a `Count` or wants to sort it) — the added machinery of async iteration isn't worth it, and a plain list is simpler to reason about and consume.

---

## Intermediate — Question 9

**Q9: What is `Lazy<T>`, and how do its `LazyThreadSafetyMode` options work? How does it solve the double-initialization race generally, beyond the `ConcurrentDictionary.GetOrAdd` case?**

`Lazy<T>` defers creation of a value until it's first accessed via `.Value`, and — depending on the mode selected — coordinates concurrent access so that expensive or side-effecting initialization logic doesn't run more than once even when multiple threads race to access `.Value` for the first time simultaneously.

```csharp
private static readonly Lazy<ExpensiveResource> _resource =
    new(() => new ExpensiveResource(), LazyThreadSafetyMode.ExecutionAndPublication);

public ExpensiveResource GetResource() => _resource.Value; // safe from any number of threads
```

**The three `LazyThreadSafetyMode` values:**
- **`ExecutionAndPublication`** (the default when using the parameterless-safety constructor): a lock ensures only one thread ever executes the factory, and every other concurrent caller blocks until that execution finishes, then all callers receive the same single result. This is the strongest, safest, and most commonly correct choice — it's exactly what generalizes the `GetOrAdd`-double-execution fix from the earlier Scenario: the expensive work runs exactly once, full stop.
- **`PublicationOnly`**: multiple threads are *allowed* to race and execute the factory concurrently (no execution lock), but only the first result to finish gets "published" — stored and returned to everyone, including the threads whose own factory execution is discarded. This trades "the factory might run more than once" for "no execution-time lock contention" — appropriate when the factory is cheap enough that occasional duplicate execution is acceptable, or when the factory itself must not be run under a held lock (e.g., it does its own locking that could deadlock against `Lazy`'s internal lock).
- **`None`**: no thread safety at all — if accessed by multiple threads without external synchronization, behavior is undefined (could double-initialize, could corrupt the cached value). Use only when you can guarantee single-threaded access, for the small performance win of skipping synchronization entirely.

**Beyond caching:** this same `ExecutionAndPublication` pattern is the general-purpose fix for *any* double-checked, "compute once no matter how many threads race to be first" scenario — a shared configuration object built from an expensive parse, a singleton connection factory, a memoized computation — not just the dictionary-cache case. Wrapping the value type in `Lazy<T>` is almost always simpler and less error-prone than hand-rolling double-checked locking with `volatile` and manual `lock` blocks.

---

## Intermediate — Question 10

**Q10: What's the difference between `Task.WhenAny` and `Task.WhenAll`? Give a concrete use case for each.**

`Task.WhenAll(tasks)` returns a `Task` that completes only once **every** task in the set has completed (whether successfully or faulted) — you get all results together, or the exception(s) as described in Q4. `Task.WhenAny(tasks)` returns a `Task<Task>` that completes as soon as **the first** task in the set completes, regardless of the others — the result is a reference to *which* task finished first, and the rest keep running in the background unless you explicitly cancel them.

```csharp
// WhenAll: need every result before proceeding — e.g., assembling a dashboard from several
// independent data sources, all of which are required.
var usersTask = _userService.GetUsersAsync();
var ordersTask = _orderService.GetOrdersAsync();
var statsTask = _statsService.GetStatsAsync();
await Task.WhenAll(usersTask, ordersTask, statsTask);
var dashboard = new Dashboard(usersTask.Result, ordersTask.Result, statsTask.Result);
```

```csharp
// WhenAny: react to whichever finishes first — the classic timeout pattern, racing the real
// operation against a Task.Delay that represents "give up after N seconds."
async Task<string> FetchWithTimeoutAsync(HttpClient client, string url, TimeSpan timeout)
{
    var fetchTask = client.GetStringAsync(url);
    var timeoutTask = Task.Delay(timeout);

    var winner = await Task.WhenAny(fetchTask, timeoutTask);
    if (winner == timeoutTask)
        throw new TimeoutException($"Request to {url} exceeded {timeout}.");

    return await fetchTask; // re-await to observe the result/rethrow any fault, not just presence
}
```

Note the pattern above: `Task.WhenAny` itself never inspects or rethrows the winning task's exception — it just tells you *which* task finished. You must still `await` (or check `.Result`/`.Exception`) on that specific task afterward to actually get its result or observe a fault.

**Other `WhenAny` use cases:** racing the same request against multiple redundant endpoints and taking whichever responds first; implementing a "first successful attempt wins" retry-with-fallback pattern; processing a batch of tasks as each one finishes rather than waiting for the whole batch (looping `WhenAny`, removing the winner from the list, and repeating).

**Pitfall:** `Task.WhenAny` does not cancel the losing tasks automatically — in the timeout example, the original `fetchTask` keeps running in the background even after you've given up and thrown `TimeoutException`. If that matters (avoiding wasted work, or a resource leak), pass a linked `CancellationToken` into the real operation and cancel it explicitly when the timeout wins.

---

## Advanced — Question 7

**Q7: Go deeper on thread-pool starvation than the "don't block on async" rule — what is the actual growth mechanics of the .NET thread pool, and why does that make blocking pool threads especially dangerous at scale?**

The CLR thread pool does not spin up a large number of threads eagerly. It starts with a small number of "minimum" threads (roughly the core count by default) and only grows beyond that when it judges the queue of pending work isn't being drained fast enough — via a **hill-climbing algorithm** that periodically samples throughput and adjusts the target thread count up or down to try to maximize work completed per unit time. Critically, when the pool decides it needs *more* threads than currently exist beyond the minimum, it does **not** create them instantly — new-thread injection is deliberately throttled, historically adding roughly one new thread approximately every 500ms (the exact figure and algorithm have evolved across .NET versions, but the throttle is a constant across all of them) once the pool detects sustained starvation. This throttling exists specifically to avoid the pool overreacting to brief spikes by mass-creating expensive OS threads that would just as quickly go idle again.

**Why this makes blocking pool threads dangerous at scale, beyond the earlier `Task.Run` scenario:** if a burst of work suddenly needs, say, 200 threads simultaneously blocked on synchronous I/O (as in the 50-downstream-fan-out scenario, multiplied across several concurrent requests), the pool cannot conjure 200 threads quickly — at roughly one new thread every half-second, closing a 200-thread deficit takes on the order of a minute or more, during which **every** unrelated piece of queued work in the entire process — health checks, timers, other endpoints' request handling, background jobs — sits queued behind the starved pool, because the thread pool is a single shared, process-wide resource. This is what makes thread-pool starvation so much worse than an isolated slow endpoint: it doesn't fail gracefully or in isolation, it degrades the whole process's responsiveness simultaneously, and the growth mechanism that's supposed to self-heal is architecturally too slow to absorb sudden synchronous-blocking demand spikes.

**Practical guidance:** never rely on the pool's ability to "just grow" to absorb blocking calls under load — treat any synchronous, blocking call on a pool thread (`.Result`, `.Wait()`, a slow synchronous DB driver, `Thread.Sleep`) in server code as something to eliminate, not something to tolerate because the pool can supposedly compensate. `ThreadPool.SetMinThreads` can raise the *floor* below which the throttle doesn't apply, which is sometimes used as a stopgap under known bursty load, but it's a blunt workaround — the durable fix is always removing the blocking call itself (`await` instead of `.Result`), not pre-provisioning more threads to be blocked.

---

## Advanced — Question 8

**Q8: How do `[ThreadStatic]` and `AsyncLocal<T>` differ, and why does thread-local state break across an `await` while `AsyncLocal<T>` doesn't?**

`[ThreadStatic]` marks a static field so that each **OS thread** gets its own independent copy — reads and writes on one thread never see another thread's value. It's a purely thread-scoped storage mechanism, tied to the physical thread, with no concept of a logical operation that might span multiple threads over time.

```csharp
[ThreadStatic]
private static string _requestId; // one slot per THREAD, not per logical operation

async Task ProcessAsync()
{
    _requestId = "req-123";
    await SomeAsyncWork();          // execution may resume on a DIFFERENT pool thread here
    Console.WriteLine(_requestId);  // may print null! — the new thread has its own, unset slot
}
```

**Why this breaks across `await`:** as covered in the state-machine question, resuming after an `await` frequently happens on a *different* thread-pool thread than the one that started the method — the thread pool reuses whichever thread is free, with no guarantee of continuity. `[ThreadStatic]` state is keyed to the physical thread, so the continuation, running on a different thread, sees that thread's own (likely unset) copy — the value set before the `await` is invisible after it, silently, with no error.

**`AsyncLocal<T>`** solves exactly this by flowing with the **logical call context** rather than the physical thread — the runtime propagates `AsyncLocal<T>` values through `ExecutionContext`, which is explicitly captured and restored across `await` points (and across `Task.Run`, thread-pool queuing, and other async hops) as part of the async infrastructure itself.

```csharp
private static readonly AsyncLocal<string> _requestId = new();

async Task ProcessAsync()
{
    _requestId.Value = "req-123";
    await SomeAsyncWork();               // may resume on a different thread...
    Console.WriteLine(_requestId.Value); // ...but this still correctly prints "req-123"
}
```

This is precisely the mechanism ASP.NET Core's `HttpContext` accessor, distributed-tracing correlation IDs (`Activity.Current`), and `System.Diagnostics` logging scopes rely on to stay correct across `await`s without you manually threading a parameter through every call.

**Practical guidance:** never use `[ThreadStatic]` for anything meant to represent a logical operation, request, or async flow's ambient state — it will intermittently and silently lose that state the moment any `await` resumes on a different thread, which is exactly the kind of bug that's invisible in quick manual testing and shows up unpredictably under real async load. `AsyncLocal<T>` is the correct primitive whenever ambient context needs to survive across `await` boundaries.

---

## Advanced — Question 9

**Q9: What is "false sharing," and why is it a distinct, sneakier performance problem from a race condition?**

False sharing is a CPU cache-level performance pitfall, not a correctness bug: it happens when two threads write to two *different*, logically unrelated variables that happen to be laid out close enough in memory to land on the **same CPU cache line** (typically 64 bytes on modern x86/x64). There's no actual shared data and no race condition — each thread's write is to its own variable, and the program computes correct results. The problem is purely about hardware cache-coherency overhead: when one core writes to any part of a cache line, the cache-coherency protocol (e.g., MESI) invalidates that entire line in every other core's cache, forcing them to re-fetch it from a slower shared cache or memory before their own write can proceed — even though the other core's variable, sitting elsewhere in that same 64-byte line, was never touched by the first core at all.

```csharp
public class Counters
{
    public long CounterA; // adjacent fields likely share a 64-byte cache line
    public long CounterB;
}

// Thread 1 hammers CounterA, Thread 2 hammers CounterB — no shared data, no race condition,
// yet both threads' writes are invisibly serialized by cache-line invalidation traffic.
```

Because `CounterA` and `CounterB` are adjacent `long`s (8 bytes each), they very likely sit in the same cache line, so heavy concurrent writes to each — despite touching entirely separate memory logically — cause constant cross-core cache invalidation, which can slow the combined throughput down dramatically (often several-fold) compared to the same fields laid out far enough apart to land on different cache lines.

**Why this is distinct from, and sneakier than, a race condition:** a race condition is a *correctness* bug — the program can compute a wrong answer, and tools (thread sanitizers, careful code review for unsynchronized shared state, the disciplined approach from the Scenario tier) can reason about it from the code alone. False sharing produces **completely correct results** every time — nothing to catch in a code review, no exception, no wrong output — it only shows up as unexplained, hard-to-diagnose *performance* degradation under concurrent load, typically found via profiling (hardware performance counters showing high cache-miss/invalidation rates) rather than by reading the code.

**The fix:** pad or separate independently-hot fields so they land on different cache lines — e.g., via explicit padding fields, `[StructLayout]` with spacing, or splitting a struct so each thread's hot field gets its own cache line (.NET also ships `System.Runtime.CompilerServices.PaddingHelpers`-style patterns and a low-level cache-line-sized `Padding` helper is a common hand-rolled fix). This matters most in tight, high-throughput hot loops with per-thread counters or per-core statistics — ordinary application code rarely needs to think about it, but high-performance server/library code sometimes must.

---

## Scenario — Question 5

**Q5: A high-throughput service intermittently returns wrong computed results — not crashes, just occasionally incorrect values — but only in production under real load. It has never once reproduced locally, in load-test replay, or while stepping through with a debugger attached. How do you diagnose this, and why is the "just try to reproduce it in the debugger" instinct the wrong first move?**

**Why it never reproduces under a debugger:** this symptom pattern — wrong-but-not-crashing, load-dependent, debugger-immune — is the signature of a **race condition**, sometimes nicknamed a "heisenbug" because attempting to observe it changes it. Breakpoints, single-stepping, and even the debugger's own overhead radically alter the timing of thread interleaving; a race that depends on two threads hitting a specific unsynchronized read/write in a narrow window of microseconds essentially never survives the vastly slower, serialized-by-observation timing a debugger imposes. The same is often true of light local testing or synthetic load replay that doesn't reproduce production's actual concurrency level, thread-pool saturation, or GC pause timing — all of which affect how likely a given race window is to actually be hit.

**Why stepping through in a debugger is the wrong first move:** it's not just unproductive, it's actively self-defeating — you're using a tool whose very operation suppresses the exact condition (tight, unpredictable interleaving under real concurrency) that causes the bug. Time spent trying to "catch it in the act" this way is largely wasted, and worse, a few unsuccessful attempts can wrongly convince a team the bug is something else (bad data, a downstream service issue) rather than concurrency-related.

**The disciplined approach — code review for unsynchronized shared mutable state, first:** given the strong tell (intermittent, wrong-not-crashing, only-under-load, debugger-immune), the productive path is a targeted audit of the code on the hot path for exactly this shape of bug:
1. Identify every piece of state (fields, static state, captured closures, cached singletons) that's written to and read from multiple concurrent request/worker threads.
2. For each one, verify it's either immutable, properly synchronized (`lock`, `Interlocked`, a concurrent collection), or genuinely thread-confined — not merely "usually fine."
3. Pay particular attention to compound operations that look atomic but aren't (`counter++`, `if (dict.ContainsKey) dict[k] = ...` as two steps, a cached computed value being read-then-conditionally-recomputed) — these are exactly the class of bug from the Beginner/Intermediate/Scenario tiers above, and they are the overwhelmingly common root cause of "occasionally wrong, never crashes, load-only" symptoms.
4. Once a suspect is found, reason about it statically (does this genuinely need to be correct under concurrent access, and is it?) rather than trying to empirically trigger it — the fix (lock, `Interlocked`, immutability, a proper concurrent collection) is usually obvious once the unsynchronized access is spotted, and can be verified by sustained high-concurrency load/stress testing afterward (which, unlike a debugger, preserves real timing and has a much better chance of surfacing the race if the fix didn't actually close it).

**Supporting tactics beyond manual review:** stress-test with many concurrent threads hammering the suspected code path with no debugger attached and tight timing (this preserves the race window instead of eliminating it); consider tools built for this class of bug (thread/concurrency analyzers, or deliberately inserting `Thread.Sleep`/`Task.Yield` at suspected race points during testing to widen the interleaving window and make the bug reproduce *more* often, not less). But the first, cheapest, and highest-yield step is always static: read the code for shared mutable state with no synchronization, because that symptom profile is close to diagnostic on its own.

---

## Beginner — Question 7

**Q7: What does a race condition actually look like at the instruction level? Walk through why `counter++` on a shared `int` is not one atomic operation.**

A race condition happens when two or more threads access shared mutable state concurrently, at least one of them writes, and the outcome depends on the unpredictable timing of how their operations interleave. The classic minimal example is two threads incrementing a shared, unsynchronized `int`:

```csharp
int counter = 0;

void IncrementManyTimes()
{
    for (int i = 0; i < 100_000; i++)
        counter++; // looks like one operation, is NOT one operation
}

var t1 = new Thread(IncrementManyTimes);
var t2 = new Thread(IncrementManyTimes);
t1.Start(); t2.Start();
t1.Join(); t2.Join();

Console.WriteLine(counter); // almost never prints 200000 — reliably prints something less
```

**Why `counter++` isn't atomic:** the C# statement compiles to three separate machine-level steps: (1) **read** the current value of `counter` from memory into a register, (2) **add** 1 to the value in the register, (3) **write** the register's value back to `counter`'s memory location. Nothing prevents the OS scheduler from switching threads *between* those three steps. Consider both threads reading `counter == 41` at nearly the same moment — thread A computes 42 and writes it back; thread B, having already read the stale value 41 before A's write, also computes 42 and writes it back. Two increments happened, but the counter only advanced by one — a lost update. Multiply that lost-update pattern across 200,000 total increments running on multiple cores and the final count is reliably lower than 200,000, by a different, non-deterministic amount on every run.

**Common pitfall:** assuming that because a line of source code is short and looks like a single expression, it executes as a single indivisible CPU operation. This is one of the most common false assumptions that leads directly to race-condition bugs — the same read-modify-write shape hides inside `dict[key]++`, `if (x == null) x = new Foo();` done without synchronization, and any "read a field, compute something from it, write it back" sequence.

**The fix, and why it's covered elsewhere:** `lock`, `Interlocked.Increment(ref counter)`, or a concurrent collection all close this gap by making the read-modify-write sequence atomic or mutually exclusive — covered in depth in the lock/Monitor and `Interlocked` questions above. The point of this example is purely to make the invisible three-step nature of `counter++` concrete, since that mental model is the foundation for recognizing race conditions in real, less obvious code.

---

## Intermediate — Question 11

**Q11: How does `System.Threading.Timer` or `PeriodicTimer` compare to a `while (true) { await Task.Delay(...); ... }` loop for recurring background work?**

All three trigger work repeatedly, but they differ in thread-pool footprint, precision, and cancellation ergonomics.

**`System.Threading.Timer`** invokes a callback on a thread-pool thread at a fixed interval, entirely independent of any `async` context:

```csharp
using var timer = new Timer(_ => DoWork(), null, dueTime: 0, period: 5000);
```

It's lightweight (no dedicated thread while idle) but its callback is `void`-returning and synchronous — if `DoWork` needs to be `async`, you must `async void` it or fire-and-forget a `Task`, which reintroduces unobserved-exception risk (see the `async void` question). It also has no built-in overlap protection: if a callback runs longer than the period, the next tick can start while the previous one is still running, requiring manual reentrancy guards.

**`PeriodicTimer`** (added in .NET 6) is the modern, `async`-first replacement:

```csharp
using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
while (await timer.WaitForNextTickAsync(cancellationToken))
{
    await DoWorkAsync(); // naturally sequential — no overlap unless you explicitly fan out
}
```

`WaitForNextTickAsync` is a proper awaitable that consumes no thread while waiting, integrates cleanly with a `CancellationToken` (cancellation simply makes it return `false`/throw, ending the loop with no extra plumbing), and — because the loop body naturally runs to completion before the next `await` — avoids the overlap problem `Timer` has by construction, unless you deliberately fire work without awaiting it.

**A raw `while (true) { await Task.Delay(period); ... }` loop** is the manual equivalent of `PeriodicTimer` and works, but has a subtle precision flaw: `Task.Delay` measures its interval starting *after* the previous iteration's work finishes, so if `DoWorkAsync` takes 200ms, the effective period drifts to `period + 200ms` each cycle. `PeriodicTimer` ticks on the original schedule (skipping missed ticks rather than drifting), giving more predictable cadence for genuinely periodic work.

**Practical guidance:** prefer `PeriodicTimer` for new async recurring-work code — it has the cleanest cancellation story and avoids the drift and overlap pitfalls of the alternatives. Reach for `System.Threading.Timer` only in synchronous or legacy contexts where pulling in `async` isn't practical. Avoid hand-rolled `Task.Delay` loops unless you specifically want drift-tolerant, non-overlapping-by-construction spacing and don't have `PeriodicTimer` available.

---

## Intermediate — Question 12

**Q12: How does `IProgress<T>`/`Progress<T>` let a background async operation safely report progress back to a UI thread?**

`IProgress<T>` is a simple callback abstraction — `void Report(T value)` — that a long-running async method calls to publish incremental progress, without knowing or caring who's listening or on what thread they need to run.

```csharp
async Task DownloadWithProgressAsync(IProgress<int> progress, CancellationToken ct)
{
    for (int i = 0; i <= 100; i += 10)
    {
        await Task.Delay(200, ct);       // simulate work happening on a pool thread
        progress?.Report(i);             // publish progress — safe to call from any thread
    }
}

// UI thread (e.g., WPF/WinForms event handler):
var progress = new Progress<int>(percent => progressBar.Value = percent); // captures SynchronizationContext HERE
await DownloadWithProgressAsync(progress, cancellationToken);
```

**The mechanism — why it's safe:** `Progress<T>` (the concrete implementation) captures `SynchronizationContext.Current` at the moment it's *constructed*, exactly the same capture point covered in the `SynchronizationContext`/`ConfigureAwait` question. When the background code calls `progress.Report(value)` from a thread-pool thread, `Progress<T>` doesn't invoke the callback directly on that thread — it posts the callback through the captured context (`SynchronizationContext.Post`), which marshals it back onto the UI thread's message loop. This means the consumer's callback (`percent => progressBar.Value = percent`) can safely touch UI controls even though `Report` itself was called from a worker thread — exactly the cross-thread-UI-access problem that would otherwise throw `InvalidOperationException` in WPF/WinForms.

**Why the constructor matters:** because the context is captured at construction time, `new Progress<int>(...)` must be created on the UI thread (or whatever thread's context you want callbacks marshaled back to) — constructing it from a background thread captures the wrong (or no) context and defeats the whole point.

**Common pitfall:** assuming `Report` calls are synchronous and ordered with respect to the reporting code. `Progress<T>` posts each report asynchronously, so a burst of rapid `Report` calls can coalesce or reorder relative to other UI work in ways a naive reader wouldn't expect; it's also not intended as a guaranteed-delivery channel — for back-pressured, ordered streaming, prefer `IAsyncEnumerable<T>` or a `Channel<T>`, both covered elsewhere in this file.

**Practical guidance:** `IProgress<T>` is the right, purpose-built tool specifically for the "report percentage/status back to whoever's watching, safely, regardless of thread" scenario — don't hand-roll `SynchronizationContext.Post` calls yourself when this abstraction already exists.

---

## Intermediate — Question 13

**Q13: `BlockingCollection<T>` and `Channel<T>` both support producer/consumer scenarios — how do they differ, and why should new code generally prefer `Channel<T>`?**

**`BlockingCollection<T>`** (from .NET Framework-era `System.Collections.Concurrent`) is a thread-based, synchronous blocking wrapper around a concurrent collection (`ConcurrentQueue<T>` by default). Consumers call `.Take()` or enumerate `.GetConsumingEnumerable()`, and if the collection is empty, the calling **thread blocks** — it's parked, unable to do anything else, until an item arrives or the collection is marked complete.

```csharp
var queue = new BlockingCollection<int>(boundedCapacity: 100);

// Producer thread
Task.Run(() => { for (int i = 0; i < 1000; i++) queue.Add(i); queue.CompleteAdding(); });

// Consumer thread — .Take() BLOCKS the thread while waiting for an item
foreach (var item in queue.GetConsumingEnumerable())
    Process(item);
```

**`Channel<T>`** (from `System.Threading.Channels`, .NET Core-era) is the async-first successor: producers and consumers use `WriteAsync`/`ReadAsync` (or `WaitToReadAsync` + `TryRead`), which **await** rather than block when the channel is empty (or full, for a bounded channel) — no thread is parked.

```csharp
var channel = Channel.CreateBounded<int>(100);

// Producer
_ = Task.Run(async () => {
    for (int i = 0; i < 1000; i++) await channel.Writer.WriteAsync(i);
    channel.Writer.Complete();
});

// Consumer — awaits, doesn't block a thread while the channel is empty
await foreach (var item in channel.Reader.ReadAllAsync())
    await ProcessAsync(item);
```

**Why `Channel<T>` is generally preferred in new code:** `BlockingCollection<T>`'s blocking `.Take()` consumes a full thread-pool (or dedicated) thread for the entire time a consumer is idle waiting for work — exactly the thread-pool-starvation risk pattern covered in the Scenario tier, especially damaging if you spin up several consumers. `Channel<T>` consumes no thread while waiting, composes naturally with `async`/`await` and `IAsyncEnumerable<T>` (`ReadAllAsync`), integrates with `CancellationToken` throughout, and offers finer-grained backpressure/bounding behavior (`BoundedChannelFullMode` options like `Wait`, `DropOldest`, `DropWrite`) than `BlockingCollection<T>`'s single blocking-add behavior.

**When `BlockingCollection<T>` still shows up:** legacy codebases predating `Channel<T>` (.NET Core 3.0+), or genuinely synchronous, dedicated-thread producer/consumer pipelines (e.g., a classic `Thread`-per-worker design) where there's no `async` context to integrate with anyway.

**Practical guidance:** default to `Channel<T>` for any new producer/consumer code, particularly in server applications where thread-pool pressure matters. Reserve `BlockingCollection<T>` for maintaining existing code already built on it or genuinely thread-based (non-async) pipelines.

---

## Advanced — Question 10

**Q10: When is `ReaderWriterLockSlim` a better fit than a plain `lock`, and what pitfall does it introduce that `lock` doesn't have?**

A plain `lock` (via `Monitor`) is **exclusive for every access** — even two threads that only want to *read* shared state are serialized against each other, because `lock` has no concept of "read" vs "write." For state that's read very frequently and written rarely (a cached configuration object, a reference dictionary refreshed occasionally), that's wasted concurrency: readers that could safely run simultaneously are needlessly queued behind one another.

`ReaderWriterLockSlim` distinguishes the two access modes explicitly:

```csharp
private readonly ReaderWriterLockSlim _rwLock = new();
private Dictionary<string, string> _cache = new();

public string? Get(string key)
{
    _rwLock.EnterReadLock();          // multiple readers allowed concurrently
    try { return _cache.TryGetValue(key, out var v) ? v : null; }
    finally { _rwLock.ExitReadLock(); }
}

public void Set(string key, string value)
{
    _rwLock.EnterWriteLock();         // exclusive — blocks all readers and writers
    try { _cache[key] = value; }
    finally { _rwLock.ExitWriteLock(); }
}
```

**Why it can outperform `lock` for this access pattern:** any number of threads can hold the read lock simultaneously, so a read-heavy workload gets genuine parallelism on the read path, with exclusivity reserved only for the rare write. A plain `lock` gives none of that — every reader pays the full serialization cost of a writer, even though readers never conflict with each other. The performance win only materializes when reads are both frequent *and* the protected work is non-trivial (a cheap dictionary lookup may not offset `ReaderWriterLockSlim`'s higher per-acquisition overhead compared to `Monitor`); for cheap, short critical sections, a plain `lock` can actually win despite serializing readers.

**The write-starvation pitfall:** because reads can overlap freely, a steady stream of overlapping readers can keep the lock continuously read-held, indefinitely delaying a writer waiting for exclusive access — a starving writer, unlike the bounded, FIFO-ish fairness a plain `lock` roughly provides. `ReaderWriterLockSlim` mitigates this somewhat (once a writer is waiting, by default new readers queue behind it rather than jumping the line indefinitely), but under sustained heavy read load it's still a real risk worth load-testing for, not a purely theoretical one.

**Practical guidance:** reach for `ReaderWriterLockSlim` specifically for read-heavy/write-rare shared state where the protected work per access is substantial enough to make separating reader concurrency worthwhile; default to plain `lock` otherwise, since it's simpler, has lower overhead for short critical sections, and has no write-starvation failure mode to reason about.

---

## Advanced — Question 11

**Q11: Why do some types need `IAsyncDisposable`/`await using` instead of the synchronous `IDisposable`/`using`, and what does that buy you?**

`IDisposable.Dispose()` is synchronous by contract — it must complete its cleanup without ever awaiting anything. That's fine for cleanup that's genuinely fast and CPU-only (releasing a handle, clearing a reference), but it's a problem for resources whose correct cleanup is itself an I/O operation — most commonly, flushing buffered data over a network connection before closing it.

```csharp
public class BufferedNetworkWriter : IAsyncDisposable
{
    private readonly Stream _stream;
    // ...

    public async ValueTask DisposeAsync()
    {
        await _stream.FlushAsync();   // async flush — genuinely needs to await I/O
        await _stream.DisposeAsync(); // Stream itself implements IAsyncDisposable too
    }
}

await using (var writer = new BufferedNetworkWriter(stream))
{
    await writer.WriteAsync(data);
} // DisposeAsync() is awaited here, automatically, even if an exception is thrown above
```

**Why forcing this into synchronous `Dispose()` is a real problem, not just style:** if `DisposeAsync`'s work were crammed into a synchronous `Dispose()`, the only options are blocking on the async flush (`.Wait()`/`.Result` — reintroducing the deadlock risk from the `.Result` question, and also a synchronous block on I/O that should have stayed asynchronous) or skipping the flush and risking silently dropped, unflushed data — neither is acceptable for a type whose whole purpose is guaranteeing bytes actually reach the network before the connection closes.

**`await using`** is the compiler-supported consumer side: it ensures `DisposeAsync()` is *awaited* — not fired-and-forgotten — at the end of the block, including when an exception propagates through the block, exactly mirroring what `using`/`Dispose()` guarantees synchronously. `IAsyncDisposable.DisposeAsync()` returns `ValueTask` rather than `Task` deliberately, for the same low-allocation reasoning covered in the `Task` vs `ValueTask` question — disposal is called extremely often and is frequently already-complete-synchronously in practice.

**Common pitfall:** implementing both `IDisposable` and `IAsyncDisposable` on the same type (common for backward compatibility) and forgetting that `Dispose()` must still provide *some* safe, synchronous cleanup path for callers who can't `await` — usually by blocking briefly on the async path or duplicating a synchronous-safe subset of the cleanup, documented clearly so callers know synchronous disposal may not flush.

**Practical guidance:** implement `IAsyncDisposable` whenever meaningful cleanup work involves `await`-worthy I/O (flushing streams, closing async database connections/transactions, network teardown handshakes); keep plain `IDisposable` for cleanup that's genuinely synchronous. Always prefer `await using` over `using` when a type offers `IAsyncDisposable`, so cleanup isn't silently skipped or forced synchronous.

---

## Scenario — Question 6

**Q6: A background worker service reads from a `Channel<T>` with several consumer `Task`s running concurrently to increase throughput. Under load, some items get processed twice. What's the likely bug, and what's the correct multi-consumer pattern?**

**The likely bug:** each consumer independently starts its own `await foreach` enumeration (or its own read loop) over the *same* `ChannelReader<T>`, often written like this:

```csharp
// BUGGY-LOOKING BUT ACTUALLY THE RIGHT SHAPE — the real bug is usually elsewhere:
async Task ConsumeAsync(ChannelReader<T> reader, CancellationToken ct)
{
    await foreach (var item in reader.ReadAllAsync(ct))
        await ProcessAsync(item); // if THIS isn't idempotent-safe, double-processing looks like a channel bug
}

var consumers = Enumerable.Range(0, 4)
    .Select(_ => ConsumeAsync(channel.Reader, ct))
    .ToArray();
await Task.WhenAll(consumers);
```

This pattern is actually correct — `ChannelReader<T>.ReadAllAsync()` and `TryRead` are internally synchronized: each individual item is delivered to exactly one caller, even with multiple consumers racing to read from the same reader concurrently. So double-processing with this shape means the double-processing is happening **downstream of the read**, not at the channel — the most common real causes are: (1) `ProcessAsync` itself is not idempotent and something upstream (a retry, a duplicate write into the channel, an at-least-once producer) legitimately delivers the same logical item twice; (2) a bug where each consumer accidentally gets its **own separate reader/channel instance** instead of sharing one (e.g., a DI registration that's `Transient` instead of `Singleton` for the channel, so each consumer resolves a fresh channel and somehow both end up populated from the same source); or (3) exception handling that catches a failure *after* successful processing but re-queues/retries the item as if it hadn't been processed yet.

**Diagnosing it:** confirm all consumers share the exact same `Channel<T>`/`ChannelReader<T>` instance (log its object identity, or check DI lifetime); add a per-item correlation ID logged at both read-time and process-completion-time to see whether the same ID is genuinely read twice by the channel (rare, would indicate a real bug in usage) versus read once but processed/retried twice downstream (far more common).

**The correct multi-consumer pattern:** share one `Channel<T>` instance and one `ChannelReader<T>` across all consumer tasks exactly as shown above — that part is safe by design. Make `ProcessAsync` itself idempotent (safe to run twice on the same item, e.g., via an upsert instead of an insert, or a processed-IDs check) wherever the upstream source can plausibly redeliver, and ensure any retry logic only re-queues on genuine failure, with the success path never both completing *and* retrying the same item.

---

## Beginner — Question 8

**Q8: What are `Task.CompletedTask` and `Task.FromResult(...)` for, and when should a method return one instead of actually going async?**

Both are ways to hand back an **already-completed** `Task`/`Task<T>` from a method whose signature commits it to the async-friendly `Task`-returning shape, without paying the cost of an actual `async` state machine when there's genuinely nothing to wait for.

`Task.CompletedTask` is a cached, singleton `Task` instance representing "done, no value" — the async equivalent of `void` for a synchronous fast path. `Task.FromResult<T>(value)` does the same but wraps a value, producing an already-completed `Task<T>` as if an `async Task<T>` method had run to completion and returned `value` instantly.

```csharp
public interface ICache
{
    Task<string?> GetAsync(string key);
}

public class MemoryCache : ICache
{
    private readonly Dictionary<string, string> _store = new();

    public Task<string?> GetAsync(string key)
    {
        // Cache hit is purely synchronous — no I/O, no reason to await anything.
        if (_store.TryGetValue(key, out var value))
            return Task.FromResult<string?>(value);   // no state machine allocated

        return Task.FromResult<string?>(null);
    }
}

public Task LogNoOpAsync() => Task.CompletedTask; // "did nothing, but I'm done" — no work at all
```

**Why not just mark the method `async` and `return value;`?** An `async` method, even one that never actually awaits anything, still gets compiled into a full async state machine (a heap-allocated object in most cases, extra bookkeeping to schedule continuations) purely to satisfy the compiler's transformation — wasted overhead when the result is already known synchronously. Returning `Task.FromResult`/`Task.CompletedTask` directly from a plain (non-`async`) method sidesteps that allocation entirely for the fast, already-known-value path.

**Common pitfall:** using this pattern inside a method that *sometimes* needs to await real asynchronous work — mixing an early `return Task.FromResult(x);` fast path with an `async` body elsewhere in the same method isn't possible (a method is either `async` or not), so this pattern is specifically for methods, or one branch factored into a separate non-`async` method, that are *entirely* synchronous internally but need to satisfy an async-shaped interface.

**Practical guidance:** reach for `Task.CompletedTask`/`Task.FromResult` when implementing an async interface (like a cache, repository, or test double) where a given code path is genuinely synchronous — cache hits, in-memory fast paths, stub/mock implementations in tests. Don't use it to fake asynchrony for genuinely blocking work; that just hides a synchronous call behind an async-looking signature without any of the real benefits.

---

## Intermediate — Question 14

**Q14: `Task.Run` vs `Task.Factory.StartNew` — why is `Task.Run` the recommended default, and what extra options does `StartNew` expose that make it easy to misuse?**

Both schedule work to run on the thread pool, and `Task.Run` is, by design, essentially a simplified wrapper around `Task.Factory.StartNew` with a set of safe defaults baked in — it's not a different mechanism, just a narrower, harder-to-misuse entry point to the same one.

```csharp
Task t1 = Task.Run(() => DoWork());                                         // safe defaults
Task t2 = Task.Factory.StartNew(() => DoWork());                            // more knobs, more footguns

// The classic StartNew trap — nested Task, not auto-unwrapped:
Task<Task<int>> nested = Task.Factory.StartNew(() => ComputeAsync());       // ComputeAsync() returns Task<int>
// nested is Task<Task<int>> — awaiting it gives you the INNER Task, not the result!
int result = await await nested;                                            // easy to forget the double-await

Task<int> correct = Task.Run(() => ComputeAsync());                         // Task.Run auto-UNWRAPS nested Tasks
int r2 = await correct;                                                      // works as expected, single await
```

**Why `StartNew` is the sharper-edged tool:** `StartNew` exposes `TaskCreationOptions`, a custom `TaskScheduler`, and `TaskContinuationOptions` — powerful for genuinely specialized scheduling scenarios (custom schedulers, `LongRunning` hints for dedicated threads), but it does **not** automatically unwrap a delegate that itself returns a `Task`. Passing an `async` lambda or a method returning `Task<T>` into `StartNew` silently produces a `Task<Task<T>>`, and awaiting that once only waits for the outer task to *schedule and start* the inner one — a common, hard-to-spot bug where code appears to run but returns before the real async work has finished. `Task.Run` calls `Unwrap()` internally, so passing an async delegate "just works" and produces a properly flattened `Task`/`Task<T>`.

`Task.Run` also defaults to `TaskScheduler.Default` (the thread pool) unconditionally, while `StartNew` without an explicit scheduler captures `TaskScheduler.Current` — meaning `StartNew` called from inside another task can silently inherit a custom (e.g., UI-affinity) scheduler instead of the thread pool, a subtle context-capture surprise `Task.Run` avoids.

**Practical guidance:** default to `Task.Run` for "run this on the thread pool" — including for `async` delegates. Reach for `Task.Factory.StartNew` only when you specifically need `TaskCreationOptions.LongRunning` (to hint for a dedicated, non-pool thread) or a custom `TaskScheduler`, and even then, remember to call `.Unwrap()` explicitly if the delegate returns a `Task`.

---

## Intermediate — Question 15

**Q15: What does `Parallel.ForEachAsync` do, and how does it compare to manually combining `SemaphoreSlim` with `Task.WhenAll` for bounded concurrent async work over a collection?**

`Parallel.ForEachAsync` (.NET 6+) is the modern, purpose-built answer to "run async work over a collection, but cap how many run at once" — it combines `Parallel`'s work-partitioning approach with genuine `async`/`await`, unlike the older `Parallel.ForEach`, whose body delegate is synchronous and would otherwise force blocking (`.Wait()`/`.Result`) to call async code from inside it.

```csharp
var urls = GetThousandsOfUrls();

var options = new ParallelOptions
{
    MaxDegreeOfParallelism = 10,     // at most 10 concurrent downloads
    CancellationToken = ct
};

await Parallel.ForEachAsync(urls, options, async (url, token) =>
{
    var response = await httpClient.GetAsync(url, token);
    await ProcessAsync(response, token);
});
```

**The manual equivalent it replaces:**

```csharp
var semaphore = new SemaphoreSlim(10);
var tasks = urls.Select(async url =>
{
    await semaphore.WaitAsync(ct);
    try
    {
        var response = await httpClient.GetAsync(url, ct);
        await ProcessAsync(response, ct);
    }
    finally { semaphore.Release(); }
});
await Task.WhenAll(tasks);
```

Both achieve the same outcome — bounded concurrent async fan-out — but `Parallel.ForEachAsync` handles the semaphore-equivalent throttling, cancellation propagation, and exception aggregation (`AggregateException` from failures across iterations) internally, without hand-writing the acquire/release/`try`/`finally` boilerplate, and it partitions work more efficiently than materializing a full `IEnumerable<Task>` up front via `Select`, which matters when the source collection is very large or itself an `IAsyncEnumerable<T>` (which `Parallel.ForEachAsync` also accepts directly).

**Common pitfall:** forgetting that `MaxDegreeOfParallelism` bounds *logical* concurrency, not thread count — the body still runs asynchronously, so it doesn't consume a dedicated thread per iteration; setting it too high assuming it "guards" thread-pool usage misunderstands what it's throttling (concurrent in-flight operations, not threads).

**Practical guidance:** prefer `Parallel.ForEachAsync` for new code needing bounded concurrent async iteration over a collection — it's more directly expressive of the intent and less error-prone than the `SemaphoreSlim` + `Task.WhenAll` pattern. That manual pattern remains valid and sometimes necessary for scenarios that don't map cleanly onto a single collection iteration (e.g., throttling concurrency across work submitted from multiple call sites sharing one semaphore).

---

## Intermediate — Question 16

**Q16: How do you build async-safe lazy initialization, and what's the specific pitfall with using `Lazy<Task<T>>` alone?**

The synchronous `Lazy<T>` pattern (ensuring expensive initialization runs exactly once, on first access, thread-safely) extends naturally to async work by having the factory produce a `Task<T>` instead of a `T` — commonly wrapped as an `AsyncLazy<T>`-style helper:

```csharp
public class AsyncLazy<T>
{
    private readonly Lazy<Task<T>> _lazy;

    public AsyncLazy(Func<Task<T>> factory) =>
        _lazy = new Lazy<Task<T>>(factory); // factory only invoked once, thread-safely, by Lazy<T> itself

    public Task<T> Value => _lazy.Value;
}

private static readonly AsyncLazy<Config> _config =
    new(() => LoadConfigFromRemoteAsync());

public static Task<Config> GetConfigAsync() => _config.Value; // awaited by callers
```

`Lazy<T>`'s built-in thread safety guarantees the factory delegate itself only *starts* once, no matter how many threads call `.Value` concurrently — that part works correctly even when `T` is `Task<TResult>`, since starting the factory just means kicking off the async operation and returning its `Task`, which every caller can then await.

**The specific pitfall:** `Lazy<T>`'s default caching mode caches whatever the factory returns — including a **faulted** `Task`. If the async factory's `Task` completes in a Faulted state (e.g., a transient network failure while loading remote config), that same failed `Task` is permanently cached by `_lazy.Value`, and every subsequent call to `GetConfigAsync()` re-awaits and re-throws the *same* original exception forever, even though the underlying failure (like a network blip) may have been purely transient and long since recovered.

```csharp
// Naive AsyncLazy<T> after ONE transient failure — permanently broken:
await GetConfigAsync(); // throws HttpRequestException (transient network failure)
await GetConfigAsync(); // throws the SAME cached exception — forever, even after network recovers
```

**Practical guidance:** plain `Lazy<Task<T>>` is fine for initialization that's expected to always succeed once retried elsewhere (or where a permanent failure genuinely should stick), but for anything that can transiently fail — remote calls, first-use network/database initialization — use a retry-on-failure variant that only caches a *successfully completed* Task, discarding and re-attempting the factory on the next access after a fault. See the Scenario question on `Lazy<Task<T>>` caching a fault for the concrete fix.

---

## Advanced — Question 12

**Q12: How does heavily async code interact with the GC, and why does `ValueTask` exist partly to address this?**

Every `async` method that actually suspends (hits an incomplete `await`) is compiled into a state machine that, in the general case, is allocated on the **heap** — it needs to survive across the suspension point, outliving the original call stack frame that's now unwound while the awaited operation completes elsewhere. Each `Task`/`Task<T>` returned is also, itself, a reference-type heap allocation. In a high-throughput async workload — a web API handling many requests per second, each involving several chained `await`s — this adds up to a steady stream of small, short-lived object allocations: state machine objects, boxed results, and `Task<T>` wrapper instances.

**Why this matters for the GC specifically:** these objects are typically short-lived (created, awaited, discarded within microseconds to milliseconds), which is exactly the profile that drives **Gen 0 collections**. Gen 0 GCs are individually cheap, but under sustained high request volume, a large enough allocation rate from async machinery can still contribute meaningfully to overall GC pause frequency and CPU overhead — not usually catastrophic on its own, but measurable in latency-sensitive, high-throughput hot paths where every allocation counts.

**Where `ValueTask<T>` fits in:** as covered in the `Task` vs `ValueTask` discussion, `ValueTask<T>` is a struct that can represent an already-completed result *without* allocating a `Task<T>` at all — directly addressing exactly this Gen 0 pressure for the common case where an async-shaped method frequently completes synchronously (a cache hit, a buffered read). It doesn't eliminate the state machine allocation for methods that genuinely suspend, but it removes the extra `Task<T>` wrapper allocation on the synchronous-completion fast path, which is often the hottest path in practice.

**Common pitfall:** assuming this means all async code needs manual optimization — for the vast majority of application code, the JIT's async state machine allocations are not a meaningful bottleneck, and reaching for `ValueTask` everywhere adds real complexity (its stricter single-await, single-consumption rules) for no measurable benefit outside genuinely hot, allocation-sensitive paths.

**Practical guidance:** don't pre-optimize regular application code around this; profile first (allocation rate, Gen 0 collection frequency under load) and reserve `ValueTask` and other allocation-reduction tactics for identified hot paths — library-level APIs called extremely frequently, or request-processing code in the innermost loop of a high-throughput service.

---

## Advanced — Question 13

**Q13: How does `TaskCompletionSource<T>` bridge a callback-based/event-based API into `async`/`await`, and what's a concrete example?**

`TaskCompletionSource<T>` (TCS) is the manual, low-level primitive for producing an awaitable `Task<T>` whose completion you control explicitly, rather than one that's driven by `async`/`await` machinery or `Task.Run`. It's the standard tool for wrapping legacy or third-party APIs that signal completion via a callback or event, rather than by returning a `Task`, into something `await`-able.

```csharp
public class LegacyFileWatcher
{
    // Old-style API: fires an event when a file operation finishes; no Task anywhere.
    public event Action<string, bool> OperationCompleted; // (filePath, success)

    public void StartCopyAsync(string source, string dest) { /* fires OperationCompleted eventually */ }
}

public static Task<bool> CopyFileAsync(LegacyFileWatcher watcher, string source, string dest)
{
    var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

    void Handler(string filePath, bool success)
    {
        if (filePath == dest)
        {
            watcher.OperationCompleted -= Handler;  // unsubscribe — avoid leaking the handler
            tcs.SetResult(success);                 // completes the Task; awaiters resume
        }
    }

    watcher.OperationCompleted += Handler;
    watcher.StartCopyAsync(source, dest);
    return tcs.Task; // caller awaits this like any other Task<bool>
}

// Usage:
bool ok = await CopyFileAsync(watcher, "a.txt", "b.txt"); // reads naturally, hides the event plumbing
```

**The mechanism:** `tcs.Task` is a normal, awaitable `Task<T>` from the caller's point of view — it just never runs any code itself. Calling `SetResult`, `SetException`, or `SetCanceled` on the TCS is what transitions `tcs.Task` to a completed state and resumes anyone awaiting it, entirely decoupled from thread-pool scheduling. `SetException` is the direct equivalent for wrapping an error callback, turning it into a properly faulted `Task` that `await` rethrows.

**Common pitfall:** forgetting `TaskCreationOptions.RunContinuationsAsynchronously`. Without it, continuations (the code after your `await`) can run **synchronously on the thread that calls `SetResult`** — often the event-raising thread deep inside a third-party library — which can cause deadlocks (if that thread later needs a lock your continuation also touches) or unexpectedly move UI-thread-sensitive continuation code onto a background thread. Also easy to forget: unsubscribing the event handler, and never calling `SetResult`/`SetException` at all if the event might never fire (leaving the `Task` hanging forever) — always pair with a timeout or cancellation registration in production code.

**Practical guidance:** reach for `TaskCompletionSource<T>` specifically at the boundary between old-style callback/event APIs and modern `async`/`await` code; don't use it to wrap something that's already `Task`-based (that's what `async`/`await` composition is for) or as a general-purpose signaling mechanism where a `SemaphoreSlim` or `Channel<T>` would fit better.

---

## Scenario — Question 7

**Q7: A service uses `Lazy<Task<T>>` to cache an expensive async initialization (e.g., loading a large config from a remote source). It works fine normally, but after a single transient network failure during startup, every subsequent request permanently fails too — even though the network recovered seconds later. Diagnose and fix.**

**Diagnosis:** this is the `Lazy<Task<T>>` caching-a-fault pitfall covered in the async-lazy-initialization question. `Lazy<T>`'s default caching mode (`LazyThreadSafetyMode.ExecutionAndPublication`) caches whatever value or exception the factory produces on its first successful *invocation* — and for `Lazy<Task<T>>`, "successful invocation" only means the factory returned a `Task` object without throwing synchronously; it says nothing about whether that `Task` later completes successfully. When `LoadConfigFromRemoteAsync()` starts, returns a `Task`, and that `Task` later faults (transient network blip), `Lazy<T>` has already committed to caching that exact `Task` instance forever — every subsequent `.Value` access returns the same faulted `Task`, and `await`ing it rethrows the same original exception indefinitely, regardless of whether the network has since recovered.

```csharp
// THE BUG:
private static readonly Lazy<Task<Config>> _config =
    new(() => LoadConfigFromRemoteAsync());   // one transient failure -> cached forever

public static Task<Config> GetConfigAsync() => _config.Value;
```

**The fix:** only cache a *successfully completed* Task; on fault, discard the cached attempt so the next access retries the factory instead of replaying the old failure. A common pattern wraps the factory to detect faulting and resets the `Lazy<T>` itself:

```csharp
public class AsyncLazyRetry<T>
{
    private readonly Func<Task<T>> _factory;
    private Lazy<Task<T>> _lazy;

    public AsyncLazyRetry(Func<Task<T>> factory)
    {
        _factory = factory;
        _lazy = CreateLazy();
    }

    private Lazy<Task<T>> CreateLazy() => new(async () =>
    {
        try { return await _factory(); }
        catch
        {
            // Reset so the NEXT caller gets a fresh Lazy<T> (and fresh factory attempt) instead of the cached fault.
            Interlocked.Exchange(ref _lazy, CreateLazy());
            throw; // still propagate this attempt's failure to whoever's currently awaiting it
        }
    });

    public Task<T> Value => _lazy.Value;
}

private static readonly AsyncLazyRetry<Config> _config = new(() => LoadConfigFromRemoteAsync());
public static Task<Config> GetConfigAsync() => _config.Value;
```

**Why this works:** the first failing attempt still correctly fails (and reports the real error) for whoever was waiting on it, but the `Lazy<T>` backing field is atomically swapped out for a brand-new, not-yet-invoked `Lazy<Task<T>>` before the exception propagates — so the *next* call to `GetConfigAsync()` triggers a fresh factory invocation and a genuine retry against the (by then) recovered network, rather than replaying history.

**Practical guidance:** never use plain `Lazy<Task<T>>` for async initialization that can transiently fail (network, remote config, first-touch database connections) without this retry-on-fault wrapper, or an equivalent library-provided one (e.g., the `Nito.AsyncEx` `AsyncLazy<T>` combined with a manual reset, or a `SemaphoreSlim`-guarded manual re-check pattern). Reserve plain caching-including-faults behavior for initialization where a failure genuinely indicates a permanent, non-retryable condition.

---
