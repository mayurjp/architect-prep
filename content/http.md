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
