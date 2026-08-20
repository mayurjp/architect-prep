# ASP.NET Web API — Q&A

## Beginner — Question 1

**Q1: What is the difference between `[ApiController]` and a standard MVC `Controller`?**

In ASP.NET Core, an API controller is typically decorated with the `[ApiController]` attribute and inherits from `ControllerBase` rather than `Controller`.

**The Mechanism:**
- **`[ApiController]` Attribute:** Enables API-specific behaviors, such as:
  - **Attribute Routing Requirement:** You are forced to use attribute routing (e.g., `[Route("api/[controller]")]`) instead of conventional routing.
  - **Automatic Model Validation:** It automatically triggers a `400 Bad Request` if `ModelState.IsValid` is false, saving you from writing `if (!ModelState.IsValid) return BadRequest();` in every action.
  - **Binding Source Inference:** It automatically infers where parameters come from (e.g., complex types from `[FromBody]`, primitives from `[FromQuery]` or `[FromRoute]`).
- **`ControllerBase` vs `Controller`:** `ControllerBase` provides essential methods for returning HTTP responses (`Ok()`, `NotFound()`, `BadRequest()`). `Controller` inherits from `ControllerBase` but adds support for Razor Views (like `View()`, `ViewBag`). API controllers don't need Razor Views, so inheriting from `ControllerBase` keeps them lightweight.

#### Follow-up: How do you disable the automatic 400 response from `[ApiController]`?
You can disable it globally in `Program.cs` by configuring the `ApiBehaviorOptions`:
```csharp
builder.Services.Configure<ApiBehaviorOptions>(options => {
    options.SuppressModelStateInvalidFilter = true;
});
```

---

## Beginner — Question 2

**Q2: How does Content Negotiation work in ASP.NET Core Web API?**

Content Negotiation is the process where the client and server agree on the format of the data being exchanged (usually JSON or XML).

**The Mechanism:**
1. The client sends an HTTP request with an `Accept` header (e.g., `Accept: application/xml`).
2. When the API controller returns an `ObjectResult` (e.g., `return Ok(myObject);`), ASP.NET Core examines the `Accept` header.
3. It looks through its configured list of `IOutputFormatter` instances.
4. If it finds a formatter that matches the requested content type, it serializes the object into that format and returns it.
5. If no match is found, it defaults to the first configured formatter (which is JSON by default in ASP.NET Core).

**Common Pitfalls:**
By default, ASP.NET Core only supports JSON. If a client requests XML, they will still get JSON. To support XML, you must explicitly add the XML formatters in `Program.cs`:
```csharp
builder.Services.AddControllers()
    .AddXmlSerializerFormatters();
```
If you want the API to strictly reject formats it doesn't support with a `406 Not Acceptable` instead of defaulting to JSON, you must set `options.ReturnHttpNotAcceptable = true`.

---

## Intermediate — Question 1

**Q1: What are Action Filters and how do they differ from Middleware?**

Both Action Filters and Middleware intercept requests to perform cross-cutting concerns (like logging, validation, or caching), but they operate at different levels of the ASP.NET Core pipeline.

**Middleware:**
- Sits at the host level, wrapping the *entire* HTTP request.
- Runs before the routing system fully determines which controller will handle the request.
- Has no context about controllers, actions, or model binding.
- Best for: Global concerns like CORS, authentication, global error handling, and request logging.

**Action Filters (`IActionFilter` / `IAsyncActionFilter`):**
- Sit specifically within the MVC/API execution pipeline.
- Run *after* routing and model binding, but *before* and *after* the specific Action method executes.
- They have access to the `ActionExecutingContext`, which means you can inspect the bound model, the controller instance, and the `ModelState` before the action runs.
- Best for: Validating inputs, formatting specific responses, or action-specific caching.

```csharp
// Example of an Action Filter
public class ValidateCustomHeaderFilter : IAsyncActionFilter {
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next) {
        if (!context.HttpContext.Request.Headers.ContainsKey("X-Custom-Header")) {
            context.Result = new BadRequestObjectResult("Missing Header");
            return; // Short-circuits the action
        }
        await next(); // Executes the action
    }
}
```

---

## Advanced — Question 1

**Q1: How do you implement API Versioning, and what are the trade-offs of the different strategies?**

API versioning allows you to evolve your API (including breaking changes) without breaking existing clients.

**Strategies and Trade-offs:**

1. **URI/Path Versioning (e.g., `/api/v1/users`)**
   - *How:* `[Route("api/v{version:apiVersion}/[controller]")]`
   - *Pros:* Extremely explicit. Easy for clients to see which version they are hitting. Easy to route at the load balancer level.
   - *Cons:* Violates REST principles (a URI should represent a resource, not a version). Harder to maintain over time as endpoints duplicate.

2. **Query String Versioning (e.g., `/api/users?api-version=1.0`)**
   - *Pros:* Keeps the URI clean. Easy to implement default versions.
   - *Cons:* Can be easily overlooked by clients.

3. **Header Versioning (e.g., `X-API-Version: 1.0`)**
   - *Pros:* Fully REST-compliant (URIs represent resources only). Clean URLs.
   - *Cons:* Harder to test in a browser without a tool like Postman.

4. **Media Type / Accept Header Versioning (e.g., `Accept: application/json;v=1.0`)**
   - *Pros:* Highly RESTful. Version is tied to the content format representation.
   - *Cons:* Complex to implement and often confusing for API consumers.

**Implementation in ASP.NET Core:**
You use the `Asp.Versioning.Mvc` package.
```csharp
builder.Services.AddApiVersioning(options => {
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    
    // Combine strategies: Read from Header, fallback to Query String
    options.ApiVersionReader = ApiVersionReader.Combine(
        new HeaderApiVersionReader("X-Api-Version"),
        new QueryStringApiVersionReader("api-version")
    );
});
```

#### Follow-up: How do you handle Swagger/OpenAPI documentation with multiple versions?
You must use `Asp.Versioning.Mvc.ApiExplorer`. It builds an `IApiVersionDescriptionProvider` which allows you to loop through all discovered API versions and dynamically generate a separate Swagger document (e.g., `v1/swagger.json`, `v2/swagger.json`) for each version.

---

## Advanced — Question 2

**Q2: What is the difference between Synchronous and Asynchronous streams (`IAsyncEnumerable<T>`) in Web API, and when should you use them?**

When returning a large collection of data from an API, how you return it severely impacts memory usage and time-to-first-byte (TTFB).

**Synchronous Collections (`IEnumerable<T>` or `List<T>`):**
If your controller returns a `List<T>`, the Entity Framework query must execute entirely, load all 10,000 records into the web server's RAM, serialize the entire list into a massive JSON string in RAM, and then send the whole payload to the client. This spikes memory and increases TTFB.

**Asynchronous Streams (`IAsyncEnumerable<T>`):**
Introduced in C# 8.0, `IAsyncEnumerable<T>` allows you to yield elements asynchronously. 
ASP.NET Core natively supports returning this from an API endpoint.

```csharp
[HttpGet]
public async IAsyncEnumerable<Product> GetProducts() {
    // The database streams rows to the web server one by one...
    // The web server serializes and streams them to the client one by one!
    await foreach (var product in _db.Products.AsAsyncEnumerable()) {
        yield return product;
    }
}
```

**The Benefit:**
Instead of buffering 10,000 records in memory, the server streams the JSON array to the HTTP response stream as the database yields the rows. Memory usage remains extremely low and flat, and the client receives the first byte of JSON almost instantly, even if the query takes a long time to complete.

---

## Scenario — Question 1

**Q1: You built a Web API that receives heavy traffic. The API sometimes has to do heavy background processing when an endpoint is hit (e.g., resizing an uploaded image). A junior developer used `Task.Run(() => ResizeImage())` inside the controller to fire-and-forget the work so the HTTP request could return immediately. Why is this dangerous in ASP.NET Core, and what is the proper solution?**

Using `Task.Run` for fire-and-forget background work inside an HTTP request context is extremely dangerous.

**The Flaw:**
ASP.NET Core knows nothing about the background `Task.Run`. Once the HTTP request finishes and returns a 200 OK, ASP.NET Core considers the request complete. If the IIS/Kestrel worker process needs to gracefully recycle, or if the application stops, ASP.NET Core will immediately kill the background thread running `ResizeImage()`, resulting in data loss. 
Additionally, `Task.Run` steals a thread from the Thread Pool, which under heavy load, will starve the Thread Pool of threads needed to serve new incoming HTTP requests.

**The Proper Solutions:**

1. **IHostedService / BackgroundService (In-Process):**
   If the work is lightweight, you can use the built-in `IHostedService` via a `Channel`. The controller writes the image data to a thread-safe `Channel<T>`. A long-running `BackgroundService` listens to the channel and processes the images sequentially. Because the `BackgroundService` is registered with the host, ASP.NET Core will wait for it to finish gracefully during shutdown.

2. **Distributed Message Queue (Out-of-Process - Preferred):**
   For CPU-heavy work like image resizing, you should completely offload the work. The controller publishes an `ImageUploadedEvent` to a message broker (RabbitMQ, Azure Service Bus). A completely separate Worker Service application listens to the queue and resizes the image. This prevents the Web API's CPU from spiking and ensures absolute durability (if the worker crashes, the message remains in the queue).

---

## Scenario — Question 2

**Q2: You have a Web API that serves configuration data to a mobile app. The mobile app calls this API every time it starts up. You notice the database is being hammered with thousands of identical read queries every minute. How do you implement HTTP Response Caching to solve this?**

You should use HTTP Response Caching so that the client (or intermediary proxies/CDNs) caches the response, preventing the request from ever reaching your server.

**The Solution:**
You apply the `[ResponseCache]` attribute to your controller or action method.

**The Mechanism:**
```csharp
[HttpGet("config")]
// Cache the response for 60 seconds.
[ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any)]
public IActionResult GetConfiguration() {
    var config = _db.GetConfig();
    return Ok(config);
}
```

**How it works:**
This attribute does *not* cache the data in the server's memory. Instead, it instructs ASP.NET Core to set the `Cache-Control` HTTP header in the response (e.g., `Cache-Control: public, max-age=60`). 
When the mobile app (or a CDN) sees this header, it caches the JSON response locally for 60 seconds. If the mobile app restarts 10 seconds later and requests the same URL, the mobile operating system's networking stack intercepts the request and instantly returns the cached JSON without even opening a network connection to your server. 

**Common Pitfalls:**
Do not use `[ResponseCache]` for user-specific data (like a shopping cart) if `Location = ResponseCacheLocation.Any`. A CDN might cache User A's cart and serve it to User B. For user-specific data, use `Location = ResponseCacheLocation.Client` (sets `Cache-Control: private`), which tells shared proxies/CDNs *not* to cache it, but allows the user's specific browser to cache it.

---

## Scenario — Question 3

**Q3: A mobile application sends a POST request with a massive 50MB JSON payload to your ASP.NET Core API. The payload contains a batch of thousands of records to process. The API is suddenly crashing with `OutOfMemoryException`. Upon investigating, the memory spikes violently exactly when the request arrives, before your controller code even executes. How do you troubleshoot and fix this?**

This is caused by **Buffer Bloat** during Model Binding.

**The Flaw:**
By default, when you bind a massive JSON payload using `[FromBody] List<Record> records`, ASP.NET Core buffers the entire HTTP request body into memory, deserializes the *entire* 50MB JSON string into a massive memory-hogging object graph (creating hundreds of thousands of small .NET objects), and *then* passes that list into your controller action. This consumes hundreds of megabytes of RAM per request. If 5 users upload at the same time, the server runs out of memory and crashes.

**The Solution:**
You must bypass Model Binding and stream the JSON payload directly off the network stream, deserializing it asynchronously as it arrives without ever buffering the whole payload into memory.

```csharp
[HttpPost("batch")]
public async Task<IActionResult> UploadBatch()
{
    // Do NOT use [FromBody]. Instead, read directly from Request.Body
    
    // IAsyncEnumerable allows us to stream the JSON array elements one by one
    var records = JsonSerializer.DeserializeAsyncEnumerable<Record>(
        Request.Body, 
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

    await foreach (var record in records)
    {
        // Process each record individually. Memory stays low and flat!
        _db.Records.Add(record);
        
        // Optionally save in chunks to avoid EF Core bloat
    }
    
    await _db.SaveChangesAsync();
    return Ok();
}
```
This streaming approach ensures that regardless of whether the payload is 5MB or 500MB, the memory footprint remains virtually zero, as objects are immediately garbage collected after processing.

---

## Beginner — Question 3

**Q3: What is Swagger/OpenAPI, and how do you set it up in an ASP.NET Core Web API?**

OpenAPI is a language-agnostic specification format for describing a REST API's endpoints, request/response shapes, and auth requirements as machine-readable JSON/YAML. **Swagger** is the tooling ecosystem (originally the name of the spec itself, now a separate brand) built around that spec — most notably Swagger UI, an interactive browsable documentation page generated directly from the spec.

**The Mechanism:**
```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(); // scans controllers/actions and builds the OpenAPI document

var app = builder.Build();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();    // serves the raw OpenAPI JSON at /swagger/v1/swagger.json
    app.UseSwaggerUI();  // serves the interactive browsable page at /swagger
}
```

`AddSwaggerGen` reflects over your controllers, actions, `[HttpGet]`/`[HttpPost]` attributes, parameter types, and `ActionResult<T>` return types to infer the shape of each endpoint automatically — no manual spec-writing required for a baseline document.

**Enriching the generated document:**
```csharp
/// <summary>Gets a product by its ID.</summary>
/// <response code="404">Product not found.</response>
[HttpGet("{id}")]
[ProducesResponseType(typeof(Product), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public ActionResult<Product> GetById(int id) { ... }
```
XML doc comments (enabled via `<GenerateDocumentationFile>true</GenerateDocumentationFile>` in the `.csproj`) and `[ProducesResponseType]` attributes both feed into a richer, more accurate Swagger UI page — showing possible status codes and their shapes, not just the happy path.

**Common Pitfall:** leaving `app.UseSwaggerUI()` enabled and unauthenticated in a production deployment. It fully documents every endpoint, parameter, and DTO shape — genuinely useful information for an attacker probing your API's surface. Most teams gate it behind `IsDevelopment()` or put it behind additional authentication in staging/production.

---

## Intermediate — Question 2

**Q2: How does model validation work with Data Annotations in a Web API, and where does FluentValidation fit in?**

**Data Annotations** are attributes placed directly on a model's properties that the framework checks automatically during model binding — before your action method body even runs (when combined with `[ApiController]`).

```csharp
public class CreateProductRequest
{
    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [Range(0.01, 100000)]
    public decimal Price { get; set; }

    [RegularExpression(@"^[A-Z]{3}-\d{4}$")]
    public string Sku { get; set; } = string.Empty;
}
```

Because the controller is decorated with `[ApiController]`, an invalid model automatically short-circuits to a `400 Bad Request` with a `ValidationProblemDetails` body listing every failed field — you never have to write `if (!ModelState.IsValid)` yourself.

**Where Data Annotations fall short:** they can't easily express validation that depends on *multiple* properties together (e.g., "EndDate must be after StartDate"), can't easily reuse the same rule set across unrelated models, and mixing business rules into attributes on a DTO blurs the line between "shape validation" and "business logic."

**FluentValidation fills that gap:**
```csharp
public class CreateProductValidator : AbstractValidator<CreateProductRequest>
{
    public CreateProductValidator()
    {
        RuleFor(x => x.Name).NotEmpty().Length(2, 100);
        RuleFor(x => x.Price).InclusiveBetween(0.01m, 100000);
        RuleFor(x => x).Must(x => x.DiscountPrice == null || x.DiscountPrice < x.Price)
            .WithMessage("Discount price must be less than the regular price.");
    }
}
```
Rules live in a separate, testable class (not attributes scattered across the model), support cross-property rules naturally, and are composable/reusable across different request types.

**Common Pitfall:** stacking both Data Annotations *and* FluentValidation rules on the same model without a clear convention for which owns what — teams that adopt FluentValidation usually strip Data Annotations from their DTOs entirely to avoid two competing, easily-desynced sources of truth for the same field.

---

## Advanced — Question 3

**Q3: What is HATEOAS, and why do most real-world Web APIs skip it despite it being part of "true" REST?**

HATEOAS (Hypermedia As The Engine Of Application State) is the REST constraint that says a response shouldn't just return data — it should include **links** describing what actions the client can take next, the way a website's HTML includes `<a>` links to guide navigation without the client needing prior out-of-band knowledge of the URL structure.

**What it looks like in practice:**
```json
{
  "id": 5,
  "status": "Pending",
  "total": 99.99,
  "_links": {
    "self": { "href": "/api/orders/5" },
    "cancel": { "href": "/api/orders/5/cancel", "method": "DELETE" },
    "pay": { "href": "/api/orders/5/pay", "method": "POST" }
  }
}
```
Instead of the client hardcoding "orders can be canceled via `DELETE /api/orders/{id}/cancel`," the API tells the client which actions are *currently valid* for this specific resource in its current state — notice there's no `"pay"` link if the order were already `Paid`, meaning the client doesn't even need business-rule knowledge baked in client-side.

**Why most APIs skip it anyway:**
- **Client complexity for uncertain benefit:** parsing and following hypermedia links is meaningfully more work for client developers than "just call the endpoint you already know," and most internal/first-party clients are built and deployed in lockstep with the API anyway — the theoretical decoupling benefit doesn't materialize when the same team owns both sides.
- **No dominant standard:** unlike JSON itself, there's no single widely-adopted hypermedia format — HAL, JSON:API, and Siren all compete, fragmenting tooling and client library support.
- **Versioning already solves the "avoid breaking clients" problem** that HATEOAS is partly meant to address, and most teams find explicit versioning easier to reason about than implicit link-following.

**Where it does get used:** large, long-lived public APIs with many independent third-party clients (payment processors like Stripe use hypermedia-*adjacent* patterns), where decoupling client logic from server-side URL structure has real, measurable value over the API's multi-year lifetime.

---

## Beginner — Question 4

**Q4: What is Minimal API syntax in ASP.NET Core, and how does it differ from controller-based Web API for building simple endpoints?**

Minimal APIs let you define an HTTP endpoint directly in `Program.cs` as a lambda, without a controller class, action method, or attribute routing scaffolding — introduced in .NET 6 as a lighter-weight alternative for small services and simple endpoints.

**Controller-based (traditional):**
```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    [HttpGet("{id}")]
    public IActionResult GetById(int id)
    {
        var product = _repository.GetById(id);
        return product is null ? NotFound() : Ok(product);
    }
}
```

**Minimal API — the same endpoint, no controller class:**
```csharp
var app = builder.Build();

app.MapGet("/api/products/{id}", (int id, IProductRepository repository) =>
{
    var product = repository.GetById(id);
    return product is null ? Results.NotFound() : Results.Ok(product);
});

app.Run();
```
Dependencies (`IProductRepository`) are injected as lambda parameters directly, rather than through a constructor — ASP.NET Core's minimal API infrastructure resolves them from the DI container automatically based on parameter type.

**When Minimal APIs fit well:** small microservices with few endpoints, simple CRUD APIs, or scenarios where the ceremony of a full controller class (attributes, base class, separate file) outweighs the benefit for that specific service's size. Minimal APIs also have a measurably smaller startup/memory footprint, relevant for high-density container deployments or serverless functions.

**When controllers still make more sense:** APIs with many related endpoints benefiting from shared controller-level concerns (a common `[Authorize]` attribute, shared constructor-injected dependencies across many actions, model binding conventions), or teams who prefer the more structured, testable shape of a dedicated controller class per resource.

**Common Pitfall:** cramming a large, many-endpoint API entirely into `Program.cs` as dozens of `app.MapGet`/`app.MapPost` lambdas — Minimal APIs support extracting groups of related endpoints into separate extension methods or files (`app.MapProductEndpoints()`), and skipping that organization as the endpoint count grows turns `Program.cs` into an unmaintainable wall of lambdas.

---

## Intermediate — Question 3

**Q3: What is the `[FromServices]` attribute, and how does it differ from constructor injection in a Web API controller?**

Both retrieve a dependency from the DI container, but `[FromServices]` resolves it at the **action method parameter** level, for a single specific action, rather than for every action in the controller via the constructor.

**Constructor injection — the dependency is available to every action:**
```csharp
public class OrdersController : ControllerBase
{
    private readonly IOrderService _orderService;
    public OrdersController(IOrderService orderService) => _orderService = orderService;

    [HttpGet]
    public IActionResult GetAll() => Ok(_orderService.GetAll()); // available here
    [HttpPost]
    public IActionResult Create(Order order) => Ok(_orderService.Create(order)); // and here
}
```

**`[FromServices]` — resolved only for the one action that declares it:**
```csharp
public class OrdersController : ControllerBase
{
    [HttpGet("{id}/audit-log")]
    public IActionResult GetAuditLog(int id, [FromServices] IAuditLogService auditLog)
    {
        return Ok(auditLog.GetForOrder(id)); // only THIS action needs this dependency
    }
}
```
If `IAuditLogService` is only ever needed by this one rarely-used action, injecting it via the constructor would mean the controller's constructor pulls in and resolves that dependency on **every single request** to **any** action on this controller, even ones that never use it — `[FromServices]` scopes the resolution to only the specific action that actually needs it.

**Common Pitfall:** using `[FromServices]` as a default habit for every dependency "to keep constructors clean" — for a dependency genuinely used across most/all actions in a controller, constructor injection is clearer (the class's dependencies are visible in one place) and avoids repeating `[FromServices]` on every method signature; `[FromServices]` earns its place specifically for dependencies used by only a minority of a controller's actions.

---

## Advanced — Question 4

**Q4: What is Output Caching in ASP.NET Core (introduced in .NET 7), and how does it differ from Response Caching?**

Both cache HTTP responses to avoid re-executing an endpoint's logic, but Output Caching stores the cached response **on the server** and can serve it directly without re-running the endpoint at all, whereas Response Caching (the `[ResponseCache]` attribute) primarily sets HTTP headers instructing the **client or an intermediary proxy/CDN** to cache the response — the server itself still has to run the endpoint at least once per client unless a shared cache in between happens to have it.

**Output Caching — the server itself skips re-execution on a cache hit:**
```csharp
builder.Services.AddOutputCache(options =>
{
    options.AddPolicy("ProductCache", builder => builder.Expire(TimeSpan.FromSeconds(30)));
});

var app = builder.Build();
app.UseOutputCache();

app.MapGet("/api/products", (IProductRepository repo) => repo.GetAll())
   .CacheOutput("ProductCache"); // the endpoint delegate itself is NOT invoked on a cache hit
```
On a cache hit, ASP.NET Core's Output Cache middleware returns the previously-generated response directly, without the `IProductRepository` call (or any of the endpoint's logic) running again at all — genuinely saving server-side compute, not just instructing clients to skip a round-trip.

**Response Caching — sets headers, doesn't prevent server-side re-execution by itself:**
```csharp
[HttpGet]
[ResponseCache(Duration = 30, Location = ResponseCacheLocation.Any)]
public IActionResult GetAll() => Ok(_repository.GetAll()); // this STILL runs on every request
                                                             // unless a client/CDN cache intercepts it first
```
This sets `Cache-Control: public, max-age=30` on the response, which client browsers or intermediary CDNs can honor to avoid even sending the request — but if no such intermediary is in play (a direct server-to-server call, or a client that ignores caching headers), the endpoint logic runs every single time.

**Why Output Caching is often the more robust default for API scenarios:** it guarantees server-side savings regardless of what clients or intermediaries choose to honor, and supports cache invalidation via **tags** (`builder.Tag("products")`, then `outputCacheStore.EvictByTagAsync("products")` when data changes) — a capability Response Caching's header-only approach doesn't have at all, since there's no server-side cache to invalidate in the first place.

**Common Pitfall:** applying Output Caching to endpoints returning user-specific or authenticated data without a proper **vary-by** configuration (`builder.SetVaryByHeader("Authorization")`) — without it, the first user's response could be served to every subsequent user hitting the same cached endpoint, a serious data-leakage bug rather than a performance win.

---

## Beginner — Question 5

**Q5: What is the `[ApiController]` attribute's automatic inference of `[FromBody]`, and how can it produce surprising behavior when an action has multiple complex-type parameters?**

`[ApiController]` (covered earlier) infers binding sources automatically — simple types (`int`, `string`) default to `[FromRoute]`/`[FromQuery]`, and complex types default to `[FromBody]`. This inference has a specific, easy-to-miss limitation: only **one** parameter per action can ever be inferred as `[FromBody]`, since an HTTP request has exactly one body.

**Works fine — a single complex-type parameter, correctly inferred as `[FromBody]`:**
```csharp
[HttpPost]
public IActionResult Create(Product product) // inferred: [FromBody] Product product
{
    // 'product' is deserialized from the request's JSON body
}
```

**The surprising case — two complex-type parameters in the same action:**
```csharp
[HttpPost]
public IActionResult Create(Product product, ShippingInfo shipping) // BOTH are complex types!
{
    // This throws an InvalidOperationException at startup:
    // "Actions cannot have more than one parameter inferred as FromBody"
}
```
`[ApiController]`'s inference has no way to guess which of the two complex-type parameters should read from the (singular) request body — rather than guessing, it simply fails fast at startup with a clear error, forcing the developer to be explicit.

**The fix — be explicit about binding sources when you have more than one complex-type parameter:**
```csharp
[HttpPost]
public IActionResult Create([FromBody] Product product, [FromServices] IShippingCalculator calculator)
{
    // Only ONE actual [FromBody] parameter now; the other complex-type "parameter"
    // is a service resolved via DI, not from the request body at all
}
```
If you genuinely need multiple pieces of data from the body, the conventional fix is combining them into a single wrapper DTO (`CreateProductRequest { Product, ShippingInfo }`) rather than trying to bind two separate objects from one JSON body.

**Common Pitfall:** adding a second complex-type parameter to an existing, working action (perhaps a new options object) and being confused by a startup-time exception referencing "FromBody inference" — this is `[ApiController]`'s inference rule catching an ambiguous binding request at the earliest possible point (application startup) rather than letting it silently misbehave at request time.

---

## Intermediate — Question 4

**Q4: What is API Explorer, and how does it feed both Swagger/OpenAPI generation and API versioning's per-version documentation simultaneously?**

`IApiDescriptionGroupCollectionProvider` (commonly just called "API Explorer") is the underlying ASP.NET Core service that inspects every registered controller/action (or Minimal API endpoint) and builds a structured, in-memory description of the entire API surface — parameters, return types, HTTP methods, routes — which both Swashbuckle (Swagger generation) and the versioning package's documentation tooling consume as their shared source of truth, rather than each reimplementing endpoint discovery independently.

**How it's populated, largely automatically:**
```csharp
builder.Services.AddEndpointsApiExplorer(); // registers API Explorer for Minimal APIs
// (controller-based APIs get this automatically via AddControllers())
```
Once registered, API Explorer reflects over every mapped endpoint, extracting its route template, HTTP method, expected parameter types (and their inferred binding sources, per the previous question), and response types (from `[ProducesResponseType]` attributes) — building a complete, structured model of the API without either Swashbuckle or the versioning tooling needing their own separate reflection logic.

**Why sharing this single source of truth matters:** if Swashbuckle and the API versioning package each independently reflected over controllers using slightly different logic, they could easily disagree about details (which parameters exist, which are optional) — by both consuming API Explorer's unified description, Swagger's generated documentation and the versioning package's per-version API listings stay consistent with each other and with the actual runtime behavior, since they're describing the exact same underlying model.

**A concrete consumer beyond Swagger — generating typed API clients:** tools like NSwag or Kiota that auto-generate strongly-typed C#/TypeScript client SDKs from an API also consume this same API Explorer-derived description (usually via the OpenAPI document it produces), meaning a single, accurate API Explorer model ultimately drives documentation, versioned discovery, *and* client code generation from one consistent source.

**Common Pitfall:** manually maintaining a separate, hand-written API documentation file alongside `[ApiController]`-based endpoints — since API Explorer already derives an accurate model directly from the actual running code (parameter types, routes, response shapes), a hand-maintained parallel document inevitably drifts out of sync with the real API as the code evolves, while the API-Explorer-driven Swagger/OpenAPI output cannot drift, since it's generated from the same code that actually executes.

---

## Advanced — Question 5

**Q5: What is Problem Details (RFC 7807 / RFC 9457), and how does ASP.NET Core's `[ApiController]` use it to standardize error response shapes across an entire API?**

Problem Details is a standardized JSON shape for representing HTTP API errors — instead of every endpoint inventing its own ad-hoc error format, RFC 7807 (updated by RFC 9457) defines a consistent structure that any client can parse generically, regardless of which specific endpoint or API produced the error.

**Without a standard — every team/endpoint invents its own error shape:**
```json
{ "error": "Product not found" }
{ "message": "Validation failed", "fields": ["Name"] }
{ "errorCode": 404, "errorMessage": "Not Found" }
```
A client consuming multiple endpoints (or multiple APIs across different teams) needs bespoke error-parsing logic for each one, since there's no shared convention for what an error response looks like.

**The standardized Problem Details shape ASP.NET Core produces automatically:**
```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "detail": "Product with ID 5 was not found.",
  "traceId": "00-8f9a2b1c3d4e5f6a-1a2b3c4d5e6f7a8b-00"
}
```
`[ApiController]`'s automatic `400 Bad Request` on model validation failure (covered at the very start of this topic) already returns this shape by default (as `ValidationProblemDetails`, which extends the base shape with a `errors` dictionary per invalid field) — and `Results.Problem()` / `Results.ValidationProblem()` in Minimal APIs produce the same standardized structure explicitly.

**Customizing the Problem Details response globally:**
```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions["instance"] = context.HttpContext.Request.Path;
    };
});
```

**Why standardizing on this shape matters beyond just following an RFC:** any client-side error-handling code (a shared HTTP client wrapper, a global error interceptor in a frontend framework) can be written **once**, generically, against the Problem Details shape — reliably extracting `title`/`status`/`detail` regardless of which specific endpoint produced the error, rather than needing endpoint-specific or team-specific error-parsing logic scattered throughout client code.

**Common Pitfall:** returning Problem Details' standardized shape for validation/client errors, but falling back to an unhandled exception's default (non-standardized) shape for unexpected server-side exceptions — a global exception-handling middleware (`app.UseExceptionHandler()` combined with `AddProblemDetails()`) is needed to ensure genuinely *every* error path, including unhandled exceptions, produces the same consistent Problem Details shape, not just the specific ones `[ApiController]` handles automatically.

---
