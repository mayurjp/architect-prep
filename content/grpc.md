# gRPC & Protobuf — Q&A

## Beginner — Question 1

**Q1: What is gRPC and when should you choose it over REST?**

gRPC (gRPC Remote Procedure Calls) is an open-source, high-performance RPC framework developed by Google. Unlike REST, which focuses on manipulating resources via standard HTTP verbs, gRPC focuses on executing functions (procedures) on a remote server as if they were local functions.

**The Mechanism:**
- **Protocol:** It strictly requires **HTTP/2**. This provides multiplexing (sending multiple requests concurrently over a single TCP connection), header compression, and bi-directional streaming.
- **Serialization:** Instead of human-readable JSON, it uses **Protocol Buffers (Protobuf)**, a strongly-typed, binary serialization format.

**When to choose gRPC over REST:**
1. **Microservice-to-Microservice communication:** Because it uses a binary format and HTTP/2, gRPC is exceptionally fast and uses far less CPU and bandwidth than parsing JSON over HTTP/1.1. It is the gold standard for internal backend communication.
2. **Polyglot environments:** You define your API contract in a `.proto` file. The gRPC tooling automatically generates the strongly-typed client and server code for almost any language (C#, Java, Go, Python).
3. **Streaming:** If you need real-time, bi-directional streaming (like a chat app or live financial ticker), gRPC supports it natively, whereas REST is strictly request/response.

**When to avoid it:**
Browser support. Browsers do not directly support HTTP/2 trailing headers, which gRPC relies on. While technologies like gRPC-Web exist as a bridge, REST/JSON remains the absolute standard for public-facing APIs consumed by web browsers or third-party developers.

---

## Intermediate — Question 1

**Q1: Explain Protocol Buffers (.proto files) and why they are faster than JSON.**

Protocol Buffers (Protobuf) is Google's language-neutral, platform-neutral, extensible mechanism for serializing structured data.

**The Mechanism:**
You define your data structures and RPC services in a `.proto` text file:
```protobuf
syntax = "proto3";

message UserRequest {
  int32 id = 1;
}

message UserResponse {
  string name = 1;
  string email = 2;
}

service UserService {
  rpc GetUser (UserRequest) returns (UserResponse);
}
```

**Why it's faster than JSON:**
1. **Binary format:** Protobuf serializes data into a compact binary stream, not text.
2. **No field names in the payload:** In JSON, a payload looks like `{"name": "Alice", "email": "alice@test.com"}`. You are transmitting the strings "name" and "email" every single time. In Protobuf, the payload only contains the *values* and a small integer tag (e.g., `1` for name, `2` for email). The generated client and server code already know that tag `1` maps to the `name` property. This drastically reduces payload size.
3. **Parsing speed:** Deserializing JSON requires a CPU-intensive string parsing engine to read brackets, quotes, and commas. Deserializing Protobuf is incredibly fast because it's just reading precise byte offsets.

**Common Pitfalls:**
Backward compatibility. Because Protobuf relies on the integer tags (1, 2) rather than names, you must **never** change the tag number of an existing field. If you delete a field, you must reserve its tag number so no future developer accidentally reuses it, which would cause older clients to misinterpret the new data.

---

## Scenario — Question 1

**Q1: You are building an internal microservice architecture in .NET. Service A needs to fetch product details from Service B, but occasionally needs to stream thousands of price updates back to Service A in real-time. How does gRPC handle this compared to REST?**

This scenario requires both unary (single request/response) and streaming capabilities, which gRPC handles natively and elegantly compared to REST.

**The REST approach:**
You would build a standard HTTP `GET` endpoint for the product details. For the real-time price updates, you would have to implement a completely separate protocol, such as WebSockets (SignalR) or Server-Sent Events (SSE). You now have to manage two different connection types, serialization formats, and error handling mechanisms.

**The gRPC approach:**
You define both capabilities in the exact same `.proto` contract using the `stream` keyword.

```protobuf
service ProductService {
  // Unary (Like a standard GET)
  rpc GetProduct (ProductRequest) returns (ProductResponse);
  
  // Server Streaming (Server sends multiple updates over one connection)
  rpc StreamPrices (PriceRequest) returns (stream PriceUpdate);
}
```

**The Mechanism:**
Because gRPC runs on HTTP/2, both the unary call and the streaming call can happen over the exact same multiplexed TCP connection.
When Service A calls `StreamPrices`, Service B can execute an `await foreach` loop, yielding price updates. The gRPC framework serializes them to Protobuf and streams them across the wire instantly. Service A receives them using an `await foreach` loop. It provides a cohesive, strongly-typed, high-performance solution without needing additional technologies like WebSockets.

---

## Scenario — Question 2

**Q2: You have a gRPC microservice that creates user accounts. The client needs to know if the creation failed due to a validation error (e.g., "Email already exists"). In a REST API, you would return a `400 Bad Request` with a JSON body detailing the error. How do you communicate this rich error information in gRPC, since it always returns HTTP/2 200 OK for a successful network call?**

gRPC handles application-level errors completely differently than REST. It uses the `gRPC-Status` trailer header, not HTTP status codes.

**The Mechanism:**
If an error occurs, the gRPC server throws an `RpcException` with a specific status code (e.g., `StatusCode.InvalidArgument` or `StatusCode.AlreadyExists`).

**Rich Error Payloads:**
If you need to send complex validation data back (like a list of invalid fields), you cannot just throw a simple exception. You must use the **gRPC Rich Error Model**.

1. In your `.proto` file, you define a specific message for your error details, or use Google's standard `google.rpc.BadRequest`.
2. On the server, you serialize this rich error object into the metadata (trailers) of the `RpcException`.
3. On the client, you catch the `RpcException`, extract the metadata trailers, deserialize the Protobuf payload back into the rich error object, and read the validation details.

This allows gRPC to maintain its strict, strongly-typed binary contract even when transmitting complex error states.

---

## Scenario — Question 3

**Q3: You want to expose your internal gRPC microservice to a legacy frontend web application that only understands REST and JSON. You do not want to maintain two completely separate API controllers (one for gRPC and one for MVC Web API) that do the exact same thing. How do you solve this?**

You solve this using **gRPC-Gateway** (or in .NET, **gRPC JSON Transcoding**).

**The Concept:**
gRPC JSON Transcoding is an extension that automatically maps RESTful HTTP APIs to gRPC methods. It acts as an in-process reverse proxy.

**The Mechanism:**
1. **Annotate the `.proto` file:** You use Google API HTTP annotations to define how the REST request maps to the gRPC request.
```protobuf
import "google/api/annotations.proto";

service UserService {
  rpc GetUser (UserRequest) returns (UserResponse) {
    option (google.api.http) = {
      get: "/v1/users/{id}" // Maps the HTTP GET to this RPC
    };
  }
}
```
2. **Enable Transcoding:** In ASP.NET Core, you add the `Microsoft.AspNetCore.Grpc.JsonTranscoding` NuGet package and call `builder.Services.AddGrpc().AddJsonTranscoding()`.
3. **The Result:** The ASP.NET Core server now listens for *both* HTTP/2 gRPC requests *and* standard HTTP/1.1 JSON requests on the same port. 
   - When a JSON request arrives at `/v1/users/5`, the transcoder intercepts it, deserializes the JSON to Protobuf, calls the gRPC method, takes the Protobuf response, serializes it to JSON, and returns a standard `200 OK` HTTP response.

You maintain a single codebase (the gRPC service) while supporting both modern microservices and legacy web clients simultaneously.

---

## Scenario — Question 4

**Q4: A developer notices that a gRPC microservice call takes 500ms to complete. They implement client-side retries using Polly, retrying up to 3 times if it fails. The server processes the request, but the network drops the response. The client retries 3 times, causing the server to process the heavy request 4 times in total. How do you prevent this using native gRPC features?**

This is a problem of blind retries without idempotency or deadline propagation. While client-side retries (like Polly) are good, gRPC offers a powerful built-in mechanism called **Deadlines**.

**The Flaw:**
The server doesn't know the client gave up or retried. It continues processing the heavy task, wasting CPU, even though the original client connection dropped.

**The Solution: gRPC Deadlines and Cancellation Tokens**

1. **Client-Side Deadline:** The client must attach a strict deadline to the RPC call:
   ```csharp
   var response = await client.ProcessDataAsync(request, deadline: DateTime.UtcNow.AddSeconds(1));
   ```
2. **Deadline Propagation:** Because gRPC uses HTTP/2, this deadline is transmitted to the server in the headers (`grpc-timeout`).
3. **Server-Side Cancellation:** In ASP.NET Core gRPC, this deadline is automatically bound to the `ServerCallContext.CancellationToken`. 
   The server developer MUST pass this token to all database or heavy asynchronous calls:
   ```csharp
   public override async Task<Response> ProcessData(Request req, ServerCallContext context) {
       await _db.HeavyWorkAsync(context.CancellationToken); // Crucial!
       return new Response();
   }
   ```

**Result:**
If the client's 1-second deadline expires (or the network drops and the client cancels), the HTTP/2 connection immediately signals cancellation to the server. The `CancellationToken` triggers, instantly aborting the database query and freeing the server's CPU, preventing resource exhaustion during retry storms.

---

## Beginner — Question 2

**Q2: What is bi-directional streaming in gRPC, and what's a real use case for it?**

gRPC supports four call types — unary (single request/response, like a normal API call), server streaming, client streaming, and **bi-directional streaming**, where both the client and server send a continuous stream of messages to each other over the *same* long-lived connection, independently and in either order.

**Defining it in the `.proto` contract:**
```protobuf
service ChatService {
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
  //         ^ client streams in           ^ server streams out, simultaneously
}
```

**Using it in .NET:**
```csharp
// Server implementation
public override async Task Chat(
    IAsyncStreamReader<ChatMessage> requestStream,
    IServerStreamWriter<ChatMessage> responseStream,
    ServerCallContext context)
{
    await foreach (var incoming in requestStream.ReadAllAsync())
    {
        var reply = new ChatMessage { Text = $"Echo: {incoming.Text}" };
        await responseStream.WriteAsync(reply); // can write back at any time, independent of reading
    }
}

// Client
using var call = client.Chat();
_ = Task.Run(async () => {
    await foreach (var reply in call.ResponseStream.ReadAllAsync())
        Console.WriteLine($"Received: {reply.Text}");
});
await call.RequestStream.WriteAsync(new ChatMessage { Text = "Hello" });
```
Both sides read and write on independent tasks over the same connection — neither has to wait for the other to finish sending before it can start receiving, which is what "bi-directional" actually means here (as opposed to a simple request-then-response exchange, even a streamed one).

**Real use cases:** a live chat application (messages flow both directions continuously), real-time collaborative editing (each participant's edits stream to the server while the server streams other participants' edits back), or a live multiplayer game state sync — anything where both parties need to push updates to each other on an ongoing basis, not just one side asking and the other answering once.

**Common Pitfall:** reaching for bi-directional streaming when server streaming alone would do — if the client only ever sends *one* initial request and then just listens for a stream of updates (e.g., "subscribe to price changes for this stock"), that's server streaming, not bi-directional; adding the complexity of a full duplex stream when the client never actually needs to send more than once adds real complexity (managing two independent read/write loops) for no benefit.

---

## Intermediate — Question 2

**Q2: What challenges does gRPC's use of long-lived HTTP/2 connections create for client-side load balancing, and how do you solve them?**

Traditional HTTP/1.1 load balancing works well because each request is typically its own short-lived connection — a load balancer can distribute *requests* round-robin across backend instances easily. gRPC's HTTP/2 connections are long-lived and multiplexed (many RPCs share one TCP connection), which breaks that assumption.

**The problem:**
```text
Client opens ONE long-lived HTTP/2 connection to Server Instance A
      │
      ├─ RPC call 1 ──┐
      ├─ RPC call 2 ──┼─► ALL multiplexed over the SAME connection to Instance A
      ├─ RPC call 3 ──┘
      │
A traditional L4 (connection-level) load balancer only balances at CONNECTION
setup time -- once connected, every RPC for the lifetime of that connection
goes to the SAME backend instance, even if 9 other instances sit idle
```
If a client opens one connection and keeps it alive for hours, a connection-level load balancer effectively pins that client to one backend server for the connection's entire lifetime — new server instances added to the pool (e.g., during a scale-out event) get zero traffic from already-connected clients.

**Solution 1 — client-side load balancing (the client itself picks a server per-call):**
```csharp
var channel = GrpcChannel.ForAddress("dns:///order-service", new GrpcChannelOptions
{
    ServiceConfig = new ServiceConfig
    {
        LoadBalancingConfigs = { new RoundRobinConfig() }
    }
});
```
The client resolves multiple backend addresses (via DNS or a service registry) and distributes RPCs across them itself, rather than relying on a single connection to a single backend — this requires the client library to support this (gRPC's official client libraries do), and it requires the client to know about all available backend instances.

**Solution 2 — an L7 (application-layer) proxy that understands HTTP/2 streams, not just connections:**
```text
Client ──(one HTTP/2 connection)──► Envoy/Linkerd proxy ──► balances individual
                                                              STREAMS (not just
                                                              connections) across
                                                              many backend instances
```
A proper Layer 7 proxy (Envoy is the standard choice, and what's typically bundled inside a service mesh) understands gRPC's HTTP/2 framing well enough to load-balance individual RPC streams within a single client connection across multiple backend connections — solving the problem without requiring load-balancing logic in every client.

**Common Pitfall:** putting a plain Layer 4 (TCP-level) load balancer in front of a gRPC service and assuming it "just works" the way it would for a stateless REST API — because gRPC connections are long-lived, an L4 balancer's per-connection distribution means traffic can become extremely unevenly distributed across backend instances over time, especially after a deployment when new pods should be receiving a fair share of traffic but aren't, since existing clients' connections were already established to the old pods.

---

## Advanced — Question 1

**Q1: What are gRPC Interceptors, and how do you use them for cross-cutting concerns like logging and authentication?**

An Interceptor is gRPC's equivalent of ASP.NET Core middleware — code that runs around every RPC call, letting you handle logging, authentication, metrics, or error translation in one centralized place instead of duplicating that logic inside every single service method.

**A server-side interceptor (logging every call's duration):**
```csharp
public class LoggingInterceptor : Interceptor
{
    private readonly ILogger<LoggingInterceptor> _logger;
    public LoggingInterceptor(ILogger<LoggingInterceptor> logger) => _logger = logger;

    public override async Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request, ServerCallContext context,
        UnaryServerMethod<TRequest, TResponse> continuation)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            return await continuation(request, context); // calls the actual RPC method
        }
        finally
        {
            _logger.LogInformation("{Method} took {Elapsed}ms", context.Method, sw.ElapsedMilliseconds);
        }
    }
}

// Program.cs
builder.Services.AddGrpc(options => options.Interceptors.Add<LoggingInterceptor>());
```
Every single RPC method in the service passes through this interceptor automatically — no service method needs its own `Stopwatch` or logging call, exactly the same value proposition as a piece of middleware wrapping every HTTP request.

**A client-side interceptor (attaching an auth token to every outgoing call):**
```csharp
public class AuthInterceptor : Interceptor
{
    public override TResponse BlockingUnaryCall<TRequest, TResponse>(
        TRequest request, ClientInterceptorContext<TRequest, TResponse> context,
        BlockingUnaryCallContinuation<TRequest, TResponse> continuation)
    {
        var headers = context.Options.Headers ?? new Metadata();
        headers.Add("Authorization", $"Bearer {_tokenProvider.GetToken()}");
        var newContext = new ClientInterceptorContext<TRequest, TResponse>(
            context.Method, context.Host, context.Options.WithHeaders(headers));
        return continuation(request, newContext);
    }
}
```
Every outgoing call through this channel automatically carries a fresh auth token, without every single client call site needing to remember to attach it.

**Common Pitfall:** putting business logic (not cross-cutting concerns) inside an interceptor — interceptors run for *every* method on the service, so anything method-specific (validation rules unique to one RPC, business rules that only apply to certain calls) belongs in the actual service method, not the interceptor; interceptors should stay limited to concerns that are genuinely uniform across all (or a well-defined subset of) calls.

---

## Advanced — Question 2

**Q2: How do you evolve a Protobuf schema safely over time without breaking existing clients or servers running an older version?**

Because Protobuf identifies fields by their **integer tag number**, not by name, schema evolution has specific, well-defined safe and unsafe changes — get this wrong and old and new versions of the same service silently misinterpret each other's data instead of failing loudly.

**Safe changes:**
```protobuf
message Order {
  int32 id = 1;
  string customer_name = 2;
  // Adding a NEW field with a NEW, never-before-used tag number is always safe
  string discount_code = 3;   // old clients simply ignore this field entirely
}
```
Old clients that don't know about `discount_code` simply skip the unrecognized tag when deserializing — Protobuf's wire format is explicitly designed to tolerate unknown fields gracefully, so adding fields never breaks anyone who hasn't been updated yet.

**Unsafe changes — reusing a tag number:**
```protobuf
message Order {
  int32 id = 1;
  string customer_name = 2;
  // string discount_code = 3;   -- field removed
  int32 loyalty_points = 3;      // DANGER: reusing tag 3 for a DIFFERENT field/type!
}
```
An old client that still has `discount_code = 3` in its compiled proto will try to interpret the new `loyalty_points` integer's bytes as a string, producing garbage data or an outright deserialization crash — the tag number, not the field name, is what's actually transmitted on the wire, so reusing it silently redefines what that number means to anyone still running old code.

**The correct way to remove a field — `reserved`:**
```protobuf
message Order {
  int32 id = 1;
  string customer_name = 2;
  reserved 3;              // tag 3 can NEVER be reused by a future field
  reserved "discount_code"; // the old field NAME is also blocked from reuse
  int32 loyalty_points = 4; // the new field gets a genuinely new tag
}
```
The `reserved` keyword makes the Protobuf compiler itself reject any future attempt to reuse that tag number or field name — turning "a developer might accidentally reuse tag 3 two years from now" into a compile-time error instead of a silent runtime data-corruption bug.

**Other safe/unsafe changes:** changing a field's *name* is safe (the wire format only cares about the tag number); changing a field's *type* to an incompatible one (e.g., `int32` to `string`) is unsafe for the same reason as tag reuse; adding a new value to an `enum` is generally safe as long as consumers handle unknown enum values gracefully rather than crashing on them.

**Common Pitfall:** deleting a field and its tag number without marking it `reserved`, assuming "nobody uses that old client version anymore" — in any system with independently-deployed services or long-lived client versions (mobile apps users haven't updated), that assumption is exactly the kind of thing that turns into a very confusing production incident months later when someone innocently reuses the tag number for something new.

---
