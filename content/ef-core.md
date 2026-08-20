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
