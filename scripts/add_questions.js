const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '../content');

const additions = [
  {
    file: 'csharp.md',
    content: `
## Advanced — Question 2

**Q2: How does the new \`record\` type work in C#, and how does it differ from a \`class\` or \`struct\`?**

Introduced in C# 9, a \`record\` is a reference type (like a class) that provides **built-in value-based equality** and favors immutability.

**The Mechanism:**
Under the hood, a \`record\` is just a \`class\`. However, the compiler automatically generates several things for you:
1. **Value Equality:** Overrides for \`.Equals()\`, \`==\`, \`!=\`, and \`.GetHashCode()\`. Two record instances are equal if all their properties have the same values, unlike standard classes which use reference equality (memory addresses).
2. **Non-Destructive Mutation:** The \`with\` expression allows you to create a copy of a record with specific properties modified.
3. **Deconstructors:** Automatically generates a \`Deconstruct\` method for tuple-like destructuring.

**Example:**
\`\`\`csharp
public record Person(string FirstName, string LastName);

var p1 = new Person("John", "Doe");
var p2 = new Person("John", "Doe");

Console.WriteLine(p1 == p2); // TRUE (Value equality)

var p3 = p1 with { LastName = "Smith" }; // Non-destructive mutation
\`\`\`

**When to use each:**
- \`class\`: For mutable objects that encapsulate state and behavior (e.g., a \`ShoppingCart\`). Identity matters.
- \`struct\`: For small, short-lived data structures where allocation performance matters (stack vs heap).
- \`record\`: For immutable data models, DTOs, CQRS Commands/Queries, and configuration objects.
`
  },
  {
    file: 'aspnet-core.md',
    content: `
## Advanced — Question 2

**Q2: What is the \`IHostedService\` interface and how do Background Tasks work in ASP.NET Core?**

\`IHostedService\` allows you to run background tasks asynchronously within your ASP.NET Core web application, independent of HTTP requests.

**The Mechanism:**
The interface requires implementing two methods:
1. \`StartAsync(CancellationToken)\`: Triggered when the application host is ready to start the service.
2. \`StopAsync(CancellationToken)\`: Triggered when the application host is performing a graceful shutdown.

Instead of implementing \`IHostedService\` directly, developers usually inherit from the abstract **\`BackgroundService\`** class, which provides a single \`ExecuteAsync\` method.

**Example:**
\`\`\`csharp
public class Worker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            Console.WriteLine("Worker running at: {time}", DateTimeOffset.Now);
            await Task.Delay(1000, stoppingToken);
        }
    }
}
\`\`\`

**Registration:**
\`builder.Services.AddHostedService<Worker>();\`

**Common Pitfalls (Captive Dependencies):**
Because an \`IHostedService\` is registered as a **Singleton**, you cannot directly inject **Scoped** services (like Entity Framework's \`DbContext\`) into its constructor. If you do, the DbContext will stay alive forever and eventually crash due to concurrent thread access.
To use a DbContext inside a BackgroundService, you must inject \`IServiceScopeFactory\`, create a new scope inside \`ExecuteAsync\`, resolve the DbContext, use it, and dispose of the scope.
`
  },
  {
    file: 'ef-core.md',
    content: `
## Advanced — Question 2

**Q2: How does Change Tracking work in EF Core, and what is the difference between Tracked and No-Tracking queries?**

**Change Tracking:**
When you query entities using EF Core, the \`DbContext\` keeps a reference to the loaded objects in memory and tracks any modifications made to their properties. When you call \`SaveChanges()\`, EF Core inspects this "snapshot" to determine exactly which \`UPDATE\`, \`INSERT\`, or \`DELETE\` SQL statements need to be generated and sent to the database.

**Tracked Queries (Default):**
\`\`\`csharp
var user = _db.Users.First(u => u.Id == 1);
user.Name = "Alice";
_db.SaveChanges(); // Automatically generates UPDATE Users SET Name='Alice' WHERE Id=1
\`\`\`
- *Pros:* Easy to update data.
- *Cons:* High memory footprint (EF stores a duplicate copy of the original state for comparison) and slower performance.

**No-Tracking Queries:**
\`\`\`csharp
var users = _db.Users.AsNoTracking().ToList();
\`\`\`
- If you use \`AsNoTracking()\`, EF Core reads the data from the database, constructs the C# objects, and immediately "forgets" about them.
- *Pros:* Significantly faster execution and lower memory usage.
- *Cons:* You cannot simply modify the object and call \`SaveChanges()\`.

**Best Practice:**
If a query is strictly for **reading** data (e.g., returning a JSON payload to a web client), *always* append \`.AsNoTracking()\`. Only use the default tracking behavior if you explicitly intend to modify the retrieved entities within the same HTTP request.
`
  },
  {
    file: 'microservices.md',
    content: `
## Scenario — Question 2

**Q2: How do you handle distributed transactions across multiple microservices without locking the database?**

In a monolithic application, you can wrap multiple database operations in a single SQL Transaction (\`BEGIN TRAN\`, \`COMMIT\`, \`ROLLBACK\`). In a microservices architecture, where each service owns its own database, traditional ACID transactions across network boundaries (like Two-Phase Commit) are disastrous for performance and availability.

**The Solution: The Saga Pattern**
A Saga is a sequence of local transactions. Each service performs its local transaction and publishes an event. The next service listens to that event and performs its local transaction.

If a local transaction fails at any point in the chain, the Saga executes **Compensating Transactions** — a series of reversal actions to undo the work done by the preceding services.

**Example (E-Commerce Order):**
1. **Order Service** creates an Order (Status: *Pending*) and publishes \`OrderCreated\`.
2. **Inventory Service** receives \`OrderCreated\`, deducts stock, and publishes \`StockReserved\`.
3. **Payment Service** receives \`StockReserved\`, attempts to charge the credit card. **(FAILS due to insufficient funds)**. It publishes \`PaymentFailed\`.
4. **Inventory Service** receives \`PaymentFailed\` and executes its compensating transaction: adding the stock back to the database.
5. **Order Service** receives \`PaymentFailed\` and executes its compensating transaction: updating the Order status to *Cancelled*.

**Orchestration vs. Choreography:**
- **Choreography:** Services publish events to a message bus (RabbitMQ, Kafka) and react to each other independently. Good for simple workflows (2-3 steps).
- **Orchestration:** A central controller service (the Orchestrator) tells each service what local transaction to execute. If something fails, the Orchestrator explicitly sends commands to trigger the compensations. Better for complex workflows.
`
  },
  {
    file: 'system-design.md',
    content: `
## Scenario — Question 4

**Q4: Design a Rate Limiter for a public API.**

**Requirements:**
- Limit users to 100 requests per minute based on their IP address or API Key.
- High availability, extremely low latency.
- Distributed across multiple API Gateway servers.

**Storage:**
Because we need shared state across multiple gateway servers with extremely fast read/write speeds, an In-Memory Distributed Cache like **Redis** is the only viable option.

**Algorithm: The Sliding Window Counter**
While Token Bucket and Fixed Window are common, Sliding Window Counter offers the best balance of accuracy and memory usage.
1. Each incoming request gets a timestamp (e.g., Redis Sorted Set).
2. The key is the user's API Key (e.g., \`rate:key_123\`).
3. When a request arrives, we remove all timestamps in the set that are older than 1 minute (the window size).
4. We count the remaining elements in the set.
5. If the count is < 100, we add the current timestamp to the set and allow the request.
6. If the count is >= 100, we reject the request with HTTP \`429 Too Many Requests\`.

**Optimization:**
Executing steps 3, 4, and 5 requires multiple round trips to Redis, which introduces latency and race conditions if multiple requests hit concurrently. To solve this, we can wrap the logic in a **Lua Script** and send it to Redis. Redis guarantees that Lua scripts execute atomically, solving both the race condition and the network overhead.
`
  },
  {
    file: 'sql-server.md',
    content: `
## Advanced — Question 2

**Q2: Explain the differences between Clustered and Non-Clustered Indexes.**

Indexes are data structures that improve the speed of data retrieval operations on a database table.

**Clustered Index:**
- **Structure:** A Clustered Index dictates the physical, on-disk sorting order of the table's rows. Because data can only be physically sorted one way, a table can only have **exactly one** clustered index.
- **Analogy:** A phone book. The data is physically sorted by Last Name. If you search for "Smith," you flip directly to the 'S' section and the actual phone numbers (the data) are right there on the page.
- **Primary Key:** By default, SQL Server creates a clustered index on the Primary Key column.

**Non-Clustered Index:**
- **Structure:** A Non-Clustered Index does *not* alter the physical order of the table. Instead, it creates a completely separate structure (a B-Tree) that holds the indexed columns and a **pointer** back to the actual data row (either a RowID or the Clustered Index key). You can have **multiple** non-clustered indexes on a table.
- **Analogy:** The index at the back of a textbook. It lists keywords alphabetically and gives you page numbers. When you search for "DNA," you find it in the index, see it's on page 42, and then you have to perform a "lookup" by flipping to page 42 to read the actual data.
- **Performance:** Non-clustered indexes are slightly slower because they often require that secondary "lookup" step to retrieve columns that aren't included in the index.
`
  }
];

for (const addition of additions) {
  const filePath = path.join(contentDir, addition.file);
  fs.appendFileSync(filePath, '\\n' + addition.content);
}
console.log('Appended questions successfully.');
