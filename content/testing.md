## Beginner — Question 1

**Q1: What is the difference between Unit Testing and Integration Testing?**

These are the two most foundational layers of the testing pyramid.

1. **Unit Testing:** 
   - **Scope:** Tests the smallest testable part of an application (a "unit"), usually a single method or class.
   - **Isolation:** It operates in complete isolation. If a method relies on a database, a file system, or an external API, those dependencies are "mocked" (replaced with fake objects).
   - **Speed:** Because they don't hit external systems, unit tests run incredibly fast (thousands of tests in a few seconds).
   - **Goal:** To verify that the specific algorithm or business logic inside that single unit works exactly as expected.

2. **Integration Testing:**
   - **Scope:** Tests how multiple units (modules, classes, or external systems) work together.
   - **Isolation:** It specifically *does not* isolate dependencies. An integration test will connect to a real (or test-specific) database, read real files, and hit real APIs.
   - **Speed:** Much slower than unit tests due to network latency and disk I/O.
   - **Goal:** To verify the "wiring" of the application. It ensures that your Entity Framework query actually maps correctly to your SQL Server schema, which a unit test can never prove.

---

## Intermediate — Question 1

**Q1: What is Moq and why do we use it in Unit Testing?**

Moq is a popular mocking library for .NET. In unit testing, we must isolate the class under test from its dependencies to ensure we are only testing that class's logic.

**The Mechanism:**
If you have an `OrderService` that depends on an `IEmailSender`, you don't want your unit test to actually send real emails. Instead, you create a "Mock" of the `IEmailSender` using Moq.

```csharp
// Arrange
var mockEmailSender = new Mock<IEmailSender>();
// Configure the mock to return a specific value when called
mockEmailSender
    .Setup(x => x.SendEmailAsync(It.IsAny<string>()))
    .ReturnsAsync(true); 

var service = new OrderService(mockEmailSender.Object);

// Act
var result = await service.PlaceOrderAsync(new Order());

// Assert
Assert.True(result);
// Verify that the mock was actually called exactly once
mockEmailSender.Verify(x => x.SendEmailAsync(It.IsAny<string>()), Times.Once);
```

**Why it's powerful:**
Moq dynamically generates a proxy class at runtime that implements the targeted interface. You can set up exactly how this fake class should behave (return values, throw exceptions) and later verify if the class under test actually interacted with the mock correctly.

**Common Pitfalls:**
Mocking everything. If you mock the database, the network, and the validation service, your unit test might pass brilliantly, but the actual application will crash immediately because the assumptions you programmed into the mocks don't match reality. 

---

## Advanced — Question 1

**Q1: How do you perform robust Integration Testing in ASP.NET Core without managing physical test databases?**

Integration testing in ASP.NET Core is highly streamlined thanks to the `Microsoft.AspNetCore.Mvc.Testing` package.

**The Mechanism (`WebApplicationFactory`):**
This package provides `WebApplicationFactory<TEntryPoint>`. It bootstraps your *actual* ASP.NET Core application in memory, exactly as it would run in production (complete with DI, routing, and middleware), and provides a `HttpClient` to send requests against it.

```csharp
public class ApiTests : IClassFixture<WebApplicationFactory<Program>> {
    private readonly HttpClient _client;

    public ApiTests(WebApplicationFactory<Program> factory) {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetEndpoint_ReturnsSuccessAndCorrectContentType() {
        // Act
        var response = await _client.GetAsync("/api/users");
        
        // Assert
        response.EnsureSuccessStatusCode(); 
        Assert.Equal("application/json", response.Content.Headers.ContentType.MediaType);
    }
}
```

**Handling Databases in Integration Tests:**
You don't want integration tests hitting your production database, but you also don't want to mock the database entirely (otherwise it's just a unit test).
1. **EF Core In-Memory Database:** You can use `WebApplicationFactory.WithWebHostBuilder` to swap out your real SQL Server `DbContext` registration with an In-Memory database just for the test. However, this is discouraged for deep testing because the In-Memory provider doesn't support relational features (like Foreign Keys or specific SQL constraints).
2. **Testcontainers:** The modern, robust standard. It is a library that dynamically spins up a real SQL Server Docker container at the start of your test suite, configures your `WebApplicationFactory` to point to it, runs the tests against a *real* SQL engine, and destroys the container when the tests finish. This provides absolute fidelity without the headache of managing static test databases.

---

## Scenario — Question 1

**Q1: You are building a flaky, highly distributed microservice system. You have an integration test that calls Service A, which in turn makes an HTTP call to Service B over the network. How do you stabilize this test without actually running Service B?**

Relying on external services over the network during an integration test leads to "flaky tests"—tests that fail randomly because of network timeouts, or because Service B's team deployed a broken version.

**The Solution: WireMock (or similar Stubbing tools)**
You must isolate Service A from the actual network call to Service B, but you *cannot* use Moq because Moq only fakes C# interfaces within the same process. You need to fake an actual HTTP server.

**The Mechanism:**
1. In your test setup, you spin up a **WireMock.Net** server on a dynamic local port (e.g., `localhost:54321`).
2. You configure your `WebApplicationFactory` for Service A to override its `HttpClient` BaseAddress to point to the WireMock port instead of the real Service B URL.
3. You instruct WireMock on how to respond: "If you receive a GET request for `/api/products/123`, return a 200 OK with this specific JSON string."
4. When Service A executes its logic, it makes a real outgoing HTTP request via `HttpClient`.
5. WireMock catches the request, instantly returns the canned JSON response, and Service A processes it successfully.

**Why this is robust:**
It tests your HTTP serialization, timeout configurations, and error handling (you can tell WireMock to return a 500 Internal Server Error to ensure Service A handles it gracefully) without ever leaving the localhost machine or relying on external teams.

---

## Scenario — Question 2

**Q2: Your team has achieved 95% code coverage with unit tests, but production deployments still frequently fail due to bugs. Management is confused. Why is high code coverage not preventing production failures, and what testing strategies are missing?**

High code coverage is a metric of how many lines of code executed during a test run; it is *not* a metric of test quality or system correctness.

**Why it fails:**
1. **The "Assert-less" Test:** Developers can achieve 100% coverage by writing tests that execute methods but never `Assert` the outcomes. The code runs, but its correctness is never verified.
2. **Mocking Reality Away:** If a developer mocks the `IUserRepository` to always return success, but the real SQL query has a syntax error, the unit test passes brilliantly while production immediately crashes on the database call. The unit test covered the logic *assuming the database works*, but never proved the database works.
3. **Integration Gaps:** Unit A works perfectly. Unit B works perfectly. But they expect different JSON date formats when they communicate. High unit test coverage will never catch integration mismatches.

**The Missing Strategies:**
To build true confidence, the team must shift focus from pure unit test coverage to the higher levels of the Testing Pyramid:
1. **Meaningful Assertions:** Code review tests to ensure they assert state changes and edge cases, not just happy paths.
2. **Integration Tests:** Implement tests using `WebApplicationFactory` and Testcontainers to verify the actual database queries, EF Core mappings, and HTTP routing without mocks.
3. **End-to-End (E2E) Tests:** Use tools like Playwright or Selenium to simulate a real user clicking through the UI against a fully deployed staging environment, proving that the frontend, backend, and database all work together in harmony.

---

## Scenario — Question 3

**Q3: A developer writes a unit test for a service method that calculates a discount based on `DateTime.Now`. The test occasionally fails if it runs exactly at midnight or on specific days of the month. How do you refactor the code and the test to eliminate this flakiness?**

Code that tightly couples itself to `DateTime.Now` (or `DateTime.UtcNow`) is notoriously difficult to test because the input is non-deterministic—it changes every time the test runs.

**The Flaw:**
```csharp
public decimal CalculateDiscount(decimal price) {
    // If it's Friday, give a 10% discount. (Hard to test on a Tuesday!)
    if (DateTime.Now.DayOfWeek == DayOfWeek.Friday) return price * 0.9m;
    return price;
}
```

**The Solution: Abstracting Time**
You must treat "time" as just another dependency that can be injected and mocked.

1. **Use `TimeProvider` (.NET 8+):** Microsoft introduced the `System.TimeProvider` class specifically for this scenario.
2. **Inject the Provider:** Modify the service to accept `TimeProvider` via its constructor.
3. **Refactor Logic:** Use the provider instead of static calls.
```csharp
public class DiscountService {
    private readonly TimeProvider _timeProvider;
    public DiscountService(TimeProvider timeProvider) => _timeProvider = timeProvider;

    public decimal CalculateDiscount(decimal price) {
        if (_timeProvider.GetLocalNow().DayOfWeek == DayOfWeek.Friday) return price * 0.9m;
        return price;
    }
}
```

**The Test:**
In your unit test, you use `FakeTimeProvider` (from the `Microsoft.Extensions.TimeProvider.Testing` package) to freeze time exactly where you need it.
```csharp
[Fact]
public void CalculateDiscount_OnFriday_Returns10PercentOff() {
    // Arrange
    var fakeTime = new FakeTimeProvider();
    // Set time explicitly to a known Friday
    fakeTime.SetUtcNow(new DateTime(2023, 11, 24, 0, 0, 0, DateTimeKind.Utc)); 
    
    var service = new DiscountService(fakeTime);

Now the test is 100% deterministic and will pass forever, regardless of when it is run.

---

## Scenario — Question 4

**Q4: Your team uses xUnit for testing. You have an `OrderProcessorTests` class with 50 tests. To save time, you initialize a mock database context in the class constructor so all 50 tests can share it. Randomly, tests start failing. When you run a failing test individually, it passes. When you run the whole suite, it fails. Why is this happening, and how do you fix it?**

This is caused by **Shared State Mutation** across parallel test executions.

**The Flaw:**
By default, xUnit runs all test classes in parallel, but it runs tests *within the same class* sequentially. However, xUnit creates a **new instance of the test class for every single test method**. 
If you initialize a mock database in the constructor, it is re-created for every test, which is safe. *Unless* you declare that mock database as `static`, or you are testing a singleton service that retains state across the AppDomain. If Test A adds an order to the shared static mock DB, and Test B expects the DB to be empty, Test B will fail if it runs after Test A.

**The Solution:**
Tests must be completely isolated and idempotent. 

1. **Never use static state** for dependencies in unit tests.
2. **xUnit Fixtures:** If you intentionally want to share expensive setup (like a real database connection in an integration test) across multiple tests *safely*, you must use xUnit's `IClassFixture<T>` or `ICollectionFixture<T>`. 
   - When you use a Fixture, xUnit creates the dependency exactly once, passes it to the constructor of the test class for every test, and ensures that the shared state is managed properly. However, even with a Fixture, you must still ensure that your tests clean up after themselves (e.g., Test A inserts an order, asserts, and then deletes the order) so it doesn't pollute the database for Test B.
