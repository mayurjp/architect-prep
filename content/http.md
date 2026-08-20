# HTTP & Protocols — Q&A

## Beginner — Question 1

**Q1: Explain HTTP verbs (GET, POST, PUT, PATCH, DELETE) and their idempotency.**

HTTP verbs (or methods) define the action the client wants to perform on a resource.

1. **GET:** Retrieves a representation of a resource. It is **safe** (does not modify data) and **idempotent** (calling it multiple times has the same effect).
2. **POST:** Creates a new resource. It is **not safe** and **not idempotent** (calling it 5 times creates 5 resources).
3. **PUT:** Replaces an entire resource with the provided payload. It is **not safe** (it modifies data), but it is **idempotent** (sending the same replacement payload 5 times leaves the resource in the exact same state as sending it once).
4. **PATCH:** Applies a partial update to a resource. It is **not safe** and, strictly speaking according to the RFC, **not idempotent** (e.g., a patch that says "increment stock by 1" called 5 times adds 5).
5. **DELETE:** Removes a resource. It is **not safe**, but it is **idempotent** (deleting a resource once makes it gone; deleting it again just means it's still gone, even if the server returns a 404 the second time).

---

## Beginner — Question 2

**Q2: What are the common HTTP status code categories (2xx, 3xx, 4xx, 5xx)?**

Status codes tell the client the result of their request.

- **2xx (Success):** The action was successfully received, understood, and accepted.
  - `200 OK`: Standard response for successful HTTP requests.
  - `201 Created`: The request succeeded, and a new resource was created (typically for POST).
  - `204 No Content`: The server processed the request, but there is no payload to return (often for DELETE or PUT).

- **3xx (Redirection):** The client must take additional action to complete the request.
  - `301 Moved Permanently`: The resource has a new URI.
  - `302 Found`: Temporary redirect.

- **4xx (Client Error):** The client sent a bad request.
  - `400 Bad Request`: The server cannot process the request due to malformed syntax or validation errors.
  - `401 Unauthorized`: Authentication is required and has failed or has not yet been provided.
  - `403 Forbidden`: The client is authenticated but does not have permission to access the resource.
  - `404 Not Found`: The requested resource could not be found.

- **5xx (Server Error):** The server failed to fulfill a valid request.
  - `500 Internal Server Error`: A generic catch-all for an unhandled server exception.
  - `503 Service Unavailable`: The server is currently unable to handle the request (e.g., overloaded or down for maintenance).

---

## Intermediate — Question 1

**Q1: What is CORS (Cross-Origin Resource Sharing) and why does the browser enforce it?**

CORS is an HTTP-header based mechanism that allows a server to indicate any origins (domain, scheme, or port) other than its own from which a browser should permit loading resources.

**The Mechanism:**
By default, web browsers enforce the **Same-Origin Policy (SOP)**. This is a critical security feature that prevents a malicious website (e.g., `evil.com`) from running JavaScript that makes background HTTP requests to a trusted site (e.g., `bank.com`) where you are currently logged in, and stealing your data.

If a frontend app hosted at `https://myapp.com` tries to call an API at `https://api.myapp.com` via JavaScript, the browser will block it because the domains are different (they are cross-origin).

**How CORS fixes this:**
1. **Preflight Request:** For state-changing methods (POST, PUT, DELETE) or requests with custom headers, the browser first sends an automatic HTTP `OPTIONS` request (the preflight) to the API.
2. **Server Response:** The API responds with headers like `Access-Control-Allow-Origin: https://myapp.com` and `Access-Control-Allow-Methods: GET, POST`.
3. **Execution:** The browser checks these headers. If `https://myapp.com` is in the allowed list, the browser proceeds to send the actual `POST` request. If not, the browser blocks the request and throws a CORS error in the console.

**Common Pitfalls:**
CORS is enforced entirely by the **Browser**, not the server. If you call the API using Postman, curl, or a backend C# service, CORS does not apply and the request will succeed.

---

## Advanced — Question 1

**Q1: How does TLS (Transport Layer Security) work to secure HTTP traffic?**

HTTP traffic is sent in plaintext. Anyone monitoring the network (like a public Wi-Fi router) can read passwords and session tokens. HTTPS uses TLS (the successor to SSL) to encrypt this traffic.

**The Mechanism (The TLS Handshake):**

1. **Client Hello:** The client connects to the server and sends supported cipher suites and a random byte string.
2. **Server Hello & Certificate:** The server responds with its chosen cipher suite, a random byte string, and its **Digital Certificate**.
3. **Authentication:** The client verifies the certificate against a list of trusted Certificate Authorities (CAs) pre-installed in the OS/Browser. This proves the server is who it claims to be.
4. **Key Exchange (Asymmetric to Symmetric):** 
   - The client encrypts a "pre-master secret" using the server's **Public Key** (found in the certificate).
   - Only the server can decrypt this secret using its **Private Key**.
   - Both the client and server use this pre-master secret (along with the random bytes from steps 1 and 2) to independently compute a **Symmetric Session Key**.
5. **Encrypted Communication:** The handshake is complete. All further HTTP traffic (GET, POST, headers, body) is now encrypted using the fast Symmetric Session Key.

**Why the switch from Asymmetric to Symmetric?**
Asymmetric encryption (Public/Private keys) is incredibly computationally expensive and slow. It is only used during the initial handshake to securely agree upon a shared password (the symmetric key). Symmetric encryption is extremely fast, making it suitable for encrypting large amounts of HTTP data.

---

## Scenario — Question 1

**Q1: You have a REST API endpoint `POST /api/payments` that charges a customer's credit card. Due to a flaky mobile network, the client's HTTP connection drops right after they click "Pay". The client doesn't know if the request reached the server, so their app automatically retries the `POST` request. The customer is charged twice. How do you design the HTTP API to prevent this?**

You must make the `POST` endpoint **idempotent**. By definition, `POST` is not idempotent, meaning the server treats every incoming `POST` request as a brand new action.

**The Solution: Idempotency Keys**
The client must generate a unique identifier for the intended action before sending the first request.

**The Mechanism:**
1. When the user taps "Pay", the mobile app generates a unique UUID (e.g., `req_987abc`).
2. The app sends the `POST` request and includes this UUID in a custom HTTP header: `Idempotency-Key: req_987abc`.
3. The server receives the request. Before doing any work, it checks a fast key-value store (like Redis or a database table) for the key `req_987abc`.
4. **Scenario A (First attempt):** The key doesn't exist. The server stores the key, processes the payment (charging the card), stores the resulting HTTP response (e.g., `200 OK, PaymentID: 555`) alongside the key, and returns it.
5. **Scenario B (The Retry):** Because the connection dropped, the mobile app retries the exact same request with the exact same `Idempotency-Key: req_987abc`. 
6. The server receives the retry. It checks the database and sees `req_987abc` already exists. It **does not** charge the card again. Instead, it immediately returns the cached HTTP response (`200 OK, PaymentID: 555`).

This guarantees that no matter how many times the client blindly retries the HTTP request due to network failures, the financial transaction only occurs exactly once.

---

## Scenario — Question 2

**Q2: You are building a public-facing API that allows clients to search a massive database of products. A user searches for "shoes" and the database returns 50,000 results. Returning all 50,000 results in a single HTTP response causes the server to run out of memory and the client's browser to freeze. How do you resolve this using standard HTTP concepts?**

You must implement **Pagination**. Returning unbounded result sets is a massive anti-pattern that leads to denial of service.

**The Architecture:**
There are two common ways to paginate via HTTP: Offset Pagination and Cursor Pagination.

1. **Offset Pagination (Skip/Take):**
   - The client sends query parameters indicating the page they want: `GET /api/products?search=shoes&page=2&pageSize=50`.
   - The API translates this into a database query (e.g., `OFFSET 50 LIMIT 50` in SQL).
   - The API should also return metadata, often in the HTTP response headers (like `X-Total-Count: 50000`) or wrapped in a JSON envelope, so the client knows how many pages exist.
   - *Pros:* Easy to implement, allows jumping to a specific page.
   - *Cons:* Terrible performance on deep pages (e.g., `OFFSET 40000` requires the database to scan and discard 40,000 rows). Vulnerable to missing/duplicate items if new records are inserted while the user is paging.

2. **Cursor Pagination (Keyset Pagination):**
   - Instead of asking for "page 2", the client asks for records *after* a specific anchor point.
   - Initial request: `GET /api/products?search=shoes&limit=50`.
   - The API returns 50 items. The last item has an ID of `987`. The API also returns a "next_cursor" pointing to that ID.
   - Next request: `GET /api/products?search=shoes&limit=50&after=987`.
   - The database executes `WHERE Id > 987 LIMIT 50`.
   - *Pros:* Extremely fast regardless of depth (uses database indexes efficiently). Immune to data shifting from new inserts.
   - *Cons:* You cannot jump directly to "Page 100". You can only go "next" or "previous". This is the standard for infinite-scroll UIs (like Twitter or Facebook).

---

## Scenario — Question 3

**Q3: You are designing an HTTP API for an IoT thermometer that reports the temperature every 10 seconds. The API endpoint receives a JSON payload like `{"temp": 72.5}` and updates the database. A junior developer argues that you should use `POST` because you are sending data to the server. You argue that `PUT` is the correct RESTful choice. Why is `PUT` better here?**

The decision between `POST` and `PUT` hinges on **Idempotency** and **Resource Identity**.

**The Flaw with POST:**
`POST` means "Create a new subordinate resource." If you `POST /api/thermometers/1/temperature`, it implies you are adding a new entry to a historical log of temperatures. If the network drops and the IoT device retries the request 3 times, `POST` would theoretically create 3 identical temperature entries.

**Why PUT is Correct:**
`PUT` means "Replace the resource at this exact URL with the provided payload." 
If your endpoint represents the *current* state of the thermometer (e.g., `PUT /api/thermometers/1/currentTemperature`), then applying `{"temp": 72.5}` means "make the current temperature 72.5". 
If the network drops and the IoT device retries the `PUT` request 3 times, the end result is exactly the same: the current temperature is 72.5. It is inherently **idempotent**, which perfectly aligns with the unreliable network connections typical of IoT devices.

---

## Beginner — Question 3

**Q3: What is the difference between HTTP/1.1, HTTP/2, and HTTP/3?**

Each version solves a specific performance limitation of its predecessor, while keeping the same request/response semantics (methods, status codes, headers) — a `GET` still means `GET` in all three.

**HTTP/1.1 — one request per connection at a time (per "slot"):**
```http
GET /style.css HTTP/1.1
Host: example.com
```
Browsers work around this by opening multiple parallel TCP connections (typically 6 per domain) to fetch several resources at once — a heavyweight workaround, not a language feature.

**HTTP/2 — multiplexing over a single TCP connection:**
Instead of one request per connection, HTTP/2 breaks messages into binary **frames** tagged with a stream ID, letting many requests and responses interleave over one connection simultaneously — no more juggling 6 parallel connections just to load a page fast. It also adds **header compression (HPACK)** and **server push** (mostly deprecated in practice).

**HTTP/3 — HTTP/2's semantics over QUIC instead of TCP:**
```text
HTTP/1.1 & HTTP/2:  Application -> TLS -> TCP -> IP
HTTP/3:             Application -> QUIC (TLS built-in) -> UDP -> IP
```
HTTP/2 still suffers from **TCP head-of-line blocking** — if one TCP packet is lost, *all* multiplexed streams on that connection stall waiting for retransmission, because TCP guarantees strict byte-order delivery. HTTP/3 replaces TCP with **QUIC** (built on UDP), where each stream's lost packets only block *that* stream — the others keep flowing.

**Common Pitfall:** assuming a server "supports HTTP/2" automatically means every request benefits — HTTP/2's multiplexing gains are most visible on pages with many small resources loaded concurrently; a single large file download sees little difference between versions.

---

## Intermediate — Question 2

**Q2: What are conditional requests, and how do `ETag` / `If-None-Match` reduce bandwidth?**

A conditional request lets the client tell the server "only send me the full response if the resource has actually changed since I last saw it" — turning a potentially large response into a tiny `304 Not Modified` when nothing changed.

**Step 1 — server returns a validator with the resource:**
```http
GET /api/products/5 HTTP/1.1
Host: example.com
```
```http
HTTP/1.1 200 OK
ETag: "a1b2c3d4"
Cache-Control: max-age=0, must-revalidate

{ "id": 5, "name": "Keyboard", "price": 29.99 }
```

**Step 2 — client re-validates instead of re-downloading:**
```http
GET /api/products/5 HTTP/1.1
Host: example.com
If-None-Match: "a1b2c3d4"
```
```http
HTTP/1.1 304 Not Modified
```
No body is transmitted at all — the client just keeps using its cached copy.

**Two validator styles:**
- **`ETag` / `If-None-Match`** — an opaque token (hash or version), the strongest and most precise validator; works even if content changes without the timestamp changing.
- **`Last-Modified` / `If-Modified-Since`** — a timestamp-based validator, simpler but only second-precision, so two changes within the same second can be missed.

**Common Pitfall:** confusing `Cache-Control: max-age` (skip contacting the server entirely, for N seconds) with conditional requests (always contact the server, but skip re-transferring the body if unchanged) — they solve different problems and are often used together: `max-age` avoids the round-trip short-term, `ETag` minimizes payload size for the round-trips that do happen.

---

## Advanced — Question 2

**Q2: What is the TCP three-way handshake, and why does every new HTTP/1.1 or HTTP/2 connection pay this cost upfront?**

Before any HTTP bytes can be exchanged, TCP (the transport HTTP/1.1 and HTTP/2 run on) must establish a reliable, ordered connection between client and server — this setup is the three-way handshake.

**The Mechanism:**
```text
Client                                  Server
  |------------ SYN (seq=x) ------------->|   1. Client requests a connection
  |<---- SYN-ACK (seq=y, ack=x+1) --------|   2. Server acknowledges + requests its own
  |------------ ACK (ack=y+1) ------------>|   3. Client acknowledges — connection open
  |                                        |
  |------------ HTTP GET request -------->|   (only now can HTTP data flow)
```
Each leg of this exchange costs at least one network round-trip (RTT). On a mobile connection with 100ms latency, that's already ~150ms spent before a single byte of the actual HTTP request goes out — and if the connection is HTTPS, the TLS handshake (another 1–2 RTTs) stacks on top of that.

**Why this matters for HTTP performance:**
- **Connection reuse (`Connection: keep-alive`, HTTP/1.1's default)** avoids paying this cost on every request by reusing one TCP connection for multiple HTTP requests sequentially.
- **HTTP/2 multiplexing** goes further — one handshake, then *many* concurrent requests share that same already-open connection.
- **HTTP/3 (QUIC over UDP)** removes the TCP handshake from the picture entirely, and even combines the transport and TLS handshakes into a single round-trip (or zero, for a resumed connection) — this is a major reason HTTP/3 improves page-load latency on high-latency mobile networks specifically.

**Common Pitfall:** benchmarking API latency by hitting an endpoint once and blaming "the API" for a slow first response, when a large chunk of that time was actually connection setup (TCP + TLS handshakes) rather than server processing — subsequent requests on a reused/pooled connection are typically dramatically faster for exactly this reason (this is also why `IHttpClientFactory`'s connection pooling matters so much on the .NET client side).

---

## Scenario — Question 4

**Q4: A mobile client reports that an API call "took 2 seconds," but your server-side logs show the request was processed in 40ms. How do you use HTTP headers to figure out where the other ~1.96 seconds went?**

When server-side processing time and client-observed time diverge this dramatically, the gap is almost always in the network/connection layer or an intermediary — and HTTP gives you headers specifically designed to pinpoint it, rather than guessing.

**Step 1 — check `Server-Timing` for a server-side breakdown:**
```http
HTTP/1.1 200 OK
Server-Timing: db;dur=12, cache;dur=1, app;dur=27
```
If your API emits this header (a standard, browser-devtools-visible way to report internal timing phases), you can immediately confirm the *server's own* 40ms breaks down as claimed — ruling out "the server is lying about its own processing time."

**Step 2 — check for a CDN/proxy layer adding latency:**
```http
HTTP/1.1 200 OK
Via: 1.1 varnish, 1.1 some-corporate-proxy
X-Cache: MISS
Age: 0
```
An `X-Cache: MISS` plus multiple hops in `Via` suggests the request had to travel through several intermediaries (each adding its own connection-setup and processing overhead) before ever reaching your app server — very different from a direct client-to-server path.

**Step 3 — suspect connection setup, not transfer, using client-side timing (e.g., browser DevTools' Network tab / `PerformanceResourceTiming` API):**
```text
DNS Lookup:      340ms   <- resolving the domain
Initial connection: 380ms   <- TCP handshake
TLS negotiation:  410ms   <- TLS handshake
Time to First Byte: 60ms    <- roughly matches your 40ms server time + a small hop
Content Download:  20ms
```
In a case like this, the ~1.96 seconds is almost entirely **connection setup** (DNS + TCP + TLS), not server processing or data transfer — a classic mobile-network symptom (poor cell signal, DNS resolver latency, cold connection with no keep-alive reuse), not an application bug.

**The fix, once diagnosed:** for connection-setup-dominated latency specifically, options include enabling **connection reuse/keep-alive** so subsequent requests skip the handshake, moving to **HTTP/2 or HTTP/3** to reduce the number of round-trips needed, or serving from a **CDN edge node** physically closer to the mobile client to cut DNS/TCP/TLS round-trip time. None of these are things you'd discover by only looking at server-side application logs — they require reading the HTTP-level timing signals end-to-end.

---

## Beginner — Question 4

**Q4: What is the difference between HTTP `Cookies` and the `Authorization` header for carrying authentication credentials, and how does the browser treat each differently?**

Both can carry an identity/session token on a request, but they differ fundamentally in *who* attaches them and *when* — a distinction with major implications for CSRF vulnerability and API design.

**Cookies — attached automatically by the browser, on every matching request:**
```http
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Strict
```
Once a server sets this cookie, the **browser itself** automatically includes `Cookie: session=abc123` on every subsequent request to that domain — including requests triggered by a form submission or `<img>` tag on a completely different, potentially malicious website. This automatic attachment is exactly why cookies are vulnerable to CSRF unless mitigated (anti-forgery tokens, `SameSite` attribute).

**`Authorization` header — must be explicitly attached by client code:**
```http
GET /api/orders
Authorization: Bearer eyJhbGci...
```
No browser mechanism attaches this automatically — JavaScript code must explicitly read a stored token and set this header on each request via `fetch`/`XMLHttpRequest`. A malicious third-party site's forged form submission has no way to make the victim's browser include an `Authorization` header it doesn't itself know the value of, since (unlike cookies) there's no ambient browser-managed storage that's leaked into every cross-origin request automatically.

**Why this distinction drives API design choices:** a browser-based SPA calling its own API can use either, but the CSRF-exposure difference is why many API-first designs prefer bearer tokens in the `Authorization` header (explicit, JavaScript-controlled) over auth cookies for pure API traffic — while traditional server-rendered web apps often still use cookies specifically *because* the automatic browser attachment is convenient for that use case, accepting the CSRF-mitigation cost that comes with it.

**Common Pitfall:** assuming a bearer token stored in `localStorage` and manually attached via `Authorization` is automatically safer than a cookie in every respect — it trades CSRF exposure for XSS exposure instead (a successful XSS attack can read `localStorage` and steal the token directly, whereas an `HttpOnly` cookie can't be read by any JavaScript at all, malicious or not). Neither option is unconditionally safer; each closes one attack vector while remaining open to a different one.

---

## Intermediate — Question 3

**Q3: What is HTTP/2 Server Push, and why has it been effectively deprecated by major browsers despite being part of the HTTP/2 spec?**

Server Push let a server proactively send resources to a client *before* the client explicitly requested them — e.g., pushing a page's CSS and JS alongside the initial HTML response, anticipating that the browser would need them next anyway.

**The intended mechanism:**
```text
Client: GET /index.html
Server: sends index.html
        PLUS proactively pushes style.css and app.js
        (before the browser has even parsed index.html to discover it needs them)
```
The theoretical benefit: eliminating the round-trip of "browser parses HTML, discovers it needs `style.css`, then requests it" — the server just sends it preemptively, in parallel with the HTML itself.

**Why it was deprecated in practice (Chrome removed support in 2022):**
- **The browser often already has the resource cached** from a previous visit — Server Push has no reliable way to know this in advance, so it frequently pushed resources the browser discarded immediately because it already had a valid cached copy, wasting bandwidth.
- **Pushed resources compete for the same limited connection bandwidth** as the critical HTML response itself — in practice, aggressively pushing extra resources could actually *slow down* delivery of the main HTML document the browser needed first, the opposite of the intended optimization.
- **Cache-awareness coordination proved too complex to get right in practice** — proposals to let the browser tell the server "don't bother, I already have this cached" added enough complexity that browser vendors concluded the real-world benefit didn't justify maintaining the feature.

**What replaced the underlying goal:** the `Link: </style.css>; rel=preload` HTTP header (or `<link rel="preload">` in HTML) achieves a similar "tell the browser about this resource early" goal, but as a **hint** the browser can act on using its own cache-awareness — rather than the server unilaterally pushing bytes the browser might not want.

**Common Pitfall:** implementing or relying on HTTP/2 Server Push in new projects today, unaware that major browsers have already stopped honoring it — a server configured to push resources to a modern Chrome/Edge client simply has those push frames ignored, silently providing zero benefit while still consuming server-side complexity to configure.

---

## Advanced — Question 3

**Q3: What is the difference between HTTP `Cache-Control: no-cache` and `Cache-Control: no-store`? These are two of the most commonly confused caching directives.**

Despite the similar names, they express very different caching instructions — `no-cache` still permits caching (with a mandatory revalidation step), while `no-store` forbids caching entirely.

**`no-cache` — cache it, but always revalidate with the origin before using the cached copy:**
```http
Cache-Control: no-cache
ETag: "a1b2c3d4"
```
A cache (browser or CDN) **is allowed to store** this response, but it must send a conditional revalidation request (`If-None-Match: "a1b2c3d4"`) to the origin server before serving the cached copy on any subsequent request — the origin gets to confirm "yes, that cached copy is still valid" (returning `304 Not Modified`, cheaply) or "no, here's a fresh version" every single time, even though the actual response body might not need to be re-transmitted.

**`no-store` — never persist this response anywhere, full stop:**
```http
Cache-Control: no-store
```
No cache, browser history mechanism, or intermediary is permitted to keep a copy of this response at all — not even for a revalidation check. This is the directive for genuinely sensitive responses (a page displaying a one-time payment confirmation with card details, a response containing an unencrypted secret) where even a *validated, confirmed-fresh* cached copy sitting on disk is an unacceptable risk.

**The practical distinction in one line:** `no-cache` means "always check back before reusing," `no-store` means "there is nothing to reuse — don't keep a copy in the first place."

**Common Pitfall:** using `no-cache` when the actual intent was `no-store` (a very common naming-confusion mistake, given `no-cache` sounds like it should mean "don't cache this") — a response containing genuinely sensitive data marked only `no-cache` can still end up written to a shared proxy's disk cache (pending revalidation), which may not meet the actual security requirement the developer intended.

---

## Beginner — Question 5

**Q5: What is the difference between a URI, a URL, and a URN — terms often used interchangeably but with a specific, formal relationship?**

**URI** (Uniform Resource Identifier) is the umbrella term — any string that identifies a resource. **URL** (Uniform Resource *Locator*) and **URN** (Uniform Resource *Name*) are both specific kinds of URI, distinguished by whether they tell you *where* to find something versus just *what it's called*.

**URL — identifies a resource AND tells you how/where to retrieve it:**
```text
https://api.example.com/products/5
```
This is both an identifier *and* a location — it specifies the scheme (`https`), the host, and a path, giving you everything needed to actually go fetch the resource.

**URN — identifies a resource by name, with no information about where to find it:**
```text
urn:isbn:9780134685991
```
This names a specific book (via its ISBN) uniquely and persistently, but says nothing about *where* to retrieve it — a URN's job is stable, location-independent identification, not retrieval instructions.

**The formal relationship:**
```text
URI (the umbrella category)
├── URL — a URI that also specifies a retrieval mechanism/location
└── URN — a URI that names a resource without specifying location
```
Every URL is a URI; every URN is a URI; but not every URI is necessarily a URL (a URN isn't) or a URN (a URL isn't).

**Why this distinction rarely matters in everyday REST API work:** almost everything web developers deal with day-to-day are URLs (they need to actually locate and fetch something) — URNs show up more in specialized identifier systems (ISBNs, legal citations, certain XML namespace declarations) where stable naming matters more than direct retrievability.

**Common Pitfall:** using "URL" and "URI" as if they mean exactly the same thing in casual conversation (which is harmless almost all the time, since nearly everything discussed in REST API contexts genuinely is a URL) — but worth knowing the precise distinction exists, since some specifications and standards (including parts of the REST/HTTP specs themselves) are deliberately precise about writing "URI" specifically because they mean to include URN-like identifiers too, not just locatable URLs.

---

## Intermediate — Question 4

**Q4: What is HTTP Basic Authentication, and why is it now considered largely obsolete for anything beyond very narrow, low-risk use cases?**

Basic Authentication is the oldest, simplest HTTP authentication scheme — credentials are sent as a Base64-encoded (not encrypted) string in the `Authorization` header on **every single request**, a design with genuine, structural security weaknesses by modern standards.

**The mechanism:**
```http
GET /api/orders
Authorization: Basic YWxpY2U6cGFzc3dvcmQxMjM=
```
Decoding that Base64 string reveals `alice:password123` — literally the username and password, separated by a colon, encoded (not encrypted, per the earlier encoding-vs-encryption distinction) directly in the header.

**Why this is structurally weak by modern standards:**
- **The actual password travels on every single request** — unlike a token-based scheme (JWT/OAuth) where a compromised token can be revoked without affecting the underlying password, a compromised Basic Auth header exposes the user's *actual* password directly, usable to log in anywhere else that same password is reused.
- **No built-in expiration** — the credential doesn't naturally expire the way a short-lived bearer token does; it remains valid until the password itself is changed.
- **No scope/permission granularity** — Basic Auth authenticates as "this specific user," with no equivalent to OAuth's scoped, limited-purpose access tokens (a token that can only read orders, for instance).
- **Relies entirely on TLS for any confidentiality at all** — since Base64 provides zero protection on its own, Basic Auth is only remotely acceptable over HTTPS, and even then, it exposes the raw password to every single service/proxy that terminates or inspects that TLS connection along the way.

**Where it's still reasonably used today:** simple, low-risk, internal service-to-service authentication (a health-check endpoint, an internal batch job hitting a single trusted internal API) where the operational simplicity outweighs the security gaps, and genuinely nothing more sensitive than that specific narrow use justifies the overhead of implementing a full token-based scheme.

**Common Pitfall:** using Basic Authentication for a public-facing, user-authenticated API "because it's simple to implement" — the direct exposure of the actual reusable password on every request (rather than a scoped, revocable, short-lived token) is a meaningfully worse security posture than JWT/OAuth for anything beyond narrow internal/service-to-service scenarios.

---

## Advanced — Question 4

**Q4: What is HTTP Request Smuggling, and how does it exploit disagreements between a front-end proxy and a back-end server about where one request ends and the next begins?**

HTTP Request Smuggling exploits ambiguity in how two different systems (typically a front-end proxy/load balancer and a back-end application server) each independently parse the boundary between HTTP requests on a shared, reused (keep-alive) TCP connection — if the two systems disagree about where one request ends, an attacker can "smuggle" a hidden, malicious second request that only the back-end sees, hidden inside what the front-end believes is a single, complete request.

**The core ambiguity — `Content-Length` versus `Transfer-Encoding: chunked`:**
```http
POST /checkout HTTP/1.1
Host: example.com
Content-Length: 13
Transfer-Encoding: chunked

0

SMUGGLED_REQUEST_HERE
```
This request maliciously includes **both** headers, which contradict each other about how to determine the body's length. If the front-end proxy uses `Content-Length` to determine the request is 13 bytes long (and forwards exactly that much, believing the request is complete), but the back-end server instead honors `Transfer-Encoding: chunked` and interprets the `0\r\n\r\n` as an end-of-chunks marker followed by *another, separate request* — the two systems now disagree about where this request ends and the next one begins on the shared connection.

**Why this enables real attacks:** because the front-end and back-end have desynchronized their understanding of request boundaries, an attacker's smuggled hidden request can get processed by the back-end as if it came from a *different*, legitimate user's subsequent request on that same reused connection — potentially allowing session hijacking, cache poisoning, or bypassing front-end security controls (a WAF rule that only inspects what the front-end believes is "the request," never seeing the smuggled portion at all).

**Mitigations:**
- **Reject any request containing both `Content-Length` and `Transfer-Encoding` headers** — the HTTP specification itself says this combination should be treated as invalid/ambiguous, and modern, well-configured proxies and servers do reject it outright rather than trying to guess which header to trust.
- **Use HTTP/2 end-to-end where possible** — HTTP/2's binary framing format doesn't have this specific text-based parsing ambiguity between `Content-Length` and chunked encoding, since request/response boundaries are expressed structurally in the binary frame format rather than via potentially-conflicting text headers.
- **Keep front-end and back-end HTTP parsing implementations consistent** — using the same well-tested, actively maintained HTTP libraries/versions on both sides reduces the chance the two systems interpret ambiguous edge cases differently in the first place.

**Common Pitfall:** assuming this is purely a "proxy configuration problem" unrelated to application code — while proxy/gateway configuration is the primary mitigation surface, an application server with lenient, non-standard HTTP parsing (accepting malformed requests a stricter parser would reject) can still be the "back-end" side of the disagreement that makes smuggling possible, even behind an otherwise well-configured front-end.

---
