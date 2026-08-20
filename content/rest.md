# rest — Q&A


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



## Intermediate — Question 1

**Q1: What is content negotiation, and how do you customize serialization?**

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

## Intermediate — Question 2

**Q2: How do authentication and authorization work? Explain JWT, `[Authorize]`, roles, and policies.**

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

**Q3: Explain idempotency in REST and why it matters for distributed systems.**

Idempotency is a mathematical property meaning that an operation can be applied multiple times without changing the result beyond the initial application. In REST, an HTTP method is idempotent if the intended effect on the server of making a single request is the same as the effect of making multiple identical requests.

**Idempotent Methods:**
- **`GET`, `HEAD`, `OPTIONS`, `TRACE`:** Naturally idempotent because they are "safe" (read-only). Reading a resource 100 times doesn't change it.
- **`PUT`:** Idempotent because it replaces the *entire* resource. If you send a `PUT` request with `{ "status": "shipped" }` 5 times, the status is just "shipped" 5 times. The final state is exactly the same as if you sent it once.
- **`DELETE`:** Idempotent. Deleting a resource for the first time returns `200 OK` or `204 No Content`. Deleting it again might return `404 Not Found`, but the *server state* (the resource is gone) remains the same regardless of how many times you try to delete it.

**Non-Idempotent Methods:**
- **`POST`:** Not idempotent. If you `POST` a new order creation payload 5 times, you will create 5 separate orders.
- **`PATCH`:** Generally considered non-idempotent because it applies a partial modification. If your `PATCH` payload is `{ "incrementStockBy": 5 }`, applying it 5 times adds 25 to the stock, which is different than applying it once.

**Why Idempotency is Critical:**
In distributed systems, networks are unreliable. A client might send a `POST` request to charge a credit card, the server processes it successfully, but the network drops the HTTP response. The client gets a timeout.
What should the client do? If it blindly retries a non-idempotent `POST` request, it will double-charge the user. 
To fix this, modern APIs implement **Idempotency Keys**. The client generates a unique GUID (e.g., `Idempotency-Key: 12345`) and sends it with the `POST` request. The server records this key. If the client retries the exact same request with the same key, the server recognizes it, skips processing the payment again, and just returns the original success response.

---

## Advanced — Question 4

**Q4: What are ETags and conditional requests, and how do they implement optimistic concurrency over REST?**

An **ETag** (Entity Tag) is an opaque identifier — usually a hash of the resource's content or a version number — that the server returns alongside a resource, letting clients detect whether the resource has changed since they last fetched it, without re-downloading the full body.

**Step 1 — the server returns an ETag on GET:**
```http
GET /api/products/5
```
```http
HTTP/1.1 200 OK
ETag: "a1b2c3d4"
Content-Type: application/json

{ "id": 5, "name": "Keyboard", "price": 29.99 }
```

**Step 2 — the client re-checks cheaply with `If-None-Match`:**
```http
GET /api/products/5
If-None-Match: "a1b2c3d4"
```
If nothing changed, the server skips re-sending the body entirely:
```http
HTTP/1.1 304 Not Modified
```

**Step 3 — the client updates safely with `If-Match` (optimistic concurrency):**
```http
PUT /api/products/5
If-Match: "a1b2c3d4"
{ "name": "Keyboard", "price": 24.99 }
```
If another client already updated the resource (so its current ETag no longer matches `a1b2c3d4`), the server rejects the write:
```http
HTTP/1.1 412 Precondition Failed
```
instead of silently overwriting the other client's change — the classic "lost update" problem that plain `PUT` without a version check is vulnerable to.

**Why this matters for REST specifically:** it's a pure HTTP-native mechanism (headers only, no bespoke versioning field in the JSON body) for both **cache validation** (`If-None-Match` → `304`) and **optimistic concurrency control** (`If-Match` → `412`), fitting REST's "self-descriptive messages" and "cacheable" constraints without inventing anything outside the HTTP spec.

**Common Pitfall:** computing the ETag from a poor hash (or, worse, `LastModified` with only second-level precision) that doesn't actually change when the resource does — two rapid updates within the same second could produce identical `Last-Modified` values and let a lost update slip through. A strong hash of the actual serialized content (or a dedicated `RowVersion`/`xmin` column from the database) avoids this.

---

## Scenario — Question 1

**Q1: Your team is designing a REST API for order management. Beyond the standard CRUD verbs, you need an endpoint to "cancel" an order — but cancellation involves side effects (refunding payment, releasing reserved inventory) beyond just changing a status field. A junior developer proposes `PATCH /api/orders/5 { "status": "Cancelled" }`. Why might this be the wrong shape, and what's the RESTful alternative?**

The core tension: pure CRUD verbs model *state changes to data*, but "cancel an order" is a **business action with side effects**, not just a field update — modeling it as a bare `PATCH` hides that complexity behind what looks like an innocuous data edit.

**Why the naive `PATCH` is risky:**
- It implies any client with write access to the order could flip `status` to `"Cancelled"` directly, bypassing whatever business rules should gate cancellation (e.g., "can't cancel an order that already shipped").
- It conflates "this is what the data now looks like" with "please perform the cancellation *process*," which a generic partial-update handler has no natural place to hook business logic (refund, inventory release) into cleanly.
- Multiple different "reasons" to change status (customer cancels vs. fraud team cancels vs. system auto-cancels for non-payment) would all collapse into the same generic `PATCH`, losing intent.

**The RESTful alternative: a sub-resource / action endpoint.**
```http
POST /api/orders/5/cancellation
{ "reason": "customer_requested" }
```
Modeling "cancellation" as its own resource being *created* (rather than the order being merely patched) keeps the action's specific validation, side effects, and audit trail (who cancelled it, why, when) explicit and separately testable, while still following REST's resource-oriented style — you're not inventing an RPC-style verb like `/api/orders/5/cancel`, you're creating a `Cancellation` resource, which is more consistent with "everything is a resource."

**Alternative accepted in practice:** many real-world APIs pragmatically use a verb-like sub-path (`POST /api/orders/5/cancel`) instead of a noun sub-resource, trading some REST purity for clarity — Richardson Maturity Level 2 APIs (the vast majority of production REST APIs) often make this trade-off deliberately, reserving strict noun-only resource modeling for the parts of the API where it doesn't hurt developer ergonomics.

---

## Scenario — Question 2

**Q2: Your public REST API is getting hammered by a client that's polling `GET /api/orders?status=pending` every 100ms in a tight loop, degrading performance for everyone else. You can't force them to fix their client. How do you protect the API using standard HTTP mechanisms?**

You need **rate limiting**, communicated through standard HTTP status codes and headers so well-behaved clients (and even this misbehaving one) can self-correct.

**The Mechanism:**
```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("PerClient", opt =>
    {
        opt.PermitLimit = 60;                     // 60 requests
        opt.Window = TimeSpan.FromMinutes(1);      // per minute
        opt.QueueLimit = 0;                        // reject immediately over limit, don't queue
    });
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

app.UseRateLimiter();
```

When the limit is exceeded, the API responds:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735689660
```

**Why this is the "REST-native" solution rather than, say, silently dropping connections:**
- `429 Too Many Requests` is a standard status code specifically for this — any HTTP-aware client or library (including this misbehaving one, if it's using a normal HTTP stack) will surface it distinctly from a generic error.
- `Retry-After` tells the client exactly how long to back off, turning "aggressive polling" into "well-behaved polling" without any code change on the client's side beyond respecting a standard header.
- The `X-RateLimit-*` headers (a de facto convention, not a formal RFC standard, but extremely widely adopted) let well-behaved clients throttle themselves *before* hitting the limit at all.

**Common Pitfall:** rate-limiting by IP address alone when clients sit behind a shared corporate NAT or mobile carrier gateway — one bad actor can trigger `429`s for every legitimate user sharing that IP. Production systems typically key the limiter by API key / authenticated client ID instead, falling back to IP only for fully anonymous/unauthenticated endpoints.

---

## Beginner — Question 5

**Q5: What is the difference between a resource's collection URI and its item URI, and what conventions govern how they relate?**

REST models data as **resources**, and a consistent naming convention between a collection of resources and a single resource within it is one of the most immediately visible signs of a well-designed API.

**The convention:**
```http
GET /api/products          -> the COLLECTION of all products
GET /api/products/5        -> a single ITEM within that collection (product with id 5)
POST /api/products         -> create a NEW item in the collection
PUT /api/products/5        -> replace the existing item at this specific URI
DELETE /api/products/5     -> remove the specific item at this URI
```
The plural noun (`products`) names the collection; appending an identifier (`/5`) narrows it down to one specific member. This mirrors how you'd talk about the data conversationally — "products" (the set) versus "product #5" (one specific one).

**Nested resources extend the same pattern:**
```http
GET /api/products/5/reviews       -> the collection of reviews belonging to product 5
GET /api/products/5/reviews/42    -> a single specific review within that nested collection
```

**Common Pitfalls:**
- **Verbs in the URI** (`GET /api/getProducts`, `POST /api/createProduct`) — REST already expresses the action via the HTTP method; repeating it in the path is redundant and inconsistent with resource-oriented naming.
- **Inconsistent pluralization** — mixing `/api/product/5` in one endpoint with `/api/products` in another confuses API consumers about which convention to expect.
- **Deeply nested paths for data that isn't actually a strict parent-child relationship** — `/api/customers/5/orders/10/items/3/reviews` becomes unwieldy; if `reviews` don't conceptually belong exclusively to that one order item, a flatter, independently-addressable resource (`/api/reviews/99`) is usually clearer.

---

## Intermediate — Question 3

**Q3: What is HAL (Hypertext Application Language), and how does it provide a concrete, standardized format for implementing HATEOAS?**

HATEOAS as a REST constraint says responses should include links describing available actions — but it doesn't itself specify *what that JSON should look like*. HAL is one of the most widely adopted concrete media-type specifications that fills in that gap with an actual, standardized structure.

**A HAL-formatted response:**
```json
{
  "id": 5,
  "status": "Pending",
  "total": 99.99,
  "_links": {
    "self": { "href": "/api/orders/5" },
    "cancel": { "href": "/api/orders/5/cancel" }
  },
  "_embedded": {
    "customer": {
      "id": 42,
      "name": "Jane Doe",
      "_links": { "self": { "href": "/api/customers/42" } }
    }
  }
}
```
Two reserved, standardized keys carry all the hypermedia information: **`_links`** (available actions/related resources as URIs) and **`_embedded`** (related resources' full representations included inline, avoiding an extra round-trip when the client needs both the order and its customer together).

**Why a standard format like HAL matters over each API inventing its own ad-hoc link structure:** client libraries and tooling can be built generically against the HAL spec once, and reused across any HAL-compliant API — without a shared convention, every API's homegrown "links" field would need bespoke client-side parsing logic, defeating much of HATEOAS's promised benefit of generic, convention-following clients.

**Common Pitfall:** adopting HAL's `_links` structure but never actually using it to drive client behavior (the client still hardcodes URLs itself instead of following the provided links) — at that point, the API is paying HAL's response-size and complexity cost without gaining any of the decoupling benefit that following the links dynamically was supposed to provide.

---

## Advanced — Question 5

**Q5: What is Content Negotiation via the `Vary` header, and why is it critical for correctly caching REST responses that support multiple representations?**

When a REST endpoint can return different representations of the same resource depending on a request header (e.g., `Accept: application/json` vs `Accept: application/xml`, or `Accept-Language: en` vs `Accept-Language: fr`), a cache sitting between the client and server needs to know that fact — otherwise it might serve the *wrong* cached representation to a client requesting a different format or language than whoever's request originally populated the cache.

**The problem without `Vary`:**
```http
GET /api/products/5
Accept: application/json
```
```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=3600
```
A shared/CDN cache stores this JSON response keyed only by the URI `/api/products/5`. If a *different* client then requests the same URI with `Accept: application/xml`, a cache that doesn't know representation varies by the `Accept` header could incorrectly serve the cached **JSON** response to a client that explicitly asked for XML.

**The fix — declare which request headers affect the response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=3600
Vary: Accept
```
`Vary: Accept` tells any compliant cache: "this response's content depends on the `Accept` header — cache a *separate* copy per distinct `Accept` value you see, rather than one shared copy for the URI alone." A request with a different `Accept` value correctly triggers a fresh cache lookup (and likely a fresh request to the origin server) instead of reusing the wrong cached representation.

**Common Pitfall:** implementing content negotiation (varying responses by `Accept`, `Accept-Language`, or a custom header like `Accept-Version`) without also setting the matching `Vary` header — the API works correctly for direct, uncached requests, but silently serves wrong/stale representations to some clients the moment a shared cache or CDN sits in front of it, a bug that's easy to miss in development (no cache in the loop) and only surfaces once real caching infrastructure is added in production.

---

## Beginner — Question 6

**Q6: What is the difference between a 4xx and a 5xx status code at a conceptual level, and why does getting this classification right matter for how clients (and monitoring systems) react?**

Both ranges signal something went wrong, but they answer a fundamentally different question about *whose fault* the failure was — 4xx means "the client's request was the problem," 5xx means "the server failed to handle a request that was otherwise fine."

**4xx — client error, the request itself was invalid or unauthorized:**
```http
400 Bad Request    -- malformed request syntax or invalid data
401 Unauthorized    -- missing or invalid authentication
403 Forbidden       -- authenticated, but not permitted
404 Not Found       -- the requested resource doesn't exist
409 Conflict        -- request conflicts with the resource's current state
```
A well-behaved client generally should **not** blindly retry a 4xx — retrying the exact same malformed request or invalid credentials will simply produce the exact same 4xx again; the client needs to *change something* about the request before trying again.

**5xx — server error, the server failed despite receiving a perfectly valid request:**
```http
500 Internal Server Error -- an unhandled exception or bug on the server
502 Bad Gateway            -- an upstream service the server depends on returned an invalid response
503 Service Unavailable    -- the server is temporarily overloaded or down for maintenance
504 Gateway Timeout        -- an upstream dependency took too long to respond
```
A 5xx often *is* reasonable to retry (possibly with backoff) — the request itself was fine, and a transient server-side issue might resolve on its own by the next attempt.

**Why the classification matters beyond just documentation:** automated monitoring/alerting systems typically treat 5xx rates as a genuine service-health signal worth paging someone about, while 4xx rates are usually treated as expected, routine "clients sending bad requests" noise — misclassifying a genuine server bug as a 4xx (or a client validation issue as a 500) can cause monitoring to miss a real outage, or trigger false alarms for normal client-side mistakes.

**Common Pitfall:** returning `500 Internal Server Error` for what's actually invalid client input (a missing required field) simply because the exception happened to originate from an unhandled exception in server code — the *root cause* being a server-side exception doesn't automatically make it a 5xx-appropriate situation if the actual underlying problem was the client sending bad data; the response code should reflect who's actually at fault, which sometimes requires catching that exception and translating it into the correct 4xx.

---

## Intermediate — Question 4

**Q4: What is the `Link` header, and how does it provide a lightweight alternative to embedding full HATEOAS `_links` objects in every response body?**

The `Link` HTTP header (RFC 8288) lets a response communicate related resources/actions via response *headers* rather than embedding them in the JSON body — useful specifically for pagination and a handful of other common relations, without committing to a full hypermedia format like HAL for the entire API.

**Using `Link` headers for pagination, instead of a `_links` object in the body:**
```http
GET /api/products?page=2
```
```http
HTTP/1.1 200 OK
Content-Type: application/json
Link: <https://api.example.com/products?page=1>; rel="prev",
      <https://api.example.com/products?page=3>; rel="next",
      <https://api.example.com/products?page=10>; rel="last"

[ { "id": 21, "name": "Keyboard" }, ... ]
```
The response body stays a clean, plain array of products — no `_links` wrapper object needed — while the `Link` header carries the pagination relations (`prev`, `next`, `last`) that a client can parse generically, since `Link` header syntax is a standard, not a bespoke JSON convention this specific API invented.

**Why this is a genuinely lighter-weight alternative to full HATEOAS:** it doesn't require restructuring the entire response body around a hypermedia envelope (like HAL's `_links`/`_embedded`) — you get standardized "related resource" links for the specific, common cases (pagination being the most frequent) without adopting a comprehensive hypermedia format across the whole API's response shapes.

**Common Pitfall:** using the `Link` header for pagination while *also* duplicating the exact same pagination metadata as fields inside the JSON body (`{"nextPage": "...", "data": [...]}`) — picking one location (header or body) and being consistent about it avoids two sources of truth that could theoretically drift out of sync, and avoids clients needing to check both places just to be safe.

---

## Advanced — Question 6

**Q6: What is Media Type Versioning combined with Custom Media Types (e.g., `application/vnd.myapi.v2+json`), and how does it let an API version its response *shape* independently from its URI?**

Beyond the four versioning strategies covered earlier, Custom Media Types let an API define its own specific, named content type per version — treating "the shape of this JSON" as a first-class, negotiable resource representation, the same way `application/json` versus `application/xml` are negotiated, rather than baking the version into the URI or a bespoke header.

**The mechanism — the `Accept` header requests a specific, versioned representation:**
```http
GET /api/products/5
Accept: application/vnd.myapi.v2+json
```
```http
HTTP/1.1 200 OK
Content-Type: application/vnd.myapi.v2+json

{ "id": 5, "name": "Keyboard", "priceInCents": 2999 }
```
versus an older client requesting the v1 shape from the exact same URI:
```http
GET /api/products/5
Accept: application/vnd.myapi.v1+json
```
```http
HTTP/1.1 200 OK
Content-Type: application/vnd.myapi.v1+json

{ "id": 5, "name": "Keyboard", "price": 29.99 }
```
Both requests hit the **exact same URI** (`/api/products/5`) — the version is negotiated entirely through content negotiation (the `Accept`/`Content-Type` headers), which is arguably the most RESTful of all the versioning approaches, since a URI is supposed to identify a *resource* (which product), not encode metadata about API version.

**Why "vnd" specifically:** the `vnd.` prefix is the standard convention (per RFC 6838) for a "vendor-specific" media type — `vnd.myapi.v2+json` tells any generic HTTP tooling "this is JSON (`+json` suffix), specifically shaped according to MyAPI's own v2 convention," distinguishing it from generic `application/json` while still signaling its underlying format.

**The trade-off versus simpler versioning strategies:** this is the most conceptually "pure" REST approach, but it's also the hardest for API consumers to discover and use correctly — most developers reach for a URI path segment (`/api/v2/products`) or a simple custom header specifically because they're far more visible and easier to test manually (in a browser, via `curl`) than crafting a precise `Accept` header value most HTTP client tools don't surface prominently.

**Common Pitfall:** adopting Custom Media Type versioning for its theoretical REST purity without accounting for how much harder it makes onboarding new API consumers — documentation, example code, and tooling all need to explicitly teach developers to set an unusual `Accept` header value, a genuinely higher barrier than a version number visible directly in the URL they're already looking at.

---
