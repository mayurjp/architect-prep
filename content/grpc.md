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
