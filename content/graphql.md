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
3. **The Execution:** When a client sends a single query asking for a User and their Orders, the Gateway intelligently breaks the query apart. It routes the `User` part to the `UserService`, takes the returned `ID`, routes the `Orders` part to the `OrderService`, merges the two JSON responses back together, and returns the final unified result to the client.

This allows frontend teams to query data as if it were a monolith, while backend teams maintain completely decoupled microservices.
