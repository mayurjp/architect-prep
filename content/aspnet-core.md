# ASP.NET Core — Q&A

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

---

## Beginner — Question 2

**Q2: How does configuration work in ASP.NET Core (`appsettings.json`, environment variables, `IConfiguration`)?**

ASP.NET Core reads configuration from multiple sources and merges them into a single unified `IConfiguration` object, rather than relying on one hardcoded file.

**The Mechanism (layered providers, applied in order — later wins):**
1. `appsettings.json`
2. `appsettings.{Environment}.json` (e.g., `appsettings.Development.json`) — overrides the base file for that environment
3. Environment variables
4. Command-line arguments

```json
// appsettings.json
{
  "ConnectionStrings": { "Default": "Server=prod-db;..." },
  "Logging": { "LogLevel": { "Default": "Information" } }
}
```

```csharp
var builder = WebApplication.CreateBuilder(args);
string? conn = builder.Configuration.GetConnectionString("Default");
string? logLevel = builder.Configuration["Logging:LogLevel:Default"]; // colon = nested key
```

**Common Pitfall:** committing real secrets (connection strings, API keys) into `appsettings.json` and pushing it to source control. The correct pattern is to keep placeholder/non-sensitive defaults in the checked-in file and override the real values via environment variables or a secret store (`dotnet user-secrets` locally, Azure Key Vault / AWS Secrets Manager in production) — environment variables always win over the JSON file, precisely so production secrets never need to touch the repo.

#### Follow-up: How does `appsettings.Development.json` get selected automatically?
Via the `ASPNETCORE_ENVIRONMENT` environment variable (or `DOTNET_ENVIRONMENT`). `CreateBuilder` reads it at startup and loads `appsettings.{ASPNETCORE_ENVIRONMENT}.json` on top of the base file automatically — no code required.

---

## Intermediate — Question 3

**Q3: What is the Options pattern (`IOptions<T>`, `IOptionsSnapshot<T>`, `IOptionsMonitor<T>`), and why not just inject `IConfiguration` directly?**

The Options pattern binds a section of configuration into a strongly-typed C# class, instead of scattering `configuration["Some:Nested:Key"]` string lookups (with no compile-time safety) throughout the codebase.

```csharp
public class SmtpSettings {
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
}

// Program.cs
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("Smtp"));

// Consuming class
public class EmailService {
    private readonly SmtpSettings _settings;
    public EmailService(IOptions<SmtpSettings> options) => _settings = options.Value;
}
```

**The three flavors, and when each applies:**
- **`IOptions<T>`** — resolved once, cached for the app's lifetime (registered as a Singleton internally). Doesn't pick up config changes after startup. Use for settings that genuinely never change while running.
- **`IOptionsSnapshot<T>`** — recomputed **per Scoped lifetime** (per HTTP request), reflecting the latest values from reloadable config sources (like a `appsettings.json` with `reloadOnChange: true`). Use for settings that might change and you want the current value per-request.
- **`IOptionsMonitor<T>`** — a Singleton-safe option that gives you the *current* value on demand (`.CurrentValue`) plus a `.OnChange()` callback, usable even from Singleton services (where `IOptionsSnapshot` can't be injected due to lifetime mismatch).

**Common Pitfall:** injecting `IOptionsSnapshot<T>` into a Singleton service — this throws at startup, because a Scoped-lifetime service can't be captured by a Singleton (a captive dependency). Singletons that need live-reloading config must use `IOptionsMonitor<T>` instead.

---

## Advanced — Question 2

**Q2: What is the difference between the old `Startup.cs` hosting model and the modern `WebApplicationBuilder`/minimal hosting model?**

Both ultimately configure the same two things — the DI container (services) and the middleware pipeline — but the modern model (default since .NET 6) collapses what used to be two classes and two methods into one linear `Program.cs` file.

**The old model (`Startup.cs`, .NET Core 3.1 / 5):**
```csharp
// Program.cs
public class Program {
    public static void Main(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .ConfigureWebHostDefaults(webBuilder => webBuilder.UseStartup<Startup>())
            .Build().Run();
}

// Startup.cs
public class Startup {
    public void ConfigureServices(IServiceCollection services) {
        services.AddControllers(); // DI registration
    }
    public void Configure(IApplicationBuilder app, IWebHostEnvironment env) {
        app.UseRouting();          // middleware pipeline
        app.UseEndpoints(endpoints => endpoints.MapControllers());
    }
}
```

**The modern model (`WebApplicationBuilder`, .NET 6+):**
```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();   // same DI registration, no separate class

var app = builder.Build();
app.UseRouting();                    // same middleware pipeline, same file
app.MapControllers();

app.Run();
```

**What actually changed:**
- `ConfigureServices` and `Configure` are gone as separate lifecycle methods — everything happens linearly, top to bottom, in `Program.cs`. This isn't just cosmetic: it removes the split-brain of "where do I register vs. configure this," which used to trip up newcomers constantly.
- Top-level statements (C# 9+) let `Program.cs` skip the `class Program { static void Main() }` boilerplate entirely.
- `WebApplication` implements both `IApplicationBuilder` (pipeline) and `IEndpointRouteBuilder` (routing) — one object does what used to require `IApplicationBuilder` + `IWebHostEnvironment` + `IEndpointRouteBuilder` passed around separately.

**Common Pitfall:** assuming the old `Startup.cs` model is deprecated/broken — it's still fully supported (`.UseStartup<Startup>()` still works in .NET 6+) for large existing codebases that don't want a risky rewrite; it's just no longer the default template for new projects.

---

## Beginner — Question 3

**Q3: What is the difference between `app.Run()`, `app.Use()`, and `app.Map()` when building the middleware pipeline?**

All three add something to the request pipeline, but they differ in whether they can call the next component and whether they branch based on the request path.

**`app.Run()` — a terminal middleware, never calls anything after it:**
```csharp
app.Run(async context =>
{
    await context.Response.WriteAsync("Hello, World!");
    // there is no "next" -- this is always the END of the pipeline for any request that reaches it
});
```

**`app.Use()` — can inspect/modify the request, then optionally continue the pipeline:**
```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("Before");
    await next(context); // continues to the next middleware
    Console.WriteLine("After");
});
```

**`app.Map()` — branches the pipeline entirely based on a path prefix:**
```csharp
app.Map("/admin", adminApp =>
{
    adminApp.Run(async context => await context.Response.WriteAsync("Admin area"));
});
// Requests to "/admin/*" go down this separate branch; everything else continues in the main pipeline
```
`Map` creates a genuinely separate sub-pipeline for matching requests — middleware registered inside the `Map` branch only runs for requests under that path, letting you compose entirely different middleware stacks for different sections of an application (e.g., a lightweight branch for health checks versus the full authentication/authorization stack for the rest of the app).

**Common Pitfall:** placing `app.Run()` before other middleware that was meant to run for all requests — since `Run()` never calls `next()`, any middleware registered *after* it in the pipeline is simply unreachable dead code for every request, a subtle bug that's easy to introduce when reordering a `Program.cs` file.

---

## Intermediate — Question 4

**Q4: What is the `IStartupFilter` interface, and when do you need it instead of just adding middleware directly in `Program.cs`?**

`IStartupFilter` lets a library or a modular piece of infrastructure inject middleware into the pipeline **without the application's `Program.cs` needing to explicitly call it** — useful when you're building a reusable component (a NuGet package, a shared internal library) that needs to guarantee its middleware runs at a specific point in the pipeline, regardless of what the consuming application's `Program.cs` does or doesn't do.

**The Mechanism:**
```csharp
public class RequestLoggingStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<RequestLoggingMiddleware>(); // inject BEFORE the app's own pipeline
            next(app); // then let the application's own Program.cs pipeline run
        };
    }
}

// Registered by a library, typically inside its own AddXyz() extension method:
public static IServiceCollection AddRequestLogging(this IServiceCollection services)
{
    services.AddTransient<IStartupFilter, RequestLoggingStartupFilter>();
    return services;
}
```
When an application calls `builder.Services.AddRequestLogging()`, the logging middleware gets wired into the pipeline automatically — the application's own `Program.cs` never has to remember to call `app.UseMiddleware<RequestLoggingMiddleware>()` itself, and multiple registered `IStartupFilter`s compose together correctly regardless of registration order nuances that manual `app.Use()` calls would require getting right by hand.

**When you actually need this versus just adding middleware directly:** if you're building the application itself, just call `app.UseMiddleware<T>()` directly in `Program.cs` — it's simpler and more explicit. `IStartupFilter` earns its complexity specifically when you're authoring a **reusable library** that needs to guarantee its middleware is present in the pipeline of *any* application that references it, without depending on that application's author remembering to wire it up manually.

**Common Pitfall:** reaching for `IStartupFilter` inside application code (not a shared library) to "make pipeline setup more modular" — for a single application, this indirection makes the actual middleware order harder to see at a glance in `Program.cs`, trading clarity for a flexibility benefit that only really pays off when multiple independent consumers need the same guarantee.

---

## Advanced — Question 3

**Q3: What is the ASP.NET Core `IHttpClientFactory`'s "typed client" pattern, and how does it differ from a "named client"?**

Both are ways of configuring `HttpClient` instances through `IHttpClientFactory` (avoiding the socket-exhaustion problem of manually `new HttpClient()`-ing), but they differ in how strongly the configuration is tied to a specific consumer.

**Named client — configuration keyed by a string:**
```csharp
builder.Services.AddHttpClient("GitHubApi", client =>
{
    client.BaseAddress = new Uri("https://api.github.com");
    client.DefaultRequestHeaders.Add("Accept", "application/vnd.github.v3+json");
});

// Consumed via IHttpClientFactory directly, by matching the string name
public class GitHubService
{
    private readonly HttpClient _client;
    public GitHubService(IHttpClientFactory factory) => _client = factory.CreateClient("GitHubApi");
}
```
The string `"GitHubApi"` is the only link between the configuration and where it's used — a typo in the string at the call site compiles fine and fails only at runtime.

**Typed client — configuration bound directly to a specific class:**
```csharp
public class GitHubApiClient
{
    private readonly HttpClient _client;
    public GitHubApiClient(HttpClient client) => _client = client; // HttpClient injected directly

    public Task<Repo> GetRepoAsync(string name) => _client.GetFromJsonAsync<Repo>($"/repos/{name}");
}

builder.Services.AddHttpClient<GitHubApiClient>(client =>
{
    client.BaseAddress = new Uri("https://api.github.com");
});

// Consumed via ordinary constructor injection -- no string lookup, no factory call at the call site
public class SomeController(GitHubApiClient gitHub) { ... }
```
The configuration is directly associated with the `GitHubApiClient` type itself — there's no string to typo, and the compiler enforces that anyone wanting this specific configured client requests the `GitHubApiClient` type via DI, exactly like any other injected dependency.

**Why typed clients are generally preferred:** they read like ordinary dependency injection (no magic strings), the HTTP-specific logic (building request URLs, parsing responses) is naturally encapsulated inside the typed client class rather than scattered at every call site that resolves a named `HttpClient`, and refactoring/renaming is compiler-checked instead of relying on string matches.

**Common Pitfall:** using named clients purely out of habit from older tutorials when there's a clear 1:1 owning class for that HTTP configuration — typed clients cost nothing extra to set up and remove an entire class of stringly-typed runtime bugs that named clients are exposed to.

---

## Beginner — Question 4

**Q4: What is the difference between `WebApplication.CreateBuilder()` and `WebApplication.CreateSlimBuilder()`, and when would you choose the latter?**

Both create the foundational builder for a minimal-hosting-model ASP.NET Core app, but `CreateSlimBuilder()` deliberately omits several default features `CreateBuilder()` includes automatically, trading built-in convenience for a smaller startup footprint and reduced memory usage.

**`CreateBuilder()` — full-featured defaults, suitable for most typical web APIs:**
```csharp
var builder = WebApplication.CreateBuilder(args);
// Automatically configures: Kestrel, IIS integration, logging providers (Console, Debug, EventSource),
// configuration sources (appsettings.json, environment variables, command line), and more
```

**`CreateSlimBuilder()` — minimal defaults, opt into only what you actually need:**
```csharp
var builder = WebApplication.CreateSlimBuilder(args);
// Starts with a MUCH smaller default feature set -- no IIS integration setup,
// fewer default logging providers, reduced reflection-based configuration --
// specifically designed to pair well with Native AOT publishing
```

**Why this distinction exists at all:** `CreateSlimBuilder()` was introduced specifically to support scenarios prioritizing minimal startup time and memory footprint — small microservices, serverless functions, or Native AOT-published applications (covered earlier) — where every unused default feature adds measurable startup latency and binary size that a lean, high-density deployment doesn't want to pay for.

**Common Pitfall:** reaching for `CreateSlimBuilder()` by default for a typical, full-featured web application "because smaller sounds better," then having to manually re-add several features (that `CreateBuilder()` would have configured automatically) one at a time — `CreateSlimBuilder()` earns its place specifically for size/startup-sensitive deployments, not as a universal default replacement for `CreateBuilder()`.

---

## Intermediate — Question 5

**Q5: What is the `IOptionsMonitor<T>.OnChange()` callback, and how does it let a Singleton service react to configuration changes without restarting the application?**

Covered earlier, `IOptionsMonitor<T>` gives Singleton-safe access to the *current* configuration value — its `OnChange()` method goes further, letting code run a callback exactly when the underlying configuration source (a reloadable `appsettings.json`, or another provider marked `reloadOnChange: true`) actually changes, without polling or restarting anything.

**Registering a reaction to configuration changes:**
```csharp
public class FeatureFlagService
{
    private FeatureFlags _current;

    public FeatureFlagService(IOptionsMonitor<FeatureFlags> monitor)
    {
        _current = monitor.CurrentValue;
        monitor.OnChange(updated =>
        {
            _current = updated; // runs automatically whenever the underlying config file changes
            Console.WriteLine("Feature flags reloaded without an app restart.");
        });
    }
}
```
If `appsettings.json`'s `FeatureFlags` section is edited on disk while the application is running (and the configuration source was registered with `reloadOnChange: true`), this callback fires automatically — the Singleton service picks up the new value immediately, with no deployment or restart required.

**Why this matters for operational agility:** toggling a feature flag, adjusting a rate limit, or tuning a timeout value becomes a simple file edit (or a change pushed to a centralized config source like Azure App Configuration) that takes effect within moments, rather than requiring a full build-test-deploy cycle just to flip one setting — genuinely useful for values that legitimately need occasional runtime tuning without a release.

**Common Pitfall:** registering multiple `OnChange()` callbacks across different parts of the application that each independently reload and cache their own copy of the same configuration section — without care, different parts of the application can end up observing the *new* value at slightly different, uncoordinated moments (since each callback fires independently), leading to brief windows of inconsistent behavior across the application immediately after a config change; for values needing atomic, coordinated updates, a single centralized owner reacting to the change (and notifying dependents itself) is safer than many independent `OnChange()` subscribers.

---

## Advanced — Question 4

**Q4: What is `IHttpContextAccessor`'s reliance on `AsyncLocal<T>`, and why does that make it subtly dangerous to cache or capture in a field for later use?**

`IHttpContextAccessor` (covered earlier for extracting user claims inside a service) works by reading from an `AsyncLocal<HttpContext>` value that ASP.NET Core's request pipeline sets at the start of each request — this mechanism flows correctly across `await` boundaries within one request, but capturing the resulting `HttpContext` for use *outside* that request's lifetime is a common and dangerous mistake.

**The mechanism, briefly:** `AsyncLocal<T>` is like a `ThreadStatic` value, except it correctly follows the *logical* flow of execution across `await` continuations (which might resume on a completely different physical thread) rather than being tied to one specific OS thread — this is precisely what lets `IHttpContextAccessor.HttpContext` return the *correct* request's context even after the code has hopped across several different thread-pool threads during `await`s.

**The danger — capturing `HttpContext` for use after the request ends:**
```csharp
public class OrderService
{
    private readonly IHttpContextAccessor _accessor;
    private HttpContext? _capturedContext; // DANGER

    public void StartBackgroundWork()
    {
        _capturedContext = _accessor.HttpContext; // captured a reference to THIS request's context

        _ = Task.Run(async () =>
        {
            await Task.Delay(5000); // by now, the ORIGINAL HTTP request has already completed and returned!
            var user = _capturedContext.User; // HttpContext may already be recycled/disposed by the framework
        });
    }
}
```
ASP.NET Core pools and recycles `HttpContext` objects aggressively for performance — once the original request completes, the framework considers that `HttpContext` free to reuse (or dispose) for a subsequent, entirely unrelated request. Code that captured a reference to it and uses it later risks reading stale, disposed, or (worse) a *different* request's data entirely, since the same object might now represent someone else's request.

**The correct pattern — extract only the specific values you need immediately, don't hold onto the whole `HttpContext`:**
```csharp
public void StartBackgroundWork()
{
    var userId = _accessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value; // extract NOW
    _ = Task.Run(async () =>
    {
        await Task.Delay(5000);
        await ProcessForUser(userId); // uses the extracted VALUE, never the HttpContext itself
    });
}
```

**Common Pitfall:** injecting `IHttpContextAccessor` into a class with a lifetime longer than a single request (a Singleton, or a background service) and treating its `.HttpContext` property as something safe to read at any arbitrary later point — outside the scope of the original request that set it, `.HttpContext` may return `null` entirely (there's no "current" request in a background thread's `AsyncLocal` flow) or, worse, a recycled context belonging to a different request.

---
