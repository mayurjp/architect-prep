# Testing Strategy — Q&A

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

    // Act & Assert
    Assert.Equal(price * 0.9m, service.CalculateDiscount(price));
}
```

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

---

## Beginner — Question 2

**Q2: What is Test-Driven Development (TDD), and what is the Red-Green-Refactor cycle?**

TDD is a development practice where you write the **test before the implementation**, rather than writing code and testing it afterward — the test itself becomes the specification of what "done" means.

**The Red-Green-Refactor cycle:**
1. **Red** — write a test for a behavior that doesn't exist yet. Run it; it fails (compiler error or assertion failure) because there's no implementation. This confirms the test can actually detect absence of the feature.
```csharp
[Fact]
public void CalculateTotal_WithTwoItems_ReturnsSum() {
    var cart = new ShoppingCart();
    cart.AddItem(new Item { Price = 10 });
    cart.AddItem(new Item { Price = 15 });

    Assert.Equal(25, cart.CalculateTotal()); // fails: CalculateTotal() doesn't exist yet
}
```
2. **Green** — write the *minimum* code necessary to make the test pass. Not the most elegant solution, just enough to turn the test green.
```csharp
public decimal CalculateTotal() => Items.Sum(i => i.Price);
```
3. **Refactor** — now that the behavior is locked in by a passing test, clean up the implementation (extract methods, rename, remove duplication) with confidence, since any regression would immediately turn the test red again.

**Why write the test first at all:** it forces you to think about the API/interface from the *caller's* perspective before you've committed to an implementation, and it guarantees every line of production code has at least one test that would fail without it — a guarantee retrofitted tests can't make (a test written after the code can pass even if it's not actually testing the right thing).

**Common Pitfall:** treating TDD as mandatory for every single line of code regardless of context — it pays off most for business logic with real edge cases; exhaustively TDD-ing trivial getters/setters or thin wrapper code adds ceremony without meaningfully improving confidence.

---

## Intermediate — Question 2

**Q2: What is the difference between a Mock, a Stub, and a Fake?**

These terms are often used interchangeably (including as "mocking" in general), but they describe distinct kinds of test doubles with different purposes.

**Stub — supplies canned answers, nothing more:**
```csharp
var stubRepo = new Mock<IUserRepository>();
stubRepo.Setup(r => r.GetById(1)).Returns(new User { Id = 1, Name = "Alice" });
// Just returns canned data. We never check HOW it was called.
```
A Stub exists purely to feed the system under test the data it needs to run — you don't assert anything about the Stub itself afterward.

**Mock — a Stub that also records and lets you verify interactions:**
```csharp
var mockEmailSender = new Mock<IEmailSender>();
var service = new OrderService(mockEmailSender.Object);
service.PlaceOrder(order);

// Verifying the INTERACTION, not just checking a return value
mockEmailSender.Verify(x => x.SendAsync(order.CustomerEmail), Times.Once);
```
A Mock is used when the thing you actually want to test is "did my code call this dependency correctly?" — the assertion is about *behavior*, not just data.

**Fake — a real, working (but simplified) implementation:**
```csharp
public class FakeUserRepository : IUserRepository {
    private readonly Dictionary<int, User> _users = new();
    public void Add(User u) => _users[u.Id] = u;
    public User? GetById(int id) => _users.GetValueOrDefault(id);
}
```
A Fake actually implements real logic (an in-memory dictionary standing in for a database) rather than just returning pre-programmed values — it behaves consistently across multiple calls the way a Stub's fixed canned response doesn't (e.g., an item you `Add()` can later be found by `GetById()`).

**Common Pitfall:** overusing Mocks to verify *implementation details* rather than *observable behavior* — asserting "this private helper method was called exactly once" ties the test to the current implementation so tightly that any harmless refactor (even one that doesn't change behavior) breaks the test, defeating the purpose of having a safety net for refactoring.

---

## Advanced — Question 2

**Q2: How do you write parameterized tests in xUnit using `[Theory]`, `[InlineData]`, and `[MemberData]`?**

A `[Fact]` runs once. A `[Theory]` runs the **same test method** once per supplied set of inputs — avoiding copy-pasting near-identical test methods that only differ by input values.

**`[InlineData]` — simple, literal values baked into the attribute:**
```csharp
[Theory]
[InlineData(0, 0, 0)]
[InlineData(2, 3, 5)]
[InlineData(-1, 1, 0)]
public void Add_ReturnsSum(int a, int b, int expected) {
    Assert.Equal(expected, Calculator.Add(a, b));
}
```
Each `[InlineData(...)]` line runs the method once with those parameters — three inputs, three independently-reported test results in the test runner, not one pass/fail for all three combined.

**`[MemberData]` — for complex or reusable data that can't be expressed as attribute literals:**
```csharp
public static IEnumerable<object[]> DiscountCases()
{
    yield return new object[] { 100m, "Regular", 100m };
    yield return new object[] { 100m, "Premium", 90m };
    yield return new object[] { 100m, "VIP", 80m };
}

[Theory]
[MemberData(nameof(DiscountCases))]
public void ApplyDiscount_ReturnsExpectedPrice(decimal price, string tier, decimal expected)
{
    Assert.Equal(expected, DiscountCalculator.Apply(price, tier));
}
```
`[MemberData]` points to a static method/property returning `IEnumerable<object[]>` — useful when test cases involve objects that can't be expressed as C# attribute arguments (attributes only allow compile-time constants), or when the same dataset needs to be shared across multiple test methods.

**Why this matters:** it turns "did we forget an edge case?" into a one-line addition (`[InlineData(...)]`) rather than a whole new copy-pasted test method, and each case is reported individually in CI output, so a single failing edge case doesn't hide among otherwise-passing ones.

**Common Pitfall:** using `[MemberData]` with a data source that yields *mutable shared objects* across test cases — if two `object[]` entries reference the same underlying object and one test mutates it, other test cases (and test runs, since xUnit may reuse data across parallel runs) can see unexpected cross-contamination. Prefer yielding fresh instances per case.

---

## Beginner — Question 3

**Q3: What is the Arrange-Act-Assert (AAA) pattern, and why does structuring every test this way matter?**

AAA is a simple, consistent structural convention for organizing a unit test into three clearly separated phases — **Arrange** (set up the inputs and dependencies), **Act** (execute the thing being tested), **Assert** (verify the outcome) — making tests easier to read, write, and diagnose when they fail.

```csharp
[Fact]
public void ApplyDiscount_ForPremiumCustomer_Returns10PercentOff()
{
    // Arrange
    var customer = new Customer { Tier = "Premium" };
    var calculator = new DiscountCalculator();

    // Act
    var result = calculator.Apply(100m, customer);

    // Assert
    Assert.Equal(90m, result);
}
```

**Why the separation matters beyond just readability:**
- A test mixing setup, execution, and assertions together (`Assert.Equal(90m, new DiscountCalculator().Apply(100m, new Customer { Tier = "Premium" }))`) is harder to scan quickly to understand *what's actually being tested* versus *what's just plumbing*.
- When a test fails, a clearly separated Assert section makes it immediately obvious which specific expectation didn't hold, rather than having to mentally untangle setup logic from the actual check.
- It naturally discourages testing multiple unrelated behaviors in one test method — a test that needs three separate "Act" blocks to exercise three different behaviors is a signal it should probably be three separate test methods instead.

**Common Pitfall:** letting the Arrange section grow into a large, unfocused block of unrelated setup "just in case something needs it" — a bloated Arrange phase makes it hard to tell which specific pieces of setup are actually relevant to *this* test's Assert, and often indicates the class under test has too many dependencies or the test is trying to cover too much at once.

---

## Intermediate — Question 3

**Q3: What is Integration Testing "the database layer" using an in-memory provider, and why is EF Core's own documentation cautious about recommending it for anything beyond the simplest cases?**

EF Core ships an `InMemory` database provider specifically marketed for testing — it lets you swap a real SQL Server connection for an in-process, ephemeral data store, avoiding the need for an actual database server during tests. But it's a genuinely different database engine underneath, not SQL Server running in memory, which creates real behavioral gaps.

```csharp
var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString()) // fresh, isolated store per test
    .Options;

using var context = new AppDbContext(options);
context.Products.Add(new Product { Name = "Keyboard", Price = 29.99m });
context.SaveChanges();
```

**Why this can pass tests while the real database would fail (or vice versa):**
- **The InMemory provider doesn't enforce relational constraints** the way SQL Server does — a test inserting data that violates a foreign key or a unique index constraint in real SQL Server might succeed silently against InMemory, giving false confidence.
- **LINQ query translation differs** — some LINQ expressions that EF Core translates into valid (if inefficient) SQL against SQL Server might behave differently, or not translate the same way at all, against the InMemory provider's own query engine, since it isn't actually running EF Core's SQL Server translation layer.
- **No real transaction/isolation-level behavior** — tests relying on specific locking or isolation-level semantics (validating concurrency-token conflict detection, for example) can't meaningfully exercise that against a provider with no real transactional engine underneath.

**The modern recommended alternative — Testcontainers with a real SQL Server:**
```csharp
var container = new MsSqlBuilder().Build();
await container.StartAsync(); // a REAL SQL Server instance in Docker, disposable per test run
```
This costs more setup time and a Docker dependency, but tests run against the actual database engine your production code targets — catching constraint violations, query translation quirks, and concurrency behavior the InMemory provider structurally cannot.

**Common Pitfall:** using the InMemory provider for tests specifically meant to validate database-level correctness (constraint enforcement, complex query behavior) rather than pure business-logic tests that happen to touch a `DbContext` — InMemory is reasonable for the latter, actively misleading for the former.

---

## Advanced — Question 3

**Q3: What is Mutation Testing, and how does it expose a blind spot that code coverage metrics alone cannot detect?**

Code coverage tells you which lines of code *executed* during a test run — it says nothing about whether those lines were actually *verified* to behave correctly. Mutation Testing addresses this gap directly: it automatically introduces small, deliberate bugs ("mutants") into the production code and checks whether the existing test suite actually catches each one.

**The mechanism:**
```csharp
// Original code
public bool IsEligibleForDiscount(int orderCount) => orderCount >= 10;

// A mutation tool (e.g., Stryker.NET) automatically generates variants like:
public bool IsEligibleForDiscount(int orderCount) => orderCount > 10;   // changed >= to >
public bool IsEligibleForDiscount(int orderCount) => orderCount <= 10;  // changed >= to <=
public bool IsEligibleForDiscount(int orderCount) => true;              // removed the condition entirely
```
For each mutant, the tool re-runs the full test suite. If **at least one test fails**, the mutant is "killed" — the test suite successfully caught that specific behavioral change. If **every test still passes** despite the code now behaving differently, the mutant "survives" — a strong signal that no test actually verifies the boundary condition that mutant altered.

**Why this catches what coverage metrics miss:** a test that calls `IsEligibleForDiscount(15)` and asserts `true` achieves 100% line coverage of that one-line method — but if it never also tests the boundary (`orderCount == 10`, or `orderCount == 9`), the mutant changing `>=` to `>` would silently survive, revealing that "100% covered" didn't actually mean "100% correctly verified." Coverage only proves code *ran*; mutation testing proves whether tests would actually *notice* if that code's behavior changed.

**The practical trade-off:** running a full test suite once per generated mutant, potentially generating dozens or hundreds of mutants per file, is computationally expensive — mutation testing is typically run periodically (nightly builds, before major releases) rather than on every single commit the way unit tests themselves are, specifically because of this cost.

**Common Pitfall:** treating "kill 100% of mutants" as a hard target the way "100% code coverage" is sometimes (mis)treated — some surviving mutants represent genuinely equivalent code changes with no observable behavioral difference (a mutant that can never actually be distinguished by any test, because the code paths produce identical results), and chasing an artificial 100% mutation-kill score can lead to writing tests that verify implementation details rather than genuine behavior, the same anti-pattern coverage-chasing produces.

---
