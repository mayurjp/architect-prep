# Data Structures & Algorithms — Q&A

## Beginner — Question 1

**Q1: What is Big-O notation, and what does it actually measure?**

Big-O notation describes how the running time (or memory usage) of an algorithm grows **relative to the size of its input**, as that input grows arbitrarily large. It's a statement about the algorithm's *shape of growth*, not a stopwatch measurement of actual seconds — two algorithms with the same Big-O can have very different real-world speeds because of constant factors, hardware, and JIT behavior, but Big-O tells you which one will eventually win as `n` gets big enough.

**What it measures:** the worst-case (by convention, unless stated otherwise) number of "basic operations" as a function of input size `n`, ignoring constants and lower-order terms. `O(2n + 100)` is written as `O(n)` because as `n → ∞`, the `2` and the `100` become irrelevant compared to the growth of `n` itself.

**What it doesn't measure:** actual wall-clock time, constant setup costs, cache locality, or how an algorithm behaves on small, realistic inputs. An `O(n²)` algorithm can easily outperform an `O(n log n)` one for `n < 50` because of a much smaller constant factor — this is why languages' built-in sorts often switch strategies for small arrays (see Q2 in Intermediate).

**Common complexity classes, with intuition:**
- `O(1)` — constant: array index access `arr[5]`, a dictionary lookup by key.
- `O(log n)` — logarithmic: binary search; each step eliminates half the remaining input.
- `O(n)` — linear: a single loop over a collection, e.g. finding the max of an unsorted array.
- `O(n log n)` — linearithmic: efficient comparison-based sorting (merge sort, quicksort's average case).
- `O(n²)` — quadratic: nested loops over the same collection, e.g. bubble sort, or checking all pairs naively.

```csharp
// O(n) - single pass
int Sum(int[] arr)
{
    int total = 0;
    foreach (var x in arr) total += x;   // n operations
    return total;
}

// O(n^2) - nested pass over the same input
bool HasDuplicatePair(int[] arr)
{
    for (int i = 0; i < arr.Length; i++)
        for (int j = i + 1; j < arr.Length; j++)
            if (arr[i] == arr[j]) return true;   // up to n*(n-1)/2 comparisons
    return false;
}
```

#### Follow-up: What's the difference between average-case, worst-case, and amortized complexity?

Worst-case is the guaranteed upper bound regardless of input (what Big-O conventionally refers to). Average-case assumes a distribution over inputs (e.g. quicksort is O(n log n) on average but O(n²) worst-case on already-sorted input with a naive pivot). Amortized complexity averages the cost over a *sequence* of operations rather than a single one — e.g. a `List<T>` append is O(1) amortized even though an occasional resize is O(n), because those expensive resizes happen rarely enough that the average per-operation cost stays constant.

---

## Beginner — Question 2

**Q2: Compare arrays and linked lists — memory layout, and the complexity of access, insertion, and deletion.**

**Arrays** store elements in a single contiguous block of memory. Because the runtime knows the element size and the base address, it computes any element's address with simple arithmetic (`base + index * elementSize`), so **random access is O(1)**. This contiguity also makes arrays cache-friendly — sequential access patterns (like `foreach`) benefit heavily from CPU cache line prefetching.

**Linked lists** store each element in a separately allocated node containing the value plus a pointer/reference to the next (and, for doubly-linked lists, the previous) node. There is no arithmetic shortcut to "the 5th node" — you must walk the chain from the head, so **random access is O(n)**. Nodes can be scattered anywhere in memory, which hurts cache locality.

| Operation | Array | Linked List |
|---|---|---|
| Access by index | O(1) | O(n) |
| Search (unsorted) | O(n) | O(n) |
| Insert/delete at end | O(1) amortized (array), O(1) (list w/ tail ref) | O(1) |
| Insert/delete at front | O(n) (must shift everything) | O(1) |
| Insert/delete in middle | O(n) (shift elements) | O(1) once you have a reference to the node, O(n) to *find* it |

The key trade-off: arrays win on access and cache performance; linked lists win on insertion/deletion at arbitrary positions **once you already hold a reference to that position** — the search to find that position is still O(n) for both structures if you don't already have a pointer to it.

```csharp
// Array: O(1) access
int[] arr = { 10, 20, 30 };
int x = arr[1]; // 20, O(1)

// LinkedList<T>: O(1) insert given a node reference, O(n) to find that node
var list = new LinkedList<int>(new[] { 10, 20, 30 });
LinkedListNode<int> node = list.Find(20);     // O(n) search
list.AddAfter(node, 25);                       // O(1) insert once positioned
```

**Practical guidance:** In C#, `List<T>` (a growable array) is the default choice for almost everything because access patterns are usually index-based or sequential. Reach for `LinkedList<T>` only when you genuinely need frequent O(1) insertion/removal at known positions (e.g. implementing an LRU cache's internal ordering) — it's rare in practice because `List<T>`'s cache-friendliness often wins even for insert-heavy workloads at small-to-medium sizes.

---

## Beginner — Question 3

**Q3: What are stacks and queues, and where does each show up in real systems?**

Both are restricted-access linear collections — you can't jump to an arbitrary element, only add/remove from specific ends — but they differ in *which* end.

**Stack (LIFO — Last In, First Out):** the most recently added element is the first one removed. Think of a stack of plates: you add and remove from the top only. Operations are `Push` (add) and `Pop` (remove), both **O(1)**.

**Queue (FIFO — First In, First Out):** the oldest added element is the first one removed. Think of a checkout line. Operations are `Enqueue` (add to the back) and `Dequeue` (remove from the front), both **O(1)**.

**Real use cases:**
- **Stacks:** function call stacks (each call pushes a frame, returning pops it — this is *why* deep recursion overflows, see the Recursion vs Iteration question), undo/redo in editors (each action pushed onto an "undo stack"; popping it and pushing onto a "redo stack" implements redo), the `Ctrl+Z` behavior, expression evaluation and syntax parsing (matching brackets), and DFS traversal (either via explicit recursion, which uses the call stack, or an explicit `Stack<T>`).
- **Queues:** task scheduling (print queues, message queues, thread pool work items), BFS traversal (explore level-by-level using a queue to hold the "frontier" of nodes to visit next), and buffering between producer/consumer processes.

```csharp
// Stack<T> - undo functionality
var undoStack = new Stack<string>();
undoStack.Push("typed 'hello'");
undoStack.Push("typed 'hello world'");
string lastAction = undoStack.Pop(); // "typed 'hello world'" - O(1)

// Queue<T> - BFS frontier
var frontier = new Queue<int>();
frontier.Enqueue(rootNodeId);
while (frontier.Count > 0)
{
    int current = frontier.Dequeue(); // O(1)
    // visit current, enqueue its unvisited neighbors
}
```

**Common pitfall:** confusing `Stack<T>.Peek()`/`Pop()` order — a fresh reader often expects `Pop()` to return the *first* item added, but it returns the *last*. Also, C#'s `Queue<T>` and `Stack<T>` are backed by a resizable array internally (not a linked list), so they share `List<T>`'s O(1) amortized growth characteristics.

---

## Beginner — Question 4

**Q4: Why is repeatedly concatenating strings in a loop O(n²) in C#, and how does `StringBuilder` fix it?**

Strings in .NET are **immutable** — once a `string` object is created, its character content never changes. Every time you write `s = s + "x"` (or `s += "x"`), the runtime doesn't modify `s` in place; it **allocates a brand-new string** large enough to hold the combined content, copies the old characters into it, appends the new characters, and repoints `s` at the new object. The old string becomes garbage.

**Why that's O(n²) over a loop:** if you concatenate a 1-character string onto a growing result `n` times, the *k*-th concatenation copies roughly `k` characters (the length of the string so far). Summing `1 + 2 + 3 + ... + n` gives `n(n+1)/2`, which is `O(n²)` total work — even though it "looks like" a simple `O(n)` loop.

```csharp
// O(n^2): each += allocates a new string and copies everything so far
string result = "";
for (int i = 0; i < 10000; i++)
{
    result += i.ToString();   // full copy of 'result' every iteration
}
```

**The fix — `StringBuilder`:** `StringBuilder` maintains an internal, mutable, resizable character buffer (conceptually similar to how `List<T>` backs an array). Appending writes directly into free space in that buffer; the buffer only needs to be reallocated (and its contents copied) when it runs out of capacity — and like `List<T>`, it typically grows by doubling, giving **O(1) amortized** append and **O(n)** total for building an n-character result.

```csharp
// O(n) amortized: mutates an internal buffer instead of reallocating a string each time
var sb = new StringBuilder();
for (int i = 0; i < 10000; i++)
{
    sb.Append(i);   // O(1) amortized
}
string result = sb.ToString(); // one final copy into an immutable string
```

**Guidance:** for a small, fixed number of concatenations (a handful of interpolated values in a log line), plain `+`/string interpolation is fine and arguably more readable — the JIT/compiler often optimizes a chain of `+` in a single expression into one `string.Concat` call anyway. `StringBuilder` earns its keep specifically inside **loops** or when the number of appends is unbounded/data-driven.

---

## Beginner — Question 5

**Q5: What is a `HashSet<T>`, how does it differ from a `List<T>`, and when should you use one?**

`HashSet<T>` is a collection of **unique** elements backed by the same hash-table mechanism as `Dictionary<TKey,TValue>` (see Intermediate Q1) — internally it's essentially a dictionary where the "value" is discarded and only the key (the element itself) matters. Adding an element hashes it via `GetHashCode()`, maps that hash to a bucket, and — critically — checks the bucket for an existing equal element before inserting, which is how uniqueness is enforced.

**Why it beats `List<T>` for membership testing:** `List<T>.Contains()` must scan element by element until it finds a match or reaches the end — **O(n)**. `HashSet<T>.Contains()` hashes the value and jumps straight to its bucket — **O(1) average**. For any code that repeatedly asks "have I seen this before?" or "is this in my collection?", a `HashSet<T>` turns an O(n) check into an O(1) one, which is exactly what made the pair-sum trick in Scenario Q1 work.

```csharp
var seen = new HashSet<string>();
seen.Add("alice");
seen.Add("bob");
seen.Add("alice");           // no-op: already present, Add returns false

bool exists = seen.Contains("alice"); // O(1) average
```

**Trade-offs vs `List<T>`:** a `HashSet<T>` has no defined iteration order (don't rely on insertion order), can't be indexed (`seen[0]` doesn't exist), and pays extra memory overhead per element for the bucket/chain structure. `List<T>` preserves insertion order, supports indexing, and is more memory-compact for small collections that don't need fast lookup.

`HashSet<T>` also exposes efficient **set algebra**: `UnionWith`, `IntersectWith`, `ExceptWith`, and `SetEquals` — each implemented in terms of the same O(1)-average hashing rather than nested loops.

```csharp
var a = new HashSet<int> { 1, 2, 3 };
var b = new HashSet<int> { 2, 3, 4 };
a.IntersectWith(b); // a is now { 2, 3 } — O(|a|) rather than O(|a| * |b|)
```

**Common pitfall:** using a mutable custom class as a `HashSet<T>` element and then mutating a field that participates in its `GetHashCode()`/`Equals()` after insertion — the element's hash changes, but it's still sitting in its *old* bucket, so future `Contains()` calls hash to the *new* bucket, look there, find nothing, and silently report the element as absent even though it's still physically in the set.

---

## Beginner — Question 6

**Q6: What is a hash function, and what properties make one suitable for use in a hash table?**

A hash function takes an input of arbitrary size (a string, an object, a number) and deterministically maps it to a fixed-size output — typically a 32-bit `int` in .NET's `GetHashCode()` contract. Hash tables (`Dictionary<TKey,TValue>`, `HashSet<T>`) use that output to decide which bucket an entry belongs in, so the *quality* of the hash function directly determines whether lookups stay O(1) or degrade toward O(n).

**Desirable properties:**
- **Deterministic:** the same input must always produce the same hash within a single run (this is why using a value that can change, or a memory address that can move, as the basis for a hash is dangerous — see the pitfall in Beginner Q5).
- **Uniform distribution:** across the range of realistic inputs, hash values should spread evenly across the output space, so that entries distribute evenly across buckets rather than clustering. A hash function that returns the same value for many different inputs (like the deliberately bad `GetHashCode() => 1` shown in Intermediate Q1) defeats the entire point of hashing.
- **Fast to compute:** hashing happens on essentially every lookup/insert, so it needs to be cheap — O(1) relative to the size of a typical key, not proportional to scanning the whole dataset.
- **Avalanche effect:** a small change to the input (flipping one bit) should ideally produce a large, unpredictable change in the output hash, which helps avoid clustering for inputs that are "similar" (e.g. sequential integers or near-identical strings).

**The .NET contract:** `GetHashCode()` only *requires* that equal objects (per `Equals()`) produce equal hash codes — it does **not** require that unequal objects produce different hash codes (collisions are allowed and expected; the hash table's chaining/collision handling deals with them). It also does not need to be unique or stable across process runs — string hashing in .NET is deliberately randomized per process by default, precisely so hash codes can't be predicted from outside the process.

```csharp
public class Point
{
    public int X, Y;
    public override bool Equals(object obj) => obj is Point p && p.X == X && p.Y == Y;
    public override int GetHashCode() => HashCode.Combine(X, Y); // built-in, well-distributed combiner
}
```

**Common pitfall:** hand-rolling a combiner like `X + Y` or `X ^ Y` instead of using `HashCode.Combine` — naive combinations often produce poor distribution (e.g. `X ^ Y` gives the same hash for `(1,2)` and `(2,1)`, clustering symmetric pairs into the same bucket).

---

## Beginner — Question 7

**Q7: What is the two-pointer technique, and how does it turn certain O(n²) problems into O(n)?**

The two-pointer technique uses two indices that move through a collection — usually a **sorted** array or a string — according to a rule tied to the problem, instead of nested loops that re-scan the collection from the start for every outer element. Because each pointer only ever moves forward (never backward), the total number of pointer movements across the whole run is bounded by `O(n)`, even though it's effectively exploring pair-wise relationships that a naive approach would need `O(n²)` nested loops to cover.

**Classic example — does a sorted array contain a pair summing to a target?**

```csharp
// O(n) time, O(1) space — requires the array to already be sorted
bool HasPairSumSorted(int[] sortedArr, int target)
{
    int left = 0, right = sortedArr.Length - 1;
    while (left < right)
    {
        int sum = sortedArr[left] + sortedArr[right];
        if (sum == target) return true;
        if (sum < target) left++;   // sum too small: only increasing the smaller side can help
        else right--;               // sum too large: only decreasing the larger side can help
    }
    return false;
}
```

**Why moving one pointer is safe (the correctness argument):** if `sortedArr[left] + sortedArr[right]` is too small, then pairing `sortedArr[left]` with anything to the *left* of `right` would only make the sum smaller still (since the array is sorted ascending) — so it's safe to permanently rule out the current `left` and advance it, without ever needing to reconsider it. The symmetric argument holds for shrinking `right` when the sum is too large. Because each pointer only moves inward and never revisits a position, the loop does at most `n` total steps — **O(n)**.

**How this differs from the `HashSet` approach (Scenario Q1):** two-pointer requires the input to be sorted first (an `O(n log n)` cost if it isn't already) but then uses **O(1) extra space**; the hash-set approach works on unsorted input directly but costs **O(n) extra space**. If the data is already sorted, or sorting it is "free" (needed elsewhere anyway), two-pointer is the better trade.

**Common pitfalls:** applying this converging-pointer pattern to unsorted data (it silently gives wrong answers, just like binary search on unsorted data); off-by-one errors in the `left < right` vs `left <= right` condition depending on whether you want to allow pairing an element with itself.

---

## Beginner — Question 8

**Q8: What is the sliding window technique, and how does a fixed-size window avoid redundant recomputation?**

A sliding window maintains a contiguous sub-range (the "window") over an array or string and moves that range one step at a time, **incrementally updating** a running result instead of recomputing it from scratch for every position. It's a direct fix for a common naive pattern: for every possible window start, re-scan the entire window's contents.

**Classic example — maximum sum of any contiguous subarray of size `k`:**

```csharp
// Naive: O(n * k) — recomputes the full sum for every window position
int MaxSumWindowNaive(int[] arr, int k)
{
    int maxSum = int.MinValue;
    for (int start = 0; start + k <= arr.Length; start++)
    {
        int sum = 0;
        for (int i = start; i < start + k; i++) sum += arr[i]; // full re-scan every time
        maxSum = Math.Max(maxSum, sum);
    }
    return maxSum;
}

// Sliding window: O(n) — reuses the previous window's sum
int MaxSumWindowOptimal(int[] arr, int k)
{
    int windowSum = 0;
    for (int i = 0; i < k; i++) windowSum += arr[i]; // build the first window once

    int maxSum = windowSum;
    for (int i = k; i < arr.Length; i++)
    {
        windowSum += arr[i] - arr[i - k]; // add the new element, drop the one that left the window
        maxSum = Math.Max(maxSum, windowSum);
    }
    return maxSum;
}
```

**Why this is O(n):** moving the window by one position only changes two elements — the one entering on the right and the one leaving on the left. Updating the running sum by `+= arr[i] - arr[i-k]` is **O(1)** per slide instead of re-summing all `k` elements, so the total work across all `n - k + 1` window positions is `O(n)` instead of `O(n * k)`.

**Fixed-size vs variable-size:** this "basics" form uses a fixed window size `k` known up front. A more general variant grows and shrinks the window's boundaries dynamically based on a condition (e.g. "keep expanding until a constraint is violated, then shrink from the left") — that variable-size form shows up in the longest-substring-without-repeating-characters problem (see the Scenario tier).

**Common pitfall:** implementing "sliding window" but still recomputing the full window sum/count on every slide instead of incrementally adjusting it — this looks like a sliding window but is actually still `O(n * k)`, defeating the entire purpose of the technique.

---

## Intermediate — Question 1

**Q1: How does `Dictionary<TKey,TValue>` work internally, and why can average-case O(1) lookup degrade?**

`Dictionary<TKey,TValue>` is a **hash table**. Internally it maintains an array of "buckets." To store a key-value pair, it computes `key.GetHashCode()`, maps that hash code into a bucket index (typically `hash % bucketCount`, though the real implementation uses a prime-sized bucket array and bitwise tricks), and stores the entry in that bucket. Lookup follows the same path: hash the key, jump straight to the bucket, and compare candidate keys there with `Equals()`.

**Why average O(1):** if hash codes are well-distributed across buckets, each bucket holds only a small, roughly constant number of entries, so hashing + a short in-bucket scan is effectively constant time regardless of how many total entries the dictionary holds.

**Collision handling:** when two different keys hash into the same bucket (a **collision**), .NET's `Dictionary<TKey,TValue>` resolves it via **separate chaining** — each bucket holds a linked list (implemented as an array-based chain of index-linked entries internally) of all entries that landed there. A lookup that hits a collision must linearly scan that chain, calling `Equals()` on each candidate.

**Why it can degrade:** if many keys collide into the same bucket — because of a poor `GetHashCode()` implementation (e.g. a custom type that always returns the same hash, or a hash that clusters heavily) or a deliberately crafted adversarial input — that bucket's chain grows long, and lookups in it degrade toward **O(n)**. This is a real denial-of-service vector for hash tables keyed on untrusted input, which is why ASP.NET Core randomizes string hash seeds per process by default.

```csharp
public class BadKey
{
    public int Id;
    public override int GetHashCode() => 1; // terrible: every instance collides
    public override bool Equals(object obj) => obj is BadKey bk && bk.Id == Id;
}
// A Dictionary<BadKey, ...> full of these degrades every lookup to O(n)
```

**Growth mechanics:** when the load factor (entries / buckets) crosses a threshold, the dictionary resizes to a larger prime-sized bucket array and rehashes every existing entry — an O(n) operation that happens rarely enough to be O(1) amortized per insert, mirroring `List<T>`'s doubling strategy.

#### Follow-up: Why must you override both `GetHashCode()` and `Equals()` together?

The dictionary contract requires that two objects considered equal by `Equals()` **must** produce the same `GetHashCode()` — otherwise the dictionary looks in the wrong bucket entirely and silently fails to find an entry that's logically present. Overriding only one of the two is a classic, hard-to-debug bug.

---

## Intermediate — Question 2

**Q2: Explain binary search — the algorithm, its complexity, and the precondition it requires.**

Binary search finds a target value in a **sorted** collection by repeatedly halving the search space: compare the target to the middle element; if equal, done; if the target is smaller, discard the right half and recurse on the left; if larger, discard the left half and recurse on the right.

**Precondition:** the data **must already be sorted**. Binary search relies entirely on the ordering to safely discard half the remaining elements without checking them — running it on unsorted data gives no correctness guarantee at all (it will often "find" the wrong answer or miss a present element).

**Complexity:** each comparison eliminates half the remaining candidates, so the number of comparisons needed to narrow `n` elements down to 1 is `log₂(n)` — giving **O(log n)** time. This is a dramatic improvement over linear search's O(n): searching a sorted array of 1,000,000 elements takes at most ~20 comparisons instead of up to 1,000,000.

```csharp
int BinarySearch(int[] sortedArr, int target)
{
    int lo = 0, hi = sortedArr.Length - 1;
    while (lo <= hi)
    {
        int mid = lo + (hi - lo) / 2; // avoids potential int overflow vs (lo+hi)/2
        if (sortedArr[mid] == target) return mid;
        if (sortedArr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1; // not found
}
```

**Common pitfalls:**
- Computing `mid = (lo + hi) / 2` can overflow `int` for very large indices; `lo + (hi - lo) / 2` avoids it.
- Off-by-one errors in the `lo`/`hi` boundary updates are the single most common source of binary search bugs — always trace through a 1-element and 2-element array by hand.
- Forgetting the precondition: applying it to unsorted or partially-sorted data is a frequent real-world bug when data is filtered/joined before search without re-sorting.

**Guidance:** .NET provides `Array.BinarySearch` and `List<T>.BinarySearch` built in — reach for those over a hand-rolled version in production code; understanding the manual implementation matters mainly for interviews and for adapting the technique (e.g. "search-on-a-condition" variants like finding the first element satisfying a predicate in a monotonic sequence).

---

## Intermediate — Question 3

**Q3: Compare bubble sort, insertion sort, merge sort, and quicksort — and explain why C#'s `Array.Sort`/`List<T>.Sort` don't use just one of these.**

**Bubble sort — O(n²):** repeatedly steps through the list, swapping adjacent out-of-order elements, until no swaps are needed. Simple but inefficient; rarely used outside teaching.

**Insertion sort — O(n²) worst case, but O(n) on nearly-sorted input:** builds the sorted portion one element at a time, inserting each new element into its correct position among the already-sorted prefix by shifting larger elements right. Its near-linear behavior on almost-sorted data (and low overhead for tiny arrays) makes it a common choice as a "finishing" step for small sub-arrays inside hybrid sorts.

**Merge sort — O(n log n) guaranteed, always:** recursively splits the array in half, sorts each half, then merges the two sorted halves in O(n). Its worst-case is the same as its average case (no bad-input scenario), and it's **stable** (equal elements keep their relative order) — but it needs O(n) auxiliary space for the merge step, unlike the others which can sort in place (or near-in-place).

**Quicksort — O(n log n) average, O(n²) worst case:** picks a pivot, partitions the array into "less than pivot" and "greater than pivot," and recurses on each partition. Its average case is excellent and it typically has lower constant-factor overhead than merge sort (fewer allocations, better cache behavior from in-place partitioning), but a poorly chosen pivot on adversarial or already-sorted input degrades it to O(n²). It is **not stable** by default.

| Algorithm | Best | Average | Worst | Stable | Extra space |
|---|---|---|---|---|---|
| Bubble sort | O(n) | O(n²) | O(n²) | Yes | O(1) |
| Insertion sort | O(n) | O(n²) | O(n²) | Yes | O(1) |
| Merge sort | O(n log n) | O(n log n) | O(n log n) | Yes | O(n) |
| Quicksort | O(n log n) | O(n log n) | O(n²) | No | O(log n) (call stack) |

**Why .NET uses a hybrid ("introspective sort"):** `Array.Sort`/`List<T>.Sort` use **introsort**, which starts with quicksort (fast average case, in-place), monitors recursion depth, and **switches to heapsort** if the recursion goes too deep (guarding against quicksort's O(n²) worst case on adversarial input), while also **switching to insertion sort for small partitions** (below roughly 16 elements) because insertion sort's low constant overhead beats quicksort's recursive overhead at that scale. This gives near-quicksort average speed with a guaranteed O(n log n) worst case, at the cost of not being stable — which is why `OrderBy` in LINQ (a stable sort, implemented separately) exists for when relative order of equal keys matters.

---

## Intermediate — Question 4

**Q4: Contrast Binary Trees and Binary Search Trees, and explain the four traversal orders and what each is useful for.**

A **Binary Tree** is simply a tree where each node has at most two children (commonly called `left` and `right`) — there's no ordering constraint on values at all.

A **Binary Search Tree (BST)** is a binary tree with an added invariant: for every node, all values in its left subtree are less than the node's value, and all values in its right subtree are greater. This ordering is what makes search, insert, and delete achievable in **O(h)** where `h` is the tree's height — O(log n) if the tree is balanced, but degrading to **O(n)** if it becomes a degenerate, essentially-linked-list shape (see the Advanced question on balanced trees).

```csharp
class TreeNode
{
    public int Value;
    public TreeNode Left, Right;
}
```

**The four traversal orders (using recursion, visiting a node relative to its children):**

- **In-order** (Left, Node, Right): for a BST, this visits nodes in **ascending sorted order** — the canonical way to read a BST's contents sorted.
- **Pre-order** (Node, Left, Right): visits the root before its subtrees — useful for **copying/serializing** a tree, since you can reconstruct it by re-inserting values in the same pre-order sequence.
- **Post-order** (Left, Right, Node): visits children before the parent — useful when a node depends on its children being processed first, e.g. **safely deleting a tree** (free children before the parent) or evaluating an expression tree (evaluate operands before the operator).
- **Level-order** (breadth-first, level by level): uses a queue rather than recursion — useful for anything needing the tree's **shallowest-first** structure, like finding the minimum depth, printing the tree row by row, or serializing in a way that mirrors a complete binary tree's array layout (e.g. a heap).

```csharp
void InOrder(TreeNode node, List<int> result)
{
    if (node == null) return;
    InOrder(node.Left, result);
    result.Add(node.Value);
    InOrder(node.Right, result);
}

void LevelOrder(TreeNode root)
{
    var queue = new Queue<TreeNode>();
    if (root != null) queue.Enqueue(root);
    while (queue.Count > 0)
    {
        var node = queue.Dequeue();
        Console.Write(node.Value + " ");
        if (node.Left != null) queue.Enqueue(node.Left);
        if (node.Right != null) queue.Enqueue(node.Right);
    }
}
```

**Common pitfall:** assuming any binary tree supports O(log n) search — that guarantee comes specifically from the BST ordering property *combined with* balance; neither alone is sufficient.

---

## Intermediate — Question 5

**Q5: Compare recursion and iteration — when is recursion's clarity worth its overhead, and when does it risk problems?**

Both express repeated computation, but recursion does it by having a function call itself with a smaller sub-problem, while iteration uses an explicit loop with mutable state.

**The mechanism:** every recursive call pushes a new **stack frame** onto the call stack — containing the function's local variables, parameters, and the return address. That frame stays on the stack until the call returns. Iteration reuses the same stack frame across all repetitions, updating loop variables in place instead.

**Classic example — factorial:**

```csharp
// Recursive: O(n) time, O(n) space (call stack depth)
int FactorialRecursive(int n) => n <= 1 ? 1 : n * FactorialRecursive(n - 1);

// Iterative: O(n) time, O(1) space
int FactorialIterative(int n)
{
    int result = 1;
    for (int i = 2; i <= n; i++) result *= i;
    return result;
}
```

**Fibonacci is the sharper cautionary example:** naive recursive Fibonacci without memoization is **O(2ⁿ)** — each call spawns two more, recomputing the same sub-problems exponentially many times — versus an O(n) iterative loop (or O(n) memoized recursion, see the Dynamic Programming question). This is the single most common "recursion looks elegant but is asymptotically catastrophic" interview trap.

```csharp
// O(2^n) - naive, recomputes Fib(2) and Fib(1) many times over
int FibNaive(int n) => n <= 1 ? n : FibNaive(n - 1) + FibNaive(n - 2);
```

**When recursion risks a stack overflow:** each frame consumes stack memory, and the default thread stack size (1MB on many .NET configurations) can only hold a few thousand to tens of thousands of frames depending on their size. A recursive function without a base case, or one processing deeply nested/large linear input (e.g. recursively walking a 100,000-node linked list), can throw a `StackOverflowException` — which, critically, **cannot be caught** in .NET; it terminates the process immediately.

**Guidance:** prefer recursion when the problem is naturally recursive/hierarchical (tree/graph traversal, divide-and-conquer) and the recursion depth is bounded and modest — the clarity gain is real and the overhead (extra stack frames, function-call cost) is usually negligible. Prefer iteration when depth could be large/unbounded (walking a long linked list or flat sequence), when performance is critical in a hot path, or convert deep recursion to an explicit iterative loop with your own `Stack<T>` to control memory explicitly.

---

## Intermediate — Question 6

**Q6: What is a Trie (prefix tree), and how does it beat a `HashSet<string>` for prefix-based lookups?**

A Trie is a tree structure specialized for storing strings, where each node represents one character position and edges spell out characters — every path from the root represents a prefix, and paths sharing a common prefix physically share the same nodes. Each node holds a map of `char → child node` (a `Dictionary<char, TrieNode>` or a fixed-size array for a known alphabet) and a boolean flag marking whether a complete word ends at that node.

```csharp
class TrieNode
{
    public Dictionary<char, TrieNode> Children = new();
    public bool IsEndOfWord;
}

class Trie
{
    private readonly TrieNode _root = new();

    public void Insert(string word)
    {
        var node = _root;
        foreach (var c in word)
        {
            if (!node.Children.TryGetValue(c, out var next))
                node.Children[c] = next = new TrieNode();
            node = next;
        }
        node.IsEndOfWord = true;
    }

    public bool Search(string word)
    {
        var node = FindNode(word);
        return node != null && node.IsEndOfWord;
    }

    public bool StartsWith(string prefix) => FindNode(prefix) != null;

    private TrieNode FindNode(string s)
    {
        var node = _root;
        foreach (var c in s)
        {
            if (!node.Children.TryGetValue(c, out node)) return null;
        }
        return node;
    }
}
```

**Complexity:** `Insert`, `Search`, and `StartsWith` are all **O(L)**, where `L` is the length of the word/prefix — independent of how many words are already stored. Space is O(total characters across all inserted words) in the worst case, but shared prefixes reduce this in practice (e.g. "cat" and "car" share the "ca" path).

**Why it beats a `HashSet<string>` for prefixes:** a hash set gives O(1) *exact-match* lookup, but answering "does any stored word start with this prefix?" requires scanning every stored word — O(n * L). A Trie answers the same prefix question in **O(L)**, regardless of `n`, because `StartsWith` just walks the prefix's characters down the tree once — this is exactly why Tries power autocomplete, spell-checkers, and IP-routing longest-prefix-match, where prefix queries are the dominant operation.

#### Follow-up: How would you extend this to support wildcard search (e.g. `"c.t"` matching "cat" and "cot")?

Replace the iterative character walk with a recursive DFS: at each position, if the character is a literal, follow that single child; if it's a wildcard (`.`), recurse into **every** child at that level and return true if any branch succeeds. This turns the search from O(L) into O(26^w * L) in the worst case (where `w` is the number of wildcards), since each wildcard can fan out into every possible child.

---

## Intermediate — Question 7

**Q7: Explain the Union-Find (Disjoint Set Union) data structure, and how path compression and union by rank achieve near-O(1) operations.**

Union-Find tracks a collection of disjoint sets and supports two operations: `Find(x)` (which set does `x` belong to, represented by that set's "root" or representative element) and `Union(x, y)` (merge the sets containing `x` and `y`). It's the standard tool for questions like "are these two nodes connected?" without needing a full graph traversal.

**Naive representation:** an array `parent[]` where `parent[x]` points to `x`'s parent, and a root is a node that is its own parent. `Find(x)` walks `parent` pointers up to the root. Without any optimization, repeated unions can build a long chain, degrading `Find` to **O(n)** — the same failure mode as an unbalanced BST (Advanced Q5).

**Path compression:** during `Find(x)`, once the root is located, re-point every node visited along the way directly to that root, so future `Find` calls on those nodes are instant.

**Union by rank/size:** when merging two sets, always attach the smaller/shallower tree's root under the larger/deeper tree's root, rather than arbitrarily — this keeps trees from growing tall in the first place.

```csharp
class UnionFind
{
    private readonly int[] _parent, _rank;

    public UnionFind(int n)
    {
        _parent = new int[n];
        _rank = new int[n];
        for (int i = 0; i < n; i++) _parent[i] = i; // each node starts as its own root
    }

    public int Find(int x)
    {
        if (_parent[x] != x)
            _parent[x] = Find(_parent[x]); // path compression: re-point directly to the root
        return _parent[x];
    }

    public void Union(int x, int y)
    {
        int rootX = Find(x), rootY = Find(y);
        if (rootX == rootY) return;
        if (_rank[rootX] < _rank[rootY]) (rootX, rootY) = (rootY, rootX);
        _parent[rootY] = rootX;                 // attach shallower tree under deeper one
        if (_rank[rootX] == _rank[rootY]) _rank[rootX]++;
    }
}
```

**Complexity:** with both optimizations, each operation is **O(α(n))** amortized, where `α` is the inverse Ackermann function — it grows so slowly that it's less than 5 for any input size that could physically fit in memory, so this is treated as **effectively O(1)** in practice.

**Use cases:** detecting cycles in an undirected graph (union each edge's endpoints; if they're already in the same set, adding this edge creates a cycle), Kruskal's minimum-spanning-tree algorithm, and counting connected components.

**Common pitfall:** implementing `Union`/`Find` without path compression *or* union by rank — it still produces correct answers, just with worst-case O(n) operations, silently losing the entire performance benefit the structure is known for.

---

## Intermediate — Question 8

**Q8: What does it mean for a sort to be "stable," and when does that property actually matter?**

A sort is **stable** if elements that compare as equal (by the sort key) retain their original relative order in the output. An **unstable** sort makes no such guarantee — two equal-key elements might end up in either order, and that order can even vary between runs or input sizes as the algorithm's internal strategy changes (see Intermediate Q3's discussion of introsort switching strategies by partition size).

**Why it matters — chained/multi-key sorting:** stability lets you sort by a secondary key first, then stably sort by a primary key, and the secondary ordering is preserved *within* each group of equal primary keys. This is a common, genuinely useful pattern:

```csharp
var people = new List<(string Dept, string Name)>
{
    ("Eng", "Zoe"), ("Sales", "Amir"), ("Eng", "Amir"), ("Sales", "Zoe")
};

// OrderBy is a stable sort: within each Dept group, original relative order is preserved
var byDept = people.OrderBy(p => p.Dept).ToList();
// Eng/Zoe, Eng/Amir, Sales/Amir, Sales/Zoe  <-- "Zoe" stays before "Amir" within Eng, matching input order
```

**Why it also matters for UI and reproducibility:** re-sorting a grid by a new column while ties should fall back to the previous sort order (a common spreadsheet/data-grid expectation) only works correctly if the sort is stable — otherwise rows with equal values in the new column "shuffle" unpredictably relative to each other.

**In .NET specifically:** LINQ's `OrderBy`/`OrderByDescending`/`ThenBy` are documented and guaranteed **stable**. `Array.Sort` and `List<T>.Sort`, by contrast, use introsort internally and are explicitly **not** guaranteed stable — for a collection with duplicate keys, the relative order of those duplicates is unspecified and can differ from what you'd naively expect, especially as introsort's internal algorithm switch (quicksort → heapsort → insertion sort) kicks in at different sizes.

**Common pitfall:** assuming `List<T>.Sort` is stable because "it looked stable in my test" — small test data often happens to land in insertion-sort territory (stable), while production-sized data hits quicksort/heapsort partitions (not stable), producing a bug that only appears at scale. If stability matters, use `OrderBy` (or a custom stable merge sort) rather than `Array.Sort`/`List<T>.Sort`.

---

## Intermediate — Question 9

**Q9: Compare greedy algorithms and dynamic programming — and give a concrete example where greedy produces the wrong answer.**

Both approaches build a solution incrementally, but they differ in how much they trust each individual step. A **greedy** algorithm makes the locally optimal choice at each step and never reconsiders it — fast and simple, but only *correct* when the problem has the **greedy choice property** (a locally optimal choice is always part of *some* globally optimal solution) on top of optimal substructure. **Dynamic programming** instead explores (and caches) the outcomes of multiple choices at each step, guaranteeing correctness for any problem with optimal substructure and overlapping subproblems (Advanced Q3), even when no greedy rule can be proven correct.

**Where greedy fails — coin change with a non-canonical coin system:** with coins `{1, 3, 4}` and a target of `6`, a greedy strategy (always take the largest coin that fits) picks `4`, then is left with `2`, forcing `1 + 1` — a total of **3 coins** (`4 + 1 + 1`). The true optimum is **2 coins** (`3 + 3`). Greedy's locally-best pick (the biggest coin) doesn't lead to the globally best outcome here, because this coin system isn't "canonical" (US currency `{1, 5, 10, 25}` happens to have the property that greedy *is* always optimal — that's a property of the specific coin set, not of coin-change problems in general).

```csharp
// Greedy: fast, but WRONG for non-canonical coin systems like {1, 3, 4}
int CoinChangeGreedy(int[] coinsDescending, int amount)
{
    int count = 0;
    foreach (var coin in coinsDescending) // must be pre-sorted descending
    {
        count += amount / coin;
        amount %= coin;
    }
    return amount == 0 ? count : -1; // silently wrong for {1,3,4}, amount=6: returns 3, not 2
}
```

The DP solution from Advanced Q3 (`CoinChange`) considers every coin at every amount rather than committing greedily, and is guaranteed correct for *any* coin system, at the cost of `O(amount * coins.Length)` instead of greedy's `O(coins.Length)`.

| | Greedy | Dynamic Programming |
|---|---|---|
| Strategy | Commit to the locally best choice, never revisit | Explore/cache multiple choices, pick the best overall |
| Correctness | Only when greedy-choice property holds | Always, given optimal substructure |
| Speed | Usually faster, often O(n) or O(n log n) | Usually slower, proportional to the state space |
| Example that works | Activity/interval scheduling (pick earliest finish time) | Coin change with arbitrary denominations |

#### Follow-up: How do you know in advance whether greedy will work for a given problem?

Prove the greedy-choice property with an **exchange argument**: assume an optimal solution that *doesn't* make the greedy choice at the first step, then show you can swap in the greedy choice without making the solution worse. If that swap is always possible, greedy is safe. Problems whose structure forms a **matroid** (a formal generalization capturing this exchange property, e.g. interval scheduling, minimum spanning tree via Kruskal's) are the classic territory where greedy is provably optimal.

---

## Intermediate — Question 10

**Q10: What is topological sort, what does it require of the graph, and how does Kahn's algorithm compute it?**

A topological sort produces a linear ordering of a **directed acyclic graph's (DAG's)** vertices such that for every directed edge `u → v`, `u` appears before `v` in the ordering. It only makes sense for graphs with **no cycles** — a cycle would require some vertex to come both before and after another, which is unsatisfiable.

**Kahn's algorithm (BFS-based):** track each vertex's **in-degree** (number of incoming edges). Start with all vertices that have in-degree 0 (nothing depends on them being processed first) in a queue. Repeatedly dequeue a vertex, add it to the output order, and decrement the in-degree of each of its neighbors — any neighbor whose in-degree drops to 0 becomes newly available and is enqueued.

```csharp
// O(V + E) time and space
List<int> TopologicalSort(Dictionary<int, List<int>> graph, int vertexCount)
{
    var inDegree = new int[vertexCount];
    foreach (var neighbors in graph.Values)
        foreach (var v in neighbors)
            inDegree[v]++;

    var queue = new Queue<int>();
    for (int v = 0; v < vertexCount; v++)
        if (inDegree[v] == 0) queue.Enqueue(v);

    var order = new List<int>();
    while (queue.Count > 0)
    {
        int node = queue.Dequeue();
        order.Add(node);
        foreach (var neighbor in graph.GetValueOrDefault(node, new List<int>()))
            if (--inDegree[neighbor] == 0) queue.Enqueue(neighbor);
    }

    return order; // if order.Count < vertexCount, the graph has a cycle — see below
}
```

**Complexity:** **O(V + E)** — every vertex is enqueued/dequeued once, and every edge is examined exactly once when decrementing in-degrees.

**Detecting a cycle for free:** if the final `order` contains fewer than `vertexCount` vertices, some vertices never reached in-degree 0 — they're stuck in a cycle (each is waiting on another vertex within the same cycle, so none of them ever becomes "ready"). This is the standard way to detect a cycle in a directed graph via Kahn's algorithm, and it's directly relevant to the directed-graph cycle-detection Scenario question.

**Use cases:** build systems resolving compile order from dependency graphs, course-prerequisite ordering, package manager install order, spreadsheet formula recalculation order.

**Common pitfall:** running topological sort on a graph that turns out to have a cycle without checking `order.Count == vertexCount` — the algorithm doesn't throw, it just silently returns a partial, incomplete ordering, which is easy to mistake for a valid (if oddly short) result.

---

## Advanced — Question 1

**Q1: Compare adjacency list and adjacency matrix graph representations — space/time trade-offs for sparse vs dense graphs.**

A graph has `V` vertices and `E` edges. Two standard ways to represent it:

**Adjacency list:** for each vertex, store a list of its neighbors (e.g. `Dictionary<int, List<int>>` or `List<int>[]`). Space is **O(V + E)** — you only pay for edges that actually exist. Checking whether a specific edge `(u, v)` exists requires scanning `u`'s neighbor list, **O(degree(u))** — in the worst case O(V). Iterating over all of a vertex's neighbors is O(degree(u)), which is efficient and exactly what most graph algorithms (BFS/DFS) need.

**Adjacency matrix:** a `V × V` 2D array where `matrix[u][v] = true` (or a weight) if an edge exists. Space is always **O(V²)** regardless of how many edges actually exist. Checking whether edge `(u, v)` exists is **O(1)** — direct array lookup. Iterating over a vertex's neighbors is O(V) even if it only has a handful of actual neighbors, because you must scan the entire row.

```csharp
// Adjacency list - good for sparse graphs
var adjList = new Dictionary<int, List<int>>();
adjList[1] = new List<int> { 2, 3 };

// Adjacency matrix - good for dense graphs / O(1) edge lookup
bool[,] adjMatrix = new bool[vertexCount, vertexCount];
adjMatrix[1, 2] = true;
```

**The trade-off in practice:**
- **Sparse graphs** (E is much smaller than V², e.g. a social network or road network where each node connects to a small handful of others) — adjacency list wins decisively: O(V + E) space instead of O(V²), and traversal algorithms (BFS/DFS) naturally only touch real edges.
- **Dense graphs** (E approaches V², e.g. a fully-connected-ish network, or when you need frequent O(1) "does this edge exist" checks, like in some dynamic-programming-on-graphs formulations) — adjacency matrix's O(1) edge lookup and simple indexing can outweigh its worse space usage.

**Common pitfall:** defaulting to an adjacency matrix out of habit for a large, sparse real-world graph (e.g. 1 million vertices) — a `V × V` matrix at that scale is 10¹² cells, completely infeasible, whereas an adjacency list scales with the actual edge count.

---

## Advanced — Question 2

**Q2: Compare BFS and DFS — the algorithms, complexity, and when each is the right choice.**

Both systematically visit every reachable vertex in a graph, but explore in a different order, using a different underlying data structure.

**BFS (Breadth-First Search)** explores level by level: visit all neighbors of the start node first, then all *their* unvisited neighbors, and so on — using a **queue** to track the frontier (FIFO: process nodes in the order discovered).

**DFS (Depth-First Search)** explores as deep as possible down one path before backtracking — using a **stack** (either explicit, or implicitly via recursion, since each recursive call is itself a stack frame).

```csharp
// BFS - queue-based, level by level
List<int> Bfs(Dictionary<int, List<int>> graph, int start)
{
    var visited = new HashSet<int> { start };
    var order = new List<int>();
    var queue = new Queue<int>();
    queue.Enqueue(start);
    while (queue.Count > 0)
    {
        int node = queue.Dequeue();
        order.Add(node);
        foreach (var neighbor in graph.GetValueOrDefault(node, new List<int>()))
            if (visited.Add(neighbor)) queue.Enqueue(neighbor);
    }
    return order;
}

// DFS - recursive, uses the call stack
void Dfs(Dictionary<int, List<int>> graph, int node, HashSet<int> visited, List<int> order)
{
    if (!visited.Add(node)) return;
    order.Add(node);
    foreach (var neighbor in graph.GetValueOrDefault(node, new List<int>()))
        Dfs(graph, neighbor, visited, order);
}
```

**Complexity:** both are **O(V + E)** — every vertex is visited once and every edge is examined once (across an adjacency list representation).

**When to choose which:**
- **BFS for shortest path in an unweighted graph.** Because BFS explores in strict distance order (all nodes at distance 1 before any at distance 2), the first time it reaches a target node is guaranteed to be via a shortest path (fewest edges). DFS gives no such guarantee — it might find a long, winding path first.
- **DFS for exploring/backtracking problems.** Path-finding with backtracking (maze solving, generating all permutations/combinations, detecting cycles, topological sort, exploring a decision tree exhaustively) maps naturally onto DFS's "go deep, backtrack on dead end" structure, and its recursive form is usually simpler to write correctly than an equivalent BFS.
- BFS typically uses more memory at peak (the frontier can be O(V) wide in a bushy graph); DFS's memory is bounded by the depth of the recursion/stack, O(H) where H is the longest path explored.

**Common pitfall:** using DFS to find a shortest path — it's a frequent interview mistake since DFS *can* find "a" path but has no guarantee of finding the shortest one without additional bookkeeping (like tracking path lengths and comparing), at which point you've essentially reinvented a worse BFS or Dijkstra.

---

## Advanced — Question 3

**Q3: Explain Dynamic Programming — memoization vs tabulation — using Fibonacci and the coin-change problem.**

Dynamic Programming (DP) applies when a problem has two properties: **optimal substructure** (the optimal solution to the problem can be built from optimal solutions to its sub-problems) and **overlapping subproblems** (the naive recursive solution solves the *same* sub-problems repeatedly). DP's core idea is simple: solve each distinct sub-problem exactly once, and cache the result.

**Memoization (top-down):** keep the natural recursive structure, but store each computed result in a cache (e.g. a `Dictionary<int, long>` or array) keyed by the sub-problem's parameters; before recursing, check the cache first.

```csharp
// Fibonacci with memoization: O(n) time, O(n) space - vs O(2^n) naive recursion
Dictionary<int, long> memo = new();
long FibMemo(int n)
{
    if (n <= 1) return n;
    if (memo.TryGetValue(n, out var cached)) return cached;
    long result = FibMemo(n - 1) + FibMemo(n - 2);
    memo[n] = result;
    return result;
}
```

Each of the `n` distinct sub-problems (`Fib(0)` through `Fib(n)`) is now computed exactly once, turning the naive O(2ⁿ) blowup into **O(n)** time, at the cost of O(n) space for the cache (plus O(n) call-stack depth).

**Tabulation (bottom-up):** build the answer iteratively from the smallest sub-problems up, filling a table (array), with no recursion at all.

```csharp
// Fibonacci with tabulation: O(n) time, O(1) space
long FibTab(int n)
{
    if (n <= 1) return n;
    long prev2 = 0, prev1 = 1;
    for (int i = 2; i <= n; i++)
    {
        long current = prev1 + prev2;
        prev2 = prev1;
        prev1 = current;
    }
    return prev1;
}
```

Tabulation avoids recursion overhead and call-stack depth entirely, and here it also drops space to O(1) since only the last two values are ever needed — a further optimization beyond plain memoization.

**Coin change (minimum coins to make an amount):** given coin denominations and a target amount, naive recursion re-explores the same remaining amounts repeatedly. Tabulation builds `dp[amount]` = minimum coins needed for each amount from 0 up to the target:

```csharp
// O(amount * coins.Length) time, O(amount) space
int CoinChange(int[] coins, int amount)
{
    var dp = new int[amount + 1];
    Array.Fill(dp, int.MaxValue - 1); // "infinity" sentinel, avoiding overflow on +1
    dp[0] = 0;
    for (int a = 1; a <= amount; a++)
        foreach (var coin in coins)
            if (coin <= a)
                dp[a] = Math.Min(dp[a], dp[a - coin] + 1);
    return dp[amount] >= int.MaxValue - 1 ? -1 : dp[amount];
}
```

**Guidance:** memoization is usually easier to derive directly from a brute-force recursive solution (add a cache, done) and only computes sub-problems actually needed; tabulation avoids recursion/stack-depth concerns and is often slightly faster in practice, but sometimes computes sub-problems that aren't strictly necessary. Both share the same asymptotic complexity for most problems — pick whichever is easier to reason about for the specific recurrence.

---

## Advanced — Question 4

**Q4: Explain the array-based binary heap, .NET's `PriorityQueue<TElement,TPriority>`, and a real use case.**

A **binary heap** is a complete binary tree (every level full except possibly the last, filled left-to-right) satisfying the **heap property**: in a min-heap, every parent is ≤ its children (so the minimum element is always at the root); a max-heap is the mirror image. "Complete" is what allows an elegant **array-based** representation with no pointers at all: for a node at array index `i`, its children live at `2i + 1` and `2i + 2`, and its parent at `(i - 1) / 2`.

**Core operations:**
- **Peek** (look at the min/max): **O(1)** — it's always at index 0.
- **Insert:** append to the end of the array, then "bubble up" (swap with parent while it violates the heap property) — **O(log n)**, bounded by the tree's height.
- **Extract-min/max:** swap the root with the last element, remove the last element (was the old root), then "bubble down" (swap with the smaller/larger child while violating the heap property) — **O(log n)**.

**`PriorityQueue<TElement,TPriority>`** (available since .NET 6) is a ready-made min-heap: `Enqueue(element, priority)` and `Dequeue()` return the element with the lowest priority value first — both O(log n).

```csharp
var pq = new PriorityQueue<string, int>();
pq.Enqueue("low priority task", 5);
pq.Enqueue("urgent task", 1);
pq.Enqueue("medium task", 3);

string next = pq.Dequeue(); // "urgent task" - lowest priority number first
```

**Real use case 1 — Dijkstra's shortest path algorithm:** repeatedly needs to pick the unvisited node with the smallest known tentative distance. Using a plain array/list for that pick is O(V) per pick (O(V²) total); using a min-heap keyed on distance drops each pick (and each distance-update "decrease-key," typically implemented as a fresh enqueue plus a lazy skip of stale entries) to O(log V), giving the standard O((V + E) log V) complexity with a binary heap.

**Real use case 2 — "find the k largest elements" in a stream or large collection:** maintain a **min-heap of size k**. For each new element: if the heap has fewer than k elements, add it; otherwise, compare it to the heap's minimum (the root) — if the new element is larger, replace the root with it. After processing everything, the heap holds exactly the k largest elements seen, in **O(n log k)** total — dramatically better than sorting the entire collection (O(n log n)) when `k` is much smaller than `n`, and it works even when the full dataset can't fit in memory at once (see the log-file Scenario question).

---

## Advanced — Question 5

**Q5: Why can an unbalanced BST degrade to O(n), and how do self-balancing trees (and `SortedDictionary<TKey,TValue>`) solve it?**

A Binary Search Tree's O(log n) guarantee for search/insert/delete comes from its height `h` being O(log n) — each step down the tree eliminates roughly half the remaining nodes, same intuition as binary search. But nothing about the plain BST insertion rule *enforces* that shape.

**The degradation:** if you insert already-sorted data into a plain BST (`1, 2, 3, 4, 5...`), every new value is greater than everything currently in the tree, so each insertion attaches as the right child of the previous node — the "tree" becomes a straight chain, structurally identical to a linked list. Its height becomes `O(n)` instead of `O(log n)`, and every operation degrades to **O(n)** — you've silently lost the entire benefit of using a tree.

**Self-balancing trees** fix this by adding a rule, checked and enforced on every insert/delete, that keeps the tree's height provably O(log n) regardless of insertion order:

- **AVL trees** track a balance factor (height difference between left and right subtrees) at every node and perform **rotations** (local restructuring that preserves BST ordering while changing shape) whenever an insert/delete pushes that difference beyond 1. AVL trees are strictly balanced, giving very fast lookups, at the cost of more frequent/expensive rotations on writes.
- **Red-Black trees** use a looser invariant (a coloring scheme with rules like "no red node has a red child" and "every root-to-leaf path has the same number of black nodes") that guarantees height is at most roughly `2 log(n+1)` — a slightly weaker balance guarantee than AVL, but with fewer rotations needed on average, making writes cheaper. This is why Red-Black trees (or similar structures) are the more common choice inside general-purpose library data structures.

Both guarantee **O(log n)** search, insert, and delete, no matter the insertion order — the self-balancing logic amortizes the cost of maintaining balance into each operation, rather than letting the tree passively degrade.

**In .NET:** `SortedDictionary<TKey,TValue>` is implemented internally as a red-black tree, which is exactly why it guarantees **O(log n)** for `Add`, `Remove`, `ContainsKey`, and why iterating it yields keys in sorted order (an in-order traversal). Contrast with `Dictionary<TKey,TValue>` (hash table, O(1) average but unordered) and `SortedList<TKey,TValue>` (backed by a sorted array — O(log n) *lookup* via binary search, but O(n) insert/delete because of shifting, making it better when writes are rare and memory overhead needs to be minimal).

**Guidance:** you rarely implement AVL/Red-Black rebalancing by hand in application code — the value of understanding them is knowing *why* `SortedDictionary` gives you guaranteed O(log n) instead of the O(n) worst case a naive BST would risk, and choosing between `Dictionary`, `SortedDictionary`, and `SortedList` based on whether you need ordering, and whether reads or writes dominate.

---

## Advanced — Question 6

**Q6: Walk through Dijkstra's algorithm in depth — the mechanism, why it requires non-negative weights, and its complexity.**

Dijkstra's algorithm finds the shortest path from a single source vertex to every other reachable vertex in a **weighted graph with non-negative edge weights**. It's a greedy algorithm built on top of the min-heap (Advanced Q4): maintain a tentative distance for every vertex (`0` for the source, `∞` for everything else), and repeatedly select the unvisited vertex with the smallest tentative distance, "finalize" it, and **relax** its outgoing edges (if going through this vertex offers a shorter path to a neighbor, update the neighbor's tentative distance).

```csharp
// O((V + E) log V) with a binary heap
Dictionary<int, int> Dijkstra(Dictionary<int, List<(int neighbor, int weight)>> graph, int source)
{
    var dist = new Dictionary<int, int> { [source] = 0 };
    var pq = new PriorityQueue<int, int>();
    pq.Enqueue(source, 0);

    while (pq.Count > 0)
    {
        pq.TryDequeue(out int node, out int nodeDist);
        if (nodeDist > dist.GetValueOrDefault(node, int.MaxValue)) continue; // stale entry — skip

        foreach (var (neighbor, weight) in graph.GetValueOrDefault(node, new()))
        {
            int newDist = nodeDist + weight;
            if (newDist < dist.GetValueOrDefault(neighbor, int.MaxValue))
            {
                dist[neighbor] = newDist;
                pq.Enqueue(neighbor, newDist); // "decrease-key" via a fresh enqueue
            }
        }
    }
    return dist;
}
```

**Why finalizing a vertex is safe (the correctness argument):** when a vertex is popped from the min-heap, its tentative distance is the *smallest* among all remaining unvisited vertices. Since all edge weights are non-negative, any alternative path to that vertex through a *currently unvisited* vertex would have to be at least as long as the path already found (you can't make a path shorter by adding more non-negative weight to it). This is exactly why **negative edge weights break the algorithm** — a vertex finalized "too early" could later be reachable via a negative edge for a genuinely shorter total distance, but Dijkstra never revisits finalized vertices, so it would report the wrong answer. Graphs with negative weights need Bellman-Ford instead, which trades speed (O(V·E)) for tolerating negative edges (as long as there's no negative cycle).

**Complexity:** each vertex is popped once (O(V log V)) and each edge triggers at most one heap insertion during relaxation (O(E log V)), giving **O((V + E) log V)** total with a binary heap.

**Common pitfall:** because .NET's `PriorityQueue<TElement,TPriority>` has no built-in "decrease-key" operation, the standard workaround is to simply enqueue a fresh, better entry whenever a shorter distance is found, and lazily discard stale entries when popped (the `if (nodeDist > dist[...]) continue` check above) — forgetting that check lets stale, already-superseded distances corrupt the relaxation of later vertices.

---

## Advanced — Question 7

**Q7: What is A* search, and how does it use a heuristic to outperform Dijkstra while still guaranteeing the shortest path?**

A* is Dijkstra's algorithm extended with a **heuristic function** `h(n)` that estimates the remaining cost from any vertex `n` to the goal. Instead of prioritizing purely by the distance traveled so far (`g(n)`, exactly what Dijkstra uses), A* prioritizes by `f(n) = g(n) + h(n)` — the known cost so far *plus* an estimate of what's left. This steers the search toward vertices that seem promising given the goal's location, rather than exploring uniformly outward in every direction the way Dijkstra does.

```csharp
// Grid pathfinding example — h() is Manhattan distance to the goal
int Heuristic((int x, int y) node, (int x, int y) goal) =>
    Math.Abs(node.x - goal.x) + Math.Abs(node.y - goal.y);

// Same structure as Dijkstra, but the priority queue is keyed on g + h, not g alone
var pq = new PriorityQueue<(int x, int y), int>();
pq.Enqueue(start, Heuristic(start, goal));
// ... relax neighbors using newG = g[current] + edgeWeight, priority = newG + Heuristic(neighbor, goal)
```

**Why it still guarantees the shortest path — admissibility:** as long as `h(n)` never **overestimates** the true remaining cost (it's "admissible"), A* is guaranteed to find the optimal path, because it never lets an overly-optimistic estimate cause it to permanently rule out a vertex that's actually on the shortest path. Manhattan distance is admissible for grid movement restricted to 4 directions (it's a lower bound on the true remaining steps); Euclidean distance is admissible when diagonal movement is allowed.

**Why it's typically faster in practice:** Dijkstra treats "distance so far" as the only signal and explores in all directions equally, like ripples spreading from a stone; A*'s heuristic biases the search toward the goal, so in a spatial pathfinding scenario it usually visits dramatically fewer vertices before finding the goal — though its worst-case complexity is the same **O((V + E) log V)** as Dijkstra's (a useless heuristic, like `h(n) = 0` everywhere, makes A* degenerate exactly into Dijkstra).

| | Dijkstra | A* |
|---|---|---|
| Priority | `g(n)` — cost so far | `g(n) + h(n)` — cost so far + estimate to goal |
| Explores | Uniformly outward | Biased toward the goal |
| Optimality guarantee | Always (non-negative weights) | Guaranteed only if `h` is admissible |
| Typical use | No known goal, or need distances to *all* nodes | Single known goal, spatial/grid pathfinding, games |

#### Follow-up: What's the difference between an admissible heuristic and a consistent one?

Admissible only requires `h(n)` to never overestimate the true cost to the goal — it's sufficient for correctness but can still let A* "undo" a decision (revisit a node with a better cost after it was already finalized). **Consistent** (or "monotonic") is a stronger condition: for every edge `(n, n')`, `h(n) ≤ cost(n, n') + h(n')` — this guarantees that once A* finalizes a vertex, it will never find a better path to it later, which is what lets an efficient A* implementation finalize vertices exactly like Dijkstra does (without needing to reopen them). Most practical heuristics (Manhattan/Euclidean distance) are both admissible and consistent.

---

## Advanced — Question 8

**Q8: What problem do segment trees and Fenwick (Binary Indexed) trees solve, and how do they differ?**

Both structures answer **range queries** (sum, min, max over a sub-range of an array) while also supporting **point updates**, in `O(log n)` each — a combination that a plain array can't do efficiently: a plain array gives O(1) point update but O(n) range query (must sum the range every time), while a precomputed prefix-sum array gives O(1) range query but O(n) point update (must recompute every prefix sum after it).

**Fenwick tree (Binary Indexed Tree):** a compact array-based structure where each index `i` implicitly stores the aggregate of a specific range determined by `i`'s binary representation — specifically, the range ending at `i` with length equal to `i`'s lowest set bit (`i & -i`). Both update and prefix-sum query walk a chain of `O(log n)` indices by repeatedly adding/subtracting the lowest set bit.

```csharp
class FenwickTree
{
    private readonly int[] _tree; // 1-indexed

    public FenwickTree(int n) => _tree = new int[n + 1];

    public void Update(int i, int delta) // add delta at position i
    {
        for (; i < _tree.Length; i += i & (-i))
            _tree[i] += delta;
    }

    public int PrefixSum(int i) // sum of [1..i]
    {
        int sum = 0;
        for (; i > 0; i -= i & (-i))
            sum += _tree[i];
        return sum;
    }

    public int RangeSum(int l, int r) => PrefixSum(r) - PrefixSum(l - 1); // O(log n)
}
```

**Segment tree:** a binary tree built over the array where each node stores the aggregate of the range it covers; the root covers the whole array, and each node's two children cover its left and right halves. Build is `O(n)`; both point update and range query walk `O(log n)` nodes down/up the tree.

**The key difference:** a Fenwick tree only works for aggregate operations that have an **inverse** (sum, XOR) — `RangeSum(l, r) = PrefixSum(r) - PrefixSum(l-1)` relies on being able to "subtract out" the unwanted prefix. A segment tree has no such restriction and directly supports **min/max** (which have no inverse — you can't "subtract" a max), as well as more complex range operations (like range updates via lazy propagation). In exchange, a Fenwick tree is simpler to implement and uses less memory (one array vs an explicit tree).

**Use cases:** range-sum queries with frequent updates (running totals, financial time-series aggregation, frequency tables in competitive programming); segment trees specifically for range min/max queries (e.g. "what's the minimum stock price in this date range" with updates).

**Common pitfall:** reaching for a Fenwick tree for a range-**minimum** query — it silently doesn't work, because there's no way to "undo" a minimum the way `PrefixSum(r) - PrefixSum(l-1)` undoes a sum; a segment tree is required for non-invertible aggregates.

---

## Advanced — Question 9

**Q9: Explain backtracking using N-Queens — the mechanism, how pruning works, and its complexity.**

Backtracking builds a solution incrementally, one decision at a time, and **abandons ("backtracks" from) a partial solution the moment it can be proven invalid**, rather than completing it and checking validity only at the end. This prunes away entire branches of the search space that could never lead to a valid solution, without ever having to enumerate them.

**N-Queens:** place `n` queens on an `n×n` board so that no two attack each other (no shared row, column, or diagonal). Since queens must occupy distinct rows by construction (one queen per row, placed row by row), the algorithm only needs to choose a **column** for each row, checking column and diagonal conflicts against queens already placed in earlier rows before committing.

```csharp
// Returns the number of valid solutions
int SolveNQueens(int n)
{
    var cols = new bool[n];
    var diag1 = new bool[2 * n];  // row - col + n, tracks "/" diagonals
    var diag2 = new bool[2 * n];  // row + col, tracks "\" diagonals
    return Solve(0, n, cols, diag1, diag2);
}

int Solve(int row, int n, bool[] cols, bool[] diag1, bool[] diag2)
{
    if (row == n) return 1; // placed a queen in every row without conflict — one full solution

    int solutions = 0;
    for (int col = 0; col < n; col++)
    {
        int d1 = row - col + n, d2 = row + col;
        if (cols[col] || diag1[d1] || diag2[d2]) continue; // conflict — prune this branch

        cols[col] = diag1[d1] = diag2[d2] = true;           // choose
        solutions += Solve(row + 1, n, cols, diag1, diag2); // explore
        cols[col] = diag1[d1] = diag2[d2] = false;          // un-choose (the "backtrack" step)
    }
    return solutions;
}
```

**Why the boolean arrays matter:** checking `cols[col] || diag1[d1] || diag2[d2]` is **O(1)** per candidate column, versus re-scanning every previously placed queen — O(row) — to check for conflicts. This is the difference between a merely-correct backtracking solution and an efficiently-pruned one.

**Complexity:** brute-force generate-then-filter over all possible placements is astronomically worse than backtracking, but backtracking's *worst-case* complexity is still exponential (O(n!) roughly, since each row's choice is constrained by all previous rows) — pruning doesn't change the asymptotic worst case, it changes the **practical constant factor** by discarding huge fractions of the search tree the instant a conflict is detected, often orders of magnitude fewer nodes explored than a naive generate-and-check approach.

**Common pitfall:** forgetting the "un-choose" step (resetting `cols[col]`, `diag1[d1]`, `diag2[d2]` back to `false` after the recursive call returns) — without it, state from a failed branch leaks into sibling branches, corrupting every subsequent attempt in that row.

---

## Advanced — Question 10

**Q10: What are the common bit manipulation tricks, and where do they show up in real systems?**

Bitwise operations work directly on a number's binary representation and are typically O(1) per operation (bounded by the fixed word size), making them useful whenever a problem can be reframed in terms of individual bits rather than higher-level arithmetic.

**Core tricks:**
- **`n & (n - 1)` clears the lowest set bit.** Subtracting 1 flips all bits from the lowest set bit downward; ANDing with the original clears exactly that bit. Used to check "is `n` a power of two?" (`n > 0 && (n & (n - 1)) == 0` — a power of two has exactly one set bit, so clearing it leaves zero) and to count set bits efficiently (Brian Kernighan's algorithm, below).
- **`n & (-n)` isolates the lowest set bit.** In two's-complement, `-n` is `~n + 1`; ANDing with `n` leaves only the lowest set bit standing. This is exactly the mechanism the Fenwick tree (Advanced Q8) relies on for its index-stepping.
- **XOR cancellation (`x ^ x == 0`, `x ^ 0 == x`).** XOR-ing every element of an array where all values appear in pairs except one leaves only the unpaired value, since every paired value XORs to zero.
- **Bitmasks for sets/flags.** An `int` can represent a set of up to 32 boolean flags (`[Flags]` enums in C#) or a subset of up to 32 items (used heavily in bitmask DP for subset-enumeration problems), with membership tests as O(1) bitwise checks instead of a collection lookup.

```csharp
// Brian Kernighan's algorithm: O(number of set bits), not O(32) like a naive bit-by-bit scan
int CountSetBits(int n)
{
    int count = 0;
    while (n != 0)
    {
        n &= (n - 1); // clears the lowest set bit each iteration
        count++;
    }
    return count;
}

// Find the single non-duplicate value where every other value appears exactly twice
// O(n) time, O(1) space — vs a HashSet-based O(n) time, O(n) space approach
int FindSingleNumber(int[] nums)
{
    int result = 0;
    foreach (var n in nums) result ^= n; // paired values cancel to 0; the lone value survives
    return result;
}
```

**Real use cases:** `[Flags]` enum combinations for permission systems (`Permissions.Read | Permissions.Write`), `System.Collections.BitArray` for memory-efficient boolean arrays (1 bit per element instead of 1 byte via `bool[]`), bitmask DP for subset/traveling-salesman-style problems, and fast hash/permission checks in performance-critical paths (routers, game engines).

**Common pitfall:** using a signed right shift (`>>`) on a negative number expecting it to behave like an unsigned shift — `>>` in C# sign-extends (fills with the sign bit) rather than filling with zeros, so shifting a negative number right keeps it negative. C# 11 introduced `>>>` as an explicit **unsigned** right shift for when zero-fill is actually intended, avoiding the need to first cast to an unsigned type.

---

## Scenario — Question 1

**Q1: Given an array of integers and a target value, determine whether any two numbers sum to the target. Walk through the naive approach and the optimized approach.**

**The naive approach — check every pair:**

```csharp
// O(n^2) time, O(1) space
bool HasPairSumNaive(int[] nums, int target)
{
    for (int i = 0; i < nums.Length; i++)
        for (int j = i + 1; j < nums.Length; j++)
            if (nums[i] + nums[j] == target) return true;
    return false;
}
```

This checks all `n(n-1)/2` pairs — correct, but **O(n²)** time. For an interview, stating this first shows you can identify a correct brute force before optimizing, but you should immediately flag that it doesn't scale (e.g. 100,000 elements → ~5 billion comparisons).

**The optimized approach — a `HashSet<int>` as we go:**

```csharp
// O(n) time, O(n) space
bool HasPairSumOptimal(int[] nums, int target)
{
    var seen = new HashSet<int>();
    foreach (var num in nums)
    {
        int complement = target - num;
        if (seen.Contains(complement)) return true; // O(1) average lookup
        seen.Add(num);
    }
    return false;
}
```

**Why this works:** for each number, we only need to know "have I already seen the value that would complete the pair?" — that's exactly what a hash set answers in O(1) average time. By checking *before* adding the current number, we correctly avoid matching a number with itself unless it legitimately appears twice in the array (e.g. target = 8, array contains two separate 4s — the second 4 will find the first 4 already in the set).

**The trade-off an interviewer wants to hear articulated explicitly:** we've traded **O(n²) time / O(1) space** for **O(n) time / O(n) space**. This is the single most common "does this candidate understand time-space trade-offs" check in an interview — a hash-based structure often lets you trade extra memory for a large speed improvement, and recognizing *when that trade is worth making* (large `n`, memory available, correctness of hashing the element type) matters as much as knowing the technique itself.

**Edge cases to mention:** duplicate values, negative numbers (works fine, no special-casing needed), and whether the problem wants indices returned rather than just a boolean (a trivial extension: store `Dictionary<int, int>` mapping value → index instead of a plain `HashSet<int>`).

---

## Scenario — Question 2

**Q2: How do you detect a cycle in a singly linked list? Explain Floyd's Tortoise and Hare and why it's preferred over a HashSet-based approach.**

**The HashSet approach — track visited nodes:**

```csharp
// O(n) time, O(n) space
bool HasCycleHashSet(ListNode head)
{
    var visited = new HashSet<ListNode>();
    var current = head;
    while (current != null)
    {
        if (!visited.Add(current)) return true; // Add returns false if already present
        current = current.Next;
    }
    return false;
}
```

Correct and simple: if we ever revisit a node we've already recorded, there's a cycle. But it costs **O(n) extra space** to store every visited node reference.

**Floyd's Tortoise and Hare — O(1) space:**

```csharp
// O(n) time, O(1) space
bool HasCycleFloyd(ListNode head)
{
    var slow = head;
    var fast = head;
    while (fast != null && fast.Next != null)
    {
        slow = slow.Next;          // moves 1 step
        fast = fast.Next.Next;     // moves 2 steps
        if (slow == fast) return true; // they've met -> cycle
    }
    return false; // fast reached the end -> no cycle
}
```

**Why it works:** run two pointers through the list at different speeds — the "tortoise" advances one node per step, the "hare" advances two. If the list has no cycle, the hare simply reaches the end (`null`) first and the loop terminates normally. If the list **does** have a cycle, both pointers eventually enter the loop portion, and because the hare gains exactly one extra node of relative distance on the tortoise every step, it's mathematically guaranteed to eventually "lap" the tortoise and land on the exact same node — they must meet within at most one full traversal of the cycle's length. There's no way for the hare to permanently "jump over" the tortoise, since it only ever closes the gap by one node per step relative to it.

**Why it's preferred:** identical **O(n)** time complexity to the HashSet approach, but **O(1) space** — no auxiliary data structure at all, just two pointers. This space advantage is the entire reason Floyd's algorithm is the textbook answer; interviewers specifically probe whether you know a constant-space alternative exists, since "just use a HashSet" is the obvious first answer most candidates reach for.

#### Follow-up: How would you find the start of the cycle, not just detect its existence?

After the tortoise and hare meet inside the cycle, reset one pointer to `head` and advance both remaining pointers one step at a time (both now at speed 1) — they will meet again exactly at the cycle's starting node. This follows from the distance math: the distance from `head` to the cycle start equals the distance from the meeting point to the cycle start, going around the loop.

---

## Scenario — Question 3

**Q3: Given a string, find its first non-repeating character. Walk through a two-pass approach and its complexity.**

**Approach — frequency count, then a second scan for the first count-of-1:**

```csharp
// O(n) time, O(k) space, where k = number of distinct characters (bounded, e.g. <= 128/256 for ASCII)
char? FirstNonRepeatingChar(string s)
{
    var counts = new Dictionary<char, int>();

    // Pass 1: build a frequency table
    foreach (var c in s)
        counts[c] = counts.GetValueOrDefault(c, 0) + 1;

    // Pass 2: walk the string IN ORDER, return the first char whose count is exactly 1
    foreach (var c in s)
        if (counts[c] == 1) return c;

    return null; // no non-repeating character exists
}
```

**Why two passes are necessary:** the first pass must finish building the *complete* frequency table before we can trust any single count — if we tried to answer in one pass by returning the first character seen with count 1 "so far," we could easily return a character too early, before a later occurrence of that same character shows up in the string (e.g. `"aabb c"` — without a full count first, a naive single pass might momentarily think `'c'`-like characters are unique before finishing the scan). The second pass then re-walks the string **in its original order** (not the dictionary's, which has no defined order guarantee) specifically to find the *first* qualifying character — order matters for the answer's correctness, and only the original string preserves it.

**Complexity:** both passes are O(n), so total time is **O(n)**. Space is **O(k)** where `k` is the number of distinct characters — bounded by the size of the character set (e.g. at most 128 for ASCII, or up to the full Unicode range for arbitrary strings), so it's often described as O(1) space in practice when the alphabet is fixed and small, though it's more precise to call it O(min(n, k)).

**Common pitfalls:** using an ordinary `Dictionary<char,int>` is fine, but candidates sometimes reach for a fixed-size `int[128]` array assuming ASCII-only input — call this assumption out explicitly if the input could contain Unicode, since it silently breaks (or requires a much larger array) otherwise. Also, forgetting that dictionary iteration order is not guaranteed to match insertion order in general — re-scanning the original string for the second pass sidesteps that entirely rather than relying on dictionary ordering.

---

## Scenario — Question 4

**Q4: You have a log file too large to fit in memory. How do you find the top-K most frequent error messages, combining earlier DSA concepts?**

This is a composition problem: it combines **streaming** (don't load everything into memory at once), a **Dictionary for counting** (from the hash table question), and a **min-heap/`PriorityQueue`** (from the heap question) to keep the working set small while still producing an exact answer.

**Step 1 — stream the file, don't load it all at once:**

```csharp
// Read line-by-line: O(1) memory for the read itself, regardless of file size
foreach (var line in File.ReadLines(logFilePath))
{
    string errorMessage = ExtractErrorMessage(line); // parse out the relevant message
    if (errorMessage != null)
        counts[errorMessage] = counts.GetValueOrDefault(errorMessage, 0) + 1;
}
```

`File.ReadLines` (as opposed to `File.ReadAllLines`) lazily yields one line at a time instead of materializing the whole file in memory — essential when the file itself doesn't fit in RAM.

**Step 2 — count frequencies in a `Dictionary<string,int>`:** this is the same hashing mechanism as Intermediate Q1. Its memory footprint is bounded by the number of **distinct** error messages, not the total line count — in practice, distinct error message templates are usually a small, bounded set even across a huge log file, which is what makes this approach memory-feasible at all. (If even the distinct-message count were too large to fit in memory, you'd need a further step — e.g. a count-min sketch or an external sort/merge — but that's beyond what a bounded set of "error message templates" typically requires.)

**Step 3 — find the top K using a size-K min-heap, not a full sort:**

```csharp
// O(m log k) where m = number of distinct messages, k = how many top results wanted
var topK = new PriorityQueue<string, int>(); // min-heap keyed on frequency

foreach (var kvp in counts)
{
    if (topK.Count < k)
    {
        topK.Enqueue(kvp.Key, kvp.Value);
    }
    else
    {
        topK.TryPeek(out _, out int minFreqInHeap);
        if (kvp.Value > minFreqInHeap)
        {
            topK.Dequeue();                    // evict the current smallest
            topK.Enqueue(kvp.Key, kvp.Value);
        }
    }
}
// topK now holds exactly the K most frequent error messages
```

**Why a min-heap instead of sorting everything:** sorting all `m` distinct messages by frequency and taking the top K is O(m log m). Maintaining a size-K min-heap instead is **O(m log k)** — since `k` is typically a small constant (top 10, top 20) while `m` (distinct messages) could still be large, `log k` is meaningfully cheaper than `log m`, and critically, the heap's memory footprint is capped at O(k) rather than needing to hold and sort every distinct message at once.

**Why this composition is the "right" interview answer:** it demonstrates recognizing that a large-scale, memory-constrained problem decomposes into smaller, well-understood pieces — streaming I/O bounds peak memory for the read, a hash table gives O(1) average-case counting, and a bounded-size heap gives an efficient top-K without a full sort — rather than reaching for one unfamiliar "big data" tool. This is exactly the kind of composition an interviewer is checking for at the Scenario tier: not a new algorithm, but recognizing which already-known building blocks combine to fit real-world constraints (memory, file size, and needing only a small final result).

---

## Scenario — Question 5

**Q5: Given a list of intervals, merge all overlapping ones. Walk through the naive approach and the optimized approach.**

**The naive approach — repeatedly scan and merge:**

```csharp
// O(n^2) worst case — for each interval, re-scan the (shrinking) rest of the list looking for overlaps
List<(int start, int end)> MergeIntervalsNaive(List<(int start, int end)> intervals)
{
    var result = new List<(int start, int end)>(intervals);
    bool mergedAny = true;
    while (mergedAny)
    {
        mergedAny = false;
        for (int i = 0; i < result.Count && !mergedAny; i++)
            for (int j = i + 1; j < result.Count; j++)
                if (result[i].start <= result[j].end && result[j].start <= result[i].end)
                {
                    result[i] = (Math.Min(result[i].start, result[j].start), Math.Max(result[i].end, result[j].end));
                    result.RemoveAt(j);
                    mergedAny = true;
                    break;
                }
    }
    return result;
}
```

This works, but repeatedly re-scanning the whole (shrinking) list for overlaps after every merge is quadratic and messy to reason about — merges can cascade in any order depending on which pair you find first.

**The optimized approach — sort by start, then a single linear pass:**

```csharp
// O(n log n) time (dominated by the sort), O(n) space for the result
List<(int start, int end)> MergeIntervalsOptimal(List<(int start, int end)> intervals)
{
    if (intervals.Count == 0) return new();

    var sorted = intervals.OrderBy(iv => iv.start).ToList(); // O(n log n)
    var merged = new List<(int start, int end)> { sorted[0] };

    for (int i = 1; i < sorted.Count; i++)
    {
        var last = merged[^1];
        var current = sorted[i];
        if (current.start <= last.end) // overlaps (or touches) the last merged interval
        {
            merged[^1] = (last.start, Math.Max(last.end, current.end)); // extend in place
        }
        else
        {
            merged.Add(current); // no overlap — starts a new merged group
        }
    }
    return merged;
}
```

**Why sorting first makes a single pass sufficient:** once intervals are ordered by start, any interval that overlaps the current merged group *must* immediately follow it in this order — there's no way for a later interval (by start) to overlap something earlier that a still-later interval doesn't also touch, because starts only increase. That's what collapses the problem from "check every pair" to "compare each interval only to the most recently merged one," turning O(n²) into **O(n log n)**, dominated entirely by the sort (the merge pass itself is O(n)).

**Edge cases to call out explicitly:** whether touching intervals like `[1,3]` and `[3,5]` should merge (depends on whether the ranges are inclusive/exclusive — the `<=` above merges touching intervals; use `<` if they shouldn't); an empty input list; and a single interval (no merging needed, returned as-is).

---

## Scenario — Question 6

**Q6: How would you find the running median of a stream of numbers as they arrive? Walk through the naive approach and the two-heap approach.**

**The naive approach — re-sort on every insertion:**

```csharp
// O(n log n) per insertion, O(n^2 log n) total across n insertions
class MedianFinderNaive
{
    private readonly List<int> _values = new();

    public void AddNum(int num)
    {
        _values.Add(num);
        _values.Sort(); // re-sort the entire collection every time — wasteful
    }

    public double FindMedian()
    {
        int n = _values.Count;
        return n % 2 == 1 ? _values[n / 2] : (_values[n / 2 - 1] + _values[n / 2]) / 2.0;
    }
}
```

Correct, but re-sorting the whole (growing) list on every single insertion is wasteful — most of the list was already sorted before the new element arrived.

**The optimized approach — a max-heap for the lower half, a min-heap for the upper half:**

```csharp
// O(log n) per insertion, O(1) per median query
class MedianFinderOptimal
{
    private readonly PriorityQueue<int, int> _lowerMax = new(); // max-heap: negate priority (see note below)
    private readonly PriorityQueue<int, int> _upperMin = new(); // min-heap: natural order

    public void AddNum(int num)
    {
        // Route the new value, then rebalance so sizes never differ by more than 1
        if (_lowerMax.Count == 0 || num <= Peek(_lowerMax))
            _lowerMax.Enqueue(num, -num); // negate priority to simulate a max-heap
        else
            _upperMin.Enqueue(num, num);

        if (_lowerMax.Count > _upperMin.Count + 1)
        {
            _lowerMax.TryDequeue(out int moved, out _);
            _upperMin.Enqueue(moved, moved);
        }
        else if (_upperMin.Count > _lowerMax.Count + 1)
        {
            _upperMin.TryDequeue(out int moved, out _);
            _lowerMax.Enqueue(moved, -moved);
        }
    }

    public double FindMedian()
    {
        if (_lowerMax.Count == _upperMin.Count) return (Peek(_lowerMax) + Peek(_upperMin)) / 2.0;
        return _lowerMax.Count > _upperMin.Count ? Peek(_lowerMax) : Peek(_upperMin);
    }

    private int Peek(PriorityQueue<int, int> pq) { pq.TryPeek(out int val, out _); return val; }
}
```

**Why two heaps work:** `_lowerMax` holds the smaller half of all values seen so far, with its *largest* value accessible in O(1) at the root (simulated by negating priorities, since .NET's `PriorityQueue` is a min-heap by construction). `_upperMin` holds the larger half, with its *smallest* value at the root. Keeping the two heaps balanced in size (differing by at most 1) means the median is always either the root of whichever heap is larger, or the average of both roots when they're equal size — both **O(1)** to read. Each insertion only needs to route the new value to the correct heap and possibly move one element across to rebalance — both **O(log n)** heap operations.

**Common pitfall:** forgetting the rebalancing step after insertion — without it, one heap can grow arbitrarily larger than the other, and the "root of the larger heap is the median" logic silently breaks. Also, using .NET's `PriorityQueue` for the max-heap without negating the priority — its `Dequeue` always returns the *minimum* priority value, so simulating a max-heap requires either negating numeric priorities or supplying a custom reversed comparer.

---

## Scenario — Question 7

**Q7: How do you detect a cycle in a graph — and why does the algorithm differ between directed and undirected graphs?**

Both cases use DFS, but what counts as "evidence of a cycle" is different, because edge direction changes what a revisit means.

**Undirected graph — track the parent, not just visited:**

```csharp
// O(V + E) time and space
bool HasCycleUndirected(Dictionary<int, List<int>> graph, int vertexCount)
{
    var visited = new HashSet<int>();
    for (int start = 0; start < vertexCount; start++)
        if (!visited.Contains(start) && Dfs(start, -1, graph, visited))
            return true;
    return false;
}

bool Dfs(int node, int parent, Dictionary<int, List<int>> graph, HashSet<int> visited)
{
    visited.Add(node);
    foreach (var neighbor in graph.GetValueOrDefault(node, new()))
    {
        if (!visited.Contains(neighbor))
        {
            if (Dfs(neighbor, node, graph, visited)) return true;
        }
        else if (neighbor != parent) // revisiting a non-parent, already-visited node -> cycle
        {
            return true;
        }
    }
    return false;
}
```

In an undirected graph, every edge is stored both ways (`u`'s neighbor list contains `v` and vice versa), so without excluding the immediate parent, the edge you just walked *in* would always look like "revisiting a visited node" and falsely report a cycle on every single edge. Excluding the parent filters that out — a genuine cycle is a revisit to an already-visited vertex that **isn't** the one you just came from.

**Directed graph — track the current recursion path, not just visited:**

```csharp
// O(V + E) time and space
bool HasCycleDirected(Dictionary<int, List<int>> graph, int vertexCount)
{
    var visited = new HashSet<int>();
    var inRecursionStack = new HashSet<int>();
    for (int start = 0; start < vertexCount; start++)
        if (!visited.Contains(start) && Dfs(start, graph, visited, inRecursionStack))
            return true;
    return false;
}

bool Dfs(int node, Dictionary<int, List<int>> graph, HashSet<int> visited, HashSet<int> inRecursionStack)
{
    visited.Add(node);
    inRecursionStack.Add(node);
    foreach (var neighbor in graph.GetValueOrDefault(node, new()))
    {
        if (inRecursionStack.Contains(neighbor)) return true; // back edge to the current path -> cycle
        if (!visited.Contains(neighbor) && Dfs(neighbor, graph, visited, inRecursionStack)) return true;
    }
    inRecursionStack.Remove(node); // done with this node's path — remove it before backtracking
    return false;
}
```

In a directed graph, revisiting an already-fully-processed vertex is **not** necessarily a cycle — it might just be a diamond-shaped convergence (two separate paths legitimately leading to the same downstream vertex in a DAG). The distinguishing signal is a "back edge": an edge pointing to a vertex that is still **on the current DFS path** (`inRecursionStack`), not merely visited at some point in the past. This is exactly the same underlying idea Kahn's algorithm (Intermediate Q10) uses from a different angle — a directed graph has a cycle if and only if it has no valid topological order.

**Common pitfall:** applying the undirected "check parent" logic to a directed graph — it under-reports cycles (misses genuine back edges that aren't to the immediate parent) — or applying the directed "recursion stack" logic to an undirected graph without adjustment — it over-reports, since every undirected edge naturally creates a same-vertex-pair round trip that isn't a real cycle.

---

## Scenario — Question 8

**Q8: Find the kth largest element in an unsorted array. Walk through sorting, the heap approach, and quickselect — and when you'd choose each.**

**The naive approach — sort everything:**

```csharp
// O(n log n) time, O(1) extra space (in-place sort)
int KthLargestSort(int[] nums, int k)
{
    Array.Sort(nums);
    return nums[nums.Length - k];
}
```

Simple and correct, but does more work than necessary — it fully orders the entire array when only one position's value is actually needed.

**The heap approach — a min-heap of size k:**

```csharp
// O(n log k) time, O(k) space
int KthLargestHeap(int[] nums, int k)
{
    var minHeap = new PriorityQueue<int, int>();
    foreach (var num in nums)
    {
        minHeap.Enqueue(num, num);
        if (minHeap.Count > k) minHeap.Dequeue(); // evict the current smallest, keeping only the k largest
    }
    return minHeap.Peek(); // root of a size-k min-heap holding the k largest values is the kth largest
}
```

This is the same size-k min-heap pattern from Advanced Q4 — useful when `k` is small relative to `n`, or when the data arrives as a stream and you can't hold it all in memory to sort at once.

**Quickselect — average O(n), the fastest option for a one-off query on an in-memory array:**

```csharp
// O(n) average, O(n^2) worst case (mitigated by a random pivot), O(1) extra space
int KthLargestQuickselect(int[] nums, int k)
{
    int targetIndex = nums.Length - k; // kth largest = (n-k)th smallest in 0-indexed sorted order
    int lo = 0, hi = nums.Length - 1;
    var rng = new Random();

    while (lo < hi)
    {
        int pivotIndex = Partition(nums, lo, hi, rng.Next(lo, hi + 1));
        if (pivotIndex == targetIndex) return nums[targetIndex];
        if (pivotIndex < targetIndex) lo = pivotIndex + 1;
        else hi = pivotIndex - 1;
    }
    return nums[lo];
}

int Partition(int[] nums, int lo, int hi, int pivotIndex)
{
    int pivotValue = nums[pivotIndex];
    (nums[pivotIndex], nums[hi]) = (nums[hi], nums[pivotIndex]); // move pivot to the end
    int storeIndex = lo;
    for (int i = lo; i < hi; i++)
        if (nums[i] < pivotValue)
            (nums[i], nums[storeIndex++]) = (nums[storeIndex], nums[i]);
    (nums[storeIndex], nums[hi]) = (nums[hi], nums[storeIndex]); // move pivot to its final sorted position
    return storeIndex;
}
```

**Why quickselect is O(n) average:** it's structurally a quicksort partition step (same mechanism as Intermediate Q3), but after partitioning, it only **recurses into the single side that contains the target index**, discarding the other side entirely rather than sorting it. Each partition pass does O(current range size) work, and the range size shrinks geometrically (roughly halving on average with a good pivot), giving a total of `O(n + n/2 + n/4 + ...) = O(n)`. A poorly chosen pivot on adversarial or already-sorted input degrades this to O(n²) — the same failure mode as quicksort — which is why picking a **random** pivot index (rather than always `lo` or `hi`) is essential for guarding against adversarial input.

| Approach | Time | Space | Best when |
|---|---|---|---|
| Sort | O(n log n) | O(1) | Simplicity matters more than speed; need multiple order statistics |
| Min-heap of size k | O(n log k) | O(k) | Streaming data, or `k` is small and repeated queries are needed |
| Quickselect | O(n) average | O(1) | One-off query on an in-memory array, average case matters more than worst case |

**Common pitfall:** using a fixed pivot choice (e.g. always the last element) in quickselect — on already-sorted or reverse-sorted input, this degrades every partition to the worst-case split, turning O(n) into O(n²), the exact scenario a random or median-of-three pivot is meant to guard against.

---

## Scenario — Question 9

**Q9: Given a string, find the length of the longest substring without repeating characters. Walk through the naive approach and the sliding window optimization.**

**The naive approach — check every substring:**

```csharp
// O(n^3) — O(n^2) substrings, each requiring an O(n) uniqueness check
int LongestUniqueSubstringNaive(string s)
{
    int maxLen = 0;
    for (int i = 0; i < s.Length; i++)
        for (int j = i; j < s.Length; j++)
        {
            var substring = s.Substring(i, j - i + 1);
            if (substring.Distinct().Count() == substring.Length) // are all characters unique?
                maxLen = Math.Max(maxLen, substring.Length);
        }
    return maxLen;
}
```

Correct but wasteful — every candidate substring is re-checked for duplicates from scratch, and most of that work is repeated across overlapping substrings that share most of their characters.

**The optimized approach — a variable-size sliding window with a last-seen-index map:**

```csharp
// O(n) time, O(min(n, charset size)) space
int LongestUniqueSubstringOptimal(string s)
{
    var lastSeenIndex = new Dictionary<char, int>();
    int maxLen = 0, windowStart = 0;

    for (int windowEnd = 0; windowEnd < s.Length; windowEnd++)
    {
        char c = s[windowEnd];
        if (lastSeenIndex.TryGetValue(c, out int prevIndex) && prevIndex >= windowStart)
        {
            windowStart = prevIndex + 1; // jump left boundary past the previous occurrence directly
        }
        lastSeenIndex[c] = windowEnd;
        maxLen = Math.Max(maxLen, windowEnd - windowStart + 1);
    }
    return maxLen;
}
```

**Why this is O(n), not O(n²):** unlike the fixed-size window in Beginner Q8, this window's left boundary (`windowStart`) grows and shrinks dynamically — it expands (via `windowEnd`) until a repeated character is found, then jumps forward. The key optimization is storing each character's **last seen index** in a `Dictionary<char,int>` rather than a plain `HashSet<char>`: with a `HashSet`, shrinking the window on a duplicate requires removing characters one at a time from the left until the duplicate is gone — still O(n) amortized overall, but with more bookkeeping. With the last-seen-index map, `windowStart` can jump **directly** to `prevIndex + 1` in O(1), since we already know exactly where the conflicting character was. Both pointers only ever move forward across the whole string, so total work is bounded by **O(n)**.

**Why the `prevIndex >= windowStart` check matters:** a character's last-seen index might be *stale* — from a previous window that's already been abandoned (before `windowStart`). Jumping `windowStart` backward based on a stale index would incorrectly shrink the window; the check ensures we only react to duplicates that are actually inside the *current* window.

**Common pitfall:** forgetting the `prevIndex >= windowStart` guard and moving `windowStart` backward on a stale duplicate — this can make the window "expand" incorrectly and report a longer unique substring than actually exists.

---

## Scenario — Question 10

**Q10: Design and implement an LRU (Least Recently Used) cache from scratch, with O(1) `Get` and `Put`.**

**The requirement:** a fixed-capacity cache where both `Get(key)` and `Put(key, value)` run in **O(1)**, and when the cache is full and a new key is inserted, the **least recently used** entry (the one that hasn't been accessed the longest) is evicted to make room.

**Why a single data structure can't do this alone:** a `Dictionary<TKey,TValue>` alone gives O(1) lookup but has no notion of "usage recency" — finding the least-recently-used entry would require scanning everything, O(n). A `LinkedList<T>` alone can maintain recency order (move accessed items to the front, evict from the back) in O(1) *once you already have a reference to the node*, but finding a node by key would require an O(n) scan. **Combining both** gives O(1) for everything: the dictionary maps `key → node reference` for instant lookup, and the doubly linked list maintains the recency ordering, with the dictionary's node reference letting you splice that exact node out of (and back into) the list in O(1) without any search.

```csharp
class LruCache<TKey, TValue>
{
    private readonly int _capacity;
    private readonly Dictionary<TKey, LinkedListNode<(TKey key, TValue value)>> _map = new();
    private readonly LinkedList<(TKey key, TValue value)> _order = new(); // front = most recently used

    public LruCache(int capacity) => _capacity = capacity;

    public bool TryGet(TKey key, out TValue value)
    {
        if (_map.TryGetValue(key, out var node))
        {
            _order.Remove(node);
            _order.AddFirst(node);       // O(1): mark as most recently used
            value = node.Value.value;
            return true;
        }
        value = default!;
        return false;
    }

    public void Put(TKey key, TValue value)
    {
        if (_map.TryGetValue(key, out var existing))
        {
            _order.Remove(existing);
            _map.Remove(key);
        }
        else if (_map.Count >= _capacity)
        {
            var lru = _order.Last;                 // back of the list = least recently used
            _order.RemoveLast();
            _map.Remove(lru!.Value.key);            // must evict from BOTH structures
        }

        var node = new LinkedListNode<(TKey, TValue)>((key, value));
        _order.AddFirst(node);
        _map[key] = node;
    }
}
```

**Why the doubly linked list specifically (not a singly linked list):** moving an accessed node to the front requires **removing it from its current position**, which means updating the pointers of both its previous and next neighbors. A doubly linked list gives O(1) access to both neighbors directly from the node itself (`node.Previous`, `node.Next` internally); a singly linked list would need an O(n) walk from the head just to find the node *before* the one being removed, defeating the O(1) goal entirely. This is the same trade-off discussed in Beginner Q2 — here it's specifically the reason a doubly linked list is the correct structural choice.

**Complexity:** `TryGet` and `Put` are both **O(1)** — a dictionary lookup plus a constant number of linked-list pointer operations, regardless of cache size.

**Common pitfalls:** evicting from the linked list but forgetting to also remove the corresponding entry from the dictionary (or vice versa) — the two structures must always stay in sync, or you end up with a stale dictionary entry pointing at a node that's no longer in the recency list (a subtle memory leak and correctness bug); and forgetting to move a node to the front on `Get` as well as `Put` — a cache that only updates recency on writes isn't a true LRU cache, since reads are supposed to count as "use" too.

#### Follow-up: How would you extend this to a Least-Frequently-Used (LFU) cache instead?

LFU evicts the entry with the *lowest access count* (breaking ties by recency), which requires tracking a frequency count per key in addition to recency. The standard O(1) LFU design uses a `Dictionary<key, node>` for lookup (same as LRU) plus a `Dictionary<frequency, doubly-linked-list-of-keys-at-that-frequency>`, along with a tracked `minFrequency` pointer — each access increments a key's frequency and moves it from its old frequency's list to the new one, and eviction pulls from the list at `minFrequency`. It's structurally the same "hash map plus linked list" idea as LRU, just with an added layer bucketing entries by frequency instead of a single global recency order.

---
