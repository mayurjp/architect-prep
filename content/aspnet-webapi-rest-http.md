# ASP.NET Web API, REST & HTTP/HTTPS — Q&A

## Beginner — Question 1

**Q1: What is HTTP, and what are its core components (methods, status codes, headers)?**

HTTP (HyperText Transfer Protocol) is a stateless, application-layer protocol used for communication between clients (like browsers or mobile apps) and servers over the web. "Stateless" means each request is independent — the server doesn't remember anything about previous requests unless you explicitly build in mechanisms like tokens or sessions.

An HTTP interaction always follows a **request → response** cycle. The client sends a request, and the server returns a response.

### 1. HTTP Methods (Verbs)

These describe the *action* the client wants to perform:

| Method | Purpose | Idempotent? | Safe? |
|--------|---------|-------------|-------|
| `GET` | Retrieve data | Yes | Yes |
| `POST` | Create a new resource | No | No |
| `PUT` | Replace a resource entirely | Yes | No |
| `PATCH` | Partially update a resource | No | No |
| `DELETE` | Remove a resource | Yes | No |

- **Safe** means the method doesn't modify server state (only reads).
- **Idempotent** means calling it multiple times produces the same result as calling it once. (Calling `DELETE` on the same resource twice — the resource stays deleted.)

### 2. HTTP Status Codes

Three-digit numbers grouped into five categories by their first digit:

- **1xx (Informational):** Request received, continuing (e.g., `100 Continue`).
- **2xx (Success):** `200 OK`, `201 Created`, `204 No Content`.
- **3xx (Redirection):** `301 Moved Permanently`, `304 Not Modified`.
- **4xx (Client Error):** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.
- **5xx (Server Error):** `500 Internal Server Error`, `503 Service Unavailable`.

### 3. HTTP Headers

Key-value pairs carrying metadata about the request or response:

- **Request headers:** `Authorization: Bearer <token>`, `Accept: application/json`, `Content-Type: application/json`.
- **Response headers:** `Content-Type: application/json`, `Cache-Control: no-cache`, `Location: /api/products/5`.

**Example of a raw HTTP request:**

```http
GET /api/products/5 HTTP/1.1
Host: example.com
Accept: application/json
Authorization: Bearer eyJhbGci...
```

**Example of a raw HTTP response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 52

{
  "id": 5,
  "name": "Keyboard",
  "price": 29.99
}
```

The body (the JSON here) carries the actual data, while the status line and headers describe how to interpret it.

#### Follow-up: Why is PATCH not idempotent while PUT is?

The distinction comes down to **what you send** and **whether repeating it changes the outcome**.

**PUT — sends the complete, absolute state.** `PUT` replaces the entire resource with the representation you provide. You're saying: "Make the resource look *exactly* like this." Because you send the full, absolute desired state, sending it again produces the identical result.

```http
PUT /api/products/5
{
  "name": "Keyboard",
  "price": 29.99,
  "stock": 100
}
```

Send this once → product 5 becomes exactly that. Send it 10 more times → still exactly that. **Idempotent.**

**PATCH — sends a partial change, often relative.** `PATCH` sends only a *modification* to apply. The problem is the modification can be **relative to the current value**:

```http
PATCH /api/products/5
{ "op": "increment", "field": "stock", "value": 10 }
```

- Start: `stock = 100` → after 1st PATCH: `110` → 2nd: `120` → 3rd: `130`

Each identical request produces a *different* final state. **Not idempotent.**

**The key nuance:** PATCH is not *guaranteed* to be idempotent, but it *can* be depending on design. If your PATCH only sets absolute values (`{ "price": 29.99 }`), repeating it *is* idempotent in practice. The HTTP spec labels PATCH as non-idempotent because it doesn't *promise* idempotency — the spec classifies methods by their *guarantee*, not by what a particular implementation happens to do.

**Analogy (whiteboard):**
- **PUT** = "Erase everything and write this exact text." Same result every time.
- **PATCH** = "Add the word 'urgent' to the bottom." Do it three times → 'urgent' three times.

---

#### Follow-up: Explaining the "Safe" column in more depth

A method is **safe** if it does **not modify the state of the server** — it's read-only. The client can call it and trust it won't create, update, or delete anything. A safe request should have **no side effects** the client would be held responsible for.

**Which methods are safe:**

| Method | Safe? | Why |
|--------|-------|-----|
| `GET` | Yes | Only reads data |
| `HEAD` | Yes | Like GET but returns headers only, no body |
| `OPTIONS` | Yes | Just asks what the server supports |
| `POST` | No | Creates resources / changes state |
| `PUT` | No | Modifies (replaces) a resource |
| `PATCH` | No | Modifies part of a resource |
| `DELETE` | No | Removes a resource |

**Why "safe" matters in practice:**

1. **Caching** — Browsers, proxies, and CDNs freely cache safe requests because a `GET` won't alter anything.
2. **Prefetching and crawling** — Crawlers and prefetchers follow `GET` links automatically. This is exactly why you must **never** put a state-changing action behind a `GET` (e.g., `GET /api/products/5/delete` could be silently triggered by a crawler). State changes must go through `POST`/`PUT`/`PATCH`/`DELETE`.
3. **Retries** — Safe methods can be retried freely after a network hiccup without duplicate side effects.

**Safe vs. Idempotent — clearing the confusion:**

- **Safe** = no change to server state at all (read-only).
- **Idempotent** = making the request multiple times leaves the server in the same state as making it once (there *can* be a change — just a repeatable one).

**Every safe method is automatically idempotent**, but the reverse is not true.

| Method | Safe | Idempotent | Explanation |
|--------|------|------------|-------------|
| `GET` | Yes | Yes | Reads only; repeating changes nothing |
| `PUT` | No | Yes | Changes state, but repeating gives same final state |
| `DELETE` | No | Yes | Deletes (a change), but resource stays deleted on repeat |
| `POST` | No | No | Creates a new resource each time |
| `PATCH` | No | No (not guaranteed) | Changes state; may keep changing on repeat |

**Mental model:**
- **Safe** answers: *"Does this touch anything?"* → No.
- **Idempotent** answers: *"If I do it again, does anything further change?"* → No.

`DELETE` illustrates the difference: **not safe** (it removes something) but **idempotent** (once deleted, deleting again leaves it deleted).

---

## Beginner — Question 2

**Q2: What is REST, and what are its guiding principles (constraints)?**

REST (**RE**presentational **S**tate **T**ransfer) is an *architectural style* for designing networked applications, introduced by Roy Fielding in his 2000 doctoral dissertation. REST is **not a protocol, not a standard, and not a technology** — it's a set of *constraints* that, when followed, make a system scalable, maintainable, and loosely coupled. An API that follows these constraints is called **RESTful**.

REST typically uses HTTP as its transport, which is why HTTP methods, status codes, and headers matter so much.

### The core idea: Resources and Representations

In REST, everything is modeled as a **resource** — a product, a user, an order. Each resource is identified by a **URI**, like `/api/products/5`. The client never touches the resource directly; it exchanges **representations** of that resource — usually JSON or XML. "Representational State Transfer" literally means: *you transfer a representation of the resource's state* between client and server.

```http
GET /api/products/5

{
  "id": 5,
  "name": "Keyboard",
  "price": 29.99
}
```

That JSON is a *representation* of product 5 — not the product itself.

### The 6 REST Constraints

1. **Client–Server** — The client (UI, mobile app) and server (data, logic) are separate concerns, communicating only through a well-defined interface. Each side can evolve independently.

2. **Stateless** — Each request must contain *all* the information the server needs. The server stores no client context between requests. If authentication is needed, the token comes with *every* request. This makes the system easier to scale — any server can handle any request.

3. **Cacheable** — Responses must define themselves as cacheable or not (via headers like `Cache-Control`). Good caching reduces client–server interactions.

4. **Uniform Interface** — The cornerstone of REST. Four sub-principles:
   - **Resource identification** via URIs.
   - **Manipulation through representations** (send JSON to update).
   - **Self-descriptive messages** (each message carries enough info to be understood).
   - **HATEOAS** (Hypermedia As The Engine Of Application State) — responses include links to related actions.

5. **Layered System** — The architecture can have multiple layers (load balancers, proxies, gateways, caches) between client and server. The client doesn't know whether it's talking to the actual server or an intermediary.

6. **Code on Demand (Optional)** — The only *optional* constraint. The server can send executable code (like JavaScript) to extend client functionality.

### Richardson Maturity Model

APIs are often graded on how "RESTful" they are (Leonard Richardson's 4 levels):
- **Level 0:** One URI, one HTTP method — basically RPC over HTTP.
- **Level 1:** Multiple URIs (resources), but limited method use.
- **Level 2:** Proper use of HTTP methods and status codes (where most real-world APIs sit).
- **Level 3:** Level 2 + HATEOAS — the "true" REST.

### Why REST won

REST became dominant because it leverages existing HTTP infrastructure (caching, status codes, methods), is language-agnostic, human-readable (JSON), and scales well thanks to statelessness. It's simpler than older approaches like SOAP.

**Key takeaway:** REST is a *style*, not a rulebook enforced by any technology. Following REST constraints is what earns the "RESTful" label.

---

## Beginner — Question 3

**Q3: What is ASP.NET Web API, and how do you build your first controller?**

ASP.NET Web API is a framework from Microsoft for building **HTTP-based services** (RESTful APIs) using C# and .NET. It's designed to return data (typically JSON) rather than HTML pages, making it ideal for serving browsers, mobile apps, IoT devices, and other services.

In modern .NET (Core / .NET 5 through .NET 9+), Web API is **unified with ASP.NET MVC** — they share the same underlying framework. An API controller is really just an MVC controller specialized for returning data instead of views.

### The building blocks

1. **Controller** — a class that groups related endpoints (actions).
2. **Action methods** — the individual endpoints inside a controller.
3. **Routing** — maps an incoming URL to the correct controller and action.
4. **Model** — a C# class representing your data.

### Setting up a minimal project

```bash
dotnet new webapi -n MyFirstApi
cd MyFirstApi
dotnet run
```

### The Program.cs (entry point)

```csharp
var builder = WebApplication.CreateBuilder(args);

// Register services (dependency injection container)
builder.Services.AddControllers();

var app = builder.Build();

// Configure the HTTP request pipeline (middleware)
app.UseHttpsRedirection();
app.MapControllers();   // wires up attribute-routed controllers

app.Run();
```

Two phases: **service registration** (before `Build()`) and **middleware pipeline** (after `Build()`).

### The Model

```csharp
public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
}
```

### Your first controller

```csharp
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    // In-memory store for demonstration
    private static readonly List<Product> _products = new()
    {
        new Product { Id = 1, Name = "Keyboard", Price = 29.99m },
        new Product { Id = 2, Name = "Mouse", Price = 15.50m }
    };

    // GET api/products
    [HttpGet]
    public ActionResult<IEnumerable<Product>> GetAll()
    {
        return Ok(_products);
    }

    // GET api/products/1
    [HttpGet("{id}")]
    public ActionResult<Product> GetById(int id)
    {
        var product = _products.FirstOrDefault(p => p.Id == id);
        if (product == null)
            return NotFound();   // returns 404

        return Ok(product);      // returns 200 with the product
    }

    // POST api/products
    [HttpPost]
    public ActionResult<Product> Create(Product newProduct)
    {
        newProduct.Id = _products.Max(p => p.Id) + 1;
        _products.Add(newProduct);

        // returns 201 Created + a Location header pointing to the new resource
        return CreatedAtAction(nameof(GetById), new { id = newProduct.Id }, newProduct);
    }
}
```

### Breaking down the key pieces

- **`[ApiController]`** — Opts into API conveniences: automatic model validation (auto `400` on invalid data), automatic binding source inference, and attribute-routing enforcement.
- **`[Route("api/[controller]")]`** — Defines the base URL. `[controller]` is a token replaced by the controller's name minus "Controller" — so `ProductsController` → `api/products`.
- **`ControllerBase`** — The base class for API controllers (regular MVC uses `Controller`, with view features you don't need). Provides `Ok()`, `NotFound()`, `CreatedAtAction()`, `BadRequest()`, etc.
- **`[HttpGet]`, `[HttpPost]`, `[HttpGet("{id}")]`** — Map an action to an HTTP method and optional route segment. `{id}` is a route parameter pulled from the URL.
- **`ActionResult<T>`** — A flexible return type that lets you return *either* the data (`T`) *or* an HTTP result like `NotFound()`.

### The helper methods and their status codes

| Helper | Status Code | Meaning |
|--------|-------------|---------|
| `Ok(data)` | 200 | Success, here's the data |
| `CreatedAtAction(...)` | 201 | Resource created (adds `Location` header) |
| `NotFound()` | 404 | Resource doesn't exist |
| `BadRequest()` | 400 | Invalid client request |
| `NoContent()` | 204 | Success, nothing to return |

**Key takeaway:** A Web API controller inherits from `ControllerBase`, is decorated with `[ApiController]` and `[Route]`, and contains action methods mapped to HTTP verbs. The `ControllerBase` helpers translate directly into proper HTTP status codes.

---

## Beginner — Question 4

**Q4: How does routing work? Explain attribute routing, route parameters, and constraints.**

**Routing** maps an incoming HTTP request's URL to a specific controller and action method. In modern ASP.NET Web API, this is done almost entirely through **attribute routing**.

### Attribute Routing vs. Conventional Routing

**Conventional routing** defines URL patterns centrally (common in MVC for HTML pages):

```csharp
app.MapControllerRoute(
    name: "default",
    pattern: "{controller}/{action}/{id?}");
```

**Attribute routing** places the route directly on the controller/action. This is the standard for APIs. The `[ApiController]` attribute *requires* attribute routing.

### The route template hierarchy

Routes combine the controller-level route and the action-level route:

```csharp
[Route("api/[controller]")]      // controller base: api/products
public class ProductsController : ControllerBase
{
    [HttpGet]                     // → GET api/products
    public IActionResult GetAll() { }

    [HttpGet("{id}")]             // → GET api/products/5
    public IActionResult GetById(int id) { }

    [HttpGet("featured")]         // → GET api/products/featured
    public IActionResult GetFeatured() { }

    [HttpGet("{id}/reviews")]     // → GET api/products/5/reviews
    public IActionResult GetReviews(int id) { }
}
```

### The `[controller]` token

`[controller]` is a **route token** replaced at runtime with the controller's name minus "Controller". If you rename the controller, the route updates automatically. You *can* hardcode it (`[Route("api/products")]`) for explicitness.

### Route parameters

A **route parameter** is a placeholder in the URL (in braces) whose value is extracted and passed to your action. The name in the route must match the method argument name:

```csharp
[HttpGet("{id}")]
public IActionResult GetById(int id)   // 'id' matches '{id}'
{
    // for GET api/products/5 → id = 5
}
```

Multiple parameters:

```csharp
[HttpGet("{categoryId}/products/{productId}")]
public IActionResult GetProduct(int categoryId, int productId) { }
```

### Route constraints

**Constraints** restrict *what values* a route parameter accepts (`{parameter:constraint}`). If the value doesn't match, the route doesn't match (usually a `404`).

```csharp
[HttpGet("{id:int}")]           // only matches integers
[HttpGet("{name:alpha}")]       // only alphabetic characters
```

Constraints let you disambiguate similar-looking routes:

```csharp
[HttpGet("{id:int}")]           // GET api/products/5 → this one
public IActionResult GetById(int id) { }

[HttpGet("{slug:alpha}")]       // GET api/products/keyboard → this one
public IActionResult GetBySlug(string slug) { }
```

**Common constraints:**

| Constraint | Matches | Example |
|-----------|---------|---------|
| `int` | Integer | `{id:int}` |
| `bool` | true/false | `{active:bool}` |
| `alpha` | Letters a–z, A–Z | `{name:alpha}` |
| `guid` | A GUID | `{id:guid}` |
| `min(n)` | Integer ≥ n | `{id:min(1)}` |
| `max(n)` | Integer ≤ n | `{id:max(100)}` |
| `range(a,b)` | Integer in range | `{id:range(1,100)}` |
| `length(n)` | String of length n | `{code:length(6)}` |
| `regex(...)` | Regex pattern | `{code:regex(...)}` |

Chain constraints: `[HttpGet("{id:int:min(1)}")]`.

### Route parameters vs. query strings

**Route parameters** identify a *specific resource* (part of its identity):
```http
GET api/products/5          → the product with id 5
```

**Query strings** *filter, sort, or paginate* a collection. `[ApiController]` binds them automatically:

```csharp
// GET api/products?category=electronics&sortBy=price&page=2
[HttpGet]
public IActionResult GetAll(string? category, string? sortBy, int page = 1) { }
```

**Rule of thumb:** Route parameter for *which* resource; query string to *shape the result* of a collection.

### Handling method ambiguity

If two actions could match the same URL + method, you get an ambiguous match exception. The framework picks the *most specific* matching route — a literal segment like `featured` beats a parameterized one like `{id}`.

**Key takeaway:** Attribute routing maps URLs to actions using `[Route]` and `[HttpVerb("template")]`. Route parameters extract values into method arguments, constraints restrict those values, and query strings handle filtering/sorting/paging. Route params for *identity*, query strings for *shaping*.

---

## Beginner — Question 5

**Q5: What is model binding and validation? How does request data become a C# object, and how do you validate it?**

**Model binding** maps incoming HTTP request data (URL, query string, headers, body) into the parameters and objects of your action methods. **Validation** checks whether that bound data meets your rules before your logic runs.

### How model binding works — binding sources

| Source | Attribute | Where the data comes from |
|--------|-----------|--------------------------|
| Route | `[FromRoute]` | URL path segments (`/products/5`) |
| Query string | `[FromQuery]` | URL query (`?page=2`) |
| Request body | `[FromBody]` | The JSON payload |
| Header | `[FromHeader]` | HTTP headers |
| Form | `[FromForm]` | Form-encoded data (file uploads) |
| Service | `[FromServices]` | The DI container |

### Automatic source inference with `[ApiController]`

`[ApiController]` applies smart inference:
- **Complex types** (your classes) → bound from the **body**.
- **Simple types** matching a route token → bound from the **route**.
- **Other simple types** → bound from the **query string**.

```csharp
// POST api/products?notify=true
// Body: { "name": "Monitor", "price": 199.99 }
[HttpPost]
public IActionResult Create(Product product, bool notify)
{
    // product ← inferred from BODY (complex type)
    // notify  ← inferred from QUERY STRING (simple type, not in route)
}
```

Be explicit when needed:

```csharp
[HttpPost("{id}")]
public IActionResult Update(
    [FromRoute] int id,
    [FromBody] Product product,
    [FromHeader(Name = "X-Correlation-Id")] string correlationId) { }
```

**Important rule:** A request has exactly **one body**, so you can bind at most **one** parameter from it.

### Validation with Data Annotations

```csharp
using System.ComponentModel.DataAnnotations;

public class Product
{
    public int Id { get; set; }

    [Required(ErrorMessage = "Name is required.")]
    [StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [Range(0.01, 10000, ErrorMessage = "Price must be between 0.01 and 10000.")]
    public decimal Price { get; set; }

    [EmailAddress]
    public string? ContactEmail { get; set; }

    [Required]
    [RegularExpression(@"^[A-Z]{3}\d{3}$",
        ErrorMessage = "SKU must be 3 letters followed by 3 digits.")]
    public string Sku { get; set; } = string.Empty;
}
```

**Common validation attributes:** `[Required]`, `[StringLength]`, `[Range]`, `[RegularExpression]`, `[EmailAddress]`, `[MinLength]`/`[MaxLength]`, `[Compare]`, `[Url]`, `[CreditCard]`.

### Automatic 400 responses with `[ApiController]`

With `[ApiController]`, validation runs **automatically** before your action body. If invalid, the framework short-circuits with a `400 Bad Request` — you never enter the method.

```csharp
[HttpPost]
public IActionResult Create(Product product)
{
    // If we reach here, product is ALREADY valid.
    _products.Add(product);
    return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
}
```

A failed validation produces a standardized **ProblemDetails** response (RFC 7807):

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "Name": [ "Name is required." ],
    "Price": [ "Price must be between 0.01 and 10000." ]
  }
}
```

### Checking ModelState manually (without `[ApiController]`)

```csharp
[HttpPost]
public IActionResult Create(Product product)
{
    if (!ModelState.IsValid)
        return BadRequest(ModelState);
    // proceed...
}
```

### Custom validation

**1. Custom validation attribute** (reusable):

```csharp
public class NotInFutureAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(
        object? value, ValidationContext context)
    {
        if (value is DateTime date && date > DateTime.UtcNow)
            return new ValidationResult("Date cannot be in the future.");
        return ValidationResult.Success;
    }
}
```

**2. `IValidatableObject`** (model-level, multiple properties):

```csharp
public class DateRange : IValidatableObject
{
    public DateTime Start { get; set; }
    public DateTime End { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (End < Start)
            yield return new ValidationResult(
                "End date must be after start date.",
                new[] { nameof(End) });
    }
}
```

### FluentValidation

For complex validation, many teams use **FluentValidation**, moving rules into dedicated classes:

```csharp
public class ProductValidator : AbstractValidator<Product>
{
    public ProductValidator()
    {
        RuleFor(p => p.Name).NotEmpty().Length(2, 100);
        RuleFor(p => p.Price).InclusiveBetween(0.01m, 10000m);
        RuleFor(p => p.Sku).Matches(@"^[A-Z]{3}\d{3}$");
    }
}
```

**Key takeaway:** Model binding maps request data into method parameters (`[ApiController]` infers the source); validation via data annotations checks it, and `[ApiController]` auto-returns a structured `400` (ProblemDetails) on failure. For advanced needs, use custom attributes, `IValidatableObject`, or FluentValidation.

---

## Beginner — Question 6

**Q6: What is a RESTful API?**

*(Planned — not yet answered.)*

---

## Beginner — Question 7

**Q7: Difference between Web API and MVC controllers**

*(Planned — not yet answered.)*

---

## Beginner — Question 8

**Q8: Explain HTTP verbs (GET, POST, PUT, PATCH, DELETE)**

*(Planned — not yet answered.)*

---

## Beginner — Question 9

**Q9: Common HTTP status codes (200, 201, 400, 401, 404, 500)**

*(Planned — not yet answered.)*

---

## Beginner — Question 10

**Q10: What is content negotiation?**

*(Planned — not yet answered.)*

---

## Intermediate — Question 1

**Q1: What is dependency injection, and what are the service lifetimes (Singleton, Scoped, Transient)?**

**Dependency Injection (DI)** is a design pattern where a class receives its dependencies from an external source rather than creating them itself. ASP.NET Core has DI **built into its core**. Getting service lifetimes wrong is one of the most common sources of subtle bugs.

### The problem DI solves

Without DI, a class creates its own dependencies — **tight coupling**:

```csharp
public ProductsController()
{
    _service = new ProductService(new SqlProductRepository("connection..."));
}
```

You can't swap implementations for tests, and the controller must know how to build the whole chain.

### The DI solution

With DI, the class **declares what it needs** via its constructor, and the framework **supplies it**:

```csharp
public class ProductsController : ControllerBase
{
    private readonly IProductService _service;

    public ProductsController(IProductService service)  // INJECTED
    {
        _service = service;
    }
}
```

Depending on an **interface** (not a concrete class) is **loose coupling** — flexible and testable.

### Registering services

```csharp
builder.Services.AddSingleton<IConfigService, ConfigService>();
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddTransient<IEmailService, EmailService>();
```

### The three service lifetimes

**1. Transient — `AddTransient`** — A **new instance every time** the service is requested. Two classes needing the same service in one request each get their own instance.
- *Use for:* lightweight, stateless services. *Analogy:* a paper cup.

**2. Scoped — `AddScoped`** — **One instance per HTTP request.** Every class in a request shares the same instance; a new request gets a fresh one.
- *Use for:* per-request work, especially **DbContext** (EF Core registers it scoped by default). *Analogy:* a numbered ticket per visit.

**3. Singleton — `AddSingleton`** — **One instance for the entire application lifetime.** Reused for every request from every user until shutdown.
- *Use for:* config, caching, logging. *Analogy:* the office water cooler.

| Lifetime | Instances created | Shared across... | Typical use |
|----------|-------------------|------------------|-------------|
| **Transient** | Every injection | Nothing — always new | Lightweight stateless services |
| **Scoped** | Once per request | One HTTP request | DbContext, per-request work |
| **Singleton** | Once per app | Entire application | Config, cache, logging |

### The critical pitfall: Captive Dependencies

**A service must never depend on another service with a *shorter* lifetime.** The shorter-lived service gets "captured" and held too long. The dangerous case: a **Singleton depending on a Scoped** service.

```csharp
// DANGER: Singleton capturing a Scoped DbContext
public class CacheService  // registered as Singleton
{
    private readonly AppDbContext _context;  // Scoped!
    public CacheService(AppDbContext context) => _context = context;  // captured forever
}
```

This causes threading issues (`DbContext` isn't thread-safe), stale data, and memory leaks.

**Safe ordering** (depend on equal-or-longer lifetimes):
- Transient → Transient, Scoped, Singleton — OK
- Scoped → Scoped, Singleton — OK
- Singleton → Singleton only — OK

.NET's DI container throws at startup (in development) if it detects a singleton consuming a scoped service.

### Solving the captive dependency

Inject `IServiceScopeFactory` and create a scope on demand:

```csharp
public class CacheService  // Singleton
{
    private readonly IServiceScopeFactory _scopeFactory;
    public CacheService(IServiceScopeFactory scopeFactory) => _scopeFactory = scopeFactory;

    public async Task RefreshAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // use context within this scope, then it's disposed
    }
}
```

### Other ways to inject

- **`[FromServices]`** — inject into a single action parameter.
- **Keyed services** (.NET 8+) — register multiple implementations under different keys:

```csharp
builder.Services.AddKeyedScoped<INotifier, EmailNotifier>("email");
builder.Services.AddKeyedScoped<INotifier, SmsNotifier>("sms");

public MyController([FromKeyedServices("email")] INotifier notifier) { }
```

**Key takeaway:** DI supplies dependencies externally, promoting loose coupling and testability. **Transient** (new every time), **Scoped** (one per request), **Singleton** (one per app). The cardinal rule: **never let a longer-lived service capture a shorter-lived one** — or use `IServiceScopeFactory`.

---

## Intermediate — Question 2

**Q2: What is the middleware pipeline, and how do you write custom middleware?**

**Middleware** is software assembled into a **pipeline** that handles HTTP requests and responses. Every request passes through a chain of middleware components before reaching your controller, and the response travels back out through the same chain in reverse. It's where cross-cutting concerns like authentication, logging, error handling, and CORS live.

### The pipeline concept

Think of middleware as nested layers, like an onion. A request enters from the outside, passes *inward* to the endpoint, then the response passes *outward* in reverse.

```text
Request  →  [Logging] → [Auth] → [Routing] → [Endpoint/Controller]
                                                      |
Response ←  [Logging] ← [Auth] ← [Routing] ← ─────────┘
```

Each middleware can (1) inspect/modify the request, (2) pass control to the next middleware or **short-circuit**, and (3) inspect/modify the response on the way out.

### The `next` delegate

Code *before* `next()` runs on the way in; code *after* `next()` runs on the way out.

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("Before next");   // way IN
    await next(context);
    Console.WriteLine("After next");    // way OUT
});
```

**Order matters enormously** — registration order = execution order.

### Configuring the pipeline

```csharp
var app = builder.Build();

app.UseExceptionHandler("/error");   // 1. catch exceptions from everything below
app.UseHttpsRedirection();           // 2. redirect HTTP → HTTPS
app.UseRouting();                    // 3. match the request to an endpoint
app.UseCors();                       // 4. apply CORS policy
app.UseAuthentication();             // 5. who are you?
app.UseAuthorization();              // 6. are you allowed?
app.MapControllers();                // 7. execute the matched controller

app.Run();
```

Exception handling goes first (to catch everything after it); authentication precedes authorization; routing precedes authorization.

### Three ways to add middleware

- **`Use`** — general-purpose; may call `next`.
- **`Run`** — terminal; ends the pipeline (never calls `next`).
- **`Map`** — branches the pipeline based on request path.

```csharp
app.Map("/health", healthApp =>
{
    healthApp.Run(async context => await context.Response.WriteAsync("Healthy"));
});
```

### Short-circuiting

A middleware stops the chain by *not* calling `next()`:

```csharp
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("X-Api-Key"))
    {
        context.Response.StatusCode = 401;
        await context.Response.WriteAsync("API key missing");
        return;   // short-circuit
    }
    await next(context);
});
```

### Writing custom middleware (class-based)

Convention: a constructor taking `RequestDelegate next`, and an `InvokeAsync(HttpContext)` method returning `Task`.

```csharp
public class RequestTimingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimingMiddleware> _logger;

    public RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        await _next(context);
        stopwatch.Stop();
        _logger.LogInformation("{Method} {Path} responded {StatusCode} in {Elapsed}ms",
            context.Request.Method, context.Request.Path,
            context.Response.StatusCode, stopwatch.ElapsedMilliseconds);
    }
}

public static class RequestTimingMiddlewareExtensions
{
    public static IApplicationBuilder UseRequestTiming(this IApplicationBuilder app)
        => app.UseMiddleware<RequestTimingMiddleware>();
}
```

Register: `app.UseRequestTiming();`

### Middleware lifetime pitfall

Class-based middleware is instantiated **once** (effectively a singleton). You **cannot** inject scoped services (like `DbContext`) into its constructor — that's a captive dependency. Instead, inject scoped services as **parameters of `InvokeAsync`**:

```csharp
public async Task InvokeAsync(HttpContext context, IProductService service)
{
    // 'service' is resolved fresh per request — safe
    await _next(context);
}
```

### Middleware vs. Filters

- **Middleware** operates on the raw `HttpContext` for *every* request, before/after MVC — it doesn't know about controllers/actions.
- **Filters** operate *inside* MVC, with access to controller/action context.

**Rule of thumb:** Middleware for app-wide, MVC-agnostic concerns (HTTPS redirect, global error handling, CORS); filters for action-aware concerns.

**Key takeaway:** Middleware forms a bidirectional pipeline — requests flow *in*, responses flow *out* in reverse. Each component calls `next()` or short-circuits. **Order of registration = order of execution.** Custom middleware is a class with a `RequestDelegate` constructor and `InvokeAsync` method; inject scoped services through `InvokeAsync`, not the constructor.

---

## Intermediate — Question 3

**Q3: What are filters? Explain the filter types, the filter pipeline, and how they differ from middleware.**

**Filters** let you run code at specific stages *within* the MVC/Web API pipeline — before or after phases like authorization, model binding, action execution, and result formatting. Unlike middleware, filters have access to rich MVC context: the controller, action, its arguments, and its result.

### Where filters sit

```text
Middleware pipeline → Routing → [ MVC Filter Pipeline → Action ] → Response
```

### The five filter types (in order)

1. **Authorization Filters** — Run **first**; determine whether the user is permitted. Short-circuit immediately on failure. `[Authorize]` is one.
2. **Resource Filters** — Run after authorization, wrapping most of the pipeline (before model binding, after result execution). Useful for caching.
3. **Action Filters** — Run **immediately before and after** the action executes; can inspect/modify arguments (before) and result (after). Most common type.
4. **Exception Filters** — Run when an **unhandled exception** occurs during model binding, action execution, or action filters.
5. **Result Filters** — Run **immediately before and after** the action's *result* is executed.

### Execution order (visualized)

```text
Authorization Filter
   |
Resource Filter (before)
   |  |-- Model Binding
   |  Action Filter (before) --> ACTION --> Action Filter (after)
   |  Result Filter (before) --> RESULT --> Result Filter (after)
Resource Filter (after)

(Exception Filter catches exceptions thrown along the way)
```

### Writing an Action Filter

```csharp
public class LoggingActionFilter : IActionFilter
{
    private readonly ILogger<LoggingActionFilter> _logger;
    public LoggingActionFilter(ILogger<LoggingActionFilter> logger) => _logger = logger;

    public void OnActionExecuting(ActionExecutingContext context)
    {
        _logger.LogInformation("Executing {Action} with arguments: {@Args}",
            context.ActionDescriptor.DisplayName, context.ActionArguments);
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
        _logger.LogInformation("Executed {Action}. Result: {Result}",
            context.ActionDescriptor.DisplayName, context.Result);
    }
}
```

The key advantage over middleware: `context.ActionArguments` gives you the *bound, validated arguments* — something middleware can't see.

### Writing an Exception Filter

```csharp
public class CustomExceptionFilter : IExceptionFilter
{
    private readonly ILogger<CustomExceptionFilter> _logger;
    public CustomExceptionFilter(ILogger<CustomExceptionFilter> logger) => _logger = logger;

    public void OnException(ExceptionContext context)
    {
        _logger.LogError(context.Exception, "Unhandled exception occurred");

        if (context.Exception is NotFoundException)
            context.Result = new NotFoundObjectResult(new { error = context.Exception.Message });
        else
            context.Result = new ObjectResult(new { error = "An error occurred" }) { StatusCode = 500 };

        context.ExceptionHandled = true;
    }
}
```

### Short-circuiting a filter

Set `context.Result` before the action runs to skip it:

```csharp
public void OnActionExecuting(ActionExecutingContext context)
{
    if (!context.ModelState.IsValid)
        context.Result = new BadRequestObjectResult(context.ModelState);
}
```

### The filter scopes

1. **Global** — every action, registered in `Program.cs`:
```csharp
builder.Services.AddControllers(options =>
{
    options.Filters.Add<LoggingActionFilter>();
});
```
2. **Controller** — via attribute on the controller.
3. **Action** — via attribute on one action.

**Order across scopes:** "before" runs Global → Controller → Action; "after" reverses (Action → Controller → Global).

### `[ServiceFilter]` vs `[TypeFilter]` vs plain attribute

Plain attributes can't use DI. If your filter has constructor dependencies:
- **`[ServiceFilter(typeof(MyFilter))]`** — resolves from DI; you must register the filter (`AddScoped<LoggingActionFilter>()`).
- **`[TypeFilter(typeof(MyFilter))]`** — instantiates using DI for its dependencies; the filter itself need not be registered; can pass extra args.
- **Plain attribute** — only if the filter has *no* injected dependencies.

### Filters vs. Middleware

| Aspect | Middleware | Filters |
|--------|-----------|---------|
| **Level** | Raw `HttpContext`, whole app | Inside MVC, per action |
| **Context** | Request/response only | Controller, action, arguments, `ModelState`, result |
| **Runs for** | Every request | Only MVC-action requests |
| **Scoping** | Global (path via `Map`) | Global, controller, or action |
| **Best for** | HTTPS redirect, CORS, global errors | Action-aware logging, validation, MVC-scoped errors, per-action caching |

**Decision rule:** if the concern needs to know *which action* is running or needs *bound arguments / model state*, use a **filter**; otherwise use **middleware**.

### Modern error handling note

.NET 8+ favors the **`IExceptionHandler`** interface (middleware) for global error handling because it catches errors from *everything*. Exception filters remain useful when you need MVC-specific context.

**Key takeaway:** Filters run *inside* MVC in a defined order — **Authorization → Resource → Action → (Exception) → Result** — with rich context middleware lacks. Apply globally, per-controller, or per-action; use `[ServiceFilter]`/`[TypeFilter]` for DI. Filters for action-aware concerns, middleware for app-wide ones.

---

## Intermediate — Question 4

**Q4: What is content negotiation, and how do you customize serialization?**

**Content negotiation** is how the server selects the best **representation format** for a response based on what the client asks for. One endpoint can serve the same data as JSON, XML, etc. This implements REST's "manipulation of resources through representations."

### How it works: the `Accept` header

The client signals its preferred format(s) with the **`Accept`** request header:

```http
GET /api/products/5
Accept: application/json      →  JSON

GET /api/products/5
Accept: application/xml       →  XML (if configured)
```

Quality values rank preferences: `Accept: application/json;q=0.9, application/xml;q=1.0` prefers XML.

### Input vs. Output formatters

- **Output formatters** — serialize C# → response body. Selected via `Accept`.
- **Input formatters** — deserialize request body → C#. Selected via **`Content-Type`**.

```http
POST /api/products
Content-Type: application/json     →  input formatter reads JSON
Accept: application/xml            →  output formatter writes XML
```

The two headers are independent — receive JSON, return XML.

### The default: System.Text.Json

Modern ASP.NET Core uses **`System.Text.Json`** (replaced Newtonsoft as default in .NET Core 3.0). Fast, low-allocation. Only JSON is supported out of the box; XML is opt-in. Default naming is **camelCase** (`ProductName` → `"productName"`).

### Configuring JSON serialization

```csharp
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.WriteIndented = true;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
```

### Per-property control

```csharp
using System.Text.Json.Serialization;

public class Product
{
    public int Id { get; set; }

    [JsonPropertyName("product_name")]
    public string Name { get; set; } = string.Empty;

    [JsonIgnore]
    public string InternalNotes { get; set; } = string.Empty;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; set; }
}
```

| Attribute | Effect |
|-----------|--------|
| `[JsonPropertyName("...")]` | Sets the JSON key name |
| `[JsonIgnore]` | Excludes the property |
| `[JsonIgnore(Condition = ...)]` | Conditionally excludes |
| `[JsonPropertyOrder(n)]` | Controls property order |

### Enabling XML

```csharp
builder.Services.AddControllers().AddXmlSerializerFormatters();
```

### Switching to Newtonsoft.Json

```csharp
// after installing Microsoft.AspNetCore.Mvc.NewtonsoftJson
builder.Services.AddControllers()
    .AddNewtonsoftJson(options =>
    {
        options.SerializerSettings.ContractResolver = new CamelCasePropertyNamesContractResolver();
    });
```

Choose `System.Text.Json` for performance, Newtonsoft for feature richness / legacy compatibility.

### Unsupported format behavior

By default, an unsupported `Accept` format falls back to JSON. For strict `406 Not Acceptable`:

```csharp
builder.Services.AddControllers(options =>
{
    options.ReturnHttpNotAcceptable = true;
});
```

### `Produces` and `Consumes`

```csharp
[HttpGet("{id}")]
[Produces("application/json")]        // this action only outputs JSON
public IActionResult Get(int id) { }

[HttpPost]
[Consumes("application/json")]        // this action only accepts JSON bodies
public IActionResult Create(Product p) { }
```

These also feed OpenAPI/Swagger documentation.

**Key takeaway:** Content negotiation serves multiple representations from one endpoint. **`Accept`** selects the output formatter; **`Content-Type`** selects the input formatter. JSON via **`System.Text.Json`** (camelCase, fast) is default; XML/Newtonsoft are opt-in. Customize globally via `AddJsonOptions` or per-property with `[JsonPropertyName]`/`[JsonIgnore]`. Use `ReturnHttpNotAcceptable` for strict `406`.

---

## Intermediate — Question 5

**Q5: How do authentication and authorization work? Explain JWT, `[Authorize]`, roles, and policies.**

**Authentication** answers *"Who are you?"* (verifies identity). **Authorization** answers *"What are you allowed to do?"* (decides access). They run in that order. REST APIs predominantly use the **JWT bearer token**.

### Why JWT for REST APIs

REST is **stateless** — no server-side session. Traditional cookie/session auth stores server state, conflicting with statelessness. **JWT** carries all identity information, is signed by the server, and is sent with *every* request — no server storage needed.

### Anatomy of a JWT

Three parts separated by dots: `header.payload.signature`.

1. **Header** — `{ "alg": "HS256", "typ": "JWT" }`
2. **Payload** — the **claims**: `{ "sub": "123", "name": "Alice", "role": "Admin", "exp": 1735689600 }`
3. **Signature** — a cryptographic signature over header + payload using a secret key; makes the token **tamper-proof**.

**Critical:** the payload is **encoded, not encrypted** — anyone can read it. Never put secrets in a JWT. The signature guarantees *integrity*, not *confidentiality*.

### Claims

A **claim** is a key-value statement about the user (e.g., `role: Admin`). After validation, ASP.NET turns claims into a `ClaimsPrincipal` (accessible via `User`). Authorization examines these claims.

### The authentication flow

```text
1. Client sends credentials to a /login endpoint
2. Server validates, GENERATES a signed JWT, returns it
3. Client sends it on every request: Authorization: Bearer <token>
4. Server VALIDATES signature + expiry on each request
5. If valid, request proceeds; claims populate User
```

### Configuring JWT authentication

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
    });

builder.Services.AddAuthorization();
```

Wire up middleware in order:

```csharp
app.UseAuthentication();   // validate token, build ClaimsPrincipal
app.UseAuthorization();    // enforce [Authorize]
```

### Generating a token (login endpoint)

```csharp
[HttpPost("login")]
public IActionResult Login(LoginRequest request)
{
    var user = _userService.Validate(request.Username, request.Password);
    if (user == null) return Unauthorized();

    var claims = new[]
    {
        new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Username),
        new Claim(ClaimTypes.Role, user.Role)
    };

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
    var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

    var token = new JwtSecurityToken(
        issuer: _config["Jwt:Issuer"],
        audience: _config["Jwt:Audience"],
        claims: claims,
        expires: DateTime.UtcNow.AddHours(1),
        signingCredentials: creds);

    return Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token) });
}
```

### The `[Authorize]` attribute

```csharp
[Authorize]                          // requires a valid token
[HttpGet]
public IActionResult GetOrders() { }

[AllowAnonymous]                     // explicitly public
[HttpGet("public-info")]
public IActionResult GetPublicInfo() { }
```

### Role-based authorization

```csharp
[Authorize(Roles = "Admin")]                 // only Admins
[Authorize(Roles = "Admin,Manager")]         // Admin OR Manager
```

A user lacking the role gets `403 Forbidden` (not `401` — they *are* authenticated).

### Policy-based authorization (recommended)

Define named rules based on claims, roles, or custom logic:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
    options.AddPolicy("HasHrDepartment", policy => policy.RequireClaim("department", "HR"));
});
```

Apply: `[Authorize(Policy = "AdminOnly")]`.

### Custom requirements and handlers

```csharp
public class MinimumAgeRequirement : IAuthorizationRequirement
{
    public int MinimumAge { get; }
    public MinimumAgeRequirement(int age) => MinimumAge = age;
}

public class MinimumAgeHandler : AuthorizationHandler<MinimumAgeRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, MinimumAgeRequirement requirement)
    {
        var ageClaim = context.User.FindFirst("age");
        if (ageClaim != null && int.TryParse(ageClaim.Value, out var age) && age >= requirement.MinimumAge)
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
```

Register:

```csharp
builder.Services.AddScoped<IAuthorizationHandler, MinimumAgeHandler>();
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Adults", policy =>
        policy.Requirements.Add(new MinimumAgeRequirement(18)));
});
```

### 401 vs 403

- **`401 Unauthorized`** — not authenticated (missing/invalid/expired token). "Log in first."
- **`403 Forbidden`** — authenticated but lacking permission. "I know who you are, but you can't do this."

| | Authentication | Authorization |
|---|---------------|---------------|
| **Question** | Who are you? | What can you do? |
| **When** | First | After authentication |
| **Mechanism** | JWT validation | Roles / policies / claims |
| **Failure code** | `401` | `403` |
| **Middleware** | `UseAuthentication()` | `UseAuthorization()` |

### Refresh tokens

Access tokens are short-lived (minutes–hour). A longer-lived **refresh token** lets the client obtain a new access token without re-login. Refresh tokens are typically stored server-side (so they can be revoked) — a pragmatic exception to pure statelessness.

**Key takeaway:** Authentication (identity) precedes authorization (permission). REST APIs use stateless, signed **JWT bearer tokens** carrying **claims**, sent as `Authorization: Bearer <token>`. `[Authorize]` enforces authentication; **role-based** checks are simple, **policy-based** is the flexible, recommended approach. **401 = not authenticated, 403 = authenticated but forbidden.**

---

## Intermediate — Question 6

**Q6: How do you version a Web API?**

*(Planned — not yet answered.)*

---

## Intermediate — Question 7

**Q7: Authentication vs authorization**

*(Planned — not yet answered.)*

---

## Intermediate — Question 8

**Q8: What is JWT and how does token-based auth work?**

*(Planned — not yet answered.)*

---

## Intermediate — Question 9

**Q9: `IHttpActionResult` vs `HttpResponseMessage`**

*(Planned — not yet answered.)*

---

## Intermediate — Question 10

**Q10: How do you handle CORS?**

*(Planned — not yet answered.)*

---

## Intermediate — Question 11

**Q11: Explain media formatters**

*(Planned — not yet answered.)*

---

## Advanced — Question 1

**Q1: What are the API versioning strategies, and how do you implement them?**

**API versioning** manages changes to your API over time without breaking existing clients. Once consumers depend on your API, you can't freely change response shapes or behavior. Versioning lets you run multiple versions concurrently.

### What constitutes a breaking change

Requiring a new version: removing/renaming fields, changing a field's type, changing response structure, altering error formats, changing behavior. **Non-breaking** additions (a new optional field, a new endpoint) usually don't.

### The four main strategies

**1. URI Path Versioning** — version as a URL segment. Most common.
```http
GET /api/v1/products
GET /api/v2/products
```
*Pros:* explicit, browser-friendly, easy to route/cache. *Cons:* "pollutes" the URI; clients must change URLs.

**2. Query String Versioning**
```http
GET /api/products?api-version=1.0
```
*Pros:* single base URI; version optional. *Cons:* easy to overlook; messier caching.

**3. Header Versioning**
```http
GET /api/products
X-Api-Version: 2.0
```
*Pros:* clean URLs; more "RESTful". *Cons:* not visible in URL, harder to test/explore.

**4. Media Type Versioning** — version in the `Accept` header. Most "RESTful".
```http
Accept: application/json; version=2.0
Accept: application/vnd.myapi.v2+json
```
*Pros:* native content negotiation; single URI. *Cons:* most complex; least intuitive.

| Strategy | Example | Visibility | RESTful purity | Ease |
|----------|---------|-----------|----------------|------|
| URI path | `/api/v2/products` | High | Low | Easy |
| Query string | `?api-version=2.0` | Medium | Medium | Easy |
| Header | `X-Api-Version: 2.0` | Low | High | Medium |
| Media type | `Accept: ...version=2.0` | Low | Highest | Hard |

**URI path is most popular** in practice; media-type is favored by purists. Large APIs (Stripe, GitHub) often use header or date-based versioning.

### Implementing with Asp.Versioning

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;   // adds 'api-supported-versions' header
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new QueryStringApiVersionReader("api-version"),
        new HeaderApiVersionReader("X-Api-Version"),
        new MediaTypeApiVersionReader("version"));
})
.AddMvc()
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});
```

`ApiVersionReader.Combine` accepts multiple strategies simultaneously.

### Applying versions (URI path)

```csharp
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/products")]
public class ProductsV1Controller : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok("This is v1");
}

[ApiController]
[ApiVersion("2.0")]
[Route("api/v{version:apiVersion}/products")]
public class ProductsV2Controller : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok("This is v2 — new and improved");
}
```

### Versioning individual actions

```csharp
[ApiVersion("1.0")]
[ApiVersion("2.0")]
[Route("api/v{version:apiVersion}/products")]
public class ProductsController : ControllerBase
{
    [HttpGet]
    [MapToApiVersion("1.0")]
    public IActionResult GetV1() => Ok("v1 response");

    [HttpGet]
    [MapToApiVersion("2.0")]
    public IActionResult GetV2() => Ok("v2 response");
}
```

### Deprecating a version

```csharp
[ApiVersion("1.0", Deprecated = true)]
[ApiVersion("2.0")]
public class ProductsController : ControllerBase { }
```

### Best practices

- **Version from day one** (even just `v1`).
- **Only bump for breaking changes.**
- **Communicate a deprecation policy.**
- **Keep versioning logic out of business code** (map versions to different DTOs/controllers).
- **Document each version** (Swagger's `AddApiExplorer`).
- **Cap the number of live versions** (often current + previous).

### Design alternative: avoid versioning

Design responses to be **tolerant and extensible** (Postel's Law). If clients ignore unknown fields, you can evolve additively without a v2. Reserve versioning for genuinely breaking structural changes.

**Key takeaway:** Versioning runs versions side-by-side. Strategies: **URI path** (most popular), **query string**, **header**, **media type** (most RESTful) — trading visibility against REST purity. Implement with **`Asp.Versioning`** using `[ApiVersion]` and version-aware routes. Version only for breaking changes; design tolerant responses to minimize new versions.

---

## Advanced — Question 2

**Q2: How does asynchronous programming work in Web API? Explain `async`/`await`, scalability, and pitfalls.**

**Asynchronous programming** lets your API handle a request without blocking a thread while waiting for slow I/O (database, HTTP calls, files). Instead of a thread idling, it's released to serve *other* requests — dramatically improving **scalability**.

### The core problem: thread starvation

ASP.NET handles each request on a thread from a limited **thread pool**. A *synchronous* I/O call **blocks** that thread — it waits, doing nothing. Under load, the pool exhausts, requests queue, latency spikes — **thread starvation**. The threads aren't working; they're just *waiting*.

### The async solution

At an `await` on I/O, the thread is **released back to the pool** to serve others. The I/O happens in the background (OS/hardware, not a thread). When it completes, the framework grabs an available thread to resume.

```text
SYNC:   Thread --[query running, thread BLOCKED 200ms]-- continues
ASYNC:  Thread --[await]--> released to serve others
                              (I/O completes) --> resumed on a thread
```

Key insight: async doesn't make a single request *faster* — it lets your server handle *far more concurrent requests* with the same threads.

### The three keywords

- **`Task` / `Task<T>`** — an operation completing in the future.
- **`async`** — marks a method asynchronous, enabling `await`.
- **`await`** — pauses the method until the task completes, *without blocking the thread*.

### Sync vs. async example

```csharp
// Synchronous (blocking)
[HttpGet("{id}")]
public ActionResult<Product> GetById(int id)
{
    var product = _dbContext.Products.Find(id);   // BLOCKS
    if (product == null) return NotFound();
    return Ok(product);
}

// Asynchronous (non-blocking)
[HttpGet("{id}")]
public async Task<ActionResult<Product>> GetByIdAsync(int id)
{
    var product = await _dbContext.Products.FindAsync(id);   // releases the thread
    if (product == null) return NotFound();
    return Ok(product);
}
```

Pattern: return `Task<T>`, mark `async`, `await` the `Async` variant.

### How `await` works (mental model)

1. If the task is already complete, continue synchronously.
2. Otherwise, the method returns to its caller and the thread is freed.
3. A **continuation** (the rest of the method) is registered.
4. On completion, the continuation resumes on an available thread.

The compiler builds a **state machine** to manage pause/resume.

### Pitfall 1: `async void`

Never write `async void` (except event handlers). It can't be awaited and **swallows exceptions** (crashing the process).

```csharp
public async void DoWork() { }        // BAD
public async Task DoWorkAsync() { }    // GOOD
```

### Pitfall 2: Blocking on async → deadlocks

**Never** call `.Result` or `.Wait()` in a synchronous context:

```csharp
var product = _service.GetProductAsync(id).Result;   // DANGER — can deadlock
```

The calling thread blocks waiting for the task; the task's continuation needs that same thread — deadlock. **Rule: "async all the way."**

### Pitfall 3: `ConfigureAwait` in libraries

In library code, use `ConfigureAwait(false)` to avoid capturing a sync context:

```csharp
var data = await _httpClient.GetAsync(url).ConfigureAwait(false);
```

ASP.NET Core has no sync context, so it matters less for app code but remains a library best practice.

### Pitfall 4: Sequential awaits when parallel is possible

```csharp
// SLOW — sequential
var a = await GetProductsAsync();
var b = await GetCategoriesAsync();

// FAST — concurrent
var productsTask = GetProductsAsync();
var categoriesTask = GetCategoriesAsync();
await Task.WhenAll(productsTask, categoriesTask);
var products = await productsTask;
var categories = await categoriesTask;
```

**Caveat:** a single `DbContext` is **not thread-safe** — don't run concurrent queries on the same context. Use separate contexts/scopes for parallel DB work.

### Pitfall 5: Async over CPU-bound work

Async helps **I/O-bound** work, not **CPU-bound** computation. Wrapping CPU work in `Task.Run` inside a request just shuffles threads and often hurts scalability. Offload true CPU work to a background service/queue.

### Cancellation tokens

Accept a `CancellationToken` so work can be abandoned if the client disconnects:

```csharp
[HttpGet]
public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
{
    var products = await _dbContext.Products.ToListAsync(cancellationToken);
    return Ok(products);
}
```

### Async ≠ faster for a single user

For a single request, async adds tiny overhead and is marginally *slower*. Its benefit is entirely **concurrency and scalability under load** — throughput, not per-request speed.

**Key takeaway:** Async releases threads during I/O waits, preventing **thread starvation** and serving far more concurrent requests. Mark methods `async`, return `Task`/`Task<T>`, `await` `Async` I/O calls. Rules: **async all the way** (no `.Result`/`.Wait()`), **never `async void`**, use **`Task.WhenAll`** for parallel work (mind `DbContext`), accept **`CancellationToken`s**. Async helps **I/O-bound scalability**, not CPU-bound work or single-request speed.

---

## Advanced — Question 3

**Q3: Explain the Web API pipeline (message handlers, delegating handlers)**

*(Planned — not yet answered.)*

---

## Advanced — Question 4

**Q4: How do you implement rate limiting / throttling?**

*(Planned — not yet answered.)*

---

## Advanced — Question 5

**Q5: Explain OAuth 2.0 flows**

*(Planned — not yet answered.)*

---

## Advanced — Question 6

**Q6: How do you secure an API (HTTPS, tokens, API keys)?**

*(Planned — not yet answered.)*

---

## Advanced — Question 7

**Q7: Explain idempotency in REST**

*(Planned — not yet answered.)*

---

## Advanced — Question 8

**Q8: Exception filters and global error handling**

*(Planned — not yet answered.)*

---
