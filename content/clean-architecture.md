## Beginner — Question 1

**Q1: What is Clean Architecture and what problem does it solve?**

Clean Architecture (championed by Robert C. Martin / "Uncle Bob") is an architectural pattern that separates software into layers, with a strict rule about dependencies: **dependencies must only point inward** toward the core domain.

**The Problem it Solves:**
In traditional N-Tier (layered) architecture, the business logic layer often depends heavily on the data access layer (the database). If you want to change the database, upgrade the ORM, or switch UI frameworks, the entire application breaks because everything is tightly coupled to the infrastructure.

**The Clean Architecture Solution:**
It places the **Domain** (business entities and rules) at the absolute center. The Domain knows nothing about databases, web APIs, or UI. 

1. **Domain Layer (Center):** Entities, Value Objects, Domain Exceptions. Zero external dependencies.
2. **Application Layer:** Use cases (Commands/Queries), DTOs, and Interfaces for infrastructure (e.g., `IUserRepository`). Depends *only* on the Domain layer.
3. **Infrastructure Layer:** Concrete implementations (e.g., `SqlUserRepository` using EF Core). Depends on the Application layer to implement its interfaces.
4. **Presentation Layer:** The Web API or UI. Depends on the Application layer to execute use cases.

Because the core business logic has no external dependencies, it is incredibly easy to unit test and completely insulated from technology churn.

---

## Intermediate — Question 1

**Q1: What is the CQRS pattern and how is it used with MediatR in .NET?**

CQRS (Command Query Responsibility Segregation) is an architectural pattern that states that every method should either be a **Command** that performs an action (modifies state) or a **Query** that returns data to the caller (reads state), but never both.

**Why use it?**
In many applications, the read workload (querying data) is vastly different from the write workload (processing business rules). CQRS allows you to optimize, scale, and secure reads and writes independently. For example, writes might go to a normalized SQL Server, while reads query a denormalized Redis cache or Elasticsearch index.

**Using MediatR in .NET:**
MediatR is an incredibly popular library that implements the Mediator pattern, serving as the perfect delivery mechanism for CQRS.
Instead of injecting a dozen different services into your Controller, you inject `IMediator`.

1. **The Request:** You create a record class representing the intent (e.g., `CreateUserCommand`).
2. **The Handler:** You create a separate class (`CreateUserCommandHandler`) that executes the business logic.
3. **The Controller:** 
```csharp
[HttpPost]
public async Task<IActionResult> CreateUser(CreateUserCommand command) {
    var result = await _mediator.Send(command); // Mediator finds the correct handler
    return Ok(result);
}
```
This forces single-responsibility. The controller only routes HTTP to MediatR, and each Handler does exactly one specific use case.

---

## Advanced — Question 1

**Q1: In Domain-Driven Design (DDD), what are Entities, Value Objects, and Aggregates?**

Clean Architecture is often paired with DDD to model complex business rules in the Domain layer.

1. **Entity:** An object defined primarily by its **identity**, not its attributes. Even if two people have the exact same Name and Age, they are different people because their IDs are different. (e.g., `User`, `Order`).
   - *Key trait:* They have a distinct lifecycle and their state can change over time.

2. **Value Object:** An object defined entirely by its **attributes** (its value), with no concept of identity. If two objects have the same attributes, they are considered mathematically equal. (e.g., `Money`, `Address`, `Color`).
   - *Key trait:* They must be **immutable**. If you want to change an address, you don't update its ZipCode; you replace the entire Address object.

3. **Aggregate (and Aggregate Root):** An Aggregate is a cluster of associated Entities and Value Objects that are treated as a single unit for data changes. Every Aggregate has a single entry point called the **Aggregate Root**.
   - *Example:* An `Order` (Root) containing multiple `OrderLine` (Entities) and a `ShippingAddress` (Value Object).
   - *The Rule:* Outside objects can only hold references to the Aggregate Root. If you want to add an OrderLine, you cannot modify the OrderLine table directly. You must call a method on the `Order` root (e.g., `order.AddLineItem(...)`). The Root is responsible for enforcing all business invariants (e.g., "An order cannot have more than 10 lines").

---

## Scenario — Question 1

**Q1: You have a Clean Architecture solution. Your Domain layer has a `User` entity with an `UpdatePassword()` method. This method needs to hash the new password, but hashing requires a cryptographic library (like BCrypt) that should not be in the pure Domain layer. How do you implement this without violating Clean Architecture dependency rules?**

This is the classic problem of injecting infrastructure capabilities into the pure Domain. The Domain cannot depend on BCrypt, but it needs to use it.

**The Solution: Domain Services and Interface Injection**

1. **Define the Interface in the Domain:**
   Inside the pure Domain Layer, you create an interface representing the capability you need.
   ```csharp
   // Inside Domain Layer
   public interface IPasswordHasher {
       string Hash(string plainText);
   }
   ```

2. **Use the Interface in the Domain:**
   Your `User` entity (or a Domain Service) accepts this interface as an argument. The Domain dictates the contract, but knows nothing about the implementation.
   ```csharp
   // Inside Domain Layer
   public class User {
       public string PasswordHash { get; private set; }
       
       public void UpdatePassword(string newPassword, IPasswordHasher hasher) {
           if (newPassword.Length < 8) throw new DomainException("Too short");
           this.PasswordHash = hasher.Hash(newPassword);
       }
   }
   ```

3. **Implement in the Infrastructure Layer:**
   In the Infrastructure Layer (which is allowed to reference the Domain Layer and external NuGet packages), you create the concrete class.
   ```csharp
   // Inside Infrastructure Layer
   public class BCryptPasswordHasher : IPasswordHasher {
       public string Hash(string plainText) => BCrypt.Net.BCrypt.HashPassword(plainText);
   }
   ```

4. **Wire it up in Application/API:**
   The Application layer's `UpdatePasswordCommandHandler` receives the `IPasswordHasher` via Dependency Injection, fetches the `User` from the database, and calls `user.UpdatePassword(newPassword, _hasher)`.

**Result:**
The dependency points *inward*. The Infrastructure depends on the Domain's interface. The Domain remains 100% pure, unit-testable (by passing a mock hasher), and ignorant of BCrypt.

---

## Scenario — Question 2

**Q2: You are enforcing Clean Architecture. A developer submits a Pull Request where the Application Layer's `GetUserQueryHandler` returns the EF Core `User` Entity directly to the Presentation Layer (the Web API controller), which then serializes it to JSON and sends it to the client. What is wrong with this, and how do you fix it?**

Returning Domain Entities or Infrastructure models directly to the Presentation Layer violates the strict boundaries of Clean Architecture and creates tight coupling.

**The Flaw:**
1. **Security Risk (Over-posting):** The `User` entity might contain sensitive fields like `PasswordHash` or `SocialSecurityNumber`. Serializing it directly exposes this data to the public API.
2. **Coupling:** If you rename a column in the database (which changes the Entity), the JSON payload returned to the mobile app changes automatically, breaking the mobile app. The database schema now dictates the API contract.

**The Fix: Data Transfer Objects (DTOs)**
You must decouple the internal domain from the external contract.

1. **Create a DTO:** In the Application Layer, define a `UserResponseDto` that contains *only* the data the client specifically requested (e.g., `Id`, `FullName`, `Email`).
2. **Map the Entity:** The `GetUserQueryHandler` fetches the `User` Entity from the database (via repository), and then maps its properties to a new `UserResponseDto`. You can do this manually or use a library like AutoMapper.
3. **Return the DTO:** The handler returns the DTO to the Controller. The Controller serializes the DTO.

Now, the database can change, and the Entity can change, but as long as the mapping logic is updated, the external API contract (`UserResponseDto`) remains perfectly stable and secure.

---

## Scenario — Question 3

**Q3: A team is building a microservice using Clean Architecture. They place EF Core `DbContext` logic directly inside the Domain layer so that Domain Entities can be loaded easily. Why is this a severe anti-pattern, and what is the correct approach?**

Placing `DbContext` (or any data access logic) in the Domain layer violates the primary rule of Clean Architecture: The Dependency Rule. 

**The Flaw:**
If the Domain depends on EF Core, it is no longer framework-independent. It becomes tightly coupled to a specific ORM and a specific version of that ORM. If you want to switch to Dapper or a NoSQL database, you have to rewrite your core business logic. Furthermore, it often leads to developers embedding database concepts (like foreign key IDs or navigation properties required by EF) directly into pure Domain models, muddying the business rules.

**The Fix:**
Data access is an infrastructure concern and must be pushed to the outermost Infrastructure Layer.

1. **Define a Repository Interface:** In the Application layer (or Domain layer depending on preference), define an abstraction, e.g., `IUserRepository` with methods like `Add()` or `GetById()`.
2. **Implement in Infrastructure:** In the Infrastructure layer, implement the `UserRepository` which injects the `DbContext` and uses EF Core to execute the database operations.
3. **Use the Interface:** The Application layer's Command/Query handlers use the `IUserRepository` interface to persist data without knowing how it actually happens. 
The Domain layer remains pure, focusing only on business rules, while the Infrastructure layer handles the messy details of translating objects into SQL.
