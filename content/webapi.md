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
