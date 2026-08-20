## Beginner — Question 1

**Q1: What is the difference between Authentication (AuthN) and Authorization (AuthZ)?**

While they sound similar and are often used together, they represent two completely different steps in securing an application.

1. **Authentication (AuthN):** The process of verifying *who* a user is. It proves their identity.
   - **Mechanism:** Passwords, multi-factor authentication (MFA), biometric scans, or federated logins (like "Sign in with Google").
   - **Analogy:** Checking someone's ID or passport at the airport security gate. You are proving you are who you say you are.

2. **Authorization (AuthZ):** The process of verifying *what* a user is allowed to do. It grants or denies access to resources.
   - **Mechanism:** Role-based access control (RBAC), claims-based authorization, or policy-based authorization in ASP.NET Core (`[Authorize(Roles = "Admin")]`).
   - **Analogy:** After you pass security (AuthN), Authorization determines if your boarding pass allows you to enter the First Class Lounge, or just the standard terminal.

---

## Intermediate — Question 1

**Q1: What is a JSON Web Token (JWT) and how does it work?**

A JWT (pronounced "jot") is an open standard (RFC 7519) that defines a compact and self-contained way for securely transmitting information between parties as a JSON object. It is heavily used for Authorization in modern Web APIs.

**The Mechanism:**
A JWT consists of three parts separated by dots (`.`): `Header.Payload.Signature`

1. **Header:** Contains metadata about the token, specifically the type of token (JWT) and the signing algorithm being used (e.g., HMAC SHA256 or RSA).
2. **Payload:** Contains the claims (statements about an entity/user). This might include the user's ID, name, roles, and the token's expiration time (`exp`).
3. **Signature:** The most critical part. To create the signature, the issuer takes the encoded header, the encoded payload, a secret key, and signs it using the algorithm specified in the header.

**How it works in practice:**
1. A user logs in. The server verifies their credentials and generates a JWT, signing it with its private secret key, and sends it to the client.
2. The client attaches the JWT to the `Authorization: Bearer <token>` header on subsequent API requests.
3. The API receives the request. It takes the Header and Payload from the token, signs them using its own copy of the secret key, and compares the result to the Signature attached to the token. If they match, the token is perfectly valid and hasn't been tampered with. If an attacker alters the Payload (e.g., changing their role from "User" to "Admin"), the Signature validation will fail.

**Common Pitfalls:**
The Header and Payload are just Base64Url encoded, *not encrypted*. Anyone who captures the token can decode it and read the Payload. You should never put sensitive data (like passwords or SSNs) inside a JWT payload.

---

## Advanced — Question 1

**Q1: Explain the difference between OAuth 2.0 and OpenID Connect (OIDC).**

OAuth 2.0 and OpenID Connect are fundamental protocols in modern identity management, but they serve different purposes.

**OAuth 2.0:**
- **Purpose:** It is strictly an **Authorization** protocol. It allows a third-party application to obtain limited access to an HTTP service, either on behalf of a resource owner or by allowing the third-party application to obtain access on its own behalf.
- **Example:** A website asks for permission to post to your Twitter timeline. You log into Twitter, and Twitter issues an **Access Token** to the website. The website uses that token to call the Twitter API.
- **Limitation:** OAuth 2.0 provides absolutely no standard way to identify the user. The Access Token is essentially a hotel key card—it gets you into the room, but the lock doesn't know (or care) who you are, only that you have the key.

**OpenID Connect (OIDC):**
- **Purpose:** It is an **Authentication** layer built *on top* of the OAuth 2.0 framework.
- **The Mechanism:** When an application uses OIDC, it requests a specific scope (`openid`). In addition to the standard Access Token, the Authorization Server (like Azure AD or IdentityServer) issues an **ID Token**.
- **The ID Token:** This is always a JWT. It contains specific, standardized claims about the authenticated user (such as `sub` for subject/ID, `name`, and `email`). The client application can read this token to securely know *who* just logged in, without having to make additional calls to an API.
- **Example:** "Sign in with Google." The application gets an ID Token containing your email address and profile picture, establishing your identity within the app.

---

## Scenario — Question 1

**Q1: Your SPA (React) communicates with an ASP.NET Core API using JWTs. How do you handle token expiration and secure renewal without forcing the user to log in repeatedly?**

JWT Access Tokens must have a short lifespan (e.g., 15 minutes). If a token is stolen, the attacker has a very limited window to use it. However, forcing the user to log in every 15 minutes is terrible UX.

**The Solution: Refresh Tokens**
When the user initially logs in, the Auth Server returns *two* tokens:
1. A short-lived **Access Token** (JWT, valid for 15 minutes).
2. A long-lived **Refresh Token** (Opaque string, valid for 7 days).

**The Flow:**
1. The SPA attaches the Access Token to API calls.
2. After 15 minutes, the Access Token expires. The API returns a `401 Unauthorized` response.
3. The SPA's HTTP interceptor (e.g., in Axios) catches the 401. It pauses the failed request.
4. The SPA makes a silent background request to the Auth Server (`/connect/token`), sending the **Refresh Token**.
5. The Auth Server validates the Refresh Token against its database. If valid (and not revoked), it generates a *new* Access Token and a *new* Refresh Token, returning them to the SPA. (This is called Refresh Token Rotation).
6. The SPA's interceptor updates its stored tokens, attaches the *new* Access Token to the paused API request, and retries it. The user experiences a slight delay but is not logged out.

**Crucial Security Aspect:**
Unlike JWTs (which are stateless and cannot be easily revoked before expiration), Refresh Tokens are stored in the database. If a user's account is compromised, the administrator can delete the Refresh Token from the database. The attacker's 15-minute Access Token will expire, and their attempt to use the stolen Refresh Token will fail, immediately locking them out.

---

## Scenario — Question 2

**Q2: You are building an ASP.NET Core API that serves multiple different tenant companies. You need to ensure that a user from Company A can NEVER access the data of Company B. How do you implement this securely at the architecture level so developers don't accidentally leak data?**

Relying on developers to remember to add `where TenantId = 1` to every single LINQ query is a recipe for a catastrophic data breach. This requires **Global Query Filters**.

**The Mechanism (Entity Framework Core):**
You must enforce the tenant isolation at the lowest possible data access level.

1. **Inject Tenant Context:** Create a scoped service (e.g., `ITenantService`) that reads the `TenantId` from the current HTTP request (usually from a claim in the JWT: `User.FindFirst("TenantId")`).
2. **Global Query Filter:** In your `DbContext`, you configure a global filter on all entity types that have a `TenantId`.
   ```csharp
   protected override void OnModelCreating(ModelBuilder modelBuilder) {
       // Assuming _tenantId is injected into the DbContext
       modelBuilder.Entity<Order>().HasQueryFilter(o => o.TenantId == _tenantId);
       modelBuilder.Entity<Customer>().HasQueryFilter(c => c.TenantId == _tenantId);
   }
   ```

**Result:**
When a developer writes `_dbContext.Orders.ToList()`, EF Core automatically intercepts it and generates SQL like `SELECT * FROM Orders WHERE TenantId = @tenantId`. It is impossible for a developer to accidentally query another tenant's data through standard EF Core methods, ensuring strict tenant isolation by default.

---

## Scenario — Question 3

**Q3: Your SPA needs to store the JWT Access Token and Refresh Token received from the server. A junior developer stores them in `localStorage` so they persist across browser tabs. Why is this a massive security vulnerability, and how should you architect token storage for a frontend application?**

Storing sensitive tokens in `localStorage` or `sessionStorage` exposes the application to **Cross-Site Scripting (XSS)** attacks.

**The Flaw:**
If an attacker manages to inject a malicious JavaScript payload into your SPA (e.g., through an unescaped comment field), that script runs in the same context as your application. The script can simply read `localStorage.getItem('token')` and send the JWT to the attacker's server. The attacker now has full access to the user's account.

**The Solution: HttpOnly Cookies**
You must remove token management from the frontend JavaScript entirely.

1. **The Login Request:** When the user logs in, the SPA sends credentials to the API.
2. **The API Response:** Instead of returning the JWTs in the JSON body, the API attaches them to the HTTP response as `Set-Cookie` headers. Crucially, these cookies MUST have the `HttpOnly` and `Secure` flags set, and `SameSite=Strict`.
3. **The Result:** The browser automatically stores the cookies. When the SPA makes subsequent requests to the API, the browser automatically attaches the cookies. 

**Why it's secure:**
Because of the `HttpOnly` flag, it is fundamentally impossible for *any* JavaScript running in the browser to read the cookie. Even if an attacker successfully executes an XSS attack, they cannot steal the token. 

*(Note: Using cookies introduces a vulnerability to **Cross-Site Request Forgery (CSRF)**, which must be mitigated by using anti-CSRF tokens or relying heavily on `SameSite=Strict` cookie policies).*

---

## Scenario — Question 4

**Q4: Your API relies on JWTs for authorization. An employee is fired, and their account is instantly deactivated in the database. However, the employee is still able to access the API for another 45 minutes and download confidential data. Why did this happen, and how do you fix it without sacrificing the performance benefits of JWTs?**

This is the classic **JWT Revocation Problem**.

**The Flaw:**
JWTs are completely stateless and self-contained. When the API receives a JWT, it validates the signature mathematically. It *does not* check the database. Because the JWT was issued with a 1-hour expiration time and the employee was fired 15 minutes into that hour, the token remains mathematically valid for another 45 minutes, regardless of the database state.

**The Solution:**
You must implement a hybrid approach that balances stateless performance with security revocation.

1. **Keep Access Tokens Short-Lived:** First and foremost, reduce the JWT lifespan. An Access Token should live for 5 to 15 minutes max. 45 minutes is too long for a critical system.
2. **Revoke the Refresh Token:** When the employee is fired, immediately delete/revoke their long-lived Refresh Token in the database. When their 5-minute JWT expires, they will be unable to get a new one, permanently locking them out.
3. **The "Blacklist" or "Deny List" (For Immediate Action):** If 5 minutes is still too long to wait, you can implement an in-memory Redis blacklist.
   - When a critical security event happens (like firing an employee), you write their `UserId` or `SessionId` (the `jti` claim) to Redis with a TTL matching the token expiration.
   - The API middleware still validates the JWT signature statelessly (fast).
   - Before granting access, it makes a microsecond check to Redis: "Is this `UserId` blacklisted?" If yes, it rejects the request.
   - This adds a tiny bit of statefulness, but Redis is so fast it barely impacts performance, providing the best of both worlds.
