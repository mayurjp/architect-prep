# SQL Server — Q&A

## Beginner — Question 1

**Q1: What are the ACID properties in a relational database?**

ACID is a set of properties of database transactions intended to guarantee data validity despite errors, power failures, or other mishaps.

1. **Atomicity:** "All or nothing." A transaction is treated as a single, indivisible unit. If any part of the transaction fails, the entire transaction fails, and the database state is left unchanged. 
2. **Consistency:** A transaction can only bring the database from one valid state to another. Any data written to the database must be valid according to all defined rules (constraints, cascades, triggers).
3. **Isolation:** Concurrent execution of transactions leaves the database in the same state that would have been obtained if the transactions were executed sequentially. One transaction cannot read data from another uncompleted transaction (depending on the Isolation Level).
4. **Durability:** Once a transaction has been committed, it will remain committed even in the case of a system failure (e.g., power outage or crash). This is typically achieved by flushing transaction logs to persistent storage before acknowledging the commit.

#### Follow-up: How do you enforce Atomicity in T-SQL?
You enforce Atomicity by wrapping your statements in a `BEGIN TRAN` and using a `TRY...CATCH` block. If an error occurs in the `CATCH` block, you execute `ROLLBACK TRAN`. If successful, you execute `COMMIT TRAN`.

---

## Intermediate — Question 1

**Q1: Explain the difference between a Clustered and a Non-Clustered Index.**

Indexes are used to quickly locate data without having to search every row in a database table every time it is accessed.

**Clustered Index:**
- Dictates the physical order of the data in the table. The leaf nodes of a clustered index *are* the actual data rows.
- Because data can only be physically sorted in one way, there can be **only one** clustered index per table (typically the Primary Key).
- Excellent for range queries (e.g., `WHERE Date > '2023-01-01'`) because the data is stored contiguously on disk.

**Non-Clustered Index:**
- A completely separate structure from the data rows. It contains the index key values and a pointer (a row locator) to the actual data row.
- You can have **multiple** non-clustered indexes per table.
- When a query uses a non-clustered index, the engine finds the pointer, and then performs a **Key Lookup** to fetch the rest of the row's data from the clustered index.

**The Mechanism (B-Tree):**
SQL Server organizes indexes using B-Trees (Balanced Trees). The engine navigates from the root node, down through intermediate nodes, to the leaf nodes. In a Clustered index, the leaf node is the full row. In a Non-Clustered index, the leaf node is the index key + the pointer.

**Common Pitfalls:**
Adding too many non-clustered indexes slows down `INSERT`, `UPDATE`, and `DELETE` operations because every time a row is modified, SQL Server must also update all the corresponding B-Trees. 

---

## Intermediate — Question 2

**Q2: What is an Execution Plan and how do you use it for performance tuning?**

An Execution Plan is a visual or XML representation of the step-by-step operations SQL Server's query optimizer will perform (or did perform) to execute a specific query.

**The Mechanism:**
When you submit a T-SQL query, the Query Optimizer analyzes it and looks at statistics (data distribution) and available indexes. It evaluates multiple possible ways to execute the query and chooses the one with the lowest estimated cost (CPU and I/O). It compiles this chosen method into an Execution Plan and caches it in memory.

**How to use it:**
When a query is running slowly, you view the **Actual Execution Plan** in SQL Server Management Studio (SSMS). You look for:
1. **Index Scans / Table Scans:** The engine had to read every row in an index/table. This is usually bad. You want to see **Index Seeks**, where the engine navigated directly to the relevant rows using the B-Tree.
2. **Key Lookups:** The query used a non-clustered index to find rows, but needed additional columns that weren't in the index, forcing it to look up the full row in the clustered index. *Fix: Add the required columns as `INCLUDE` columns to the non-clustered index.*
3. **Thick arrows:** The arrows between operators show the number of rows passed. If an arrow indicates 1 million rows were passed to a filter operator that reduced it to 10 rows, the query is highly inefficient.

---

## Advanced — Question 1

**Q1: Explain Transaction Isolation Levels and the phenomena they prevent.**

Isolation Levels control the degree to which a transaction must be isolated from the data modifications made by any other concurrent transaction. Higher isolation prevents data anomalies but severely impacts concurrency (locking).

**Read Phenomena:**
- **Dirty Read:** Reading uncommitted data from another transaction. (If that transaction rolls back, you read data that never existed).
- **Non-repeatable Read:** A transaction reads the same row twice, but gets different data because another transaction updated the row in between.
- **Phantom Read:** A transaction runs a query twice, but gets different *rows* because another transaction inserted or deleted data that matches the query conditions in between.

**Standard Isolation Levels (from lowest to highest protection):**

1. **Read Uncommitted:** No locks are issued. Dirty reads, non-repeatable reads, and phantom reads can occur. Extremely fast but risky.
2. **Read Committed (SQL Server Default):** Prevents dirty reads. A query will wait if the data it wants to read is currently being updated by another transaction. Non-repeatable and phantom reads can still occur.
3. **Repeatable Read:** Prevents dirty and non-repeatable reads. Locks are placed on all data read by the transaction until it finishes. This prevents other transactions from updating those specific rows. Phantom reads can still occur (new rows can be inserted).
4. **Serializable:** The strictest level. Prevents all three phenomena. It places range locks on the data, preventing other transactions from inserting, updating, or deleting any rows that fall into the range queried. This creates massive blocking and deadlocks.

**The Snapshot alternative:**
SQL Server also offers **Snapshot Isolation**, which uses row-versioning (storing older versions of rows in `tempdb`) rather than locking. This prevents read phenomena without blocking concurrent writers, at the cost of heavy `tempdb` usage.

#### Follow-up: What is a Deadlock?
A deadlock occurs when Transaction A holds a lock on Resource 1 and is waiting for a lock on Resource 2, while Transaction B holds a lock on Resource 2 and is waiting for a lock on Resource 1. Neither can proceed. SQL Server detects this and automatically kills one transaction (the "deadlock victim") to allow the other to proceed.

---

## Scenario — Question 1

**Q1: You have a SQL Server database for an e-commerce store. During peak hours (Black Friday), the `Orders` table receives thousands of `INSERT` statements per second. Simultaneously, a dashboard runs a massive aggregate `SELECT` query on the `Orders` table to calculate total sales. The dashboard query is causing the `INSERT` statements to block and timeout. How do you solve this without changing the application code?**

This is a classic concurrency problem where writers block readers, and readers block writers, because SQL Server's default isolation level is `Read Committed` (which uses shared locks for reading).

**The Solution: Read Committed Snapshot Isolation (RCSI)**

You need to enable RCSI at the database level.

**The Mechanism:**
1. You run `ALTER DATABASE MyDatabase SET READ_COMMITTED_SNAPSHOT ON;`.
2. When RCSI is enabled, SQL Server changes how the default `Read Committed` isolation level behaves under the hood.
3. Instead of the `SELECT` query acquiring a Shared Lock on the `Orders` table (which blocks the `INSERT` from acquiring an Exclusive Lock), SQL Server uses **Row Versioning**.
4. When an `INSERT` or `UPDATE` happens, the old version of the row is quietly copied to the `tempdb` system database.
5. When the `SELECT` query runs, it completely ignores the Exclusive Locks. Instead, it reads the last known committed version of the data from `tempdb`.

**Why this is the best fix:**
- Readers no longer block Writers.
- Writers no longer block Readers.
- You still prevent Dirty Reads (the dashboard only sees committed data).
- **Crucially:** It requires absolutely zero code changes in your application. You don't have to rewrite queries to use `WITH (NOLOCK)` (which is dangerous and causes dirty reads).

**The Trade-off:**
It puts massive strain on `tempdb`. You must ensure your `tempdb` is hosted on extremely fast storage (NVMe/SSD) and properly sized, otherwise, you've just moved the performance bottleneck from locking to disk I/O.

---

## Scenario — Question 2

**Q2: A developer writes a LINQ query that results in the following SQL query running millions of times a day: `SELECT Name, Email FROM Users WHERE RegistrationDate = @Date`. The query takes 500ms and consumes high CPU. You discover there is a Non-Clustered Index on `RegistrationDate`. Why is the query slow, and how do you optimize it with zero code changes?**

Even though there is a Non-Clustered Index on `RegistrationDate`, the query is slow due to a massive number of **Key Lookups**.

**The Flaw:**
The Non-Clustered Index only contains the `RegistrationDate` and a pointer to the clustered index. The engine uses this index to quickly find all rows matching the `@Date`. However, the query also selects `Name` and `Email`. Because these columns are *not* in the Non-Clustered Index, the engine must perform a Key Lookup (a random I/O read) into the clustered index to fetch the `Name` and `Email` for *every single matching row*. If there are 10,000 matches, it does 10,000 random reads, which is incredibly expensive.

**The Solution:**
You create a **Covering Index** by adding `Name` and `Email` as `INCLUDE` columns to the existing Non-Clustered Index.

**The Mechanism:**
```sql
CREATE NONCLUSTERED INDEX IX_Users_RegistrationDate
ON Users(RegistrationDate)
INCLUDE (Name, Email)
WITH (DROP_EXISTING = ON);
```
By adding them to the `INCLUDE` clause, SQL Server copies the `Name` and `Email` data into the leaf nodes of the Non-Clustered Index. When the query runs, it finds the `@Date` in the index and immediately has the `Name` and `Email` right there on the leaf node. The Key Lookup is completely eliminated. The query becomes a pure "Index Seek" and drops from 500ms to <1ms.

---

## Scenario — Question 3

**Q3: A stored procedure that fetches a user's order history by `CustomerID` usually runs in 5 milliseconds. Suddenly, today, it takes 30 seconds for everyone. However, if you run the exact same query manually in SSMS using local variables, it runs in 5 milliseconds. What is causing this, and how do you fix it?**

This is the classic symptom of **Parameter Sniffing**.

**The Flaw:**
When a stored procedure is executed for the very first time, SQL Server inspects the parameters passed in (e.g., `@CustomerID = 1`) and generates an Execution Plan optimized *specifically for that value*. It caches this plan for all future executions.
If Customer 1 has 2 orders, the engine might choose an Index Seek (very fast for small data). 
However, if the procedure was evicted from the cache overnight, and the *first* person to run it the next morning is Customer 999 (a massive corporate account with 5 million orders), SQL Server creates a plan optimized for 5 million rows (e.g., an Index Scan or a Parallel Hash Match).
It caches this heavy plan. Now, when normal users (with 2 orders) run the procedure, SQL Server forces them to use the heavy Index Scan plan, causing their queries to take 30 seconds instead of 5 milliseconds.

**The Fixes:**
1. **`OPTION (RECOMPILE)`:** Append this to the problematic query inside the stored procedure. It tells SQL Server to throw away the cache and generate a fresh plan every single time based on the specific parameter provided. This costs a bit of CPU to compile, but guarantees the optimal plan.
2. **`OPTION (OPTIMIZE FOR UNKNOWN)`:** Forces SQL Server to use statistical averages rather than the specific parameter passed in on the first run, leading to a "good enough" plan for everyone.
3. **Local Variables:** Mask the parameter by assigning it to a local variable inside the proc (e.g., `DECLARE @localId INT = @CustomerID`) and using the local variable in the `WHERE` clause. This achieves a similar effect to `OPTIMIZE FOR UNKNOWN`.

---

## Scenario — Question 4

**Q4: You are migrating a massive `Logs` table with 500 million rows to a new schema. You write a script to `DELETE FROM Logs WHERE CreatedDate < '2023-01-01'`. The script runs for 4 hours, during which the transaction log file (`.ldf`) grows from 5GB to 500GB, exhausting the server's disk space and crashing the entire database engine. What caused this, and how should you perform massive deletes?**

This is caused by SQL Server's Transaction Log behavior during massive, unbounded operations.

**The Flaw:**
SQL Server guarantees Atomicity and Durability (ACID). When you issue a single `DELETE` statement for 100 million rows, SQL Server treats it as one massive transaction. Before deleting a row, it writes the old data to the Transaction Log so it can roll back if the query is cancelled. The transaction log grows continuously until the single commit finishes. If it runs out of disk space, the transaction fails and begins a multi-hour rollback process, crippling the server.

**The Solution: Batch Processing (Chunking)**

You must never perform massive inserts, updates, or deletes in a single unbounded transaction. You must chunk the work.

```sql
SET NOCOUNT ON;
DECLARE @RowsDeleted INT = 1;

WHILE @RowsDeleted > 0
BEGIN
    DELETE TOP (5000) FROM Logs 
    WHERE CreatedDate < '2023-01-01';

    SET @RowsDeleted = @@ROWCOUNT;
    
    -- Optional: Add a brief delay to allow other queries to execute
    -- WAITFOR DELAY '00:00:01'; 
END
```

**Why this works:**
By deleting in batches of 5,000, each `DELETE TOP (5000)` is its own fully contained transaction. It completes in milliseconds, writes 5,000 records to the log, commits, and frees that space in the log (assuming Simple Recovery model or regular log backups). The log file remains small and stable, and the database remains highly responsive to other users throughout the entire migration process.

---

## Beginner — Question 2

**Q2: What are the differences between `DELETE`, `TRUNCATE`, and `DROP`?**

All three remove data, but at completely different granularities and with very different costs.

```sql
DELETE FROM Orders WHERE Status = 'Cancelled'; -- removes matching rows only
TRUNCATE TABLE Orders;                          -- removes ALL rows, keeps the table structure
DROP TABLE Orders;                              -- removes the rows AND the table definition itself
```

**`DELETE`:**
- Row-by-row operation; can filter with `WHERE`; fully logged in the transaction log (one log entry per row deleted); fires `DELETE` triggers; can be rolled back mid-transaction.
- Slowest of the three for removing large volumes of data, since every row's removal is individually logged.

**`TRUNCATE`:**
- Removes *every* row; cannot use `WHERE`; minimally logged (deallocates data pages rather than logging each row) — dramatically faster for clearing an entire large table.
- Resets any `IDENTITY` column back to its seed value; does **not** fire `DELETE` triggers; still fully transactional/rollback-able within an explicit transaction.
- Blocked if the table is referenced by an active Foreign Key from another table with existing rows.

**`DROP`:**
- Removes the table's data *and* its schema definition (columns, indexes, constraints) entirely — the table no longer exists at all.
- Also removable via transaction rollback if wrapped in one, but obviously the most destructive of the three.

**Common Pitfall:** reaching for `DELETE FROM BigTable` (with no `WHERE`) to "empty" a huge table for a data-refresh job — it's dramatically slower than `TRUNCATE TABLE BigTable` for the exact same end result, purely because of per-row transaction logging.

---

## Intermediate — Question 3

**Q3: What is a Common Table Expression (CTE), and how do you use one for a recursive query?**

A CTE is a temporary, named result set defined with a `WITH` clause, scoped to a single statement — think of it as a readable, inline "view" that only exists for the duration of the query that follows it.

**A simple (non-recursive) CTE:**
```sql
WITH HighValueCustomers AS (
    SELECT CustomerId, SUM(Total) AS LifetimeValue
    FROM Orders
    GROUP BY CustomerId
    HAVING SUM(Total) > 10000
)
SELECT c.Name, h.LifetimeValue
FROM HighValueCustomers h
JOIN Customers c ON c.Id = h.CustomerId;
```
This is mostly a readability tool here — you could write the same thing as a subquery, but naming the intermediate result makes complex queries far easier to follow.

**A recursive CTE (its real superpower)** — for traversing hierarchical data (org charts, category trees, bill-of-materials) that plain SQL can't express without knowing the depth in advance:
```sql
WITH OrgChart AS (
    -- Anchor member: the top-level manager (no manager of their own)
    SELECT EmployeeId, Name, ManagerId, 0 AS Level
    FROM Employees
    WHERE ManagerId IS NULL

    UNION ALL

    -- Recursive member: joins back to OrgChart itself, one level down each pass
    SELECT e.EmployeeId, e.Name, e.ManagerId, o.Level + 1
    FROM Employees e
    INNER JOIN OrgChart o ON e.ManagerId = o.EmployeeId
)
SELECT * FROM OrgChart ORDER BY Level;
```
SQL Server executes this by first running the anchor query, then repeatedly re-running the recursive member against the *previous* iteration's results, accumulating rows, until a pass produces zero new rows.

**Common Pitfall:** an unintentionally infinite recursive CTE (e.g., a data bug creating a circular manager reference) will hit SQL Server's default `MAXRECURSION` limit of 100 and throw an error — a safety net, not something to raise carelessly with `OPTION (MAXRECURSION 0)` (unlimited) without first being sure the data is genuinely acyclic.

---

## Advanced — Question 2

**Q2: How does SQL Server locking work, and what causes lock escalation?**

SQL Server uses locks to enforce isolation between concurrent transactions, applying them at different **granularities** depending on how many rows a query touches.

**Lock granularities (finest to coarsest):**
- **Row lock (RID/Key)** — locks a single row; most granular, allows maximum concurrency.
- **Page lock** — locks an 8KB data page (potentially many rows).
- **Table lock** — locks the entire table; least concurrency, cheapest to manage (one lock instead of thousands).

**Common lock modes:**
```sql
-- Shared (S) lock — acquired for reads under Read Committed; allows other readers, blocks writers
SELECT * FROM Orders WHERE Id = 5;

-- Exclusive (X) lock — acquired for writes; blocks all other readers and writers on that resource
UPDATE Orders SET Status = 'Shipped' WHERE Id = 5;

-- Intent locks (IS/IX) — placed on the table/page to signal "a more granular lock exists below me,"
-- letting the engine quickly check for conflicts without scanning every row lock individually
```

**Lock Escalation:**
Maintaining thousands of individual row locks consumes real memory (each lock is a small in-memory structure). If a single statement acquires roughly **5,000+ row/page locks** on one table, SQL Server automatically **escalates** them into a single table-level lock to reduce memory overhead.

```sql
UPDATE Orders SET Status = 'Archived' WHERE OrderDate < '2020-01-01'; -- touches 2 million rows
```
If this matches millions of rows, SQL Server escalates from row locks to a full table lock partway through — which then blocks *every other* query trying to touch that table, even ones on completely unrelated rows, for the remainder of the transaction.

**Common Pitfall:** a large batch `UPDATE`/`DELETE` unexpectedly locking an entire table and blocking unrelated OLTP traffic — this is exactly why the batch-chunking pattern (breaking one massive statement into many small ones, each comfortably under the escalation threshold, each its own transaction) matters for both transaction-log growth *and* lock escalation avoidance simultaneously.

#### Follow-up: Can you control or disable lock escalation?
Yes — `ALTER TABLE Orders SET (LOCK_ESCALATION = DISABLE)` prevents escalation for that table entirely (use with caution — it trades memory usage for concurrency), or `LOCK_ESCALATION = AUTO` lets SQL Server escalate at the partition level instead of the whole table for partitioned tables.

---

## Beginner — Question 3

**Q3: What is a Foreign Key constraint, and what happens if you try to insert a row that violates it?**

A Foreign Key (FK) is a column (or set of columns) that references the Primary Key of another table, enforcing that a value in the referencing table must actually exist in the referenced table — the database engine itself guarantees this, rather than relying on application code to check it correctly every time.

```sql
CREATE TABLE Customers (
    Id INT PRIMARY KEY,
    Name NVARCHAR(100)
);

CREATE TABLE Orders (
    Id INT PRIMARY KEY,
    CustomerId INT NOT NULL,
    CONSTRAINT FK_Orders_Customers FOREIGN KEY (CustomerId) REFERENCES Customers(Id)
);
```

**What happens on a violation:**
```sql
INSERT INTO Orders (Id, CustomerId) VALUES (1, 999); -- CustomerId 999 doesn't exist in Customers
-- Msg 547: The INSERT statement conflicted with the FOREIGN KEY constraint
```
SQL Server rejects the insert entirely and raises an error — the row is never written, preventing an "orphaned" order that points to a customer who doesn't exist.

**What happens on a delete of a referenced row (by default):**
```sql
DELETE FROM Customers WHERE Id = 1; -- Customer 1 has existing Orders
-- Msg 547: The DELETE statement conflicted with the REFERENCE constraint
```
By default, SQL Server blocks deleting a customer who still has orders referencing them — you must either delete the dependent orders first, or configure a cascade behavior:
```sql
CONSTRAINT FK_Orders_Customers FOREIGN KEY (CustomerId)
    REFERENCES Customers(Id) ON DELETE CASCADE -- deleting a Customer auto-deletes their Orders too
```

**Common Pitfall:** using `ON DELETE CASCADE` casually without considering the blast radius — a cascading delete on a deeply-referenced table (e.g., deleting a `Customer` that cascades through `Orders` → `OrderLines` → `Payments`) can silently remove far more data than intended if the cascade chain is longer than the developer realized when writing the original constraint.

---

## Intermediate — Question 4

**Q4: What are SQL Server Views, and what's the difference between a regular view and an Indexed (Materialized) View?**

A View is a saved, named SQL query that behaves like a virtual table — querying the view runs the underlying query fresh each time, it doesn't store data of its own by default.

**A regular View — just a saved query, re-executed every time it's queried:**
```sql
CREATE VIEW ActiveCustomerOrders AS
SELECT o.Id, o.Total, c.Name
FROM Orders o
JOIN Customers c ON c.Id = o.CustomerId
WHERE c.IsActive = 1;

SELECT * FROM ActiveCustomerOrders WHERE Total > 100; -- runs the JOIN fresh, every single time
```
This is purely a convenience/abstraction layer — hiding a complex join behind a simple name — with no inherent performance benefit over writing the join directly, since SQL Server executes the underlying query every time regardless.

**An Indexed (Materialized) View — SQL Server actually stores and maintains the result set:**
```sql
CREATE VIEW ActiveCustomerOrdersIndexed WITH SCHEMABINDING AS
SELECT o.Id, o.Total, c.Name
FROM dbo.Orders o
JOIN dbo.Customers c ON c.Id = o.CustomerId
WHERE c.IsActive = 1;
GO
CREATE UNIQUE CLUSTERED INDEX IX_ActiveCustomerOrdersIndexed ON ActiveCustomerOrdersIndexed(Id);
```
Creating a clustered index on the view forces SQL Server to physically materialize and store the view's result set on disk, automatically keeping it in sync whenever the underlying `Orders`/`Customers` tables change — queries against the indexed view can be dramatically faster since the join has already been computed, at the cost of extra storage and slightly slower writes to the base tables (since the materialized view must be updated too).

**Why `WITH SCHEMABINDING` is required:** it locks the underlying tables' schema so they can't be altered in a way that would break the view (e.g., dropping a column the view depends on) without first dropping the view — a necessary safety guarantee for a structure SQL Server is actively maintaining physical storage for.

**Common Pitfall:** creating an Indexed View on a heavily-written table expecting only read-side benefits — every `INSERT`/`UPDATE`/`DELETE` on the underlying tables now also has to update the materialized view's stored data, which can meaningfully slow down write-heavy workloads; Indexed Views are best suited for read-heavy scenarios querying relatively stable data.

---

## Advanced — Question 3

**Q3: What are SQL Server Statistics, and how does a stale statistics object cause the query optimizer to choose a bad execution plan?**

Statistics are lightweight metadata objects describing the **distribution of values** in a column or index (e.g., "this column has 500,000 distinct values, ranging from 1 to 500,000, roughly evenly distributed") — the Query Optimizer relies entirely on these estimates, not the actual live data, to decide things like whether an Index Seek or a full Table Scan will be cheaper for a given query.

**How stale statistics cause a bad plan:**
```sql
-- Statistics were last updated when the Orders table had 1,000 rows
SELECT * FROM Orders WHERE CustomerId = 42;
-- The optimizer estimates (based on STALE stats) that ~1 row matches -> chooses an Index Seek

-- But the table has since grown to 10 million rows, and CustomerId 42 now has 50,000 matching orders
-- The chosen Index Seek + many individual Key Lookups is now FAR slower than a Table Scan would have been
```
The optimizer isn't "wrong" given the information it had — it made the best decision based on statistics that no longer reflect reality, producing a plan that was optimal for the old data volume/distribution but is badly mismatched for the current one.

**SQL Server's automatic statistics maintenance:** by default, `AUTO_UPDATE_STATISTICS` refreshes statistics automatically once a sufficient percentage of rows have changed since the last update — but for very large tables, that threshold can represent a large *absolute* number of changed rows before a refresh triggers, meaning statistics can lag noticeably stale for a meaningful window on big, frequently-changing tables.

**Manually forcing a refresh when you suspect stale stats are the culprit:**
```sql
UPDATE STATISTICS Orders WITH FULLSCAN; -- recompute using every row, not a sample
```

**Common Pitfall:** diagnosing a sudden query slowdown as an indexing problem (adding more indexes) when the actual cause is stale statistics causing the optimizer to *mis-estimate* row counts and pick a poor plan despite perfectly good indexes already existing — checking the *estimated* vs *actual* row counts in an execution plan (a large mismatch between the two is the tell-tale sign) should come before assuming an index is missing.

---
