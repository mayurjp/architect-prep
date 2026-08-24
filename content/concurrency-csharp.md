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
