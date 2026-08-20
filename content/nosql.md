# NoSQL — Q&A

## Beginner — Question 1

**Q1: What are the primary differences between SQL (Relational) and NoSQL (Non-Relational) databases?**

The distinction between SQL and NoSQL databases primarily comes down to how they model data, how they scale, and how they guarantee consistency.

**SQL (Relational):**
- **Structure:** Data is stored in highly structured tables with fixed columns and defined schemas. Relationships are enforced via Foreign Keys.
- **Scaling:** Primarily scales *vertically* (scaling up by adding more CPU/RAM to a single server).
- **Consistency:** Strictly adheres to ACID properties (Atomicity, Consistency, Isolation, Durability).
- **Examples:** SQL Server, PostgreSQL, MySQL.

**NoSQL (Non-Relational):**
- **Structure:** Data is stored in flexible, schema-less (or schema-lite) formats like JSON documents, key-value pairs, or wide columns.
- **Scaling:** Built to scale *horizontally* (scaling out by distributing data across many commodity servers).
- **Consistency:** Often adheres to BASE properties (Basically Available, Soft state, Eventual consistency) to favor high availability and partition tolerance over immediate consistency (as described by the CAP theorem).
- **Examples:** MongoDB, Redis, Cassandra.

#### Follow-up: When should you choose NoSQL over a Relational database?
Choose NoSQL when you have massive volumes of unstructured or rapidly changing data, when horizontal scalability is a hard requirement, or when you need extremely fast, simple read/write operations (like caching). Choose Relational when you have highly structured data with complex relationships, strict financial/ACID requirements, and rely heavily on complex joins.

---

## Intermediate — Question 1

**Q1: What are the four main types of NoSQL databases, and what are their typical use cases?**

NoSQL is a broad term that encompasses several entirely different architectural models:

1. **Document Stores (e.g., MongoDB, Cosmos DB):**
   - **How it works:** Data is stored as semi-structured documents (like JSON or BSON). Each document can have a completely different structure.
   - **Use case:** Content Management Systems (CMS), catalogs, and applications where the data schema evolves rapidly.

2. **Key-Value Stores (e.g., Redis, Memcached):**
   - **How it works:** The simplest NoSQL type. Data is stored as an opaque blob (the value) accessed via a unique string (the key). Extremely fast.
   - **Use case:** Caching, session management, shopping carts, and real-time leaderboards.

3. **Wide-Column Stores (e.g., Cassandra, HBase):**
   - **How it works:** Stores data in tables, rows, and dynamic columns, but instead of organizing by row, data is physically clustered by column families. This allows for querying massive datasets across specific columns very quickly.
   - **Use case:** IoT sensor data, time-series data, and massive logging systems where you are writing continuously and reading specific columns.

4. **Graph Databases (e.g., Neo4j, Gremlin):**
   - **How it works:** Data is stored as nodes (entities) and edges (relationships). The architecture is heavily optimized for traversing complex relationships.
   - **Use case:** Social networks, recommendation engines, and fraud detection.

---

## Advanced — Question 1

**Q1: Explain the CAP Theorem and how it dictates NoSQL database design.**

The CAP Theorem states that a distributed data store can guarantee at most two of the following three properties simultaneously:

1. **Consistency:** Every read receives the most recent write or an error. (All nodes see the same data at the same time).
2. **Availability:** Every request receives a non-error response, without the guarantee that it contains the most recent write. (The system stays up even if nodes fail).
3. **Partition Tolerance:** The system continues to operate despite an arbitrary number of messages being dropped or delayed by the network between nodes.

**The Reality of Distributed Systems:**
Because network failures are an unavoidable reality in distributed systems, a system *must* tolerate partitions (P). Therefore, when a network partition occurs, the system designer must choose between Consistency (C) and Availability (A).

- **CP (Consistency + Partition Tolerance):** If a network link goes down between Node A and Node B, the system will refuse to accept writes (sacrificing Availability) to ensure that no stale data is ever read (preserving Consistency). *Examples: MongoDB (default configuration), HBase.*
- **AP (Availability + Partition Tolerance):** If the network link goes down, the system continues to accept writes on all available nodes (preserving Availability). This means different nodes might have different versions of the data, which will be reconciled later. This is known as **Eventual Consistency**. *Examples: Cassandra, CouchDB.*

**Common Pitfalls:**
Assuming a NoSQL database is purely CP or AP. Many modern NoSQL databases (like Cosmos DB or Cassandra) allow you to tune the consistency level per-query. You can choose "Strong Consistency" (CP) for financial transactions, and "Eventual Consistency" (AP) for social media feeds within the exact same database.

---

## Scenario — Question 1

**Q1: You are designing an e-commerce platform and need to store the shopping cart for millions of concurrent users. Why would you choose Redis over a SQL database for this specific component?**

A shopping cart requires extremely fast read/write access, the data structure is relatively simple, and the data is highly transient (once the user checks out, the cart is deleted).

**Why Redis (Key-Value Store):**
1. **In-Memory Speed:** Redis operates entirely in RAM. Reading or writing a user's cart takes microseconds. A SQL database has to write to disk, manage transaction logs, and update indexes, resulting in millisecond response times.
2. **Key-Value Simplicity:** The schema is perfect for a key-value store. The Key is the `UserId` or `SessionId`. The Value is a serialized JSON object containing the cart items. 
3. **Built-in Expiration (TTL):** In Redis, you can set a Time-To-Live (TTL) on a key. You can tell Redis, "Store this cart, but automatically delete it if the user doesn't interact with it for 7 days." To do this in SQL requires writing a background worker service that constantly polls and deletes old rows.

**The Trade-off:**
RAM is far more expensive than disk storage. Storing massive historical order data in Redis would be cost-prohibitive. Furthermore, if the Redis server crashes before saving a snapshot to disk, you might lose the most recent cart updates. For a shopping cart, this data loss is generally considered an acceptable risk compared to losing a finalized financial transaction.

---

## Scenario — Question 2

**Q2: You are using MongoDB to store complex `Order` documents. You need to generate a monthly sales report that aggregates the total revenue per product category. However, running this aggregation query takes several minutes and severely degrades the performance of the live application. How do you resolve this?**

Running heavy analytical queries (OLAP) directly against the primary operational database (OLTP) is a major anti-pattern in both SQL and NoSQL.

**The Solution:**
You must separate the operational workload from the analytical workload.

**The Mechanism:**
1. **Read Replicas:** The simplest approach. MongoDB supports Replica Sets. You configure a dedicated "Secondary" node in the cluster strictly for analytics. You route your heavy aggregation queries to this secondary node. It still has the same data (replicated from the primary), but the CPU/RAM spike won't affect the primary node serving live user traffic.
2. **Data Pipeline (ETL):** For more complex or larger-scale reporting, you extract the data from MongoDB and load it into a dedicated Data Warehouse or columnar database.
   - Use a tool like **MongoDB Connector for Apache Kafka** or a change data capture (CDC) tool like Debezium to stream changes from MongoDB in real-time.
   - Transform and load this data into an OLAP system like Snowflake, Google BigQuery, or Amazon Redshift. 
   - Run the monthly sales report queries against the data warehouse, which is heavily optimized for massive aggregations.

---

## Scenario — Question 3

**Q3: A highly available global application uses a wide-column NoSQL store (Cassandra). Due to a temporary network partition, Node A receives an update setting a user's address to "New York," while Node B simultaneously receives an update setting the same user's address to "London." How does Cassandra resolve this conflict when the network partition heals?**

Cassandra handles conflicts in highly distributed, eventually consistent environments using a strict, deterministic resolution mechanism based on timestamps.

**The Mechanism (Last Write Wins):**
Cassandra relies on a **Last Write Wins (LWW)** conflict resolution strategy.
1. When a client writes data to Cassandra, the driver (or the coordinator node) attaches a microscopic timestamp to the mutation.
2. When the network partition heals, the nodes exchange data via a background process called **Read Repair** or **Anti-Entropy Node Repair**.
3. When the nodes detect that they have two different values for the exact same column (Address), they compare the timestamps.
4. The value with the most recent timestamp (e.g., "London" was written 2 milliseconds after "New York") is declared the winner. The older value is discarded, and all nodes converge on "London."

**The Flaw (Clock Drift):**
This system relies entirely on the system clocks of the servers being perfectly synchronized. If Node A's clock is 5 minutes faster than Node B's clock, a write to Node A will always "win" over a write to Node B, even if Node B's write actually occurred later in real time. To mitigate this, servers running Cassandra must use Network Time Protocol (NTP) to keep their clocks synchronized to within milliseconds.

---

## Scenario — Question 4

**Q4: You are migrating a relational database to a NoSQL Document Store (MongoDB). In the SQL database, you had a `Users` table and an `Addresses` table, connected by a Foreign Key, requiring a `JOIN` to query. A developer proposes replicating this exact structure in MongoDB by creating a `Users` collection and an `Addresses` collection, and doing manual "joins" in the application code. Why is this an anti-pattern in NoSQL, and what is the correct approach?**

This is the classic mistake of applying relational modeling paradigms to a non-relational database. 

**The Anti-Pattern:**
NoSQL databases like MongoDB do not support efficient server-side JOINs across distributed collections. If you try to normalize data (like SQL) and do manual joins in your C# code, you will introduce massive network latency (the N+1 query problem). Fetching 100 users would require 101 database queries to assemble the data.

**The Correct Approach: Denormalization (Embedding)**
In document databases, data that is accessed together should be stored together.

You should **embed** the address directly inside the User document as a sub-document or an array of sub-documents.

```json
{
  "_id": "user123",
  "name": "Jane Doe",
  "addresses": [
    {
      "type": "Home",
      "street": "123 Main St",
      "city": "Seattle"
    }
  ]
}
```

**Result:**
When you query the user, you get all their relevant data in a single, fast disk read and network round trip. This heavily optimizes for read performance, which is exactly what NoSQL document stores are designed to do. 
*(Note: You only normalize via references in MongoDB if the sub-document is unbounded and grows infinitely, like a user's activity log, to avoid hitting the 16MB document size limit).*

---

## Beginner — Question 2

**Q2: What is a Partition Key (or Shard Key), and why does choosing one well matter so much in NoSQL databases?**

A Partition Key is the field NoSQL databases use to decide **which physical node/shard** a given piece of data lives on — it's the mechanism that makes horizontal scaling possible in the first place.

**The Mechanism:**
```json
// Cosmos DB / DynamoDB style document, partitioned by "tenantId"
{
  "id": "order123",
  "tenantId": "acme-corp",
  "total": 249.99
}
```
The database hashes (or ranges) the partition key value to determine which physical shard stores that document. Every read or write that includes the partition key can be routed directly to the correct shard in one hop; queries that *don't* include it must fan out to **every** shard and merge results — dramatically slower and more expensive.

**Why the choice matters so much:**
- **Even distribution:** A poorly chosen key (e.g., partitioning orders by `Status`, which only has 3-4 possible values) creates a "hot partition" — most traffic piles onto one or two shards while others sit idle, defeating the entire purpose of horizontal scaling.
- **Query alignment:** If your most common query is "get all orders for tenant X," partitioning by `tenantId` makes that query single-shard and fast. Partitioning by `orderId` instead would scatter one tenant's orders across every shard, turning that same common query into an expensive fan-out.

**Common Pitfall:** choosing a partition key optimized for *write* distribution (like a random GUID, which spreads writes perfectly evenly) while ignoring your application's actual *read* patterns — if nearly every query needs "all data for tenant X" but the partition key is a random GUID, every single query becomes a full fan-out scan regardless of how evenly the writes were distributed.

---

## Intermediate — Question 2

**Q2: Why is denormalization considered a first-class NoSQL modeling strategy rather than the anti-pattern it would be in a relational database?**

In relational modeling, normalization (splitting data into separate tables to eliminate redundancy) is the default good practice, and duplicating data is generally treated as a bug waiting to happen. NoSQL modeling deliberately inverts this default.

**Why the relational default doesn't transfer:**
Relational databases are built around cheap, efficient server-side `JOIN`s across normalized tables, backed by strict transactional guarantees that keep duplicated data consistent if it existed. NoSQL databases (particularly document and wide-column stores) are explicitly designed to avoid expensive cross-partition joins entirely — most don't support them at all, or only in limited, expensive forms.

**The NoSQL modeling principle: model around your queries, not your entities.**
```json
// Denormalized: the author's name is duplicated into every one of their blog posts
{
  "postId": "p1",
  "title": "Scaling Databases",
  "author": { "id": "u42", "name": "Jane Doe" }   // duplicated, not referenced
}
```
If you display the author's name on every blog post listing page, embedding it means that page loads with **one** read from **one** partition. The alternative — storing only `authorId` and looking up the name separately — would require a second round-trip (or a fan-out join the database may not even support efficiently) for every single post rendered.

**The trade-off you're explicitly accepting:** if Jane Doe changes her display name, you now must update it in every post document that duplicated it (an "update anomaly" that normalization exists specifically to prevent in SQL). NoSQL modeling accepts this cost deliberately, betting that reads vastly outnumber writes for this particular field, and that eventual, application-driven synchronization (or accepting some staleness) is cheaper than paying a join penalty on every single read.

**Common Pitfall:** denormalizing data that changes frequently and is read relatively rarely — that's the exact inverse of the trade-off that makes denormalization worthwhile, and you end up paying heavy write-amplification cost (updating many duplicated copies) for a read optimization you rarely benefit from.

---

## Advanced — Question 2

**Q2: How do indexes work in MongoDB, and how does that compare conceptually to SQL Server's Clustered/Non-Clustered indexes?**

Both databases use the same underlying data structure — a **B-Tree** — to avoid scanning every document/row, but MongoDB's storage model changes what "having an index" actually means in practice.

**MongoDB indexes:**
```javascript
db.products.createIndex({ category: 1, price: -1 }); // compound index: category ascending, price descending

db.products.find({ category: "electronics" }).sort({ price: -1 }); // uses the index directly
```
Every MongoDB collection has one mandatory index on `_id` (conceptually similar to a SQL Server clustered index's uniqueness guarantee), but critically, **MongoDB documents are not physically sorted by any secondary index the way a SQL Server clustered index physically sorts table rows.** Every additional index (single-field, compound, multi-key for arrays, text, or geospatial) is a *separate* B-Tree structure mapping key values to document locations — conceptually all MongoDB secondary indexes behave like SQL Server's **non-clustered** indexes; there's no equivalent of "the data rows themselves are the leaf nodes," because MongoDB's storage engine (WiredTiger) organizes documents by insertion/internal-storage order rather than by any queryable key.

**Multi-key indexes (a NoSQL-specific concept with no direct SQL Server equivalent):**
```javascript
// A document with an array field
{ "_id": 1, "tags": ["sale", "electronics", "clearance"] }
db.products.createIndex({ tags: 1 });
```
MongoDB automatically creates one index entry *per array element*, so a query like `db.products.find({ tags: "sale" })` uses the index efficiently — something a traditional relational column (which holds one scalar value, not an array) has no direct equivalent for without a separate join table.

**Common Pitfall:** assuming a compound index in MongoDB is equally useful regardless of field order, the same way people sometimes assume for SQL Server — MongoDB compound indexes are only useful for queries/sorts that follow a **left-to-right prefix** of the indexed fields, exactly analogous to SQL Server's compound index prefix rule. An index on `{ category: 1, price: -1 }` serves queries filtering on `category` alone, or `category` + `price` together, but does **not** efficiently serve a query filtering on `price` alone.

---
