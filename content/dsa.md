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
