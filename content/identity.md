# Identity & Access — Q&A

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

---

## Beginner — Question 2

**Q2: What is Multi-Factor Authentication (MFA), and how does the TOTP (Time-based One-Time Password) mechanism behind most authenticator apps actually work?**

MFA requires a user to prove their identity with **two or more independent factors** — something they *know* (a password), something they *have* (a phone/authenticator app), or something they *are* (a fingerprint) — so that a stolen password alone isn't enough to compromise an account.

**TOTP — the algorithm behind Google Authenticator / Microsoft Authenticator:**
```csharp
// Simplified TOTP generation (RFC 6238) -- the same math both server and app run independently
public static string GenerateTotp(byte[] secretKey, DateTime time)
{
    long timeStep = (long)(time - DateTime.UnixEpoch).TotalSeconds / 30; // 30-second windows
    byte[] timeBytes = BitConverter.GetBytes(timeStep).Reverse().ToArray();

    using var hmac = new HMACSHA1(secretKey);
    byte[] hash = hmac.ComputeHash(timeBytes);

    int offset = hash[^1] & 0x0F;
    int binaryCode = ((hash[offset] & 0x7F) << 24) | (hash[offset + 1] << 16)
                    | (hash[offset + 2] << 8) | hash[offset + 3];

    return (binaryCode % 1_000_000).ToString("D6"); // the 6-digit code shown in the app
}
```

**Why this works without the phone ever talking to the server:**
1. During MFA setup, the server generates a random `secretKey` and shows it to the user as a QR code (scanned once into the authenticator app).
2. From that point on, **both** the server and the phone independently compute the same 6-digit code every 30 seconds, using the shared secret and the current time as the only two inputs — no network call between them is ever needed.
3. When logging in, the user types the code currently shown on their phone; the server computes what it expects for the current 30-second window (checking one window before/after to tolerate clock drift) and compares.

**Why this defeats a stolen password:** an attacker who phishes or brute-forces the password still doesn't have the `secretKey`, so they cannot compute a valid code — and each code is only valid for ~30-90 seconds, making a captured code useless shortly after.

**Common Pitfall:** relying on SMS-based MFA codes instead of TOTP for anything security-sensitive — SMS is vulnerable to **SIM-swapping attacks**, where an attacker socially engineers the victim's mobile carrier into porting their phone number to a new SIM card the attacker controls, silently intercepting the "MFA code" texts. TOTP's shared-secret approach has no equivalent carrier-level attack surface.

---

## Intermediate — Question 2

**Q2: What is the difference between Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC)?**

Both answer "is this user allowed to do this?" but RBAC decides based on a fixed **role** assignment, while ABAC decides based on evaluating **attributes** of the user, resource, and context at request time — a more flexible but more complex model.

**RBAC — access tied to a role:**
```csharp
[Authorize(Roles = "Manager")]
[HttpPost("approve")]
public IActionResult ApproveExpense(int expenseId) { ... }
```
Simple and fast to reason about: "Managers can approve expenses." But it breaks down for rules that don't map cleanly onto a fixed role — e.g., "a manager can only approve expenses **from their own department**, and only if the amount is **under their approval limit**." RBAC alone can't express that without creating an unmanageable explosion of roles (`ManagerDeptA_Under1000`, `ManagerDeptA_Under5000`, ...).

**ABAC — access tied to evaluating attributes at request time:**
```csharp
public class ExpenseApprovalHandler : AuthorizationHandler<ApprovalRequirement, Expense>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, ApprovalRequirement requirement, Expense expense)
    {
        var userDept = context.User.FindFirst("department")?.Value;
        var userLimit = decimal.Parse(context.User.FindFirst("approvalLimit")?.Value ?? "0");

        // Attributes of the USER (department, limit) evaluated against attributes of the RESOURCE (expense)
        if (userDept == expense.Department && expense.Amount <= userLimit)
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}
```
The decision is computed dynamically from **combinations** of attributes — user department, user's approval limit, the resource's own department and amount — rather than a single static role check, letting one policy correctly express a rule that would otherwise require dozens of RBAC roles.

**Decision guide:**
- **RBAC** for coarse-grained access that maps naturally onto job functions ("Admins can access the admin panel") — simpler to implement, audit, and explain to non-technical stakeholders.
- **ABAC** when access genuinely depends on relationships between the user, the specific resource, and context (time of day, department match, resource ownership) that a fixed role can't cleanly express.

**Common Pitfall:** starting a system with ABAC "for maximum flexibility" when RBAC would fully cover the actual requirements — ABAC's policy logic is significantly harder to audit ("why was this request allowed?" requires tracing a dynamic evaluation, not just checking a role list) and over-engineering it for simple role-based needs adds real maintenance cost for no corresponding benefit.

---

## Advanced — Question 2

**Q2: What is PKCE (Proof Key for Code Exchange), and why does the OAuth 2.0 Authorization Code flow require it for SPAs and mobile apps?**

The classic OAuth 2.0 Authorization Code flow was originally designed assuming the client exchanging the code for a token is a confidential, server-side application that can safely hold a `client_secret`. SPAs and mobile apps are **public clients** — their code runs entirely on the user's device, so any embedded secret can be extracted by inspecting the app's binary or JavaScript bundle. PKCE closes the specific vulnerability that gap creates.

**The vulnerability PKCE prevents — Authorization Code Interception:**
```text
1. SPA redirects user to the Authorization Server to log in
2. Authorization Server redirects back with a `code` in the URL: https://app.com/callback?code=abc123
3. WITHOUT PKCE: a malicious app on the same device (or a network intermediary) that
   intercepts this redirect can steal `code` and exchange it for tokens itself
```
Without a `client_secret` (which public clients can't safely hold) and without PKCE, whoever captures that `code` value can redeem it for access tokens — impersonating the legitimate app.

**The PKCE mechanism — a one-time, per-request secret the SPA generates itself:**
```csharp
// Step 1: Before redirecting to login, the SPA generates a random secret and its hash
var codeVerifier = GenerateRandomString(64);              // kept ONLY in the SPA's memory
var codeChallenge = Base64UrlEncode(Sha256(codeVerifier)); // sent in the initial redirect

// Step 2: Initial redirect includes the CHALLENGE (the hash), not the secret itself
// GET /authorize?...&code_challenge=xyz789&code_challenge_method=S256

// Step 3: When exchanging the returned `code` for tokens, the SPA sends the ORIGINAL verifier
var tokenRequest = new Dictionary<string, string>
{
    ["grant_type"] = "authorization_code",
    ["code"] = returnedCode,
    ["code_verifier"] = codeVerifier   // proves this exchange request came from the SAME app instance
};
```
The Authorization Server hashes the received `code_verifier` and checks it matches the `code_challenge` from step 2. An attacker who intercepted only the `code` (step 2's redirect) never saw the original `code_verifier` — it never left the legitimate app's memory — so they cannot complete the token exchange even with a stolen code.

**Common Pitfall:** treating PKCE as an optional hardening measure only for "extra security" — the current OAuth 2.1 draft specification makes PKCE **mandatory** for all Authorization Code flows, public and confidential clients alike, precisely because this vulnerability class turned out to affect more scenarios than originally assumed (including some confidential-client setups vulnerable to code interception via other means).

---

## Scenario — Question 5

**Q5: Your ASP.NET Core API authenticates users via an external identity provider (e.g., Auth0 or Azure Entra ID) using OIDC. The provider's JWT only contains generic claims (`sub`, `email`, `name`), but your application needs a custom `subscriptionTier` claim (Free/Pro/Enterprise) stored in your own database to drive authorization decisions. How do you get this application-specific data into the user's claims without asking the identity provider to store it?**

The identity provider owns *authentication* (who is this person), but it shouldn't need to know your application's specific business data — the standard pattern is **Claims Transformation**, enriching the incoming token's claims with application-specific data after authentication succeeds, entirely on your side.

**The Mechanism — `IClaimsTransformation`:**
```csharp
public class SubscriptionClaimsTransformation : IClaimsTransformation
{
    private readonly ISubscriptionRepository _subscriptions;

    public SubscriptionClaimsTransformation(ISubscriptionRepository subscriptions)
        => _subscriptions = subscriptions;

    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.HasClaim(c => c.Type == "subscriptionTier"))
            return principal; // already transformed this request, avoid double-adding

        var userId = principal.FindFirst("sub")?.Value;
        var tier = await _subscriptions.GetTierForUserAsync(userId!);

        var identity = (ClaimsIdentity)principal.Identity!;
        identity.AddClaim(new Claim("subscriptionTier", tier));
        return principal;
    }
}

// Program.cs
builder.Services.AddTransient<IClaimsTransformation, SubscriptionClaimsTransformation>();
```
ASP.NET Core calls every registered `IClaimsTransformation` automatically, right after the incoming JWT is validated and its claims are loaded into `ClaimsPrincipal` — by the time your controller/authorization policy runs, `User.FindFirst("subscriptionTier")` is populated, even though that claim never existed in the original token from the identity provider.

**Using the enriched claim in an authorization policy:**
```csharp
builder.Services.AddAuthorization(options =>
    options.AddPolicy("ProFeatureAccess", policy =>
        policy.RequireClaim("subscriptionTier", "Pro", "Enterprise")));

[Authorize(Policy = "ProFeatureAccess")]
[HttpGet("advanced-reports")]
public IActionResult GetAdvancedReports() { ... }
```

**Common Pitfall:** querying the database for the subscription tier on *every single request* inside `IClaimsTransformation` without caching — since this runs on every authenticated request, an uncached database call here adds a real per-request latency/load cost. A common fix is caching the tier lookup (e.g., in `IMemoryCache` keyed by user ID, with a short TTL) so the database is only hit once per cache window rather than on every API call.

---

## Beginner — Question 3

**Q3: What is Single Sign-On (SSO), and what actually happens behind the scenes when a user logs into one application and is automatically signed into others?**

SSO lets a user authenticate once with a central Identity Provider (IdP) and gain access to multiple, independent applications without logging in separately to each — the "automatic" sign-in a user experiences relies on a shared session with the IdP itself, not on the applications somehow sharing credentials directly with each other.

**The mechanism, step by step:**
```text
1. User visits App A (has never logged in yet) -> App A redirects to the IdP for login
2. User enters credentials at the IdP -> IdP authenticates, establishes its OWN session
   (typically an IdP session cookie, scoped to the IdP's domain)
3. IdP redirects back to App A with a token proving successful authentication
4. App A creates its own local session for the user based on that token

5. Later, user visits App B (different application, same organization) -> App B ALSO redirects to the IdP
6. The IdP notices the user ALREADY has an active session (from step 2's cookie) --
   it does NOT ask for credentials again, and immediately redirects back to App B with a fresh token
7. App B creates its own local session -- the user never saw a login form for App B at all
```
The "single" part of Single Sign-On refers to the *IdP's own session* being reused across every application redirecting to it — each application still gets its own token and its own local session, but the credential-entry step only happens once, at the IdP, for as long as that IdP session remains valid.

**Why this requires a shared, trusted Identity Provider rather than "App A telling App B the user is logged in" directly:** apps don't trust each other's assertions about identity directly (that would require pairwise trust relationships between every pair of applications) — instead, every application trusts the *same* IdP, and the IdP is the only party that needs to verify credentials and maintain the actual login session.

**Common Pitfall:** assuming SSO eliminates the need for each application to still validate tokens/sessions properly on every request — SSO simplifies the *login experience*, but each application must still independently validate the token it receives from the IdP (signature, expiry, audience) exactly as it would with any other authentication token; SSO isn't a security shortcut for skipping that validation.

---

## Intermediate — Question 3

**Q3: What is the Authorization Code flow in OAuth 2.0, and why does it involve a "code" as an intermediate step rather than returning the access token directly?**

The Authorization Code flow is OAuth 2.0's standard flow for server-side (confidential) applications — it deliberately introduces an extra round-trip (exchanging a short-lived code for the actual token) rather than handing back the access token directly in the initial redirect, specifically to keep the access token out of the browser's URL and history.

**The flow:**
```text
1. App redirects user to: https://idp.com/authorize?client_id=X&redirect_uri=Y&response_type=code
2. User logs in and consents at the IdP
3. IdP redirects back to the app: https://app.com/callback?code=SHORT_LIVED_CODE
   -- notice: only a CODE appears in the browser's URL, not an actual access token
4. The app's OWN BACKEND (not the browser/frontend) makes a separate, direct server-to-server
   request to the IdP, exchanging the code for the actual access token:
   POST https://idp.com/token  { code: SHORT_LIVED_CODE, client_secret: ... }
5. IdP responds with the access token -- delivered directly to the app's backend,
   NEVER appearing in the browser's URL bar, browser history, or server access logs
```

**Why not just return the access token directly in step 3?** URLs are logged in many places outside the application's control — browser history, proxy server access logs, the `Referer` header sent to any third-party resources the redirect page loads. An access token sitting directly in a URL is exposed to all of those logging surfaces; a short-lived, single-use authorization code exchanged over a direct server-to-server call (never appearing in a URL a browser navigates to) avoids that entire exposure surface.

**Why the code alone isn't enough — it also requires the `client_secret`:** the code-for-token exchange in step 4 requires the app's confidential `client_secret`, which only the legitimate backend possesses — even if an attacker somehow intercepted the authorization code from the redirect URL, they can't complete the exchange without also having the client secret, which never travels through the browser at all.

**Common Pitfall:** using this exact flow (with a `client_secret`) for a public client like a SPA or mobile app — those can't safely store a `client_secret` at all (it would be visible in their distributed JavaScript/binary), which is precisely why SPAs and mobile apps use the Authorization Code flow **with PKCE** instead (covered earlier) rather than this confidential-client variant.

---

## Advanced — Question 3

**Q3: What is Federated Identity, and how does it differ from your own application maintaining its own separate user accounts for third-party logins like "Sign in with Google"?**

Federated Identity means your application trusts an *external* Identity Provider's assertion about who a user is, rather than owning and verifying credentials itself — "Sign in with Google" is a concrete example, but the underlying concept extends to enterprise scenarios (trusting a partner company's IdP) far beyond consumer social login buttons.

**Without federation — your application owns the credential:**
```csharp
// YOUR database stores the password hash, YOUR code verifies it
var user = _db.Users.SingleOrDefault(u => u.Email == email);
if (!BCrypt.Verify(password, user.PasswordHash)) return Unauthorized();
```
Your application bears full responsibility for credential security — password hashing, breach response, password reset flows — for every one of these accounts.

**With federation — an external IdP owns the credential, you trust its assertion:**
```csharp
// Your app NEVER sees the user's Google password at all
builder.Services.AddAuthentication()
    .AddOpenIdConnect("Google", options =>
    {
        options.Authority = "https://accounts.google.com";
        options.ClientId = googleClientId;
        // Your app trusts Google's signed ID token asserting "this is alice@gmail.com, verified"
    });
```
Your application never handles, stores, or verifies the user's actual Google password — it simply validates a **signed token** from Google asserting the user's verified identity, trusting Google's own authentication process (which might include Google's own MFA, risk-based challenges, etc.) entirely.

**Why enterprises use federation beyond convenience:** a large enterprise integrating dozens of SaaS applications doesn't want each application maintaining its own separate password database for the same employees — federating identity to the company's own IdP (Entra ID, Okta) means employee onboarding/offboarding, password policy, and MFA enforcement are centralized in **one** place, and instantly apply across every federated application, rather than needing to be replicated and kept in sync across dozens of separate per-application user stores.

**Common Pitfall:** federating identity but still maintaining a *separate*, locally-stored password as a "backup login method" for the same account — this reintroduces exactly the credential-security burden (password hashing, breach monitoring, reset flows) federation was meant to eliminate, and creates a second, often less-scrutinized attack surface an attacker could target instead of the properly-secured federated IdP.

---

## Beginner — Question 4

**Q4: What is the difference between "Authentication Scheme" and "Authentication Handler" in ASP.NET Core, and why can an application support more than one at the same time?**

An Authentication Scheme is a named configuration (e.g., `"Cookies"`, `"Bearer"`, `"Google"`) — the Authentication Handler is the actual code that knows how to validate credentials for that specific scheme. ASP.NET Core supports registering **multiple** schemes simultaneously, letting a single application authenticate different kinds of clients through entirely different mechanisms.

**Registering multiple schemes side by side:**
```csharp
builder.Services.AddAuthentication()
    .AddCookie("Cookies", options => { /* for browser-based, server-rendered pages */ })
    .AddJwtBearer("Bearer", options => { /* for API clients sending a JWT */ })
    .AddOpenIdConnect("Google", options => { /* for "Sign in with Google" */ });
```
Each named scheme has its own dedicated handler validating credentials in a completely different way — a cookie handler checks an encrypted cookie value; a JWT bearer handler validates a token's signature and claims; an OIDC handler redirects to Google and processes the callback.

**Why an application needs more than one scheme:** a typical application serving both a traditional server-rendered admin panel (using cookies) *and* a public JSON API (using JWT bearer tokens) needs both mechanisms available simultaneously — a request to an API endpoint should be authenticated via the `Bearer` scheme, while a request to a browser-facing admin page should be authenticated via `Cookies`, and the application needs to apply the *right* scheme to the *right* kind of request.

**Selecting which scheme applies to which endpoint:**
```csharp
[Authorize(AuthenticationSchemes = "Bearer")] // THIS endpoint only accepts JWT bearer tokens
[HttpGet("api/orders")]
public IActionResult GetOrders() { ... }

[Authorize(AuthenticationSchemes = "Cookies")] // THIS endpoint only accepts the cookie-based scheme
[HttpGet("admin/dashboard")]
public IActionResult AdminDashboard() { ... }
```

**Common Pitfall:** registering multiple schemes without specifying which one a given endpoint should use, relying only on the application's single `DefaultAuthenticateScheme` — if an API endpoint meant for JWT bearer tokens accidentally falls back to attempting cookie-based authentication (because no explicit scheme was specified and the default happens to be `Cookies`), a JWT-bearing API client can receive confusing authentication failures unrelated to anything wrong with their actual token.

---

## Intermediate — Question 4

**Q4: What is Step-Up Authentication, and how does it let a system require stronger proof of identity for specific, higher-risk operations without forcing every user interaction through the same strict requirement?**

Step-Up Authentication means a user who's already authenticated (perhaps with just a password) can be prompted for an *additional* verification step specifically when attempting a higher-risk action — rather than requiring that stronger verification (like MFA) for every single interaction regardless of sensitivity, which would add friction to routine, low-risk actions unnecessarily.

**Without step-up — every action requires the same authentication level:**
```text
Viewing account balance: requires password + MFA (same as everything else)
Changing account password: requires password + MFA (same strength, even though FAR more sensitive)
Wiring $50,000 to a new recipient: requires password + MFA (STILL the same strength!)
```
Applying the same authentication strength uniformly either annoys users with excessive friction for routine actions, or under-protects genuinely high-risk ones if the baseline is kept low for convenience.

**With step-up — the authentication requirement scales with the action's risk:**
```csharp
[Authorize] // baseline: just needs to be logged in at all, for routine actions
[HttpGet("balance")]
public IActionResult GetBalance() { ... }

[Authorize(Policy = "RecentMfa")] // requires MFA to have been completed RECENTLY, not just at initial login
[HttpPost("wire-transfer")]
public IActionResult WireTransfer(WireTransferRequest request) { ... }
```
```csharp
builder.Services.AddAuthorization(options =>
    options.AddPolicy("RecentMfa", policy =>
        policy.RequireAssertion(context =>
        {
            var mfaTime = context.User.FindFirst("mfa_completed_at")?.Value;
            return mfaTime != null && DateTime.Parse(mfaTime) > DateTime.UtcNow.AddMinutes(-15);
            // MFA must have happened within the last 15 minutes specifically for THIS action
        })));
```
A user browsing their balance doesn't need to have completed MFA recently at all — but attempting a wire transfer specifically triggers a check for *recent* MFA completion, and if it hasn't happened recently enough, the application prompts for it right then, at the moment the higher-risk action is attempted, rather than upfront for every login.

**Why this matters as a genuinely different model from just "always require MFA":** it concentrates the friction of strong authentication specifically at the moments it provides the most security value (genuinely sensitive, high-risk actions) while keeping routine, low-risk interactions frictionless — a deliberate risk-proportionate design rather than a uniform one.

**Common Pitfall:** implementing step-up authentication but forgetting to set a reasonable expiry on "recent MFA completion" — without a time window (the 15-minute check above), a user who completed MFA once at login would satisfy "recent MFA" checks indefinitely for the rest of their session, defeating the purpose of requiring MFA specifically *close in time* to the sensitive action itself.

---

## Advanced — Question 4

**Q4: What is Token Introspection (RFC 7662), and why does an Opaque (non-JWT) access token require a fundamentally different validation approach than a self-contained JWT?**

A JWT is self-contained — a resource server can validate it entirely on its own (checking the signature, expiry, claims) without any network call back to the identity provider, as covered throughout earlier questions. An **Opaque token** (just a random, meaningless string from the resource server's perspective) contains no information at all by itself — validating one requires calling back to the Authorization Server via Token Introspection to ask "is this token currently valid, and if so, what does it represent?"

**A JWT — self-contained, validated locally, no network call needed:**
```csharp
// The resource server can check signature/expiry/claims ENTIRELY on its own
var principal = jwtHandler.ValidateToken(jwt, validationParameters, out _);
```

**An Opaque token — meaningless on its own, requires an introspection call to the Authorization Server:**
```http
POST /introspect HTTP/1.1
Host: identity-provider.com
Content-Type: application/x-www-form-urlencoded

token=2YotnFZFEjr1zCsicMWpAA&token_type_hint=access_token
```
```json
{
  "active": true,
  "scope": "orders.read orders.write",
  "client_id": "mobile-app",
  "exp": 1735689600
}
```
The resource server has to make this network round-trip to the Authorization Server for every single request bearing an opaque token, since the token itself carries no verifiable information — the Authorization Server is the only party that actually knows what that specific opaque string represents and whether it's still valid.

**Why anyone would choose Opaque tokens over the seemingly more convenient JWT:** **instant revocation.** A JWT is only genuinely revocable by waiting for it to naturally expire (or maintaining a deny-list, as covered in the earlier JWT revocation scenario) — an Opaque token can be revoked *immediately* at the Authorization Server, and the very next introspection call for that token simply returns `"active": false`, with no propagation delay or deny-list infrastructure needed at all, since the resource server never cached any independent judgment about the token's validity to begin with.

**The trade-off:** every single request now requires an extra network round-trip (to the introspection endpoint) that a self-contained JWT completely avoids — a real latency and Authorization-Server-load cost, which is exactly the trade-off JWTs were designed to eliminate in the first place; some systems mitigate this by caching introspection results briefly (accepting a small window of revocation delay in exchange for reduced introspection call volume).

**Common Pitfall:** choosing JWTs by default without considering that the specific use case might genuinely need instant revocation (a scenario like the "employee fired, must lose access immediately" case covered earlier) — Opaque tokens with introspection, despite the added latency cost, directly solve that specific requirement in a way a plain JWT structurally cannot without additional deny-list infrastructure layered on top.

---

## Beginner — Question 5

**Q5: What is the difference between "Authentication" happening at the API Gateway versus at each individual backend microservice, and why do most architectures do BOTH rather than picking just one?**

Covered under the microservices security material at a conceptual level (authenticate at the edge, authorize everywhere) — the specific reasoning for validating a token at *both* layers, rather than trusting the gateway's check alone, is worth understanding concretely.

**Gateway-only authentication — the API Gateway checks the token, backend services trust it blindly:**
```text
Client -> API Gateway (validates JWT signature/expiry) -> Order Service (trusts the
          gateway completely, does NO token validation of its own)
```
This works *as long as* every single request genuinely passes through the gateway — but if `OrderService` is ever reachable directly (a misconfigured internal network route, another service calling it directly bypassing the gateway, or simply a future architecture change nobody remembered to re-audit), there's **no authentication check at all** at that point, since `OrderService` itself never learned how to validate a token independently.

**Defense-in-depth — EVERY service independently validates, even though the gateway already did:**
```csharp
// OrderService's OWN Program.cs -- validates the JWT itself, INDEPENDENTLY of whether
// the gateway already checked it
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => { options.Authority = "https://identity.mycompany.com"; });
```
Even though the gateway already validated this exact token moments earlier, `OrderService` performs its *own*, independent validation — if `OrderService` is ever reached through any path other than the gateway (intentionally or by misconfiguration), it still correctly rejects unauthenticated requests on its own, rather than silently trusting that "surely this only ever comes through the gateway."

**Why this isn't wasteful redundancy but genuine defense-in-depth:** relying solely on the gateway's check makes the *entire system's* security depend on one specific network topology assumption (everything routes through the gateway) never being violated, ever, by any future change — a single point of failure for the whole system's authentication; having every service validate independently means a network misconfiguration or a bypassed gateway is a much smaller, contained problem (that one specific access path is unauthenticated) rather than a catastrophic, system-wide authentication bypass.

**Common Pitfall:** skipping per-service token validation "since the gateway already checked it, why do the same work twice" — validating a JWT's signature/expiry is computationally cheap (no network call, purely local cryptographic verification), making the redundancy cost genuinely negligible compared to the security benefit of not depending entirely on network topology remaining exactly as originally designed, forever, without any future misconfiguration risk.

---

## Intermediate — Question 5

**Q5: What is the "Confused Deputy Problem" in the context of OAuth, and how does the `state` parameter in the Authorization Code flow (covered earlier) specifically defend against it?**

The Confused Deputy Problem describes a scenario where an attacker tricks a legitimate, trusted party (the "deputy" — here, your application) into misusing its own legitimate authority on the attacker's behalf, without the deputy realizing it's being manipulated — in OAuth specifically, this manifests as an attacker hijacking the authorization flow to link *their own* third-party account to the *victim's* session on your application.

**The attack this specifically enables without the `state` parameter:**
```text
1. Attacker starts a LEGITIMATE OAuth flow with Google on THEIR OWN account, gets as far
   as receiving a valid authorization CODE for their own account
2. Attacker tricks the victim into visiting: https://yourapp.com/oauth/callback?code=ATTACKERS_CODE
   (e.g., via a crafted link sent in a phishing email)
3. The victim, ALREADY LOGGED IN to yourapp.com, has their browser send this request
4. Your application's callback handler exchanges ATTACKERS_CODE for a token, and (WITHOUT
   the state check) LINKS the resulting Google identity to the CURRENTLY LOGGED IN
   victim's account -- the attacker's Google account is now linked to the VICTIM's app account!
5. The attacker can now log into the VICTIM's application account using THEIR OWN Google credentials
```

**The `state` parameter — a per-flow, unguessable value the application generates and verifies matches on return:**
```csharp
// Step 1: BEFORE redirecting to the identity provider, generate and remember a random state value,
// tied to the CURRENT user's own session
var state = GenerateSecureRandomString();
HttpContext.Session.SetString("oauth_state", state);
var authUrl = $"https://accounts.google.com/o/oauth2/auth?client_id=...&state={state}&...";
return Redirect(authUrl);

// Step 2: when the callback arrives, verify the returned state matches what THIS session generated
[HttpGet("oauth/callback")]
public IActionResult Callback(string code, string state)
{
    var expectedState = HttpContext.Session.GetString("oauth_state");
    if (state != expectedState) return BadRequest("Invalid state -- possible CSRF/session-fixation attempt.");
    // only proceed with the code exchange if state genuinely matches THIS user's own initiated flow
}
```
Because the attacker's OAuth flow (started on their own browser, for their own account) generated a **different** `state` value than whatever the victim's own session expects, the victim's application correctly detects the mismatch and rejects the attacker's `code` — the attacker can't forge a `state` value that matches the victim's specific session, since the victim's session generated and is checking against its own random value the attacker never saw.

**Why this is genuinely a CSRF-family defense, not just an unrelated OAuth quirk:** this is structurally identical to the CSRF anti-forgery token pattern covered much earlier (a server-generated, unguessable value the client must echo back, proving the request genuinely originated from a flow the server itself initiated) — applied specifically to the OAuth callback step, defending against an attacker hijacking someone else's already-authenticated session via a maliciously-crafted callback URL.

**Common Pitfall:** implementing an OAuth "Sign in with X" integration by copying a tutorial's code that omits `state` validation entirely (many simplified tutorials skip it for brevity) — without it, the integration is specifically vulnerable to this account-linking hijack, a genuinely serious vulnerability class that's easy to miss precisely because the OAuth flow otherwise "works correctly" in every normal, non-attack scenario during testing.

---

## Advanced — Question 5

**Q5: What is "Token Binding" (or its more modern successor, DPoP — Demonstrating Proof-of-Possession), and how does it prevent a stolen access token from being usable by an attacker on a different device?**

An ordinary bearer token (covered throughout — JWT or opaque) is exactly what its name implies: **whoever bears (possesses) it** can use it, with no verification that the presenter is the same party the token was originally issued to. If a bearer token is stolen (via XSS, a compromised network, a leaked log), the thief can use it from anywhere, on any device, indistinguishable from the legitimate holder. DPoP closes this specific gap by cryptographically binding a token to the specific client that originally requested it.

**Ordinary bearer token — usable by ANYONE who possesses it, from ANY device:**
```http
GET /api/orders
Authorization: Bearer eyJhbGci... 
-- the server has NO way to verify this request is coming from the SAME device/client
   the token was originally issued to -- if this exact string is stolen, it's fully
   usable by the thief, from a completely different machine, indistinguishable from
   the legitimate original holder
```

**DPoP — the client proves possession of a private key on EVERY request, not just at token issuance:**
```http
GET /api/orders
Authorization: DPoP eyJhbGci...
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2In0... (a fresh, per-request proof, signed
       by a PRIVATE KEY that stays on the legitimate client's own device and NEVER travels
       over the network at all)
```
When the token was originally issued, the client generated a public/private key pair, keeping the private key locally and only sending the *public* key to the Authorization Server (bound into the issued token itself). On every subsequent API request, the client must generate a fresh, short-lived proof — signed with that same private key — demonstrating it still possesses the private key corresponding to the public key the token was bound to.

**Why stealing just the bearer token string is no longer sufficient for an attacker under DPoP:** even if an attacker steals the DPoP-bound access token itself (via the same XSS/log-leak paths that would fully compromise an ordinary bearer token), they **cannot** forge a valid DPoP proof for subsequent requests without also possessing the private key — which never left the legitimate client's device, was never transmitted over the network, and isn't recoverable from the stolen token string alone; the stolen token is now useless without the private key that never left the original device.

**Why this represents a genuinely different security model, not just an incremental hardening:** ordinary bearer tokens make "possessing the token string" and "being the legitimate client" the same thing by definition — DPoP separates them, requiring *both* the token *and* proof of possessing a specific private key that was never transmitted anywhere, meaningfully raising the bar for what a token theft alone can actually accomplish.

**Common Pitfall:** implementing DPoP but allowing an overly generous validity window on each proof (or failing to check proof replay via a `jti`-style uniqueness check) — a DPoP proof is meant to be single-use and short-lived; without proper replay protection, an attacker who intercepts *one* valid request (token + its accompanying DPoP proof, together) within the proof's validity window could still replay that exact request once, even without ever obtaining the private key itself — the security benefit specifically depends on correctly enforcing proof freshness and single-use, not merely requiring a proof to exist at all.

---

## Beginner — Question 6

**Q6: What is the difference between "Authentication" and "Authorization," and why is a system that only implements one of them fundamentally incomplete?**

Authentication answers "who are you?" — verifying an identity is genuinely who it claims to be (checking a password, validating a token's signature). Authorization answers "what are you allowed to do?" — deciding whether an already-verified identity has permission to perform a specific action or access a specific resource. A system needs both: Authentication alone verifies identity but doesn't decide what that identity can do; Authorization alone has no reliable identity to base its decisions on.

```csharp
[HttpDelete("orders/{id}")]
[Authorize] // AUTHENTICATION only -- confirms the caller is SOMEONE with a valid token
public async Task<IActionResult> DeleteOrder(int id)
{
    var order = await _repository.GetAsync(id);

    // AUTHORIZATION check -- confirms THIS SPECIFIC authenticated user is ALLOWED to delete THIS order
    if (order.OwnerId != User.GetUserId() && !User.IsInRole("Admin"))
        return Forbid();

    await _repository.DeleteAsync(id);
    return NoContent();
}
```
`[Authorize]` alone confirms the request carries a genuinely valid, authenticated identity — but says nothing about whether *that specific* identity should be allowed to delete *this specific* order; the explicit ownership/role check afterward is the actual Authorization decision, and omitting it (relying on `[Authorize]` alone) would let any authenticated user delete any other user's orders.

**Common Pitfall:** treating `[Authorize]` (or equivalent authentication-only checks) as sufficient protection for an endpoint, without adding the corresponding authorization logic verifying the authenticated user is actually permitted to act on the *specific* resource being requested — this is the exact root cause of the Broken Object Level Authorization vulnerability class (covered under application security), where "you're logged in" is mistakenly treated as equivalent to "you're allowed to do this to any resource."

---

## Intermediate — Question 6

**Q6: What is the OAuth 2.0 "Refresh Token," and how does its longer lifetime (compared to a short-lived Access Token) let a client obtain new Access Tokens WITHOUT requiring the user to re-authenticate?**

An Access Token is deliberately short-lived (minutes to an hour) to limit the damage window if it's stolen — but requiring the user to log in again every time it expires would be a poor experience. A Refresh Token, issued alongside the Access Token but with a much longer lifetime, lets the client silently obtain a fresh Access Token from the Authorization Server without any user interaction at all.

```http
POST /token
grant_type=refresh_token&refresh_token=<the long-lived refresh token>&client_id=...
```
```json
{
  "access_token": "<A BRAND NEW, freshly-issued, short-lived access token>",
  "refresh_token": "<possibly a NEW refresh token too, if rotation is enabled>",
  "expires_in": 3600
}
```
The client presents its Refresh Token directly to the Authorization Server (not to any resource server) and receives a fresh Access Token in response — no username/password re-entry, no user-visible login screen at all; this happens transparently, often triggered automatically just before the current Access Token is about to expire.

**Why Refresh Token Rotation matters as a security hardening on top of the basic mechanism:** with rotation enabled, every time a Refresh Token is used, the Authorization Server issues a brand new one and immediately invalidates the old one — if a stolen Refresh Token is ever used by an attacker, the legitimate client's *next* attempt to use its now-invalidated Refresh Token fails, which itself is a detectable signal that a theft has occurred (since two parties now believe they hold "the" valid refresh token, but only one attempt can succeed).

**Common Pitfall:** storing a long-lived Refresh Token somewhere insecure (like browser `localStorage`, accessible to any JavaScript running on the page, including injected via XSS) — because a Refresh Token grants the ability to mint fresh Access Tokens indefinitely (or until it expires/is revoked), it's an even higher-value target for theft than an Access Token itself; it warrants storage at least as secure as the Access Token (an HttpOnly cookie, or a platform-specific secure credential store), not casual client-side storage.

---

## Advanced — Question 6

**Q6: What is "Continuous Access Evaluation" (CAE), and how does it let an Identity Provider REVOKE an already-issued, still-technically-valid access token's effective access in near-real-time, rather than waiting for the token's own expiry?**

Ordinarily, once an Access Token is issued, it remains valid until its own expiration, regardless of what happens to the underlying account in the meantime — a user's account could be disabled, their password changed after a suspected compromise, or their location flagged as suspicious, but their still-unexpired Access Token would normally continue granting access until it naturally expires. Continuous Access Evaluation closes this gap by having resource providers actively check for critical events and revoke access in near-real-time, rather than passively waiting out the token's stated lifetime.

```text
1. User authenticates, receives an Access Token valid for 1 hour
2. 5 minutes later: security team disables the user's account (suspected compromise detected)
3. WITHOUT CAE: the token remains valid for the REMAINING 55 minutes, regardless of the disablement
4. WITH CAE: the Identity Provider pushes a near-real-time signal ("this user's session is revoked")
   -> the resource provider (Microsoft Graph, for instance) re-evaluates and REJECTS
      the token almost IMMEDIATELY, despite it not having technically expired yet
```
Rather than relying solely on short token lifetimes to bound the risk window (the traditional mitigation, forcing frequent re-authentication as a blunt instrument), CAE lets critical, security-relevant events propagate from the Identity Provider to resource providers essentially in real-time, allowing access to be revoked the moment a disqualifying event is known, independent of whatever lifetime the token was originally issued with.

**Why this specifically improves on "just use very short token lifetimes" as a mitigation:** very short-lived tokens reduce risk exposure but at the cost of far more frequent token-refresh traffic and, in stricter implementations, more frequent user-visible re-authentication — CAE instead allows tokens to have a more normal, less aggressively short lifetime, while still achieving near-real-time revocation specifically when it actually matters (a genuine security event), rather than paying the operational/UX cost of very short lifetimes at all times regardless of whether anything suspicious ever happens.

**Common Pitfall:** assuming CAE is a drop-in security guarantee available automatically for any OAuth/OIDC deployment — it requires both the Identity Provider and the specific resource providers/APIs involved to explicitly support and correctly implement the CAE signaling protocol; a resource server that doesn't participate in CAE will simply continue honoring a token for its full stated lifetime regardless of any revocation signal the Identity Provider attempts to push, meaning CAE's benefit depends entirely on end-to-end support across the specific components actually deployed.

---
