# Entity Framework Core — Q&A

## Beginner — Question 1

**Q1: What is a `DbContext` and how does it relate to `DbSet`?**

In Entity Framework Core (EF Core), the `DbContext` is the primary class that acts as a bridge between your application domain classes and the database. It is responsible for establishing the connection, managing transactions, and tracking changes to objects.

A `DbSet<TEntity>` represents a collection of a specific entity type (e.g., `DbSet<User>`). It conceptually corresponds to a table in the database, and it allows you to write LINQ queries that EF Core translates into SQL queries against that table.

**The Mechanism:**
When you instantiate or inject a `DbContext`, it establishes an isolated session with the database. 
```csharp
public class AppDbContext : DbContext {
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // Each DbSet represents a table
    public DbSet<User> Users { get; set; }
    public DbSet<Order> Orders { get; set; }
}
```
When you query `context.Users.ToList()`, the `DbContext` translates the LINQ expression into a `SELECT` statement, executes it via ADO.NET, materializes the results into C# `User` objects, and returns them.

**Common Pitfalls:**
Treating `DbContext` as a Singleton. A `DbContext` is designed to have a short lifespan (usually tied to a single HTTP request in ASP.NET Core via `AddDbContext` which defaults to Scoped). Sharing a single `DbContext` instance across multiple concurrent threads will result in `InvalidOperationException` because it is not thread-safe.

---

## Intermediate — Question 1

**Q1: Explain the difference between Eager, Explicit, and Lazy Loading.**

These are three distinct strategies EF Core uses to load related entities (navigation properties) from the database.

1. **Eager Loading (`Include`):**
   - Related data is loaded from the database as part of the initial query.
   - **Mechanism:** EF Core generates a SQL `JOIN` to retrieve both the primary entity and its related entities in a single database round-trip.
   - **Use case:** When you know you will definitely need the related data immediately.
   ```csharp
   // Generates a JOIN on Authors and Books
   var author = context.Authors.Include(a => a.Books).FirstOrDefault();
   ```

2. **Explicit Loading (`Load`):**
   - Related data is explicitly requested from the database *after* the primary entity has already been loaded.
   - **Mechanism:** Triggers a second, separate SQL query when you explicitly call `Load()`.
   - **Use case:** When you only conditionally need the related data based on some business logic evaluated in memory.
   ```csharp
   var author = context.Authors.FirstOrDefault();
   if (someCondition) {
       context.Entry(author).Collection(a => a.Books).Load(); // Second query
   }
   ```

3. **Lazy Loading:**
   - Related data is transparently loaded from the database the moment the navigation property is accessed in code.
   - **Mechanism:** EF Core generates proxy classes (at runtime) that inherit from your entity. When the property getter is called, the proxy intercepts the call and executes a SQL query if the data isn't loaded yet.
   - **Common Pitfall:** The **N+1 Query Problem**. If you load 100 authors and then iterate over them to print their books, Lazy Loading will execute 1 query for the authors, and 100 separate queries for the books (101 queries total). This destroys performance. Because of this danger, Lazy Loading is disabled by default in EF Core.

---

## Intermediate — Question 2

**Q2: How does EF Core's Change Tracking work?**

Change Tracking is the mechanism EF Core uses to figure out what data has changed in memory so it can generate the correct `UPDATE`, `INSERT`, or `DELETE` SQL statements when you call `SaveChanges()`.

**The Mechanism:**
When an entity is queried from the database, the `DbContext` attaches it to its internal `ChangeTracker`. The tracker stores a "snapshot" of the entity's original values.
1. When you modify a property on the entity, you are modifying the in-memory C# object.
2. When you call `SaveChanges()`, EF Core scans all tracked entities and compares their current property values against the original snapshot values.
3. For any differences found, it changes the `EntityState` to `Modified` and generates an `UPDATE` statement targeting *only* the columns that changed.

```csharp
var user = context.Users.First(u => u.Id == 1);
user.Name = "New Name"; // Modified in memory
// ChangeTracker compares original snapshot vs current state
context.SaveChanges(); // Generates UPDATE Users SET Name = 'New Name' WHERE Id = 1;
```

#### Follow-up: How do you bypass Change Tracking for read-only queries?
If you are querying data just to display it (e.g., building a JSON response for an API) and have no intention of updating it, you should use `AsNoTracking()`.
```csharp
var users = context.Users.AsNoTracking().ToList();
```
This tells EF Core not to store snapshots in the ChangeTracker. This significantly reduces memory usage and improves CPU performance for the query.

---

## Advanced — Question 1

**Q1: What are EF Core Migrations and how do they work under the hood?**

EF Core Migrations provide a way to incrementally update the database schema to keep it in sync with your application's C# data model, while preserving existing data in the database.

**The Mechanism:**
1. **Model Snapshot:** When you run `Add-Migration`, EF Core examines your current `DbContext` and entity classes to build an in-memory model of what the database *should* look like.
2. It compares this new model against the `ModelSnapshot.cs` file (which represents the schema from the *last* migration).
3. It generates a new Migration class with `Up()` and `Down()` methods containing C# instructions representing the exact schema differences (e.g., `migrationBuilder.AddColumn(...)`).
4. It updates the `ModelSnapshot.cs` file to reflect the new state.
5. When you run `Update-Database`, EF Core queries a special table in your database called `__EFMigrationsHistory`. It compares the migrations in your codebase against the records in this table.
6. It translates the `Up()` methods of any unapplied migrations into raw SQL DDL (Data Definition Language) statements and executes them, then inserts a record into `__EFMigrationsHistory` to mark them as applied.

**Common Pitfalls:**
- **Merge Conflicts:** If two developers create migrations on different branches, the `ModelSnapshot.cs` will conflict. Fixing it requires rolling back one migration, resolving the merge, and regenerating the migration so the snapshot accurately reflects both sets of changes.
- **Data Loss:** If you rename a property in C#, EF Core might interpret it as dropping the old column and creating a new one (losing all data). You must manually inspect the generated `Up()` method and rewrite it to use `migrationBuilder.RenameColumn()` before applying it.

---

## Advanced — Question 2

**Q2: How does Change Tracking work in EF Core, and what is the difference between Tracked and No-Tracking queries?**

**Change Tracking:**
When you query entities using EF Core, the `DbContext` keeps a reference to the loaded objects in memory and tracks any modifications made to their properties. When you call `SaveChanges()`, EF Core inspects this "snapshot" to determine exactly which `UPDATE`, `INSERT`, or `DELETE` SQL statements need to be generated and sent to the database.

**Tracked Queries (Default):**
```csharp
var user = _db.Users.First(u => u.Id == 1);
user.Name = "Alice";
_db.SaveChanges(); // Automatically generates UPDATE Users SET Name='Alice' WHERE Id=1
```
- *Pros:* Easy to update data.
- *Cons:* High memory footprint (EF stores a duplicate copy of the original state for comparison) and slower performance.

**No-Tracking Queries:**
```csharp
var users = _db.Users.AsNoTracking().ToList();
```
- If you use `AsNoTracking()`, EF Core reads the data from the database, constructs the C# objects, and immediately "forgets" about them.
- *Pros:* Significantly faster execution and lower memory usage.
- *Cons:* You cannot simply modify the object and call `SaveChanges()`.

**Best Practice:**
If a query is strictly for **reading** data (e.g., returning a JSON payload to a web client), *always* append `.AsNoTracking()`. Only use the default tracking behavior if you explicitly intend to modify the retrieved entities within the same HTTP request.

---

## Scenario — Question 1

**Q1: You have an ASP.NET Core API using EF Core to update a `BankAccount` balance. User A and User B both call the `Withdraw` API at the exact same millisecond. They both load the account (Balance = $100). User A withdraws $50, saves, and sets balance to $50. User B withdraws $50, saves, and sets balance to $50. The bank just lost $50. How do you prevent this?**

This is a classic "Lost Update" concurrency problem. EF Core does not inherently lock rows in the database just because you `Select` them.

**The Solution: Optimistic Concurrency Tokens (RowVersion)**

EF Core uses Optimistic Concurrency control. Instead of locking the row (Pessimistic concurrency), it allows both users to read the data, but ensures the second user's update fails if the data changed underneath them.

**The Mechanism:**
1. You add a `byte[]` property to your `BankAccount` entity called `RowVersion`.
2. You configure this property in EF Core as a Concurrency Token (usually by data annotation `[Timestamp]` or fluent API `IsRowVersion()`).
3. In SQL Server, this generates a `ROWVERSION` column. The database engine *automatically* changes the bytes in this column every single time the row is updated.

**The Flow:**
- User A and User B query the account. Both receive `RowVersion = 0x01`.
- User A saves. EF Core generates: `UPDATE Account SET Balance = 50 WHERE Id = 1 AND RowVersion = 0x01`. It succeeds. The DB automatically changes the RowVersion to `0x02`.
- User B saves. EF Core generates: `UPDATE Account SET Balance = 50 WHERE Id = 1 AND RowVersion = 0x01`.
- Because User A caused the RowVersion to change to `0x02`, User B's `WHERE RowVersion = 0x01` clause matches ZERO rows. 
- EF Core detects that 0 rows were updated and immediately throws a `DbUpdateConcurrencyException`. 
- Your application catches this exception and tells User B: "The account was modified by someone else, please refresh and try again."

---

## Scenario — Question 2

**Q2: You have a batch processing job that needs to update the `Status` of 10,000 `Order` records from "Processing" to "Shipped". Using standard EF Core `SaveChanges()`, this takes several minutes and times out. How do you rewrite this to execute instantly?**

Standard EF Core Change Tracking is designed for small, discrete updates, not massive bulk operations.

**The Flaw:**
If you load 10,000 orders into memory, modify them, and call `SaveChanges()`, EF Core will generate 10,000 separate `UPDATE` SQL statements and send them to the database (even if batched, it's still 10,000 statements). You are also consuming massive amounts of RAM to track 10,000 entities in the Change Tracker.

**The Solution: `ExecuteUpdate` (EF Core 7+)**
You completely bypass the Change Tracker and execute a direct, bulk SQL update.

**The Mechanism:**
Instead of pulling the data into memory, you write a LINQ query to filter the records, and then immediately call `ExecuteUpdate()` (or `ExecuteUpdateAsync()`).

```csharp
await _context.Orders
    .Where(o => o.Status == "Processing")
    .ExecuteUpdateAsync(setters => setters
        .SetProperty(o => o.Status, "Shipped")
        .SetProperty(o => o.ShippedDate, DateTime.UtcNow));
```

**Result:**
EF Core instantly translates this into a single, highly efficient SQL statement:
`UPDATE Orders SET Status = 'Shipped', ShippedDate = GETUTCDATE() WHERE Status = 'Processing'`.
The entire operation executes on the database server in milliseconds, using zero application memory, because the entities are never actually loaded into C#. (For deletes, use `ExecuteDelete()`).

---

## Scenario — Question 3

**Q3: A developer configures a `DbContext` in `Program.cs` as a Singleton service (`builder.Services.AddDbContext<AppDbContext>(..., ServiceLifetime.Singleton)`). Over the course of the day, the application's memory usage grows infinitely until it crashes with an OutOfMemory exception. What is the root cause?**

The root cause is a fundamental misunderstanding of the `DbContext` lifecycle and Change Tracking.

**The Flaw:**
A `DbContext` is designed to be a short-lived unit of work, typically scoped to a single HTTP request (which is the default behavior of `AddDbContext`).
When you query entities, the `DbContext`'s internal `ChangeTracker` stores a reference to every single entity it materializes from the database. 
If the `DbContext` is a Singleton, it lives for the entire lifetime of the application. Therefore, every single row queried by every single user over the entire day is cached indefinitely inside that single `DbContext` instance's `ChangeTracker`. The Garbage Collector can never clean them up because the active `DbContext` holds a strong reference to them. 
Furthermore, `DbContext` is **not thread-safe**, meaning simultaneous HTTP requests attempting to use the same Singleton instance will cause concurrency exceptions.

**The Fix:**
Always use the default `ServiceLifetime.Scoped` for `DbContext`. The framework will create a new instance at the beginning of an HTTP request and properly dispose of it (and its tracking cache) at the end of the request.

---

## Scenario — Question 4

**Q4: A complex EF Core LINQ query involving multiple `Include` statements and filtering logic executes perfectly on the developer's local machine using a small subset of test data. However, in production with millions of rows, the query causes a massive CPU spike on the web server and eventually throws an `OutOfMemoryException`. Upon investigating the SQL logs, you notice the SQL query being generated is extremely simple and lacks the `WHERE` clauses from your LINQ statement. What caused this?**

This is the dreaded **Client-Side Evaluation** problem (which was partially disabled in EF Core 3.0+, but can still manifest when mixing `IEnumerable` vs `IQueryable` incorrectly).

**The Flaw:**
If a developer accidentally calls `.AsEnumerable()`, `.ToList()`, or passes the `IQueryable` into a method that only accepts `IEnumerable` *before* applying the `.Where()` filters, the SQL query is immediately executed. 
EF Core stops translating LINQ to SQL the moment the type shifts from `IQueryable` to `IEnumerable`.

```csharp
// THE FLAW: Calling ToList() too early!
var activeUsers = _context.Users
    .Include(u => u.Orders)
    .ToList() // <--- FATAL MISTAKE: Executes "SELECT * FROM Users JOIN Orders"
    .Where(u => u.IsActive && u.Orders.Count > 10); // Filters applied in server RAM
```
This forces the database to return all millions of rows over the network to the web server. The web server then consumes gigabytes of RAM instantiating C# objects for every row, only to filter out 99% of them in memory.

**The Solution:**
Ensure all filtering (`Where`), sorting (`OrderBy`), and pagination (`Skip/Take`) are applied strictly to the `IQueryable` interface *before* invoking terminal execution methods like `.ToList()`, `.ToArray()`, or `FirstOrDefault()`.

```csharp
// THE FIX: Maintain IQueryable until the end
var activeUsers = _context.Users
    .Include(u => u.Orders)
    .Where(u => u.IsActive && u.Orders.Count > 10) // Translated into SQL WHERE clause
    .ToList(); // Executes optimized SQL returning only the matching rows
```

---

## Beginner — Question 2

**Q2: What is the difference between EF Core and Dapper, and when would you choose each?**

Both are data-access libraries for .NET, but they sit at opposite ends of the abstraction spectrum.

**EF Core (a full ORM):**
```csharp
var product = context.Products
    .Include(p => p.Category)
    .FirstOrDefault(p => p.Id == 5);
```
- Translates LINQ into SQL for you, tracks changes, generates migrations, and manages relationships/navigation properties automatically.
- Trade-off: more abstraction overhead — the generated SQL isn't always what a human would hand-write, and complex queries can sometimes produce inefficient plans.

**Dapper (a micro-ORM):**
```csharp
var product = connection.QueryFirstOrDefault<Product>(
    "SELECT * FROM Products WHERE Id = @Id", new { Id = 5 });
```
- You write the raw SQL yourself; Dapper's only job is mapping the result set's columns onto your C# object's properties efficiently via reflection (cached per type).
- No change tracking, no migrations, no LINQ translation — just fast, predictable object-mapping on top of ADO.NET.

**When to choose which:**
- **EF Core** for typical CRUD-heavy application code, where developer productivity, migrations, and maintainability matter more than squeezing out the last millisecond of query time.
- **Dapper** for performance-critical read paths (reporting dashboards, high-throughput endpoints) where you want full control over the exact SQL executed, or for complex queries EF Core would translate poorly.

**Common Pitfall:** treating this as an all-or-nothing choice. Many production codebases use EF Core for the bulk of the application and drop down to Dapper (or raw ADO.NET / `FromSqlRaw`) for a handful of specific, performance-critical queries — the two coexist fine in the same project.

---

## Intermediate — Question 3

**Q3: What are Shadow Properties and Owned Types in EF Core?**

Both let you model data that doesn't map cleanly onto a simple "one property per column" C# class, without resorting to raw SQL.

**Shadow Properties** — a column exists in the database, but *no corresponding property exists on your C# class*. EF Core tracks it internally.
```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.Entity<Order>().Property<DateTime>("LastModified");
}

// Reading/writing a shadow property requires the ChangeTracker API, not a normal property:
context.Entry(order).Property("LastModified").CurrentValue = DateTime.UtcNow;
```
Commonly used for audit columns (`CreatedAt`, `LastModified`) that the application shouldn't be able to accidentally set directly — only infrastructure code (like a `SaveChanges` override) touches them.

**Owned Types (Value Objects)** — a class with no identity of its own that's always embedded inside its owner, mapped either as extra columns on the same table (default) or as a separate table.
```csharp
public class Address {                 // no Id — not an entity, a value object
    public string Street { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
}
public class Customer {
    public int Id { get; set; }
    public Address ShippingAddress { get; set; } = new(); // owned
}

modelBuilder.Entity<Customer>().OwnsOne(c => c.ShippingAddress);
// Generates: Customers table with ShippingAddress_Street, ShippingAddress_City columns
```

**Why this matters:** Owned Types let your domain model stay expressive (a real `Address` class instead of loose `string Street`/`string City` fields scattered on `Customer`) while EF Core still flattens it into simple columns under the hood — no separate table or join required unless you explicitly configure one.

**Common Pitfall:** trying to share a single Owned Type *instance* across two different owners — Owned Types are conceptually "owned" by exactly one entity instance; EF Core will throw if you try to reuse the same object reference for two owners' `ShippingAddress` properties.

---

## Advanced — Question 3

**Q3: What are EF Core Compiled Models, and when do they meaningfully help startup performance?**

Every time your application starts, EF Core has to build an internal in-memory representation of your entire data model (every entity, relationship, and configured convention) by reflecting over your `DbContext` and entity classes — this is the **model-building phase**, and for large models it's surprisingly expensive.

**The Mechanism (without compiled models):**
On first use, EF Core reflects over all your `OnModelCreating` configuration, Data Annotations, and conventions, builds an `IModel` object graph, and caches it for the app's lifetime. For a model with dozens or hundreds of entities and complex relationships, this reflection-heavy process can take a noticeable chunk of a cold start — hundreds of milliseconds to a few seconds.

**Compiled Models (EF Core 6+):**
```bash
dotnet ef dbcontext optimize --output-dir CompiledModels
```
This CLI command runs the model-building logic **ahead of time**, at build/publish time, and generates plain C# source files representing the model directly — no reflection needed at runtime.

```csharp
// Program.cs — opt into the pre-built model
optionsBuilder.UseSqlServer(connectionString)
              .UseModel(MyAppContextModel.Instance); // generated compiled model
```

**When it meaningfully helps:**
- **Serverless / Azure Functions / short-lived containers** where cold-start latency directly impacts user-facing response time and the app doesn't stay warm long enough to amortize the one-time model-building cost.
- **Large models** (50+ entity types with complex relationships) — the win is negligible for a handful of entities.

**Common Pitfall:** forgetting to regenerate the compiled model after changing your entity classes or `OnModelCreating` configuration — the compiled model is a point-in-time snapshot, and EF Core will throw a runtime exception at startup if the compiled model's shape doesn't match what your `DbContext` actually declares, since it can no longer safely assume the two are in sync.

---

## Beginner — Question 3

**Q3: What is the difference between `SaveChanges()` and `SaveChangesAsync()`, and does it actually matter for a simple console app versus an ASP.NET Core API?**

Both persist the `DbContext`'s tracked changes to the database — the difference is purely about whether the calling thread blocks while waiting for the database round-trip.

```csharp
context.SaveChanges();       // blocks the calling thread until the DB responds
await context.SaveChangesAsync(); // frees the thread to do other work while waiting
```

**Why it matters enormously in ASP.NET Core, and barely at all in a simple console app:**
- In a web API, the calling thread is a **Thread Pool thread** shared across potentially thousands of concurrent requests. Calling the synchronous `SaveChanges()` blocks that thread for the entire database round-trip — under load, this is exactly the thread-pool-starvation problem covered elsewhere (many blocked threads waiting on I/O, no threads left to handle new incoming requests).
- In a simple single-threaded console app or a one-off script, there's no thread pool being shared across concurrent work — blocking "the" thread while it's the only thing happening anyway costs essentially nothing, since there was no other work that thread could have picked up instead.

**Common Pitfall:** using synchronous EF Core methods (`ToList()`, `SaveChanges()`, `Find()`) inside an ASP.NET Core controller action out of habit or copy-pasted from a console-app tutorial — this is one of the most common sources of the "thread pool starvation under load" performance bug, precisely because it works fine in local testing (low concurrency) and only degrades once real production traffic arrives.

---

## Intermediate — Question 4

**Q4: What is a Global Query Filter in EF Core, and what's a common pitfall when combining it with `.Include()` for related entities?**

A Global Query Filter is a `Where` clause EF Core automatically applies to **every** query against a given entity type, configured once in `OnModelCreating` — commonly used for soft-delete (`IsDeleted == false`) or multi-tenancy (`TenantId == currentTenant`) so every developer doesn't have to remember to add that filter manually to every single query.

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.Entity<Order>().HasQueryFilter(o => !o.IsDeleted);
}

var orders = context.Orders.ToList(); // automatically becomes: WHERE IsDeleted = 0
```

**The pitfall — filters on related entities loaded via `.Include()` still apply, sometimes surprisingly:**
```csharp
modelBuilder.Entity<OrderLine>().HasQueryFilter(l => !l.IsDeleted);

var order = context.Orders.Include(o => o.Lines).First(o => o.Id == 5);
// If Order #5 has 3 lines but one is soft-deleted, `order.Lines` only contains 2 --
// the OrderLine's OWN query filter silently applied even though you only filtered on Order
```
This is usually the *desired* behavior (a soft-deleted line shouldn't appear anywhere), but it surprises developers who expect `.Include()` to load *all* related rows verbatim — the filter applies transparently to every entity type that has one configured, regardless of how deeply it's loaded via navigation properties.

**Bypassing the filter when you genuinely need to see filtered-out rows (e.g., an admin "restore deleted item" screen):**
```csharp
var allOrdersIncludingDeleted = context.Orders.IgnoreQueryFilters().ToList();
```

**Common Pitfall:** forgetting that a Global Query Filter referencing a scoped/injected value (like the current tenant ID) requires that value to be available for the *entire lifetime* of the `DbContext` — if the tenant context changes mid-request in a way the `DbContext` doesn't pick up, queries can silently keep filtering by a stale tenant ID until a new `DbContext` instance is created for the next request.

---

## Advanced — Question 4

**Q4: What is the difference between `IQueryable<T>` composition and calling `.AsEnumerable()` partway through a query chain, and why does the order of operations matter so much for performance?**

Both eventually produce results, but where you switch from `IQueryable<T>` (translated to SQL) to `IEnumerable<T>` (executed in application memory) determines whether filtering/sorting happens in the database or after pulling potentially large amounts of data into the app's RAM.

**Filtering entirely in the database — efficient:**
```csharp
var results = context.Orders
    .Where(o => o.Status == "Pending")   // still IQueryable -- becomes part of the SQL WHERE clause
    .OrderBy(o => o.CreatedDate)          // still IQueryable -- becomes SQL ORDER BY
    .ToList();                             // NOW executes -- one optimized SQL query, only matching rows returned
```

**Switching to `IEnumerable` too early — filtering happens in application memory instead:**
```csharp
var results = context.Orders
    .AsEnumerable()                        // switches to IEnumerable HERE
    .Where(o => o.Status == "Pending")     // now a plain C# LINQ-to-Objects filter, NOT SQL
    .OrderBy(o => o.CreatedDate)
    .ToList();
// The database returns EVERY row in Orders first, THEN the app filters/sorts in memory
```
The moment `.AsEnumerable()` (or `.ToList()`, or passing to a method typed as `IEnumerable<T>`) is called, every subsequent LINQ operator uses the plain in-memory LINQ-to-Objects implementation rather than EF Core's SQL-translating provider — the database has already sent back the *entire* unfiltered table by that point, and all the "filtering" happening afterward is just discarding most of what was needlessly transferred over the network.

**Why this sometimes happens accidentally, not just as an obvious mistake:** calling a method containing custom logic EF Core's SQL translator doesn't understand (a private C# helper method, a complex conditional not expressible in SQL) forces an implicit switch to client-side evaluation for that specific step — EF Core 3.0+ throws an exception for this rather than silently doing it (older EF Core versions silently client-evaluated, which was its own performance trap), but developers unaware of *why* their query throws sometimes "fix" it by prematurely calling `.AsEnumerable()`/`.ToList()` far earlier in the chain than necessary, reintroducing the exact performance problem the exception was trying to prevent.

**Common Pitfall:** treating any `IQueryable`-breaking exception as "just call `.ToList()` right before the problematic line" without checking whether that materializes the *entire* table first — the fix should isolate exactly which single operation needs client-side evaluation and keep everything else, including any filtering that can stay server-side, translated to SQL for as long as possible.

---

## Beginner — Question 4

**Q4: What is the difference between `Add()`, `Attach()`, and `Update()` on a `DbContext`, and why does mixing them up cause EF Core to generate the wrong SQL statement?**

All three add an entity to the `DbContext`'s change tracker, but they set a different initial `EntityState` — which directly determines whether `SaveChanges()` generates an `INSERT`, an `UPDATE`, or nothing at all.

```csharp
var product = new Product { Id = 5, Name = "Keyboard" };

context.Products.Add(product);      // EntityState.Added -> SaveChanges() generates an INSERT
context.Products.Attach(product);   // EntityState.Unchanged -> SaveChanges() does NOTHING for this entity
context.Products.Update(product);   // EntityState.Modified -> SaveChanges() generates an UPDATE for EVERY property
```

**Why this matters in a common real-world scenario — receiving an entity from an API request that should update an existing row:**
```csharp
[HttpPut("{id}")]
public IActionResult UpdateProduct(int id, Product product)
{
    context.Products.Update(product); // marks it Modified -- generates UPDATE for ALL columns
    context.SaveChanges();
}
```
`Update()` marks *every* property as modified, regardless of whether it actually changed — this generates an `UPDATE` statement touching every column, even ones that were identical to what's already in the database. For a table with many columns (or ones with database-level triggers reacting to specific column changes), this can be wasteful or produce unintended side effects compared to a targeted update of only the fields that actually changed.

**Common Pitfall:** calling `Add()` on an entity that already exists in the database (has a non-default primary key from a previous save) — since `Add()` always marks the entity `Added`, EF Core attempts an `INSERT` with a primary key that already exists, producing a primary-key-violation exception at the database level rather than the intended update.

---

## Intermediate — Question 5

**Q5: What is EF Core's `TPH` (Table Per Hierarchy) inheritance mapping strategy, and what's the trade-off against `TPT` (Table Per Type)?**

When a C# class hierarchy (e.g., `Payment` with subclasses `CreditCardPayment` and BankTransferPayment) needs to be persisted, EF Core offers different strategies for mapping that inheritance onto relational tables — TPH and TPT represent opposite trade-offs between query simplicity and schema normalization.

**TPH (Table Per Hierarchy) — one single table for the entire hierarchy, EF Core's default:**
```csharp
public abstract class Payment { public int Id; public decimal Amount; }
public class CreditCardPayment : Payment { public string CardNumber; }
public class BankTransferPayment : Payment { public string IBAN; }
```
```sql
-- ONE table, with a "discriminator" column and NULLABLE columns for every subclass's fields
CREATE TABLE Payments (
    Id INT, Amount DECIMAL, Discriminator NVARCHAR(50),
    CardNumber NVARCHAR(20) NULL,   -- NULL for BankTransferPayment rows
    IBAN NVARCHAR(34) NULL          -- NULL for CreditCardPayment rows
);
```
Querying the base type or any subtype requires **no joins at all** — everything lives in one table — but the table accumulates nullable columns for every subclass's fields, and the schema doesn't enforce "a CreditCardPayment must have a CardNumber" the way a dedicated table's `NOT NULL` constraint could.

**TPT (Table Per Type) — a separate table per class, joined via shared primary keys:**
```sql
CREATE TABLE Payments (Id INT PRIMARY KEY, Amount DECIMAL);
CREATE TABLE CreditCardPayments (Id INT PRIMARY KEY REFERENCES Payments(Id), CardNumber NVARCHAR(20) NOT NULL);
CREATE TABLE BankTransferPayments (Id INT PRIMARY KEY REFERENCES Payments(Id), IBAN NVARCHAR(34) NOT NULL);
```
This properly normalizes the schema (each subclass's specific fields can be `NOT NULL`, genuinely enforced), but querying a specific subtype (or the base type across all subtypes) now requires a `JOIN` between the base table and the relevant subtype table(s) — more relationally "correct," but with real query-performance cost as the hierarchy grows.

**Why TPH is EF Core's default despite the schema-normalization downside:** query performance — avoiding joins entirely for common operations (loading any `Payment` regardless of subtype) usually matters more in practice than the nullable-column schema imperfection, especially for hierarchies that aren't too deep or wide.

**Common Pitfall:** choosing TPT purely for "proper database normalization" without benchmarking the actual query performance impact on a hierarchy queried frequently — the join overhead is real and compounds with hierarchy depth, and many teams that start with TPT for its cleaner schema later migrate to TPH specifically after noticing query performance degrade as the application and hierarchy grow.

---

## Advanced — Question 5

**Q5: What is an EF Core Interceptor, and how does it differ from a SaveChanges override for implementing cross-cutting concerns like auditing or soft-delete?**

An `IInterceptor` (specifically `ISaveChangesInterceptor` for save operations, or `IDbCommandInterceptor` for raw SQL commands) lets you hook into EF Core's internal pipeline at specific points — reusable across multiple `DbContext` types, unlike overriding `SaveChanges()` directly on one specific context class.

**Overriding `SaveChanges()` directly — works, but tied to one specific `DbContext` class:**
```csharp
public class AppDbContext : DbContext
{
    public override int SaveChanges()
    {
        foreach (var entry in ChangeTracker.Entries<IAuditable>())
        {
            if (entry.State == EntityState.Added) entry.Entity.CreatedAt = DateTime.UtcNow;
        }
        return base.SaveChanges();
    }
}
```
This logic only applies to `AppDbContext` — a second `DbContext` class in the same solution (perhaps for a separate bounded context) would need this exact logic duplicated into its own override.

**An Interceptor — reusable across any `DbContext` it's registered with:**
```csharp
public class AuditingInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        foreach (var entry in eventData.Context!.ChangeTracker.Entries<IAuditable>())
        {
            if (entry.State == EntityState.Added) entry.Entity.CreatedAt = DateTime.UtcNow;
        }
        return result;
    }
}

// Registered once, works for ANY DbContext that opts in
optionsBuilder.AddInterceptors(new AuditingInterceptor());
```
The same `AuditingInterceptor` class can be registered against multiple different `DbContext` types across a solution — the auditing logic is written once, as a standalone, testable class, rather than copy-pasted into every context's `SaveChanges()` override.

**Where Interceptors go further than a `SaveChanges` override can — intercepting raw SQL commands:**
```csharp
public class SqlLoggingInterceptor : DbCommandInterceptor
{
    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        _logger.LogInformation("Executing SQL: {Sql}", command.CommandText); // logs EVERY query, not just saves
        return result;
    }
}
```
`SaveChanges()` overrides only ever see write operations — an interceptor can also observe every *read* query EF Core issues, useful for cross-cutting concerns like comprehensive SQL logging or query-level performance instrumentation that a `SaveChanges` override structurally cannot provide, since it only runs for writes.

**Common Pitfall:** implementing the exact same cross-cutting logic (soft-delete filtering, auditing timestamps) independently in multiple `DbContext` subclasses' `SaveChanges()` overrides across a growing solution — once that logic needs to apply consistently across more than one context, an Interceptor registered against all of them (rather than duplicated per-context overrides slowly drifting out of sync) is the more maintainable choice.

---
