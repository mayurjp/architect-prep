## Beginner — Question 1

**Q1: What is the ASP.NET Core Middleware pipeline?**

Middleware in ASP.NET Core is software assembled into an application pipeline to handle HTTP requests and responses. Each component in the pipeline decides whether to pass the request to the next component in the pipeline or to short-circuit the request and return a response immediately.

**The Mechanism:**
The pipeline is built in the `Program.cs` file using the `IApplicationBuilder` (or `WebApplication` builder). The order in which middleware components are added is critical because it dictates the order of execution. 
When a request arrives, it flows through the middleware sequentially. On the way back out (the response), it flows through them in the exact reverse order.

```csharp
var app = builder.Build();

// 1. Exception handling (runs first on request, last on response to catch everything)
app.UseExceptionHandler("/Error");

// 2. Static files (short-circuits if it finds a file, saving processing time)
app.UseStaticFiles();

// 3. Routing (figures out which endpoint to hit)
app.UseRouting();

// 4. Authorization (secures the endpoint)
app.UseAuthorization();

// 5. Endpoint execution
app.MapControllers();

app.Run();
```

**Common Pitfalls:** 
Putting `UseAuthorization` *before* `UseRouting` is a classic mistake. If the framework doesn't know *which* endpoint is being called (done by routing), it cannot know what authorization rules to apply to that specific endpoint.

#### Follow-up: How do you write a custom inline middleware?
You can use the `app.Use()` method. You must be careful to invoke `next()` if you want the pipeline to continue.
```csharp
app.Use(async (context, next) => {
    // Logic before the next middleware
    Console.WriteLine("Incoming Request");
    
    await next.Invoke(); // Call the next middleware in the pipeline
    
    // Logic after the next middleware (on the way out)
    Console.WriteLine("Outgoing Response");
});
```

---

## Intermediate — Question 1

**Q1: Explain the difference between Transient, Scoped, and Singleton service lifetimes in ASP.NET Core DI.**

ASP.NET Core has a built-in Dependency Injection (DI) container that manages the creation and disposal of services based on their defined lifetime.

1. **Transient (`AddTransient`):**
   - A new instance of the service is created *every single time* it is requested from the DI container.
   - Best for lightweight, stateless services.

2. **Scoped (`AddScoped`):**
   - A new instance is created *once per client request* (HTTP request). All components that resolve this service during that specific HTTP request will get the exact same instance.
   - Best for services that maintain state for a single request, like a database context (`DbContext`).

3. **Singleton (`AddSingleton`):**
   - A single instance is created the first time it is requested, and that exact same instance is used for the entire lifetime of the application.
   - Best for application-wide state, memory caches, or expensive-to-create objects like a connection pool.

**The Mechanism:**
The DI container resolves dependencies by inspecting constructors. If you request a Scoped service, the ASP.NET Core framework creates a "Scope" at the beginning of the HTTP request and disposes of that scope at the end, automatically calling `Dispose()` on all resolved services implementing `IDisposable`.

**Common Pitfalls:**
**Captive Dependencies:** This occurs when a service with a longer lifetime (e.g., Singleton) takes a dependency on a service with a shorter lifetime (e.g., Scoped). Since the Singleton is only constructed once, it holds onto the Scoped dependency forever, effectively turning it into a Singleton. This can lead to massive memory leaks or concurrent threading issues (e.g., using a single `DbContext` across multiple concurrent HTTP requests).

#### Follow-up: How does ASP.NET Core prevent Captive Dependencies?
By default, in the Development environment, ASP.NET Core enables scope validation (`ValidateScopes = true`). If you attempt to resolve a Scoped service from the root provider (Singleton), the application will crash at startup with an `InvalidOperationException`. However, this check is disabled in Production by default for performance reasons.

---

## Intermediate — Question 2

**Q2: What is Kestrel, and why do we often put a Reverse Proxy (like NGINX or IIS) in front of it?**

**Kestrel** is the default, cross-platform web server included with ASP.NET Core. It is highly optimized, incredibly fast, and handles the actual processing of raw TCP sockets and HTTP protocols.

**The Mechanism:**
Kestrel runs in-process with your ASP.NET Core application. When a request hits the machine, Kestrel parses the HTTP headers and body, translates them into the `HttpContext` object, and hands it off to the middleware pipeline.

**Why use a Reverse Proxy?**
While Kestrel is fast, it is primarily designed to be an edge-facing web server for modern protocols. Historically (and often still today), developers place a reverse proxy like IIS, NGINX, or Apache in front of Kestrel.
1. **Security & Hardening:** Reverse proxies are battle-tested against slow-client attacks (like Slowloris), malformed headers, and other edge-case vulnerabilities.
2. **Port Sharing:** Kestrel can't share port 80 or 443 with other applications on the same server (IIS and NGINX can).
3. **Load Balancing:** A reverse proxy can distribute traffic across multiple instances of Kestrel.
4. **Static File Serving:** NGINX is heavily optimized to serve static files directly from the OS file system without waking up the .NET runtime.

*Note:* In recent versions (ASP.NET Core 6+), Kestrel has been heavily hardened, and Microsoft fully supports exposing Kestrel directly to the internet without a reverse proxy in edge deployments (like Kubernetes or Azure App Service).

---

## Advanced — Question 1

**Q1: What is an `IHostedService` and how does `BackgroundService` simplify it?**

ASP.NET Core applications are not limited to just responding to HTTP requests. You can run long-running background tasks (like polling a queue, cache refreshing, or batch processing) using Hosted Services.

**The Mechanism:**
You implement the `IHostedService` interface, which has two methods: `StartAsync` and `StopAsync`. When the ASP.NET Core host starts, it calls `StartAsync` on all registered hosted services *before* it starts accepting HTTP traffic. When the app shuts down gracefully, it calls `StopAsync`.

```csharp
public class MyBackgroundJob : IHostedService {
    public Task StartAsync(CancellationToken cancellationToken) {
        // Start background logic
        return Task.CompletedTask;
    }
    public Task StopAsync(CancellationToken cancellationToken) {
        // Clean up
        return Task.CompletedTask;
    }
}
// Registered via: builder.Services.AddHostedService<MyBackgroundJob>();
```

**`BackgroundService` base class:**
Implementing `IHostedService` manually is tricky because if `StartAsync` blocks, it prevents the entire web application from starting! 
`BackgroundService` is an abstract base class that implements `IHostedService` for you. It provides a single `ExecuteAsync` method that runs on a background thread.

```csharp
public class QueueProcessor : BackgroundService {
    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
        while (!stoppingToken.IsCancellationRequested) {
            await ProcessQueueMessageAsync();
            await Task.Delay(1000, stoppingToken);
        }
    }
}
```

**Common Pitfalls:**
Because Hosted Services run outside of an HTTP request, there is no "Scope". If your `BackgroundService` needs to use a Scoped service (like `DbContext`), you cannot inject it directly into the constructor (it would become a Captive Dependency).

#### Follow-up: How do you use a Scoped service inside a BackgroundService?
You must inject the `IServiceProvider` (or `IServiceScopeFactory`), create a scope manually, resolve the service, and dispose of the scope.
```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
    using (var scope = _scopeFactory.CreateScope()) {
        var dbContext = scope.ServiceProvider.GetRequiredService<MyDbContext>();
        // Use dbContext...
    } // dbContext is disposed here
}
```

---

## Scenario — Question 1

**Q1: You are building an ASP.NET Core API. You have a `ShoppingCartController` that injects a `ShoppingCartService`. The service needs to know the ID of the currently logged-in user, which is stored in the JWT Token as a claim. How do you securely pass this User ID to the service without passing it as an argument to every single method?**

Passing the `userId` around manually (e.g., `_service.AddItem(userId, item)`) pollutes your domain methods with infrastructure concerns.

**The Solution: `IHttpContextAccessor`**

You should extract the User ID ambiently within the service itself using `IHttpContextAccessor`.

**The Mechanism:**
1. **Register the accessor:** In `Program.cs`, you must explicitly register it because it is not enabled by default for performance reasons: `builder.Services.AddHttpContextAccessor();`
2. **Inject it into your service:** 
```csharp
public class ShoppingCartService {
    private readonly IHttpContextAccessor _httpContextAccessor;
    
    public ShoppingCartService(IHttpContextAccessor httpContextAccessor) {
        _httpContextAccessor = httpContextAccessor;
    }
    
    public void AddItem(Item item) {
        // Read the claim directly from the current HTTP request context
        var userId = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        // Proceed with logic...
    }
}
```

**Why this works:**
ASP.NET Core uses `AsyncLocal<T>` under the hood for the `IHttpContextAccessor`. This means that even as your asynchronous code jumps between different threads in the thread pool (`await`), the specific `HttpContext` associated with the *original request* flows perfectly with the execution context. You securely access the correct user's claims without polluting your method signatures.

---

## Scenario — Question 2

**Q2: Your team deployed an ASP.NET Core API to production. Everything works fine under low load, but during peak hours, the application crashes with `SocketException: Only one usage of each socket address is permitted`. The logs show the crash happens when calling an external third-party API via `HttpClient`. How do you fix this architectural flaw?**

This is the dreaded **Socket Exhaustion** problem, usually caused by creating a `new HttpClient()` for every request.

**The Flaw:**
When you dispose of an `HttpClient`, the underlying TCP socket is not immediately closed by the OS; it goes into a `TIME_WAIT` state for up to 4 minutes. If your API receives 1,000 requests per minute and instantiates a new `HttpClient` for each, you will rapidly exhaust all available outbound TCP ports on the server, causing the application to crash.

**The Solution: `IHttpClientFactory`**

Instead of instantiating `HttpClient` manually, you must let ASP.NET Core manage the connections via `IHttpClientFactory`.

1. **Register the Factory:** In `Program.cs`, you register your typed client:
   `builder.Services.AddHttpClient<ThirdPartyApiService>();`
2. **Inject the Client:** In your service, inject the `HttpClient` provided by the factory:
   ```csharp
   public class ThirdPartyApiService {
       private readonly HttpClient _httpClient;
       public ThirdPartyApiService(HttpClient httpClient) {
           _httpClient = httpClient;
       }
   }
   ```

**The Mechanism:**
Under the hood, `IHttpClientFactory` does not cache the `HttpClient` instances themselves (which would cause DNS staleness issues). Instead, it pools the underlying `HttpMessageHandler` and TCP connections. When you request a client, it hands you a new lightweight `HttpClient` wrapper hooked up to an existing, pooled, and highly optimized TCP connection, completely solving socket exhaustion.

---

## Scenario — Question 3

**Q3: Your SPA is hosted on `https://myfrontend.com`, but your ASP.NET Core API is hosted on `https://api.mybackend.com`. When the SPA tries to call the API, the browser blocks the request and throws a CORS error. A developer "fixes" this by adding `app.UseCors(builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader())`. Why is this extremely dangerous, and how do you properly configure CORS for production?**

CORS (Cross-Origin Resource Sharing) is a browser security feature designed to prevent malicious websites from making unauthorized API calls on behalf of the user.

**The Flaw:**
Using `.AllowAnyOrigin()` completely disables this protection. It tells the browser, "I am perfectly happy to accept API requests from literally any website on the internet." If a malicious site (`evilhacker.com`) tricks your user into visiting, their JavaScript can silently call `https://api.mybackend.com/users/delete` in the background. Because the user is already authenticated (via cookies), the browser will happily execute the request, leading to a catastrophic **Cross-Site Request Forgery (CSRF/XSRF)** or related vulnerability.

**The Solution:**
You must configure a strict CORS policy that only allows requests from your specific, trusted frontend domains.

**The Mechanism:**
In `Program.cs`, configure the CORS policy carefully:

```csharp
var trustedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("StrictPolicy", policy =>
    {
        policy.WithOrigins(trustedOrigins) // e.g., "https://myfrontend.com"
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials(); // REQUIRED if using Cookies for Auth, but forbidden if using AllowAnyOrigin!
    });
});

var app = builder.Build();

// Must be placed precisely here! AFTER Routing, BEFORE Auth!
app.UseRouting();
app.UseCors("StrictPolicy");
app.UseAuthentication();
app.UseAuthorization();
```

By explicitly whitelisting `https://myfrontend.com`, the browser will block the malicious request from `evilhacker.com` before it ever reaches your API controllers.

---

## Scenario — Question 4

**Q4: Your ASP.NET Core API handles file uploads. During a penetration test, the auditor uploads a 5GB file to the endpoint. The server immediately runs out of RAM and crashes, resulting in a Denial of Service (DoS) for all other users. How do you protect the ASP.NET Core application from this?**

This happens because, by default, ASP.NET Core attempts to buffer the incoming HTTP request body entirely into memory or disk before binding it to your Controller's parameters (like `IFormFile`).

**The Solution:**
You must implement strict Request Size Limits and, for large files, use Streaming.

1. **Request Size Limits (Kestrel):**
   By default, Kestrel restricts the maximum request body size to ~30MB. If the attacker bypassed this, it means a developer explicitly removed the limit or misconfigured IIS/NGINX. Ensure the limit is enforced globally, or restrict it via attributes on specific endpoints:
   ```csharp
   [HttpPost]
   [RequestSizeLimit(10_000_000)] // Limit this specific endpoint to 10MB
   public IActionResult Upload(IFormFile file) { ... }
   ```

2. **Disable Buffering (Streaming):**
   If you legitimately need to accept 5GB files (e.g., video uploads), you cannot use `IFormFile`, because `IFormFile` buffers. You must stream the file directly from the network socket to the destination (like Azure Blob Storage or disk) without loading it into RAM.
   - You apply the `[DisableFormValueModelBinding]` attribute.
   - You read the multipart boundary directly from `Request.Body` using `MultipartReader`.
   - You copy the stream asynchronously: `await section.Body.CopyToAsync(fileStream)`. 
   
This allows the server to process a 5GB file using only a few kilobytes of RAM, completely mitigating the DoS attack.
