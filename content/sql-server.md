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
