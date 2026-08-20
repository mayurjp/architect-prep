# GraphQL — Q&A

## Beginner — Question 1

**Q1: What is GraphQL and how does it fundamentally differ from REST?**

GraphQL is a query language for APIs and a runtime for fulfilling those queries with your existing data. It was developed by Facebook to solve the problems of over-fetching and under-fetching data in REST APIs, particularly for mobile applications.

**The REST Approach:**
In REST, the *server* dictates the shape of the response. If you hit `GET /api/users/1`, the server returns a fixed JSON object containing all the user's details (Name, Age, Address, Email, etc.).
- **Over-fetching:** If a mobile screen only needs the user's `Name`, downloading the `Address` and `Email` wastes bandwidth and battery.
- **Under-fetching (The N+1 problem on the client):** If the screen also needs the user's 10 most recent posts, you usually have to make a second HTTP request to `GET /api/users/1/posts`, increasing latency.

**The GraphQL Approach:**
In GraphQL, the *client* dictates exactly what data it wants. There is typically only one endpoint (e.g., `POST /graphql`). The client sends a specific query string:
```graphql
query {
  user(id: 1) {
    name
    posts(limit: 10) {
      title
    }
  }
}
```
The server responds with a JSON object that matches that exact shape—no more, no less. It solves both over-fetching and under-fetching in a single network trip.

---

## Intermediate — Question 1

**Q1: Explain the concepts of Schema, Queries, Mutations, and Resolvers in GraphQL.**

A GraphQL server is built around a strongly-typed schema and the functions that resolve the data for that schema.

1. **Schema & Types:** The Schema acts as a strict contract between the client and the server. It defines all the available data types and what fields they have.
   ```graphql
   type User {
     id: ID!      # The ! means non-nullable
     name: String!
     email: String
   }
   ```

2. **Queries:** The equivalent of a `GET` request in REST. It is used to fetch data. The schema defines a special root `Query` type that acts as the entry point for all reads.

3. **Mutations:** The equivalent of `POST`, `PUT`, `PATCH`, and `DELETE` in REST. It is used to modify data and return a result. It is defined under a root `Mutation` type.

4. **Resolvers:** GraphQL itself doesn't connect to a database; it just parses queries. A **Resolver** is a backend function you write (e.g., in C# using HotChocolate) that tells the server *how* to fetch the data for a specific field in the schema.
   - If a client asks for a `User`'s name, the `UserNameResolver` function is executed.
   - If they also ask for the `User`'s posts, the `UserPostsResolver` function is executed, which might make a database query. If they don't ask for posts, that resolver is never executed, saving backend resources.

**Common Pitfalls:**
The N+1 problem on the *server*. If a client queries 100 users and asks for each user's posts, a naive GraphQL implementation will execute 1 database query for the users, and 100 separate database queries for the posts (triggered by the resolver running 100 times). You must use tools like **DataLoaders** to batch and cache these resolver calls into a single database query.

---

## Scenario — Question 1

**Q1: You are exposing a public GraphQL API for your application. A malicious user sends a deeply nested query asking for User -> Friends -> Friends -> Friends... a hundred levels deep. This query crashes your server by exhausting memory and CPU. How do you prevent this?**

GraphQL gives massive power to the client, which opens the door for Denial of Service (DoS) attacks via overly complex queries. Unlike REST endpoints that do one fixed thing, a single GraphQL endpoint can be abused infinitely.

**Defense Mechanisms:**

1. **Query Depth Limiting:**
   You configure your GraphQL server (e.g., HotChocolate in .NET) to reject any query that exceeds a certain depth.
   - Example: Setting a Max Depth of 5. The server inspects the incoming query before executing any resolvers. If it sees `User -> Friends -> Friends -> Friends -> Friends -> Friends` (depth 6), it immediately rejects the HTTP request with an error.

2. **Query Complexity (Cost) Analysis:**
   Depth limiting isn't always enough. A shallow query could ask for 10,000 items in a single list. Query Complexity assigns a "cost" or "weight" to specific fields.
   - Example: Fetching a scalar like `name` costs 1 point. Fetching a heavy relationship like `posts` costs 10 points. 
   - You set a Max Cost of 100 for the entire query. The server calculates the total cost before execution, and rejects it if it exceeds the limit.

3. **Persisted Queries (The Ultimate Defense for 1st-Party Apps):**
   If you are building the frontend app (React) that consumes the GraphQL API, you can use Persisted Queries. During the frontend build process, all GraphQL queries are extracted, hashed, and uploaded to the server. 
   - The React app no longer sends the actual query string; it only sends the short hash (e.g., `hash: "8f6a9c"`). 
   - The server looks up the hash, finds the pre-approved query, and executes it. 
   - Any raw, arbitrary query string sent by a malicious user is completely rejected. This gives you the flexibility of GraphQL during development, but the security of fixed REST endpoints in production.

---

## Scenario — Question 2

**Q2: Your team is building a complex dashboard. The frontend needs to fetch a `User` profile, their `Company` details, and a list of their recent `Orders`. In your GraphQL server, the `UserResolver` runs instantly, but the `CompanyResolver` and `OrdersResolver` each take 500ms. Currently, the entire GraphQL response takes 1,000ms. How do you optimize this without changing the database?**

This is an issue of sequential execution of independent resolvers.

**The Solution:**
GraphQL resolvers are naturally asynchronous. If fields are at the same level in the query hierarchy (e.g., fetching a User, a Company, and Orders concurrently in the root query), the GraphQL execution engine can run their resolvers in parallel.

However, if they are nested (e.g., User -> Company and User -> Orders), you must ensure your data fetching logic is asynchronous.

**The Mechanism in .NET (HotChocolate):**
Ensure that your resolver methods are `async Task<T>`. When the GraphQL engine encounters multiple sibling fields that return `Task`, it fires them off concurrently.
1. The engine fetches the `User`.
2. It sees the `Company` and `Orders` fields.
3. It calls `CompanyResolver()` and `OrdersResolver()` *at the same time*.
4. It awaits both (`Task.WhenAll` under the hood).
5. The total time drops to ~500ms (the time of the longest single resolver) instead of 1,000ms.

This highlights why `async/await` is absolutely critical in GraphQL backends—it inherently enables concurrent data fetching across independent branches of the graph.

---

## Scenario — Question 3

**Q3: Your company is transitioning from a monolith to microservices (OrderService, ProductService, UserService). You want to provide a single, unified GraphQL endpoint to the frontend team so they can query `User` and their `Orders` in one request, but the data lives in different microservices. How do you architect this in a GraphQL ecosystem?**

You solve this using **GraphQL Federation** (popularized by Apollo Federation) or **Schema Stitching**.

**The Concept:**
Instead of building one massive, monolithic GraphQL server that connects to every database, each microservice implements its own standalone, isolated GraphQL server. Then, a central API Gateway composes them into one unified "Supergraph."

**The Mechanism (Federation):**
1. **The Subgraphs:** The `UserService` defines the `User` type. The `OrderService` defines the `Order` type, but it also *extends* the `User` type to add an `orders` field, even though it doesn't own the core `User` data.
2. **The Gateway:** You deploy an Apollo Router or a HotChocolate Gateway. It pulls the schemas from all subgraphs and stitches them together into one unified schema.
This allows frontend teams to query data as if it were a monolith, while backend teams maintain completely decoupled microservices.

---

## Scenario — Question 4

**Q4: Your GraphQL API allows clients to fetch a `Post` and its `Author`. When 50 posts are fetched, the server executes 1 query for the posts, and 50 separate queries to fetch the author for each post, crippling database performance. What is this problem, and what specific GraphQL pattern solves it?**

This is the classic **N+1 Problem**, which is significantly more dangerous in GraphQL than REST because the client dictates the depth of the query.

**The Flaw:**
In REST, the server developer hardcodes the SQL joins. In GraphQL, the `PostResolver` fetches 50 posts. Then, the GraphQL execution engine iterates over those 50 posts, calling the `AuthorResolver` one by one. If `AuthorResolver` executes `SELECT * FROM Authors WHERE Id = @id`, it runs 50 times.

**The Solution: DataLoader Pattern**

You must batch and cache these individual resolver requests.

**The Mechanism:**
1. You implement a `DataLoader` (e.g., `AuthorDataLoader` in HotChocolate).
2. Inside the DataLoader, you write a single method that accepts an array of IDs: `GetAuthorsByIdsAsync(IReadOnlyList<int> authorIds)`. This method executes a single SQL query: `SELECT * FROM Authors WHERE Id IN (1, 2, 3...)`.
3. In your `AuthorResolver`, instead of querying the database directly, you ask the DataLoader: `return dataLoader.LoadAsync(post.AuthorId)`.
4. The GraphQL engine runs all 50 `AuthorResolvers` simultaneously. The DataLoader captures all 50 requested IDs, batches them into a single list, executes the one massive SQL query, and distributes the results back to the individual resolvers. 

This reduces 51 database queries down to exactly 2, completely solving the N+1 problem.

---

## Beginner — Question 2

**Q2: What are GraphQL Fragments, and why do they matter as queries grow larger?**

A Fragment is a reusable, named chunk of fields that can be included in multiple queries — GraphQL's way of avoiding the same set of fields being copy-pasted every time a client needs them.

**Without fragments — duplicated field selections:**
```graphql
query {
  user(id: 1) {
    id
    name
    email
    profilePicture
  }
  recommendedFriend(userId: 1) {
    id
    name
    email
    profilePicture
  }
}
```

**With a fragment — defined once, reused everywhere:**
```graphql
fragment UserFields on User {
  id
  name
  email
  profilePicture
}

query {
  user(id: 1) {
    ...UserFields
  }
  recommendedFriend(userId: 1) {
    ...UserFields
  }
}
```
If the client later needs to add `lastLoginDate` to every place a `User` is displayed, it's a one-line change to the `UserFields` fragment definition — every query using `...UserFields` picks up the change automatically, rather than needing to hunt down and update every individual query that happened to list those same fields manually.

**Fragments also enable component-colocated data requirements** in frontend frameworks like React/Relay/Apollo — each UI component can declare its own fragment describing exactly the fields *it* needs, and a parent query composes those fragments together, keeping each component's data dependencies next to the component itself rather than centralized in one giant query file that every team has to coordinate changes to.

**Common Pitfall:** treating fragments purely as a DRY (Don't Repeat Yourself) mechanism for the query author's convenience, while missing their bigger architectural value in component-based frontends — fragment colocation is what lets independent teams each own their own component's data requirements without one team's query change accidentally breaking another team's component that happened to rely on the same hand-written field list.

---

## Intermediate — Question 2

**Q2: Why doesn't GraphQL typically use versioned endpoints (`/v1/graphql`, `/v2/graphql`) the way REST commonly uses `/v1/`, `/v2/`?**

REST versions endpoints because the *server* controls the exact response shape returned to every client — changing that shape risks breaking every client depending on the old shape, so a new version is the safety valve. GraphQL's core design (the client specifies exactly which fields it wants) removes much of that pressure entirely.

**How GraphQL evolves a schema without versioning:**
```graphql
type User {
  id: ID!
  name: String!
  email: String!
  # Adding a new field is always safe -- old queries that don't ask for it are unaffected
  phoneNumber: String
}
```
Since a client's query only ever receives the fields it explicitly asked for, **adding** a new field to the schema can never break an existing client — an old query for `{ id, name, email }` gets exactly that, regardless of how many new fields have been added to the `User` type since that query was written.

**The genuinely hard case — deprecating or removing a field:**
```graphql
type User {
  id: ID!
  name: String!
  """Use `emailAddress` instead. Will be removed after 2026-06-01."""
  email: String! @deprecated(reason: "Use emailAddress instead")
  emailAddress: String!
}
```
GraphQL's `@deprecated` directive marks a field as discouraged without removing it — tooling (GraphQL IDE plugins, schema introspection) surfaces the deprecation warning to developers still using the old field, giving them a migration window before the field is eventually actually removed from the schema — a soft, gradual migration path rather than REST's harder "spin up a whole new versioned endpoint" approach.

**Where GraphQL still needs a real breaking change:** changing an existing field's *type* incompatibly, or changing its *semantics* without renaming it, has no safe migration path — those genuinely require either a new field name (and deprecating the old one) or, in rare cases, a genuinely new schema entirely.

**Common Pitfall:** assuming "GraphQL doesn't need versioning" means schema changes are risk-free — while *additive* changes are safe by construction, teams still need governance around deprecation timelines and monitoring which clients are still querying deprecated fields (via server-side usage analytics on field resolution) before actually deleting them, or they'll break clients anyway, just without the visible signal a REST version bump would have provided.

---

## Advanced — Question 1

**Q1: What are GraphQL Subscriptions, and how do they deliver real-time updates over WebSockets?**

Queries and Mutations are both request-response — the client asks once, gets one answer. A Subscription is GraphQL's third root operation type, letting a client establish a long-lived connection over which the server pushes updates whenever a specific event occurs, without the client re-polling.

**Defining a subscription in the schema:**
```graphql
type Subscription {
  orderStatusChanged(orderId: ID!): Order!
}
```

**The client subscribes and receives a stream of updates (not just one response):**
```graphql
subscription {
  orderStatusChanged(orderId: "12345") {
    id
    status
    updatedAt
  }
}
```

**The mechanism, in .NET with HotChocolate:**
```csharp
public class Subscription
{
    [Subscribe]
    [Topic("OrderStatusChanged_{orderId}")]
    public Order OrderStatusChanged([EventMessage] Order order, string orderId) => order;
}

// Elsewhere, when an order's status actually changes:
await _eventSender.SendAsync($"OrderStatusChanged_{order.Id}", order);
```
Unlike Queries/Mutations (served over standard HTTP request/response), Subscriptions require a persistent connection — typically **WebSockets** (via the `graphql-ws` or legacy `subscriptions-transport-ws` protocol), since the server needs to be able to push data to the client at any time, not just in response to a request. When `SendAsync` fires for a given topic, every client currently subscribed to that specific topic (`OrderStatusChanged_12345`) receives the update pushed down their open WebSocket connection immediately.

**Common Pitfall:** using Subscriptions for data that doesn't actually need real-time push semantics — e.g., subscribing to "get the current stock price" when the client only needs to display it once per page load. Subscriptions carry real infrastructural cost (maintaining persistent WebSocket connections at scale, handling reconnection logic, backpressure if a client can't keep up with the message rate) that a simple Query re-fetched occasionally, or a Query plus a lightweight polling interval, often handles more simply for data that doesn't genuinely need sub-second freshness.

---

## Advanced — Question 2

**Q2: How do you implement field-level authorization in GraphQL, and how does that differ from REST's typical endpoint-level authorization?**

In REST, an entire endpoint is usually gated behind one authorization check (`[Authorize(Roles = "Admin")]` on a controller action) — the whole response is either allowed or denied. GraphQL's single endpoint serving arbitrarily-shaped queries means authorization often needs to be enforced *per field*, since different fields on the same type can have completely different access requirements for the same request.

**The problem a single endpoint-level check can't solve:**
```graphql
query {
  user(id: 5) {
    name           # anyone can see this
    email          # only the user themselves or an admin can see this
    salary         # only HR or the user themselves can see this
  }
}
```
A single "is this request authorized" gate can't express "allow this query, but only populate `salary` if the caller is HR" — REST would need three separate endpoints (or a lot of manual conditional serialization logic) to express what GraphQL can express as three independently-authorized fields on one type.

**Field-level authorization in .NET (HotChocolate):**
```csharp
public class UserType : ObjectType<User>
{
    protected override void Configure(IObjectTypeDescriptor<User> descriptor)
    {
        descriptor.Field(u => u.Name);  // no restriction

        descriptor.Field(u => u.Email)
            .Authorize(); // requires ANY authenticated user

        descriptor.Field(u => u.Salary)
            .Authorize(policy: "HRPolicyOnly"); // requires a specific named policy
    }
}
```
When a query requests `salary` and the caller doesn't satisfy `HRPolicyOnly`, HotChocolate returns a partial response — the fields the caller *is* authorized for still resolve normally, while `salary` comes back as `null` with a specific authorization error attached to that field in the response's `errors` array, rather than failing the entire query.

**Why this matters architecturally:** it lets one schema serve many different callers with different clearance levels through the exact same query shape, with the server enforcing exactly which parts of the graph each caller can see — the authorization logic lives right next to the field it protects (similar to how Domain-Driven Design keeps invariants close to the data they guard), rather than being scattered across many different REST endpoint-level checks that all happen to touch overlapping data.

**Common Pitfall:** relying solely on hiding a field from the schema's introspection for a given caller as a "security" measure, rather than enforcing an actual authorization check on resolution — introspection-based hiding is a discoverability nicety at best; a determined caller who already knows a field's name from documentation or a leaked schema can still query it directly unless the resolver itself enforces the check.

---

## Beginner — Question 3

**Q3: What are GraphQL Variables, and why are they preferred over building query strings via manual concatenation of user input?**

Variables let a GraphQL query declare typed placeholders that are supplied separately from the query string itself — the same fundamental idea as parameterized SQL queries, and for the same underlying reason: keeping user-supplied values out of the query's literal text.

**Without variables — user input concatenated directly into the query string:**
```javascript
const userId = getUserInput(); // e.g., could contain unexpected characters
const query = `query { user(id: "${userId}") { name email } }`; // string concatenation
```
Beyond being awkward to build correctly (escaping quotes, handling different types), this pattern invites the same category of injection-adjacent bugs that string-concatenated SQL does — a malformed or unexpected value could break the query's syntax entirely, and it makes the query string itself non-reusable/non-cacheable since it's different every time the value changes.

**With variables — the query structure stays constant, values are passed separately:**
```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
  }
}
```
```json
{ "id": "user-input-value-here" }
```
The query document itself never changes regardless of what `$id` value is supplied — the GraphQL server parses the query structure once and binds the variable value separately, the same separation of "code" from "data" that parameterized queries provide in SQL.

**Why this matters for caching and tooling, not just safety:** because the query *text* stays identical across different variable values, tools like Persisted Queries (covered earlier) and query-plan caching can recognize "this is the same query as before, just with different variable values" — string-concatenated queries defeat this recognition entirely, since every differently-valued query looks like a completely different, never-before-seen query string.

**Common Pitfall:** using variables for some inputs but falling back to string concatenation for "just this one dynamic field name" or similar edge cases — GraphQL's type system and variable mechanism are designed to handle values, not structural parts of the query itself (which field to select); if a use case seems to need a dynamically-changing field *name*, that's usually a sign the schema itself needs a different design (e.g., an argument-based filter) rather than string-built queries.

---

## Intermediate — Question 3

**Q3: What is the "N+1 problem" as it appears specifically in GraphQL versus how it appears in a plain REST/EF Core context, and why does GraphQL make it structurally more likely to occur?**

The N+1 problem itself (one query for a list, then one additional query per item) isn't unique to GraphQL — it's the same performance bug covered for EF Core's lazy loading. What's different is that GraphQL's very design (client-specified nested field selection, arbitrary query shape) makes triggering it dramatically easier and less visible to the server developer, since the *client*, not the server's own code, controls how deeply nested a query gets.

**In a typical REST/EF Core context, the developer controls the query shape:**
```csharp
// The DEVELOPER decides whether to eager-load Posts or not, in the server's own code
var users = await _db.Users.Include(u => u.Posts).ToListAsync(); // developer's explicit choice
```
The person writing the server code sees, in their own codebase, exactly which relationships get loaded — the N+1 risk is visible in the code review of that one endpoint.

**In GraphQL, the client decides the query shape, and the server can't predict it in advance:**
```graphql
query {
  users {
    name
    posts {          # this client happened to ask for posts
      title
      comments {      # AND comments on those posts
        text
      }
    }
  }
}
```
The exact same `usersResolver`/`postsResolver`/`commentsResolver` code must correctly handle *this* deeply-nested query today, and a completely different, shallower query from a different client tomorrow — the server-side resolver code has no way to know ahead of time how deep a given request will nest, making it much easier for N+1 (or even N×M×K for triple-nested relationships) to occur without a developer specifically noticing during their own testing, since their own manual testing might only ever exercise shallow queries.

**Why DataLoader (covered earlier) is close to mandatory in GraphQL specifically, rather than just "a nice optimization":** because the *client* controls nesting depth in a way a REST developer's own code doesn't have to anticipate, GraphQL servers essentially must batch-and-cache every resolver that could be invoked multiple times per request as a matter of course — treating it as an occasional optimization (the way N+1 fixes are sometimes treated in a REST/EF Core codebase after the fact) leaves a GraphQL server vulnerable to arbitrary, client-controlled amplification of database load.

**Common Pitfall:** testing a GraphQL API only with the specific query shapes your own frontend team currently uses, and concluding N+1 isn't a problem because those particular queries perform fine — a different, deeper query (from a new client, a mobile app team, or simply a future frontend feature) can trigger the exact same underlying resolver code into a very different, much worse performance profile, since the resolvers themselves didn't change, only the query shape invoking them did.

---

## Advanced — Question 3

**Q3: What is Persisted Queries' relationship to Automatic Persisted Queries (APQ), and how does APQ solve the "who registers the query hashes" bootstrapping problem?**

Persisted Queries (covered earlier as a DoS defense) require every valid query to be pre-registered on the server, with clients sending only a short hash instead of the full query text — but this raises a practical question: how does a hash get registered on the server in the first place, especially across a large team shipping frequent frontend changes? Automatic Persisted Queries (APQ) solves this bootstrapping problem elegantly.

**Plain Persisted Queries — hashes must be registered ahead of time, via a separate build step:**
```text
1. Frontend build process extracts every GraphQL query from the codebase
2. Each query is hashed and uploaded to the server's registry BEFORE deployment
3. The running frontend only ever sends hashes, which the server recognizes because
   they were registered in step 2
```
This requires coordinating a registration step between the frontend build pipeline and the GraphQL server — workable, but adds real deployment coupling between the two.

**Automatic Persisted Queries — the client registers a hash the FIRST time it's used, on demand:**
```text
1. Client sends: { "extensions": { "persistedQuery": { "sha256Hash": "abc123" } } }
   (no query text at all -- just the hash)
2. Server has never seen "abc123" before -> responds with an error: "PersistedQueryNotFound"
3. Client retries, this time sending BOTH the hash AND the full query text
4. Server verifies the hash actually matches the provided query text, then STORES that
   mapping for next time, and executes it
5. Every SUBSEQUENT request can send just the hash -- the server already has it cached
```
The very first time any client uses a new query, there's a one-time extra round-trip (steps 2-3) to register it — every request after that (from any client, not just the one that registered it) can use the lightweight hash-only form.

**Why this removes the separate build-time registration step:** there's no longer a coordinated "upload all query hashes before deploying the frontend" pipeline step at all — the registration happens organically, automatically, the first time each query is actually used in production, self-bootstrapping without any separate coordination between frontend and backend deployment pipelines.

**Common Pitfall:** relying on APQ's automatic registration as a *security* boundary the way strict Persisted Queries are used (rejecting any query not pre-approved) — APQ's self-registering nature means it doesn't actually restrict *which* queries can be run the way a strictly pre-registered allowlist does; a client can still register and run an arbitrary new query on its first use. APQ is a bandwidth/performance optimization (avoid re-sending full query text on every request), not the same DoS-prevention mechanism strict Persisted Queries provide.

---
