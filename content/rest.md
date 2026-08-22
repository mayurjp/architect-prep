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

## Beginner — Question 7

**Q7: What is the difference between a "Collection Resource" returning a bare JSON array versus an "Envelope" wrapping it with metadata, and why do most production APIs prefer the envelope despite the extra nesting?**

A REST endpoint returning a list can shape that response two ways — a bare array (simplest to consume directly) or an object "envelope" wrapping the array alongside metadata (pagination info, total count) — the trade-off is directness versus the ability to attach information *about* the collection itself.

**A bare array — simplest, but has nowhere to attach metadata:**
```json
[
  { "id": 1, "name": "Keyboard" },
  { "id": 2, "name": "Mouse" }
]
```
This is simple to consume (`response.json()` directly gives you the array), but there's no way to also communicate "there are 500 total products, this is page 2 of 25" alongside the actual items — the response *is* the array, with no room to attach anything else at the same top level.

**An envelope — wraps the array with metadata about the collection itself:**
```json
{
  "data": [
    { "id": 1, "name": "Keyboard" },
    { "id": 2, "name": "Mouse" }
  ],
  "pagination": { "page": 2, "pageSize": 20, "totalItems": 500, "totalPages": 25 }
}
```
Now the response can communicate both the actual items *and* metadata describing the collection as a whole — pagination details, applied filters, or a request-correlation ID — without needing to smuggle that information into HTTP headers (the `Link` header approach covered earlier) or omit it entirely.

**Why most production APIs prefer the envelope despite the extra nesting:** metadata like pagination info is usually essential for the client to actually build a usable UI (showing "page 2 of 25," enabling/disabling a "next" button) — while the `Link` header approach works, many teams find keeping pagination metadata directly in the JSON body (visible in any HTTP client/browser dev tools without needing to inspect headers separately) more discoverable and easier for API consumers to work with directly.

**Common Pitfall:** inconsistently switching between bare arrays and enveloped responses across different endpoints of the same API — a client library written generically against "the API always returns `{ data: [...] }`" breaks unexpectedly on an endpoint that happens to return a bare array instead; picking one convention and applying it consistently across the entire API matters more than which specific convention is chosen.

---

## Intermediate — Question 5

**Q5: What is Idempotency Key Design specifically for how long a server should remember a given key, and what happens if a client reuses the same key for a genuinely different request body?**

Idempotency Keys (covered earlier for preventing duplicate payment processing) require the server to make two additional design decisions beyond just "check if we've seen this key before": how long to remember a used key, and what to do if the *same* key arrives with *different* request data than the first time.

**How long to remember a used key — a retention window, not forever:**
```csharp
public class IdempotencyRecord
{
    public string Key { get; set; }
    public string RequestHash { get; set; } // a hash of the ORIGINAL request body
    public string CachedResponse { get; set; }
    public DateTime ExpiresAt { get; set; } // e.g., 24 hours after the original request
}
```
Retaining every idempotency key forever would grow the tracking table unboundedly — a reasonable, documented retention window (commonly 24 hours, matching how long a client might plausibly still be retrying a failed request) balances genuine duplicate-protection against unbounded storage growth; a client retrying after the window has expired is treated as a brand-new request, which is an accepted, documented trade-off of the chosen window length.

**What happens if the same key arrives with a DIFFERENT request body — a critical edge case:**
```csharp
[HttpPost("payments")]
public async Task<IActionResult> Charge([FromHeader(Name = "Idempotency-Key")] string key, ChargeRequest request)
{
    var existing = await _idempotencyStore.GetAsync(key);
    if (existing != null)
    {
        var currentRequestHash = ComputeHash(request);
        if (existing.RequestHash != currentRequestHash)
            return Conflict("Idempotency-Key was already used with a different request body."); // REJECT, don't silently process either version
        return Ok(existing.CachedResponse); // genuinely the same request, return the cached result
    }
    // ... process normally, store the result keyed by (key, requestHash) ...
}
```
If a client reuses an idempotency key but with a *different* request body (perhaps a bug reusing a stale key, or a client mistakenly generating fewer unique keys than distinct operations), silently returning the *original* cached response for a *different* request would be actively wrong — the server should detect the mismatch (via a hash of the original request) and explicitly reject it with a `409 Conflict`, rather than either silently processing the new, different request (defeating the idempotency guarantee) or silently returning the old response for what's actually a different operation.

**Common Pitfall:** implementing idempotency key checking purely by key existence, without also validating the request body matches what was originally associated with that key — this creates a scenario where a client bug (accidentally reusing a key across genuinely different requests) could either silently succeed with wrong cached data, or silently double-process, depending on implementation details, rather than surfacing the client's bug clearly via an explicit conflict response.

---

## Advanced — Question 7

**Q7: What is "Overfetching Mitigation via Sparse Fieldsets" in REST (an approach GraphQL solves natively, covered in that topic, but that plain REST APIs can approximate), and how does a `?fields=` query parameter work?**

Covered as GraphQL's core motivating problem (over-fetching, under-fetching) — a REST API can partially address the over-fetching half of that problem without adopting GraphQL wholesale, by letting clients specify exactly which fields they want returned via a query parameter, trading some REST simplicity for reduced payload size on bandwidth-constrained clients.

**The default — the full resource representation is always returned, regardless of what the client actually needs:**
```http
GET /api/products/5
```
```json
{ "id": 5, "name": "Keyboard", "description": "A very long description...", "price": 29.99,
  "manufacturer": "...", "warehouseLocation": "...", "supplierId": 42, "internalSku": "..." }
```
A mobile client that only needs `name` and `price` for a list view still receives every field, wasting bandwidth on a constrained connection — the exact over-fetching problem GraphQL was designed to solve entirely.

**Sparse Fieldsets — a query parameter lets the client request only specific fields:**
```http
GET /api/products/5?fields=name,price
```
```json
{ "name": "Keyboard", "price": 29.99 }
```
The server inspects the `fields` parameter and returns only the requested subset — this requires deliberate server-side support (parsing the parameter, selectively projecting the response), it isn't something REST/HTTP provides automatically the way GraphQL's field-selection is built into the query language itself.

**Why this remains an approximation, not a full GraphQL replacement:** Sparse Fieldsets only address a single resource's *own* field selection — it doesn't solve under-fetching (needing related, nested data like the earlier `posts`/`comments` example requiring separate requests), and every endpoint needs its own bespoke implementation of field-filtering logic, whereas GraphQL provides both field selection *and* nested relationship traversal as one unified, built-in mechanism across the entire schema, implemented once at the framework level rather than per-endpoint.

**Common Pitfall:** implementing `?fields=` support inconsistently across only some endpoints of an API — a client library built generically to request sparse fieldsets from any endpoint breaks unexpectedly on the endpoints that don't support the parameter, silently receiving the full payload instead and not necessarily realizing the optimization simply wasn't honored for that specific endpoint.

---

## Beginner — Question 8

**Q8: What is the difference between the HTTP status codes `401 Unauthorized` and `403 Forbidden` in a REST API, and why is this distinction so frequently implemented backwards?**

`401 Unauthorized` actually means "you are not *authenticated*" — the request lacks valid credentials entirely, or the credentials provided are invalid/expired. `403 Forbidden` means "you ARE authenticated, but you're not *allowed* to do this" — the server recognized who you are and refused anyway, based on permissions.

```http
GET /api/admin/users
(no Authorization header at all)

HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer
```
```http
GET /api/admin/users
Authorization: Bearer <a valid token, but belonging to a non-admin user>

HTTP/1.1 403 Forbidden
```
The first response means "prove who you are" (the client should try to authenticate, e.g., log in or refresh a token) — the second means "we know who you are, and the answer is still no" (retrying with different credentials for the same account won't help; the account itself lacks the required permission).

**Why the name `401 Unauthorized` is famously misleading:** despite its name containing the word "Unauthorized," HTTP 401 is actually about *authentication*, not *authorization* — this naming mismatch (a historical artifact of the original HTTP spec) is the single most common source of APIs returning the wrong status code for the wrong scenario, since developers naturally read "401 Unauthorized" as "this user isn't authorized to do X" and reach for it even when the real issue is a missing/invalid permission check on an already-authenticated user.

**Common Pitfall:** returning `403 Forbidden` for a request with no credentials at all (should be `401`, prompting the client to authenticate), or returning `401 Unauthorized` for an authenticated user who simply lacks a specific permission (should be `403`, since re-authenticating as the same user won't change the outcome) — getting this backwards actively misleads client-side error handling, since a client typically responds very differently to "please log in" (401) versus "you're logged in, but not allowed" (403).

---

## Intermediate — Question 6

**Q6: What is Content Negotiation via the `Accept` header, and how does it let a single REST endpoint serve the SAME resource in multiple representations (JSON, XML, CSV) without needing separate URLs for each format?**

Content negotiation lets a client specify, via the `Accept` request header, which media type(s) it can handle for a response — the server inspects this header and returns the SAME underlying resource, just serialized into whichever format the client requested, all from one single URL.

```http
GET /api/products/5
Accept: application/json
```
```json
{ "id": 5, "name": "Keyboard", "price": 29.99 }
```
```http
GET /api/products/5
Accept: text/csv
```
```text
id,name,price
5,Keyboard,29.99
```
Both requests hit the exact same URL (`/api/products/5`) — the *representation* differs based purely on what the client asked for via `Accept`, not the underlying resource, which is exactly REST's distinction between a "resource" (a stable, identified thing) and its "representation" (one particular serialized form of that thing at a point in time) made concrete.

**Server-side implementation (ASP.NET Core supports this via output formatters):**
```csharp
builder.Services.AddControllers(options =>
{
    options.OutputFormatters.Add(new CsvOutputFormatter()); // a custom IOutputFormatter
}).AddXmlSerializerFormatters(); // built-in XML support, alongside the default JSON formatter
```
The framework inspects the incoming `Accept` header and automatically selects whichever registered formatter matches — the action method itself remains entirely unaware of which format was ultimately chosen, returning a plain C# object (`Ok(product)`) regardless.

**Common Pitfall:** encoding the desired format into the URL itself (`/api/products/5.json`, `/api/products/5.xml`) instead of using the `Accept` header — this creates multiple distinct URLs for what's conceptually the *same* resource, undermining REST's principle that a URL identifies one stable resource; while format-in-URL is sometimes used pragmatically (it's easier to test by pasting into a browser address bar), the `Accept` header is the more RESTful mechanism specifically because it keeps one canonical URL per resource regardless of representation.

---

## Advanced — Question 8

**Q8: What is the "Postel's Law" (Robustness Principle — "be conservative in what you send, be liberal in what you accept") tension in REST API design, and why has API design guidance shifted AWAY from strict adherence to it in recent years?**

Postel's Law originally advised: send strictly conforming output, but accept a wide variety of potentially-malformed input liberally. Applied to REST APIs, this historically meant accepting looser, more forgiving input (extra unexpected fields, alternate casing, minor format inconsistencies) to be maximally compatible with imperfect clients — but modern API design guidance has shifted meaningfully away from this, favoring **strict** input validation instead.

**The "liberal" approach (historically common):**
```csharp
[HttpPost]
public IActionResult Create(dynamic body) // accept ANYTHING, try to figure out the intent
{
    string name = body.name ?? body.Name ?? body.productName; // guess which field the client meant
    // ...
}
```
**The modern, strict approach:**
```csharp
public class CreateProductRequest
{
    [Required] public string Name { get; set; } = "";
    [Range(0.01, 100000)] public decimal Price { get; set; }
}

[HttpPost]
public IActionResult Create(CreateProductRequest request) // rejects ANYTHING not matching exactly
```
**Why the shift away from "liberal acceptance":** being overly permissive about malformed or ambiguous input tends to mask genuine client-side bugs rather than helping — a client sending `productName` instead of the documented `name` field, silently "handled" by liberal guessing logic, never discovers its own bug; it works by accident until the liberal-acceptance logic's assumptions eventually diverge from reality, producing much harder-to-diagnose failures than an immediate, clear `400 Bad Request` would have. Postel's original liberal-input advice was formulated for low-level network protocols (TCP/IP interoperability across different vendor implementations), a very different context from a versioned, documented, actively-maintained API contract between a service and its own known clients.

**The modern consensus, more precisely stated:** be strict about *both* what you send and what you accept for a well-documented API contract — reject unexpected fields or malformed input immediately and explicitly (surfacing the client's bug clearly and early) rather than silently guessing at intent, reserving true Postel's-Law-style leniency for genuinely low-level interoperability protocols, not application-level REST API contracts with a known, documented shape.

**Common Pitfall:** building "helpful" liberal-acceptance logic (case-insensitive field matching, silently ignoring unrecognized fields, guessing at intent from multiple possible field names) believing it improves compatibility — in practice, this class of leniency frequently masks real client bugs, delays their discovery, and makes the API's actual contract far less clear than simply rejecting anything not matching the documented shape exactly.

---

## Beginner — Question 9

**Q9: What is the `Location` response header, and what specific role does it play in a `201 Created` response's contract with the client?**

When a `POST` request successfully creates a new resource, a `201 Created` response is expected to include a `Location` header pointing to the URL of the newly-created resource — telling the client exactly where to find (or subsequently interact with) the thing it just created, without needing to construct that URL itself.

```http
POST /api/products
{ "name": "Keyboard", "price": 29.99 }

HTTP/1.1 201 Created
Location: /api/products/42
{ "id": 42, "name": "Keyboard", "price": 29.99 }
```
The client now knows the newly-created product's URL is `/api/products/42` directly from the response header, without needing to guess it, parse it out of the response body, or make a separate follow-up request to discover it — a subsequent `GET`, `PUT`, or `DELETE` targeting this specific resource can go directly to that URL.

**Why omitting `Location` on a `201` response is a commonly-missed REST convention:** many APIs return `201 Created` with the new resource's data in the body but forget the `Location` header entirely — this technically still communicates "something was created" via the status code, but leaves the client to construct the new resource's URL manually (often by concatenating the base path with an `id` field from the response body), which works but isn't as directly self-describing as a proper `Location` header pointing exactly where the client should go next.

**Common Pitfall:** returning `200 OK` instead of `201 Created` for a successful creation `POST`, or returning `201` without the accompanying `Location` header — both are common, easy-to-overlook deviations from the expected REST convention for resource creation; the combination of the correct status code AND the `Location` header together is what fully communicates "a new resource was created, and here's exactly where to find it."

---

## Advanced — Question 9

**Q9: What is "Hypermedia as the Engine of Application State" (HATEOAS) failing to achieve widespread real-world adoption despite being part of Roy Fielding's ORIGINAL REST dissertation — what specific practical friction explains this gap between theory and practice?**

HATEOAS (covered at a conceptual level elsewhere) envisions API responses including links describing available next actions, letting a client navigate an API dynamically without hardcoding URL structures — despite being arguably the most "purely RESTful" idea in Fielding's original dissertation, the overwhelming majority of real-world "REST APIs" never implement it, exposing fixed, documented URL structures that clients hardcode directly instead.

```json
// A HATEOAS response -- includes LINKS describing what the client can do NEXT
{
  "id": 42, "status": "pending",
  "_links": {
    "self": { "href": "/orders/42" },
    "cancel": { "href": "/orders/42/cancel" },   // only present because status IS currently "pending"
    "payment": { "href": "/orders/42/payment" }
  }
}
```
```json
// The FAR more common real-world approach -- NO links, client just KNOWS the URL structure from documentation
{ "id": 42, "status": "pending" }
```
The theoretical benefit is real: a HATEOAS client could discover that "cancel" is currently possible (because the link is present) without hardcoding "orders can be cancelled while pending" business logic client-side — but building genuinely dynamic, link-following client code is substantially more complex than simply hardcoding known URL paths from API documentation, and most real-world API consumers (internal teams, well-documented partner integrations) find hardcoded paths perfectly adequate and far simpler to implement.

**Why the practical friction outweighs the theoretical benefit for most real APIs:** HATEOAS's value is largest for APIs whose URL structure and available actions genuinely change unpredictably over time, consumed by generic, adaptive clients that need to discover capabilities dynamically — for the much more common case of a well-documented API with a known, versioned contract, consumed by clients built specifically against that documented contract, hardcoding URLs is simpler, and the dynamic-discovery benefit HATEOAS provides largely goes unused in practice.

**Common Pitfall:** treating "true REST requires HATEOAS" as a strict, universal requirement any pragmatic engineering team must implement — while technically accurate to Fielding's original definition, the overwhelming majority of production "REST APIs" (including extremely widely-used ones) never implement HATEOAS and are still broadly, colloquially, and usefully described as "RESTful" in everyday industry usage; understanding HATEOAS's theoretical value without treating its absence as disqualifying is the more practical stance for most real-world API design decisions.

---

## Intermediate — Question 7

**Q7: What is the `If-Match`/`If-None-Match` conditional request pattern combined with `ETag`, and how does it let a client perform an OPTIMISTIC CONCURRENCY check as part of an update request?**

An `ETag` is an opaque identifier representing a specific version of a resource's current state — a client can submit an update conditioned on `If-Match: <etag>`, meaning "only apply this update if the resource's current ETag still matches the one I last saw"; if another client modified the resource in the meantime (changing its ETag), the conditional update fails instead of silently overwriting the intervening change.

```http
GET /api/products/5
HTTP/1.1 200 OK
ETag: "abc123"
{ "id": 5, "name": "Keyboard", "price": 29.99 }
```
```http
PUT /api/products/5
If-Match: "abc123"
{ "name": "Keyboard", "price": 24.99 }

HTTP/1.1 200 OK   <-- succeeds, because the CURRENT ETag still matched "abc123"
```
```http
PUT /api/products/5      (a SECOND client, using the SAME stale ETag it fetched earlier)
If-Match: "abc123"
{ "name": "Keyboard", "price": 19.99 }

HTTP/1.1 412 Precondition Failed   <-- FAILS -- the resource's ETag has ALREADY changed since this client last read it
```
Because the second client's `If-Match` value no longer matches the resource's current (already-updated) ETag, the server rejects the update with `412 Precondition Failed` rather than silently overwriting the first client's change — this is the classic "lost update" problem prevented via optimistic concurrency, entirely through standard HTTP headers, without any application-specific version-number scheme needing to be invented.

**Why this is "optimistic" rather than "pessimistic" concurrency:** no lock is held on the resource between the initial `GET` and the subsequent `PUT` — both clients are free to read and attempt to update concurrently; the conflict is only detected (optimistically assuming it usually won't happen) at the moment of the actual write, via the ETag comparison, rather than preventing concurrent access upfront the way a pessimistic lock would.

**Common Pitfall:** implementing update endpoints without any conditional-request/ETag support at all — this leaves the API vulnerable to the classic "lost update" problem, where two clients reading the same resource and both submitting updates result in the second write silently overwriting the first, with neither client ever informed that a conflicting concurrent change occurred.

---

## Beginner — Question 10

**Q10: What is the REST convention of using PLURAL nouns for collection resource URLs (`/products` rather than `/product`), and why does consistency in this choice matter more than which specific choice is made?**

REST convention favors plural nouns for a collection endpoint (`/products` representing the collection of all products) and the same plural noun with an identifier for a specific item within it (`/products/5`) — the specific choice of singular versus plural matters less than applying it *consistently* across an entire API.

```http
GET /products        <-- the COLLECTION of all products (PLURAL)
GET /products/5       <-- ONE specific product WITHIN that collection (same plural noun + identifier)
POST /products        <-- creates a NEW product, added to the collection
```
```http
-- INCONSISTENT mixing (should be AVOIDED) --
GET /products/5        <-- plural here
GET /customer/42        <-- but SINGULAR here -- inconsistent, forces API consumers to remember exceptions
```
A consumer of a well-designed API can correctly guess a resource's URL pattern for a *new* resource type they haven't used before, purely from having learned the API's established convention on other resources — an API that inconsistently mixes singular and plural forms across different resource types forces every consumer to memorize which specific convention applies to which specific resource, rather than being able to apply one learned, predictable pattern universally.

**Common Pitfall:** allowing different teams or individual developers within the same organization to independently choose singular versus plural for different resources they happen to build, resulting in an inconsistent API surface overall — establishing (and enforcing, via API design review or linting) ONE consistent convention across an entire organization's APIs is more valuable than which specific convention (singular or plural) was actually chosen.

---

## Advanced — Question 10

**Q10: What is "Idempotency Keys" for POST requests (as distinct from HTTP's inherent idempotency of PUT/DELETE), and how does a CLIENT-GENERATED unique key let a server SAFELY retry a POST without risking a duplicate side effect (like a double charge)?**

`POST` is NOT inherently idempotent per the HTTP specification (unlike `PUT`/`DELETE`, covered elsewhere) — retrying a `POST` (due to a timeout, a dropped connection where the client never received a response) risks creating a *second*, duplicate resource/side-effect, since the server has no inherent way to know "this is a retry of a request I may have already processed" versus "this is a genuinely new request." An Idempotency Key solves this by having the *client* generate a unique key, sent with the request, that the server uses to recognize and safely handle retries.

```http
POST /api/payments
Idempotency-Key: 7f3e9a21-...   <-- a UNIQUE key, GENERATED BY THE CLIENT, reused on any retry of THIS SAME request
{ "amount": 99.99, "customerId": 42 }
```
```text
Server-side handling:
1. Server receives the request, checks: "have I already processed THIS EXACT Idempotency-Key before?"
2. If NOT seen before: process the payment NORMALLY, store the result keyed by this Idempotency-Key
3. If ALREADY seen before (this is a RETRY): return the SAME STORED RESULT from step 2,
   WITHOUT charging the customer a SECOND time
```
Because the client reuses the *exact same* Idempotency-Key when retrying a request whose response it never received (due to a timeout or dropped connection), the server can recognize this specific retry and simply return the previously-computed result, rather than blindly re-executing the payment charge a second time — this makes an otherwise-non-idempotent `POST` operation safely retryable by the client, without risking a duplicate side effect.

**Why this specifically requires CLIENT-generated keys, not a server-generated mechanism:** the entire point is enabling the *client* to safely retry a request whose response it never actually received — if the server generated the identifying key (returned only in the original response), a client that never received that response would have no key to retry with in the first place; the client must generate and hold onto the key *before* sending the original request, specifically so it remains available for a retry regardless of whether the original response was ever received.

**Common Pitfall:** implementing "retry-safe" `POST` endpoints (payments, order creation) without any Idempotency Key mechanism at all, relying instead on client-side logic to simply "not retry" — network failures genuinely do happen, and a client with no visibility into whether its request actually succeeded before a timeout occurred has no safe way to decide whether retrying is appropriate; Idempotency Keys move this safety guarantee to the server, where it can be enforced reliably regardless of what any individual client's retry logic actually does.

---

## Intermediate — Question 8

**Q8: What is the "Rate Limiting" `Retry-After` header, and how does it let a server tell a throttled client EXACTLY when it's safe to retry, rather than leaving the client to guess?**

When a server rejects a request due to rate limiting (`429 Too Many Requests`), the `Retry-After` header tells the client exactly how long to wait before retrying — either as a number of seconds, or an absolute timestamp — removing the need for the client to guess an appropriate backoff duration on its own.

```http
POST /api/orders
HTTP/1.1 429 Too Many Requests
Retry-After: 30
{ "error": "Rate limit exceeded. Please retry after 30 seconds." }
```
A well-behaved client reads `Retry-After: 30` and waits the full 30 seconds before retrying — without this header, a client would need to guess an appropriate wait duration (too short, and it just gets rate-limited again immediately; too long, and it wastes time unnecessarily waiting longer than actually required), whereas `Retry-After` gives the client the server's own, authoritative answer.

**Why this matters for well-behaved distributed clients specifically:** in a system with many independent clients all being rate-limited simultaneously (a traffic spike), `Retry-After` lets the server communicate a *specific*, deliberately-chosen wait time (potentially staggered across different clients to avoid a "thundering herd" of simultaneous retries) rather than every client independently guessing similar backoff durations and retrying at roughly the same moment, which could itself recreate the same overload condition all over again.

**Common Pitfall:** implementing rate limiting that returns `429 Too Many Requests` without the accompanying `Retry-After` header — this leaves clients to implement their own guessed backoff strategy (commonly exponential backoff with jitter), which works reasonably well but is strictly less precise than the server simply telling clients exactly how long to wait, information the server itself already has direct knowledge of from its own rate-limiting configuration.

---

## Beginner — Question 11

**Q11: What is REST's convention of using QUERY PARAMETERS for filtering/sorting/pagination (`?status=pending&sort=date&page=2`) rather than encoding this same information into the URL PATH itself, and why does this distinction matter for what a URL's PATH is meant to represent?**

REST convention reserves the URL path for identifying *which resource* (or collection) is being addressed, while query parameters express *how* to filter, sort, or paginate that same underlying resource/collection — keeping these two concerns cleanly separated rather than encoding filtering/sorting criteria into the path itself.

```http
GET /orders?status=pending&sort=-date&page=2&pageSize=20
```
```text
-- INCONSISTENT WITH convention (mixing filtering criteria INTO the path itself) --
GET /orders/pending/sorted-by-date/page-2
```
The path `/orders` clearly identifies "the orders collection" as the resource being addressed — the query string (`?status=pending&sort=-date&page=2`) separately expresses how that same collection should be filtered/sorted/paginated for this specific request, without changing what resource is fundamentally being addressed; encoding the same filtering logic into the path instead creates an unbounded, ad-hoc explosion of URL "shapes" for what's conceptually still just one single resource (the orders collection).

**Why this specifically matters for caching and URL predictability:** a consistent, query-parameter-based approach means a client (or a generic caching layer) can predict how filtering/sorting/pagination will always be expressed for ANY resource in the API, without needing resource-specific knowledge of a bespoke path structure — encoding the same information into ad-hoc path segments instead requires memorizing (or discovering) each individual resource's own unique path conventions, undermining the predictability a consistent, convention-following API provides.

**Common Pitfall:** encoding filtering, sorting, or pagination state directly into the URL path (`/orders/pending`, `/orders/page/2`) rather than using query parameters — this conflates "which resource" with "how to view/filter it," producing an unpredictable, resource-specific proliferation of path structures instead of one clean, consistent convention (query parameters) applicable uniformly across every resource in the API.

---

## Intermediate — Question 9

**Q9: What is the "Overloaded POST" anti-pattern (as distinct from a genuine resource-creation `POST`), and how does using `POST` for operations that AREN'T actually "create a new resource" undermine REST's use of HTTP verbs to convey MEANINGFUL semantics?**

`POST` is conventionally meant to represent "create a new resource within this collection" — the Overloaded POST anti-pattern instead uses `POST` as a generic, catch-all verb for virtually every operation (searching, calculating, triggering an action), regardless of whether that operation actually creates anything, undermining HTTP verbs' role in conveying genuinely meaningful semantics about what an operation actually does.

```http
-- OVERLOADED POST -- used for operations that DON'T actually "create" anything at all --
POST /api/calculateShippingCost    { "weight": 5, "destination": "NYC" }   -- NOT creating a resource
POST /api/searchProducts            { "query": "keyboard" }                 -- NOT creating a resource
POST /api/sendPasswordReset         { "email": "user@example.com" }         -- NOT creating a resource, EXACTLY

-- MORE RESTFUL alternatives, using verbs/resources that convey MEANINGFUL semantics --
GET /api/shipping-cost?weight=5&destination=NYC   -- a QUERY, appropriately using GET
GET /api/products?q=keyboard                        -- a QUERY, appropriately using GET
POST /api/password-reset-requests                    -- genuinely CREATES a "password reset request" RESOURCE
```
Using `POST` universally for every operation (regardless of whether it's genuinely a creation) discards the semantic information HTTP verbs are specifically meant to convey — a client (or intermediate cache/proxy) inspecting an Overloaded-POST-based API can no longer infer anything meaningful from the HTTP verb alone (is this safe to retry? is it cacheable? is it idempotent?), since every single operation looks identical (`POST`) regardless of its actual underlying nature.

**Why this specifically undermines infrastructure-level assumptions built around HTTP verb semantics:** intermediate caches, proxies, and generic HTTP tooling make real, useful assumptions based on HTTP verb semantics (a `GET` is safe to cache and retry; a `POST` typically is not) — an API that overloads `POST` for genuinely safe, cacheable, idempotent operations (a search query) loses these infrastructure-level benefits entirely, forcing every single request through `POST`'s more conservative (non-cacheable, not-safe-to-blindly-retry) semantics regardless of the operation's actual, genuine nature.

**Common Pitfall:** defaulting to `POST` for every single API operation regardless of its actual semantics, often to sidestep GET's limitations around request body size or the desire to avoid exposing search criteria in a URL — while there are legitimate edge cases where a `GET` with a very large or complex query genuinely doesn't fit cleanly in a URL, defaulting to `POST` universally, even for operations that are genuinely safe, cacheable, read-only queries, discards the real semantic and infrastructure benefits that correctly-used HTTP verbs are specifically designed to provide.

---

## Advanced — Question 11

**Q11: What is "Content Negotiation for API Versioning via Media Type" (`Accept: application/vnd.myapi.v2+json`), and how does embedding the API version WITHIN the media type itself differ from (and philosophically align more closely with REST than) URL-path-based versioning?**

Rather than embedding a version number in the URL path (`/api/v2/products`), Media-Type-based versioning embeds the version within a custom media type string sent via the `Accept` header — the URL itself stays completely stable and version-agnostic across every version, with content negotiation (covered earlier) determining which version's representation is actually returned.

```http
GET /api/products/5
Accept: application/vnd.myapi.v2+json
```
```http
GET /api/products/5
Accept: application/vnd.myapi.v1+json
```
Both requests target the *exact same URL* (`/api/products/5`) — the specific version returned is determined entirely by the custom media type specified in the `Accept` header, rather than by which URL path segment was used; this means the URL genuinely represents one stable, canonical resource identity across all versions, with the *representation's version* negotiated separately, exactly mirroring how content negotiation determines JSON versus XML for the same underlying resource.

**Why this philosophically aligns more closely with REST's principles than URL-path versioning:** REST's core idea is that a URL identifies a stable *resource* — under Media-Type versioning, `/api/products/5` genuinely remains one single, stable resource across every version, with version being purely a *representation* concern (exactly parallel to format negotiation, JSON vs. XML) — URL-path versioning (`/api/v1/products/5` vs `/api/v2/products/5`), by contrast, technically creates a *different URL* (and therefore, strictly, a different resource identity) for every version, arguably conflicting with REST's principle that one resource should have one stable, canonical URL.

**Why URL-path versioning remains far more common in practice despite this philosophical argument:** Media-Type versioning requires clients to correctly construct and send custom `Accept` header values (easy to get wrong, harder to test by simply pasting a URL into a browser) — URL-path versioning is immediately visible, bookmarkable, and testable directly from a browser address bar, a significant practical convenience that often outweighs Media-Type versioning's stronger philosophical alignment with REST's resource-identity principle for many real-world API teams.

**Common Pitfall:** dismissing URL-path versioning as "not truly RESTful" while ignoring the genuine practical trade-offs that make it the far more commonly adopted approach in real-world APIs — Media-Type versioning's philosophical purity doesn't automatically make it the better *practical* choice for every team; the decision should weigh genuine practical considerations (debuggability, client tooling convenience) against philosophical alignment with REST's resource-identity principle, rather than treating philosophical purity as automatically decisive.

---

## Beginner — Question 12

**Q12: What is the difference between a Path Parameter (`/products/5`) and a Query Parameter (`/products?category=shoes`), and what convention governs when a piece of data belongs in one versus the other?**

A Path Parameter identifies *which specific resource* a URL refers to — it's part of the resource's identity, and the URL is genuinely a different resource without it. A Query Parameter modifies *how* a resource (typically a collection) is retrieved — filtering, sorting, or paginating it — without changing what resource is fundamentally being addressed.

```text
Path Parameter -- identifies WHICH resource:
  GET /products/5           -- product NUMBER 5, specifically -- a DIFFERENT id is a DIFFERENT resource entirely

Query Parameter -- modifies HOW a resource (here, a COLLECTION) is retrieved:
  GET /products?category=shoes&sort=price&page=2
  -- still fundamentally "the products collection" -- the query params just FILTER/SORT/PAGINATE it
```
`/products/5` and `/products/6` are conceptually two entirely different resources (two different products) — `/products?category=shoes` and `/products?category=hats` are still fundamentally "the same collection resource," just viewed through different filters; this is precisely the distinction covered earlier between a REST resource's path structure (identity) and its query string (view/retrieval options on that identity).

**Common Pitfall:** encoding filter/sort/pagination options directly into the URL *path* instead of query parameters (`/products/category/shoes/page/2`) — this conflates "which resource" with "how to retrieve/view it," making the URL structure ambiguous about what's actually resource identity versus retrieval option, and is precisely the anti-pattern covered under the earlier discussion of why query parameters (not path segments) are the REST convention for filtering/sorting/pagination.

---

## Intermediate — Question 10

**Q10: What is the "Chattiness" problem in a strictly resource-per-endpoint REST API, and how does it lead teams toward either GraphQL (covered separately) or REST-specific compromises like embedding/expansion (`?expand=`) to reduce round-trips?**

A strictly resource-per-endpoint REST design (one URL per resource type, no aggregation) can force a client needing related data across several resource types to make many separate round-trips — each individually RESTful, but collectively "chatty," adding cumulative latency, especially over a high-latency mobile connection.

```text
A client needs an Order, its Customer, and its LineItems' Product details:
  GET /orders/5              -- round trip 1
  GET /customers/42          -- round trip 2 (customer ID FROM the order response)
  GET /products/7            -- round trip 3 (for EACH line item's product...)
  GET /products/9            -- round trip 4
-- FOUR separate round trips for what CONCEPTUALLY feels like "one order's full detail" --
```

**A REST-specific mitigation — embedding/expansion via a query parameter:**
```text
GET /orders/5?expand=customer,lineItems.product
-- returns the Order, WITH the Customer and LineItems' Product data EMBEDDED directly in ONE response --
```
```json
{
  "id": 5, "total": 99.99,
  "customer": { "id": 42, "name": "Alice" },
  "lineItems": [{ "product": { "id": 7, "name": "Keyboard" } }]
}
```
The `expand` parameter lets a client opt into embedding specifically the related data it needs for a given screen, collapsing what would otherwise be several round-trips into one — at the cost of the server needing to implement this expansion logic itself, and the response shape becoming somewhat variable depending on what was requested (a a much more constrained version of what GraphQL, covered in its own topic, solves more generally and flexibly).

**Common Pitfall:** treating chattiness purely as "the client's problem to work around with more requests" rather than recognizing it as a real, addressable API design cost — for genuinely mobile/high-latency-sensitive clients, an unmitigated chatty REST API can meaningfully hurt perceived performance; `expand`-style embedding (or, for more severe cases, considering GraphQL or a Backend-for-Frontend aggregation layer, covered elsewhere) are the standard mitigations once chattiness becomes a real, measured problem rather than a merely theoretical one.

---

## Advanced — Question 12

**Q12: What is the Richardson Maturity Model, and how does its four levels (0 through 3) provide a concrete way to assess HOW "RESTful" a given HTTP API actually is, beyond a binary "is it REST or not" judgment?**

The Richardson Maturity Model (named after Leonard Richardson) breaks "how RESTful is this API" into four increasing levels of maturity — most real-world APIs calling themselves "REST" actually sit at Level 2, with genuine Level 3 (full HATEOAS, covered earlier) being comparatively rare in practice.

```text
LEVEL 0 -- "The Swamp of POX": ONE single endpoint, ONE HTTP verb (usually POST), everything
           tunneled through it -- essentially RPC-over-HTTP with NO resource concept at all
           POST /api  { "action": "getOrder", "id": 5 }

LEVEL 1 -- Resources: MULTIPLE distinct URLs now exist per resource -- but STILL typically
           uses ONE HTTP verb (often POST) for everything, regardless of the actual operation
           POST /orders/5/get
           POST /orders/5/cancel

LEVEL 2 -- HTTP Verbs: resources PLUS genuinely using GET/POST/PUT/DELETE according to their
           actual REST semantics (covered throughout THIS topic) -- status codes ALSO used
           meaningfully (200, 201, 404, etc.) -- THIS is where the VAST MAJORITY of real-world
           "REST" APIs actually sit
           GET /orders/5        POST /orders        DELETE /orders/5

LEVEL 3 -- HATEOAS: responses ALSO include hypermedia links describing available NEXT actions,
           letting a client discover what it can do NEXT from the response itself, rather than
           needing that knowledge hardcoded in advance (covered in depth earlier in this topic)
           { "id": 5, "status": "pending", "_links": { "cancel": { "href": "/orders/5/cancel" } } }
```
Because most production APIs stop at Level 2 (genuinely useful HTTP verb/status-code semantics, but no hypermedia-driven discoverability), the Richardson Maturity Model gives a precise, shared vocabulary for what's actually true of a given API — "our API is Level 2" is a meaningfully more useful, specific claim than a vague "yes, it's RESTful," especially when discussing why a team hasn't implemented full HATEOAS (covered earlier as facing real, practical adoption friction) despite the API otherwise following REST conventions well.

**Common Pitfall:** treating "RESTful" as a single, binary yes/no property of an API, leading to unproductive debates about whether a Level 2 API (extremely common, and often perfectly fit-for-purpose) "really counts" as REST — the Maturity Model's actual value is replacing that binary framing with a precise, gradated one, letting a team make an explicit, deliberate choice about which level of maturity is actually worth investing in for their specific API's real consumers, rather than treating Level 3 as an unstated, ill-defined bar every "true" REST API must clear.

---

## Beginner — Question 13

**Q13: What is the convention of Nested Resource URLs (`/customers/5/orders`) versus a flat top-level resource with a filter (`/orders?customerId=5`), and when does nesting genuinely make sense?**

Nesting a resource under its "parent" in the URL path (`/customers/5/orders`) signals a genuine ownership/containment relationship — the orders being requested only make sense *in the context of* customer 5 — while a flat resource with a filter (`/orders?customerId=5`) treats orders as a standalone collection that merely happens to support filtering by customer.

```text
NESTED -- signals "these orders ONLY exist in the CONTEXT of THIS customer":
  GET /customers/5/orders          -- customer 5's orders, specifically
  POST /customers/5/orders         -- create a NEW order, BELONGING to customer 5

FLAT, with a FILTER -- treats orders as its OWN independent, top-level collection:
  GET /orders?customerId=5         -- orders, FILTERED to customer 5 -- but ORDERS exist as their OWN concept
```
Nesting reads naturally when the child resource's identity is genuinely scoped to its parent (an order line item only makes sense within one specific order) — but nesting too deeply (`/customers/5/orders/42/items/3/reviews`) becomes unwieldy, and a resource that's meaningfully independent (an Order might be queried across all customers by an admin dashboard) is often better exposed as its own flat, filterable top-level collection instead.

**Common Pitfall:** nesting resources purely to mirror how the database's foreign keys happen to relate two tables, rather than asking whether the *URL* genuinely needs to express that containment — over-nesting produces long, brittle URLs that break if the "parent" relationship ever needs to change, and often needlessly limits a resource from also being queried independently of its "parent" when a legitimate use case (an admin viewing all orders across every customer) actually requires it.

---

## Intermediate — Question 11

**Q11: What is Cursor-Based Pagination, and how does using an opaque cursor token (rather than a page number) avoid the skipped-or-duplicated-row problem that Offset-Based Pagination suffers when the underlying data changes between page requests?**

Offset-Based Pagination (`?page=2&pageSize=10`, effectively `OFFSET 10 FETCH NEXT 10`, covered under SQL Server) assumes the underlying result set stays stable between requests — if a row is inserted or deleted between fetching page 1 and page 2, the offset-based "skip 10, take 10" arithmetic can skip a row entirely or return the same row twice. Cursor-Based Pagination instead uses an opaque token pointing to "the last item you saw," immune to this shifting problem.

```text
OFFSET-based -- a row DELETED between page 1 and page 2 SHIFTS everything, causing a SKIPPED row:
  Page 1: OFFSET 0  FETCH 10  -- returns rows 1-10
  -- row #7 gets DELETED by someone else, in between requests --
  Page 2: OFFSET 10 FETCH 10  -- now returns what WAS rows 12-21 (everything SHIFTED down by one) --
  -- row #11 (the ORIGINAL row 11) was NEVER shown -- SILENTLY SKIPPED, due to the SHIFT --

CURSOR-based -- the cursor points to a SPECIFIC row's identity, IMMUNE to shifts elsewhere in the set:
  Page 1: GET /orders?limit=10                    -> returns rows, plus a cursor: "next=eyJpZCI6MTB9"
  Page 2: GET /orders?limit=10&cursor=eyJpZCI6MTB9 -> "give me the NEXT 10 rows AFTER the row THIS cursor points to"
  -- REGARDLESS of what got inserted/deleted ELSEWHERE in the set, THIS specific boundary is STABLE --
```
The cursor (typically an opaque, encoded value referencing the last-seen row's own sort key, like `WHERE id > 10 ORDER BY id LIMIT 10` under the hood) anchors the *next* page to a specific row's identity rather than a numeric position that can shift — a row inserted or deleted anywhere else in the result set has no effect on which specific row the cursor still correctly points to.

**Why this matters specifically for APIs backing infinite-scroll feeds or high-churn datasets:** a social media feed or a live order queue where rows are constantly being added/removed is exactly the scenario where offset-based pagination's shifting problem is most likely to actually manifest and be noticed by users (a duplicate post appearing twice while scrolling, or a post seemingly skipped) — cursor-based pagination is the standard mitigation precisely for this class of frequently-changing, sequentially-consumed dataset.

**Common Pitfall:** implementing cursor-based pagination but constructing the cursor from a non-unique or non-stable sort key (like a `CreatedDate` with many rows sharing the exact same timestamp) — if the cursor's underlying sort key isn't guaranteed unique, rows sharing that value can still be skipped or duplicated across pages; a robust cursor typically needs a genuinely unique (or a compound, tie-broken) sort key to fully eliminate the instability offset-based pagination suffers from.

---

## Advanced — Question 13

**Q13: What is the difference between JSON Patch (RFC 6902) and JSON Merge Patch (RFC 7396) for expressing a partial update via HTTP `PATCH`, and how do their two fundamentally different formats trade off expressiveness against simplicity?**

Both formats let a client describe a *partial* change to a resource via `PATCH` (rather than `PUT`'s full-replacement semantics, covered elsewhere) — but they express that partial change in fundamentally different ways: JSON Patch is a sequence of explicit, imperative *operations*; JSON Merge Patch is simply a *partial object* to be shallow-merged into the existing resource.

```http
# JSON Merge Patch (RFC 7396) -- a PARTIAL OBJECT, simply MERGED into the existing resource
PATCH /products/5
Content-Type: application/merge-patch+json

{ "price": 39.99 }
-- MEANING: "merge THIS partial object in -- price becomes 39.99, EVERYTHING ELSE stays UNCHANGED"
-- SIMPLE, reads NATURALLY -- but CANNOT express "remove this field" or "insert into an ARRAY at position 2"
```
```http
# JSON Patch (RFC 6902) -- an EXPLICIT SEQUENCE of IMPERATIVE operations
PATCH /products/5
Content-Type: application/json-patch+json

[
  { "op": "replace", "path": "/price", "value": 39.99 },
  { "op": "remove", "path": "/discontinuedReason" },
  { "op": "add", "path": "/tags/2", "value": "clearance" }
]
-- MEANING: THREE EXPLICIT operations -- REPLACE one field, REMOVE another, INSERT into an ARRAY at a SPECIFIC index
-- FAR more EXPRESSIVE (can target ARRAY positions, EXPLICITLY remove fields) -- but MORE VERBOSE, LESS intuitive
```
JSON Merge Patch's simplicity comes at a real cost: it has no way to explicitly express "remove this field" versus "I simply didn't mention it" in every case (setting a field to `null` is its convention for removal, which conflates "delete this field" with "set this field's value to null," a genuine ambiguity for a field that legitimately *can* hold `null` as a valid value) — JSON Patch's explicit `remove` operation has no such ambiguity, at the cost of a much more verbose, operation-sequence-based request body for even a single-field change.

**Why most real-world APIs choose Merge Patch's simplicity despite JSON Patch's greater expressiveness:** the vast majority of partial-update use cases are genuinely simple ("change this one field's value"), where Merge Patch's plain, intuitive partial-object syntax reads far more naturally to API consumers than JSON Patch's operation-sequence format — JSON Patch's additional expressiveness (array-position-specific operations, explicit removal) matters mainly for APIs with genuinely complex partial-update needs, which is a comparatively narrow slice of real-world API design overall.

**Common Pitfall:** implementing a "PATCH" endpoint that simply accepts a partial JSON object without ever declaring which specific format (Merge Patch, JSON Patch, or an entirely bespoke, undocumented convention) it actually follows — a client has no reliable way to know whether sending `{"discontinuedReason": null}` means "remove this field" or "literally set it to null" without the API explicitly documenting (ideally via the appropriate `Content-Type`, `application/merge-patch+json` or `application/json-patch+json`) which specific, standardized convention its `PATCH` endpoint actually implements.

---

## Beginner — Question 14

**Q14: What is a REST API's root endpoint / Discovery Document convention (`GET /` returning links to major resources), and how does it give a client a genuine starting point for HATEOAS-style navigation?**

Rather than a client needing every specific endpoint URL hardcoded in advance, a Discovery Document convention has the API's root URL (`GET /`) return a small response listing links to its major top-level resources — giving a client one well-known entry point from which it can discover everything else, directly connecting to the HATEOAS philosophy (covered earlier) of navigating an API via links rather than pre-memorized URLs.

```http
GET /
```
```json
{
  "_links": {
    "products": { "href": "/products" },
    "orders": { "href": "/orders" },
    "customers": { "href": "/customers" },
    "docs": { "href": "/docs" }
  }
}
```
A client that only knows the API's base URL can discover its major resource collections simply by requesting the root and following the returned links — rather than requiring separate, out-of-band documentation to be consulted before the client can make its very first meaningful request, the API itself provides that starting map directly, in-band, exactly the way HATEOAS's broader philosophy (covered earlier) envisions an API being navigable.

**Common Pitfall:** implementing a Discovery Document at the root but then having every *other* endpoint's response omit further `_links` entirely — a single root-level discovery document without any further link-following capability deeper into the API provides only a shallow, partial version of HATEOAS's actual value; genuine link-driven navigation requires *every* response, not just the root, to consistently surface the next available actions/resources, the same broader adoption friction covered under HATEOAS's practical-limitations discussion.

---

## Intermediate — Question 12

**Q12: How does a `PUT` request that omits some of a resource's existing fields risk accidentally clearing them, and why does `PUT`'s "replace the entire resource" semantics make this a genuine design hazard distinct from `PATCH`'s partial-update model?**

`PUT` is defined to *replace* a resource's entire representation with whatever the client sends — if a client's `PUT` request body omits a field the resource currently has a value for, a naive server implementation can interpret that omission as "the client wants this field cleared," silently nulling out data the client never actually intended to touch at all.

```http
-- the RESOURCE currently has BOTH a name AND a description
GET /products/5
{ "id": 5, "name": "Keyboard", "description": "A mechanical keyboard", "price": 29.99 }

-- a CLIENT, wanting to update ONLY the price, sends a PUT -- but FORGETS to include "description"
PUT /products/5
{ "id": 5, "name": "Keyboard", "price": 34.99 }

-- a NAIVE server implementation REPLACES the ENTIRE resource with EXACTLY what was sent --
-- "description" is now SILENTLY WIPED OUT, even though the CLIENT never intended to touch it AT ALL --
```
Because `PUT`'s defined semantics are "this representation now IS the resource" (a full replacement, not a partial merge), any field genuinely omitted from the request body is, strictly per the semantics, being set to its absent/default state — this is precisely why `PUT` requires the client to send the resource's *complete* current representation (fetch it first, modify only the field(s) that need to change, then `PUT` the whole thing back) rather than a partial object, which is exactly the scenario `PATCH` (covered earlier, via JSON Patch/Merge Patch) exists to handle safely instead.

**Why this is specifically a client-discipline risk, not a server bug to "fix":** a server correctly implementing `PUT`'s full-replacement semantics is behaving exactly as specified — the actual risk lives entirely on the client side, in a client that constructs a `PUT` request body carelessly, without first fetching the resource's complete current state; the fix isn't to make the server "smarter" about guessing which omitted fields the client "probably" didn't mean to clear (which reintroduces ambiguity `PUT`'s strict semantics are meant to avoid), but to ensure clients always `PUT` a complete representation, or use `PATCH` when only a partial update is genuinely intended.

**Common Pitfall:** using `PUT` for what's conceptually a partial update, relying on client discipline to always remember to include every existing field even when only one is actually changing — this is fragile and error-prone across many different client implementations/teams; when partial updates are a common, expected client need, exposing a proper `PATCH` endpoint (using Merge Patch or JSON Patch, covered earlier) removes the "must remember to always send everything" burden from client code entirely.

---

## Advanced — Question 14

**Q14: What is the Batch/Bulk Operation convention (`POST /orders/batch`), and how does it represent a deliberate exception to REST's one-resource-per-request convention, trading strict RESTfulness for reduced round-trips in high-volume scenarios?**

Strict REST convention operates on one resource (or collection) per request — a Batch endpoint deliberately breaks from this, accepting an array of multiple operations in a single request body, executing them together, and returning an array of individual results — a pragmatic compromise specifically for scenarios where the Chattiness problem (covered earlier) makes strict one-request-per-resource impractical at scale.

```http
POST /orders/batch
Content-Type: application/json

[
  { "method": "POST", "body": { "customerId": 1, "items": [...] } },
  { "method": "POST", "body": { "customerId": 2, "items": [...] } },
  { "method": "DELETE", "path": "/orders/42" }
]
```
```json
[
  { "status": 201, "body": { "id": 101, "customerId": 1 } },
  { "status": 201, "body": { "id": 102, "customerId": 2 } },
  { "status": 204 }
]
```
Rather than a client needing three separate HTTP round-trips (two `POST /orders` calls and one `DELETE /orders/42`), the batch endpoint lets all three operations travel together in a single request/response pair — dramatically reducing cumulative network round-trip overhead for a client that legitimately needs to perform many related operations at once (a mobile client syncing offline changes, a bulk-import job), at the cost of the endpoint no longer mapping cleanly onto REST's "one URL, one resource, one HTTP verb" model.

**Why this is a deliberate, narrow exception rather than a general replacement for ordinary resource-per-request endpoints:** a batch endpoint sacrifices several REST conveniences at once — individual operations within the batch don't get their own distinct HTTP status code at the *transport* level (the outer request is typically a flat `200 OK` regardless of individual operation outcomes, with per-operation status embedded in the response body instead), and standard HTTP semantics like caching or conditional requests (covered elsewhere) don't apply meaningfully to a single request bundling several unrelated operations together; batch endpoints are best reserved specifically for genuinely high-volume, latency-sensitive scenarios where the round-trip reduction clearly outweighs these forfeited RESTful conveniences.

**Common Pitfall:** exposing a generic batch endpoint as the *default*, primary way to interact with a resource collection, rather than reserving it specifically for the narrow scenarios that genuinely need it — for ordinary, everyday client interactions, individual resource-per-request endpoints remain simpler to reason about, cache, and secure; introducing batch endpoints prematurely, before the round-trip cost has actually been shown to be a real problem, adds real complexity (a bespoke request/response envelope format, non-standard per-operation status handling) without a correspondingly clear benefit.

---

## Beginner — Question 15

**Q15: When is it appropriate for a client to create a resource via `PUT` with a client-specified ID, rather than the more common `POST`-based creation with a server-generated ID?**

`POST /orders` (server assigns the new resource's ID, returning it in the response) is the more common creation pattern — but `PUT /widgets/{clientGeneratedId}` is also valid REST, specifically appropriate when the *client* is the natural authority for choosing the resource's identifier, rather than the server.

```http
-- SERVER-GENERATED id -- the CLIENT doesn't know the id UNTIL the server ASSIGNS and RETURNS it
POST /orders
{ "customerId": 5, "items": [...] }
-- Response: 201 Created, Location: /orders/8842   <-- the SERVER decided "8842"

-- CLIENT-SPECIFIED id -- the CLIENT ALREADY knows/OWNS the identifier BEFORE creating the resource
PUT /widgets/sku-ABC123
{ "name": "Blue Widget", "price": 9.99 }
-- Response: 201 Created (if it DIDN'T exist yet) -- the CLIENT chose "sku-ABC123" ITSELF
```
A `PUT`-based creation is idempotent by nature (covered extensively elsewhere) — sending the identical `PUT` request twice creates the resource once, then simply updates it identically the second time, which fits naturally when the client already has a stable, meaningful identifier in mind (a product SKU, a username) — `POST`-based creation is more natural specifically when the server itself is the appropriate authority for assigning a new, previously-unknown identifier (an auto-incrementing order number).

**Common Pitfall:** using `POST` for creation even when the client genuinely already possesses the natural, stable identifier for the resource being created (a user picking their own username, a well-known external SKU) — forcing a server-generated ID onto a resource that already has a perfectly good, client-known identifier adds an unnecessary layer of indirection; `PUT`-based creation is the more natural fit specifically for this scenario, letting the resource's URL directly reflect the identifier the client already had in hand.

---

## Intermediate — Question 13

**Q13: What is the `202 Accepted` status code combined with a `Location` header pointing to a status-check endpoint, and how does this "polling" pattern let a REST API handle long-running, asynchronously-processed operations?**

Some operations (generating a large report, processing a bulk import) take too long to complete within a single synchronous HTTP request/response cycle — `202 Accepted` tells the client "I've accepted your request and started processing it, but it's not done yet," with a `Location` header pointing to a separate endpoint the client can poll to check progress and eventually retrieve the actual result.

```http
POST /reports
{ "type": "annual-sales" }

-- the SERVER immediately RESPONDS, WITHOUT waiting for the REPORT to actually FINISH generating:
HTTP/1.1 202 Accepted
Location: /reports/status/abc123
```
```http
-- the CLIENT POLLS this SEPARATE status endpoint, PERIODICALLY, to CHECK progress:
GET /reports/status/abc123

HTTP/1.1 200 OK
{ "status": "processing", "progressPercent": 45 }

-- EVENTUALLY, ONCE the report is ACTUALLY done:
GET /reports/status/abc123
HTTP/1.1 303 See Other
Location: /reports/abc123/download   <-- REDIRECTS the client to the ACTUAL, FINISHED result
```
Because the client immediately gets a `202` response (rather than the connection staying open for however long the report actually takes to generate), the client is free to do other work while periodically checking the status endpoint — this pattern directly avoids the problems covered under Performance's earlier discussion of a slow, synchronous endpoint tying up a connection/thread for an extended duration, instead giving the client an immediate acknowledgment and a way to check back later.

**Common Pitfall:** returning `200 OK` immediately for a long-running operation that hasn't actually finished yet, without a status-checking mechanism at all — the client has no standardized way to know whether the operation actually succeeded, is still processing, or failed, and no URL to check back at; `202 Accepted` combined with a `Location`-pointed status endpoint is the standard, discoverable way to communicate "accepted, but not yet complete" rather than either blocking the original request indefinitely or returning a premature, misleading success response.

---

## Advanced — Question 15

**Q15: How does combining `If-Match`/ETag-based optimistic concurrency (covered earlier for `PUT`) with a partial JSON Merge Patch body let a `PATCH` operation avoid a lost-update race, the same way `If-Match` protects a full `PUT`?**

`PATCH`'s partial-update model (covered earlier) doesn't inherently protect against two concurrent clients both patching the same resource based on stale data — but exactly the same `If-Match`/ETag mechanism covered for `PUT`-based optimistic concurrency applies equally well to `PATCH`, letting a partial update be conditionally rejected if the resource has changed since the client last read it.

```http
GET /products/5
ETag: "v3-abc123"
{ "id": 5, "name": "Keyboard", "price": 29.99, "stock": 100 }

-- a CLIENT wants to UPDATE just the price, but ONLY if NOBODY ELSE has changed the resource SINCE it was READ
PATCH /products/5
If-Match: "v3-abc123"
Content-Type: application/merge-patch+json

{ "price": 34.99 }
```
```text
IF ANOTHER client ALREADY updated product 5 (e.g., changing stock) BETWEEN this client's GET and PATCH:
  -> the RESOURCE's CURRENT ETag is now DIFFERENT (say, "v4-def456") -- NO LONGER matches "v3-abc123"
  -> the SERVER REJECTS this PATCH with 412 Precondition Failed -- the PARTIAL price update is NEVER applied
  -> the CLIENT must RE-FETCH the CURRENT state and DECIDE how to proceed, rather than BLINDLY
     applying a PARTIAL update ON TOP of data it NO LONGER accurately reflects
```
Without `If-Match`, a `PATCH` request could apply its partial change on top of a resource state that's already been superseded by someone else's concurrent update — silently succeeding, but based on stale assumptions about the resource's other fields — combining `If-Match` with `PATCH` closes this gap exactly the way it closes the equivalent gap for `PUT`, rejecting the partial update outright if the resource has genuinely changed since the client last observed it.

**Why this matters specifically for `PATCH` even though it only modifies a SUBSET of fields:** one might assume a partial update is inherently "safer" than a full `PUT` replacement, since it only touches the fields it explicitly mentions — but the *decision* to apply that specific partial change might itself have been made based on now-stale context (a client deciding to apply a discount specifically because it read a certain stock level, which has since changed) — `If-Match` protects against acting on stale context, not merely against overwriting fields the client didn't intend to touch.

**Common Pitfall:** assuming `PATCH`'s partial-update nature makes it inherently immune to lost-update races, and therefore skipping `If-Match` entirely for `PATCH` endpoints while still using it for `PUT` — a `PATCH` operation can be just as vulnerable to acting on stale, superseded context as a full `PUT`, and deserves the exact same `If-Match`-based optimistic concurrency protection whenever the operation's correctness genuinely depends on the resource's state not having changed since it was last read.

---

## Beginner — Question 16

**Q16: What is the `X-Total-Count` (or similarly-named) response header convention for paginated results, and how does it let a client know the total number of items without the response body needing an Envelope (covered elsewhere)?**

An Envelope (covered elsewhere) wraps a paginated response body with metadata like a total count — an alternative convention instead keeps the response body a plain, bare array of items, and communicates the total count (and other pagination metadata) via a response *header* instead, avoiding the extra nesting an envelope introduces.

```http
GET /products?page=2&pageSize=20

HTTP/1.1 200 OK
X-Total-Count: 347
Link: <https://api.example.com/products?page=3&pageSize=20>; rel="next"

[
  { "id": 21, "name": "Keyboard" },
  { "id": 22, "name": "Mouse" }
  // ... a PLAIN, BARE array -- NO envelope wrapping AT ALL
]
```
A client needing the total item count (to render "Page 2 of 18," for instance) reads it from `X-Total-Count` rather than needing to unwrap an envelope object first — this keeps the response body itself exactly the shape a client would expect for "just the items," while still surfacing pagination metadata through a standard, predictable header any client can check for, without altering the fundamental response body shape at all.

**Common Pitfall:** mixing both conventions inconsistently across an API's different endpoints — some paginated endpoints returning a bare array with metadata in headers, others wrapping the same kind of data in an envelope object — forcing client code to handle two entirely different response shapes depending on which specific endpoint happens to be called; an API should commit to one consistent pagination-metadata convention across all its paginated endpoints, not mix the two approaches arbitrarily.

---

## Intermediate — Question 14

**Q14: What is the `Prefer` request header (RFC 7240), and how does it let a client hint at preferred handling — like `Prefer: respond-async` or `Prefer: return=minimal` — without requiring the server to honor it?**

The `Prefer` header lets a client express an optional *preference* for how a request should be handled, which the server may honor or simply ignore — unlike a mandatory instruction, a `Prefer` header is explicitly advisory, giving a client a standardized way to hint at a preference without breaking compatibility with servers that don't support or choose not to honor that specific preference.

```http
POST /orders
Prefer: return=minimal

-- a SERVER HONORING this preference returns a MINIMAL response (JUST a Location header, no BODY):
HTTP/1.1 201 Created
Location: /orders/42
Preference-Applied: return=minimal    <-- CONFIRMS it WAS honored

-- a SERVER that DOESN'T support this preference SIMPLY IGNORES it, returning its NORMAL, FULL response:
HTTP/1.1 201 Created
Location: /orders/42
{ "id": 42, "customerId": 5, "items": [...], "total": 99.99 }   <-- the FULL body, as USUAL
```
```http
POST /reports
Prefer: respond-async
-- HINTS the CLIENT would PREFER an ASYNCHRONOUS (202 Accepted, covered earlier) response, rather
   than WAITING synchronously for a POTENTIALLY LONG-RUNNING operation to FULLY complete
```
Because `Prefer` is explicitly advisory (the server is never *required* to honor it, and can simply proceed with its normal, default behavior), a client can safely send this header against any server, whether or not that server actually understands or supports the specific preference — servers that do support it can echo back a `Preference-Applied` header confirming which preference was actually honored, while non-supporting servers simply behave exactly as they would have without the header present at all.

**Common Pitfall:** designing a client that *requires* a specific `Prefer`-requested behavior to actually occur, treating it as a mandatory instruction rather than the advisory hint the header is specifically designed to be — a client depending on `return=minimal` actually being honored, without a fallback path for a server that ignores the preference and returns its normal, full response instead, misunderstands the header's fundamentally optional, best-effort nature.

---

## Advanced — Question 16

**Q16: What is Long Polling, and how does a server holding a request open until data becomes available differ from ordinary polling's fixed interval, as a middle-ground technique for near-real-time updates without WebSockets?**

Ordinary polling (covered elsewhere) has a client repeatedly send a new request every fixed interval, mostly receiving "nothing new yet" responses — Long Polling instead has the server *hold the connection open*, without responding, until either new data actually becomes available or a timeout is reached, at which point the client immediately issues a new long-polling request, repeating the cycle.

```text
ORDINARY POLLING -- client asks EVERY fixed interval, REGARDLESS of whether anything's ACTUALLY new:
  GET /notifications  (t=0s)   -> "nothing new"
  GET /notifications  (t=5s)   -> "nothing new"
  GET /notifications  (t=10s)  -> "nothing new"
  GET /notifications  (t=15s)  -> FINALLY, something new arrived AT t=12s, but the CLIENT doesn't
                                   find OUT until its NEXT scheduled poll, at t=15s -- UP TO A
                                   FULL POLLING INTERVAL of UNNECESSARY DELAY

LONG POLLING -- the SERVER HOLDS the connection OPEN, responds THE MOMENT something is ACTUALLY new:
  GET /notifications  (t=0s)  -- SERVER holds this CONNECTION open, WITHOUT responding YET...
                              -- new DATA arrives at t=12s -- SERVER responds IMMEDIATELY, at t=12s
  GET /notifications  (t=12s) -- CLIENT immediately issues the NEXT long-poll request, REPEATING the cycle
```
Because the server only responds once genuinely new data exists (rather than the client needing to wait for its next scheduled poll interval), Long Polling delivers updates with much lower latency than ordinary fixed-interval polling, while still working over plain HTTP request/response semantics — no WebSocket upgrade, no persistent bidirectional connection, no additional protocol beyond ordinary HTTP — making it a genuine, lower-complexity middle ground between simple polling's latency cost and a full WebSocket/SSE connection's added protocol complexity.

**Why this remains a legitimate technique even with WebSockets and SSE (covered under ASP.NET Core) available:** Long Polling works transparently through any ordinary HTTP infrastructure (proxies, load balancers) that might not correctly support WebSocket upgrades or long-lived SSE connections — for environments with restrictive network intermediaries, or clients/scenarios not justifying a full persistent-connection technology, Long Polling remains a genuinely useful, simpler fallback providing meaningfully better latency than fixed-interval polling without requiring any protocol beyond plain HTTP.

**Common Pitfall:** implementing Long Polling without a reasonable server-side timeout, letting connections hang indefinitely waiting for data that might never arrive — this can exhaust server-side connection/thread resources (many requests held open simultaneously, waiting); a well-designed Long Polling implementation always includes a timeout (returning an empty/no-op response after, say, 30 seconds), at which point the client simply issues a fresh long-poll request, preventing connections from being held open truly indefinitely.

---

## Beginner — Question 17

**Q17: What is the `OPTIONS` HTTP method's role in a REST API's own design (as distinct from its use in a CORS preflight check, covered under HTTP), and how can a client use it to discover which methods a specific resource actually supports?**

Beyond its automatic use as a CORS preflight mechanism, `OPTIONS` is itself a defined HTTP method a REST API can implement to let a client ask "what can I actually do with this resource?" — the response's `Allow` header lists the supported methods for that exact URL, giving a client a way to discover a resource's capabilities without needing prior, out-of-band documentation.

```http
OPTIONS /api/orders/5 HTTP/1.1
```
```http
HTTP/1.1 200 OK
Allow: GET, PUT, PATCH, DELETE
```

```csharp
[HttpOptions("{id}")]
public IActionResult GetAllowedMethods(int id) {
    Response.Headers.Append("Allow", "GET, PUT, PATCH, DELETE");
    return Ok();
}
```

Because the `Allow` header comes directly from the server's own routing configuration for that resource, a client (or a debugging tool) can use `OPTIONS` to verify exactly which verbs a given endpoint accepts, without needing to guess or consult separate documentation that might have drifted out of sync with the actual implementation.

**Common Pitfall:** confusing this REST-level use of `OPTIONS` with the browser's automatic CORS preflight `OPTIONS` request (covered under HTTP) — they're the same HTTP method but serve different purposes; a REST API can support both simultaneously, using the CORS middleware to handle preflight checks while separately implementing `OPTIONS` on specific routes for genuine resource-capability discovery.

---

## Intermediate — Question 15

**Q15: What is the REST convention around a successful `DELETE` request's response body, and why do most APIs return `204 No Content` rather than the now-deleted resource's last known state?**

A `DELETE` request's whole point is that the resource no longer exists afterward — returning `204 No Content` (an explicitly empty body) signals "the deletion succeeded, and there is nothing further to say," which is why it's the overwhelmingly common convention, though some APIs instead return `200 OK` with the deleted resource's final representation, useful when a client might want to display "you just deleted: [name]" without having cached that data beforehand.

```http
DELETE /api/orders/5 HTTP/1.1
```
```http
HTTP/1.1 204 No Content
```
```text
-- versus the LESS COMMON alternative, RETURNING the resource's LAST state before deletion:
HTTP/1.1 200 OK
Content-Type: application/json

{ "id": 5, "status": "Cancelled", "total": 129.99 }
```

Because a deleted resource genuinely no longer exists, there's no "current state" left to return — `204`'s empty body is the more semantically honest response, while the `200`-with-body alternative is a deliberate, documented deviation some APIs choose purely for client convenience, not because it's more "correct" REST.

**Common Pitfall:** inconsistently mixing both conventions across different endpoints of the same API (some `DELETE` actions returning `204`, others returning `200` with a body) without a documented, deliberate reason — clients consuming the API then can't safely assume a consistent response shape for every delete operation, undermining exactly the kind of predictability a well-designed API's conventions are meant to provide.

---

## Advanced — Question 17

**Q17: What is resource embedding via an `?include=` query parameter (as used by JSON:API-style REST conventions), and how does it let a client request related resources in the SAME response, avoiding the N+1 follow-up-request problem that a purely resource-per-endpoint design otherwise creates?**

A strict one-resource-per-endpoint REST design forces a client wanting an order *and* its customer *and* its line items to make separate follow-up requests for each related resource — `?include=` lets the client explicitly ask for specific related resources to be embedded directly in the initial response, trading strict resource-per-URL purity for a meaningful reduction in round-trips, directly addressing the "Chattiness" problem covered earlier.

```http
GET /api/orders/5?include=customer,lineItems HTTP/1.1
```
```json
{
  "id": 5,
  "total": 129.99,
  "customer": { "id": 42, "name": "Alice" },
  "lineItems": [ { "productId": 9, "quantity": 2 } ]
}
```
```text
WITHOUT ?include=, the SAME data would require THREE separate round-trips:
  GET /api/orders/5           -- get the order itself
  GET /api/customers/42       -- a SEPARATE request, just to get the customer's name
  GET /api/orders/5/line-items -- ANOTHER separate request, for the line items
```

Because the client explicitly opts into which related resources it needs embedded (rather than the server always eagerly including everything, or never including anything), this approach lets a mobile client on a slow connection request a lean response while a dashboard needing the full picture requests everything in one round-trip — directly analogous to GraphQL's (covered separately) field-selection model, but layered onto an otherwise ordinary REST endpoint rather than requiring a dedicated query language.

**Common Pitfall:** implementing `?include=` by having the server ALWAYS eagerly load and embed every possible related resource regardless of what the client actually asked for — this defeats the entire purpose of making inclusion opt-in, and reintroduces the N+1-avoidance benefit's inverse problem: bloated responses for clients that only wanted the base resource; the query parameter's whole value lies in the CLIENT controlling exactly what gets embedded, not the server deciding unilaterally.

---

## Beginner — Question 18

**Q18: What is a REST API's `405 Method Not Allowed` response (with an `Allow` header), and how does it differ from `404 Not Found` for a client trying an unsupported HTTP verb on an otherwise-valid URL?**

`404` means the URL itself doesn't correspond to any resource at all — `405` means the URL is entirely valid and does correspond to a real resource, but the specific HTTP method attempted isn't one that resource supports, with the `Allow` header telling the client exactly which methods *are* supported instead.

```http
DELETE /api/reports/5 HTTP/1.1
```
```http
HTTP/1.1 405 Method Not Allowed
Allow: GET, PATCH
```

```text
404: the URL "/api/reports/5" doesn't exist AT ALL -- NO resource matches this path, PERIOD
405: the URL "/api/reports/5" IS a REAL, VALID resource -- it simply DOESN'T support DELETE --
     the Allow header tells the CLIENT exactly WHICH methods it DOES support (GET, PATCH)
```

Because `405` explicitly confirms the resource exists (just not for that verb) while `404` says nothing about the resource's existence at all, correctly distinguishing the two gives a client (or a developer debugging an integration) genuinely useful information — a `404` suggests checking the URL itself, while a `405` suggests checking which HTTP method the endpoint actually supports.

**Common Pitfall:** returning a generic `404` for every routing failure, including cases where the resource exists but the attempted method simply isn't supported — this conflates two genuinely different failure conditions, forcing a client to guess whether the problem is "wrong URL" or "wrong verb"; returning the more specific `405` (with its `Allow` header) when the resource is valid but the method isn't gives much clearer, more actionable feedback.

---

## Intermediate — Question 16

**Q16: Why is an `Idempotency-Key` typically sent as an HTTP header rather than a field inside the request body, and how does this placement make it easier for generic middleware/proxies to inspect and deduplicate on?**

Putting the idempotency key in a header (rather than buried inside a JSON body whose structure varies per endpoint) lets generic, endpoint-agnostic infrastructure (an API Gateway, a reverse proxy, a shared middleware component) read and act on it uniformly across every endpoint, without needing to understand or parse each endpoint's specific body schema.

```http
POST /api/payments HTTP/1.1
Idempotency-Key: 7d3f9c2a-1234-4abc-9def-a1b2c3d4e5f6
Content-Type: application/json

{ "amount": 99.99, "currency": "USD" }
```

```text
Header-based Idempotency-Key: a GENERIC middleware component can read "Idempotency-Key" from
  ANY request, REGARDLESS of what that specific endpoint's BODY schema looks like -- ONE piece
  of shared, REUSABLE deduplication logic works ACROSS every endpoint in the API UNIFORMLY

Body-based idempotency field: EACH endpoint's body has a DIFFERENT shape -- a shared middleware
  component would need to PARSE and UNDERSTAND every DIFFERENT body schema just to FIND the key
```

Because headers are structurally uniform regardless of what an endpoint's specific request body contains, a single piece of shared infrastructure (middleware, a gateway policy) can implement idempotency-key deduplication generically, applied consistently across an entire API's many differently-shaped endpoints, without needing endpoint-specific knowledge of each one's body structure.

**Common Pitfall:** embedding an idempotency key as just another field inside each endpoint's own JSON body — this works for that one endpoint, but any shared, cross-cutting deduplication logic would need custom parsing per endpoint's distinct body shape; a header-based convention lets the same generic logic apply uniformly, which is why most real-world APIs (Stripe, for instance) standardize on `Idempotency-Key` as a header.

---

## Advanced — Question 18

**Q18: What is Conditional PATCH via `If-Unmodified-Since` as an alternative to ETag-based optimistic concurrency (covered extensively), and why is ETag-based validation generally preferred despite `If-Unmodified-Since` being simpler to implement naively?**

`If-Unmodified-Since` lets a client submit an update conditioned on the resource not having changed since a specific *timestamp* — similar in spirit to `If-Match`/ETag (covered earlier), but based on a `Last-Modified` date rather than an opaque version identifier; ETag is generally preferred because a timestamp only has whatever precision the server chooses to track (often just seconds), meaning two genuinely different updates occurring within the same second are indistinguishable to a date-based check, while an ETag can encode a genuinely unique version per actual change regardless of timing.

```http
PATCH /api/orders/5 HTTP/1.1
If-Unmodified-Since: Wed, 22 Aug 2026 10:15:00 GMT
```
```text
PROBLEM: if TWO separate updates happen WITHIN the SAME SECOND (a common occurrence under real
concurrent load), BOTH share the IDENTICAL Last-Modified TIMESTAMP -- If-Unmodified-Since CANNOT
DISTINGUISH between them, and a CONFLICTING update might be INCORRECTLY accepted as "unmodified"

ETag-based (If-Match): the ETag CHANGES with EVERY SINGLE update, REGARDLESS of HOW CLOSE
TOGETHER in TIME two updates happen -- NO precision LIMITATION, since it's NOT based on a
TIMESTAMP at all -- it's an OPAQUE, GUARANTEED-unique-per-VERSION identifier instead
```

Because a timestamp's precision is fundamentally limited by whatever granularity the server tracks (rarely finer than a second, sometimes coarser), `If-Unmodified-Since` can fail to detect two genuinely conflicting updates that happen to occur within the same timestamp granularity window — an ETag, generated fresh with every actual change (a hash of the content, or an incrementing version number), has no such precision ceiling, making it the more robust choice for concurrency control even though a timestamp-based check is often simpler to implement with data a system already tracks.

**Common Pitfall:** relying on `If-Unmodified-Since` for concurrency control specifically because `Last-Modified` timestamps are already tracked and readily available, without considering the precision ceiling that a busy resource updated multiple times per second genuinely runs into — for anything with meaningful concurrent-update risk, an ETag's version-per-change guarantee avoids this specific class of missed-conflict bug that a timestamp-based check remains vulnerable to.

---
