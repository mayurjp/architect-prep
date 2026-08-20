## Beginner — Question 1

**Q1: What is the Model-View-Controller (MVC) pattern and how is it implemented in ASP.NET Core?**

MVC is an architectural pattern that separates an application into three main components to achieve separation of concerns:

1. **Model:** Represents the data and the business logic of the application. It is responsible for retrieving data (often from a database via EF Core), validating it, and applying business rules.
2. **View:** Represents the user interface (UI). It displays the data provided by the Model to the user. In ASP.NET Core, Views are typically written using Razor syntax (`.cshtml` files), which blends HTML with C#.
3. **Controller:** Handles user interaction. It receives HTTP requests, processes user input (often by interacting with the Model), and selects the appropriate View to render the response.

**The Mechanism:**
When an HTTP request arrives, the ASP.NET Core routing engine maps the URL to a specific Action method inside a Controller. The Controller executes, pulls data into a Model (or a ViewModel), and passes that Model to the `View()` method. The Razor view engine then compiles the HTML and returns it to the client.

#### Follow-up: What is a ViewModel and why should you use it instead of passing Domain Models to a View?
A ViewModel is a custom class specifically designed to hold only the data required for a particular View. Domain models often contain sensitive data (like `PasswordHash`) or lack UI-specific formatting properties (like a pre-calculated `FullName`). Using a ViewModel prevents over-posting attacks, hides database structure, and keeps the View clean of complex logic.

---

## Intermediate — Question 1

**Q1: Explain how Model Binding works in ASP.NET Core MVC.**

Model Binding is the process that maps data from an incoming HTTP request to the parameters of a Controller's Action method.

**The Mechanism:**
When an Action is invoked, ASP.NET Core inspects the parameters required by the method. The Model Binder then searches the HTTP request for values that match the parameter names. It searches in a specific, prioritized order:

1. **Form values:** Data submitted via `POST` requests.
2. **Route values:** Data extracted from the URL path (e.g., the `{id}` in `/Users/Edit/5`).
3. **Query strings:** Data at the end of the URL (e.g., `?sort=desc`).

```csharp
// URL: /Products/Details/5?showReviews=true
public IActionResult Details(int id, bool showReviews) {
    // Model Binding automatically maps '5' to 'id' (from Route)
    // and 'true' to 'showReviews' (from Query string).
    return View();
}
```

**Common Pitfalls:**
**Over-posting (Mass Assignment) Attacks:** If your Action accepts a domain model directly (e.g., `public IActionResult Edit(User user)`), a malicious user could inject extra form fields (like `isAdmin=true`) into the HTTP request. If the Model Binder blindly binds all fields and you save to the database, the user just granted themselves admin rights. 
*Fix:* Always bind to a specific ViewModel containing only the editable fields, or explicitly use the `[Bind]` attribute.

---

## Intermediate — Question 2

**Q2: What are `IActionResult` and `ActionResult<T>`, and why do we return them instead of raw types?**

Controllers need to return HTTP responses, not just raw C# objects. `IActionResult` is an interface that represents the result of an action method, allowing you to return different HTTP status codes and payloads depending on the execution flow.

**The Mechanism:**
Instead of directly writing to the `HttpContext.Response` stream, you return an object that implements `IActionResult`. The ASP.NET Core framework then executes this result to format the final HTTP response.

- `View()` returns a `ViewResult` (200 OK + HTML).
- `Ok()` returns an `OkObjectResult` (200 OK + JSON/Content).
- `NotFound()` returns a `NotFoundResult` (404).
- `RedirectToAction()` returns a `RedirectToActionResult` (302).

```csharp
public IActionResult GetProduct(int id) {
    var product = _db.Products.Find(id);
    if (product == null) {
        return NotFound(); // 404
    }
    return View(product); // 200 + HTML
}
```

**`ActionResult<T>` (API Specific):**
Introduced for API controllers, `ActionResult<T>` allows you to return *either* a specific type `T` (which is automatically wrapped in a 200 OK) *or* an `IActionResult` (like `NotFound()`). This dramatically improves Swagger/OpenAPI documentation generation because the framework explicitly knows the success return type.

---

## Advanced — Question 1

**Q1: Explain Conventional Routing vs Attribute Routing in ASP.NET Core.**

Routing is responsible for mapping incoming HTTP requests to executable endpoints (Action methods). ASP.NET Core supports two fundamentally different paradigms.

**Conventional Routing:**
- Rules are defined globally in `Program.cs`.
- Uses a template-based approach to map URLs to Controllers and Actions based on their names.
- **The Mechanism:** `app.MapControllerRoute(name: "default", pattern: "{controller=Home}/{action=Index}/{id?}");`
- If a request comes in for `/Products/List/5`, the engine splits it into `Controller="Products"`, `Action="List"`, `Id="5"`.
- **Pros:** Keeps controllers clean. Centralized routing rules.
- **Cons:** Hard to trace which URL maps to which action in large applications.

**Attribute Routing:**
- Rules are defined directly on the Controllers and Action methods using attributes like `[Route]`, `[HttpGet]`, `[HttpPost]`.
- **The Mechanism:**
```csharp
[Route("api/[controller]")]
public class OrdersController : Controller {
    [HttpGet("{id:int}")] // Explicitly requires an integer
    public IActionResult GetOrder(int id) { ... }
}
```
- **Pros:** Highly explicit and discoverable. Supports advanced constraints (e.g., `{id:guid}`). Required for RESTful APIs.
- **Cons:** Can become verbose.

**Common Pitfalls:**
Mixing them inconsistently can lead to confusing behavior. If a controller has a `[Route]` attribute on it, Conventional Routing is completely ignored for that controller—it *must* rely entirely on Attribute Routing.

---

## Advanced — Question 2

**Q2: How do Tag Helpers work in ASP.NET Core MVC, and how are they superior to HTML Helpers?**

Tag Helpers enable C# code to participate in creating and rendering HTML elements in Razor files. They transform HTML-like tags into standard HTML.

**The Mechanism:**
If you want a link that generates a URL based on the routing engine, you use:
```html
<a asp-controller="Products" asp-action="Details" asp-route-id="@Model.Id">View Product</a>
```
When Razor compiles the view, the `AnchorTagHelper` intercepts this tag. It reads the `asp-` attributes, uses the routing engine to generate the correct URL (e.g., `/Products/Details/5`), and renders standard HTML:
```html
<a href="/Products/Details/5">View Product</a>
```

**Superiority to HTML Helpers (`@Html.ActionLink`):**
Historically in ASP.NET MVC 5, you had to write C# code directly in the view:
```csharp
@Html.ActionLink("View Product", "Details", "Products", new { id = Model.Id }, new { @class = "btn btn-primary" })
```
1. **HTML-Friendly:** Tag Helpers look like native HTML. Front-end developers who don't know C# can easily read and style them. HTML Helpers look like confusing C# method calls.
2. **IntelliSense:** Because they extend standard HTML tags, Visual Studio provides rich IntelliSense for standard HTML attributes (`class`, `style`) alongside the `asp-` attributes, which was difficult with HTML Helpers.

---

## Scenario — Question 1

**Q1: You have an ASP.NET Core MVC application. A user submits a large form, but validation fails on the server because the `DateOfBirth` is in the future. The server returns the View with validation errors, but the user complains that all 20 fields they filled out were cleared and they have to start over. How do you fix this?**

When a controller re-renders a View after a `POST` fails, the `ModelState` and the original `ViewModel` are critical to preserving user input.

**The Mechanism:**
If model binding or validation fails, `ModelState.IsValid` will be `false`. To preserve the user's input, you must pass the *exact same* model object that was just bound back into the `View()` method. 

```csharp
[HttpPost]
public IActionResult Edit(UserEditViewModel model) {
    if (!ModelState.IsValid) {
        // Correct: Pass the 'model' object back! 
        // Razor will read the values and repopulate the HTML input fields.
        return View(model); 
    }
    
    // ... Save to DB ...
    return RedirectToAction("Index");
}
```

**Common Pitfall (The Cause of the Bug):**
The bug happens if the developer writes `return View();` without passing the `model`, or if they instantiate a `new UserEditViewModel()` and pass that. In both cases, Razor receives an empty model, and all `<input asp-for="...">` fields render completely blank, infuriating the user.

---

## Scenario — Question 2

**Q2: You have an MVC application that renders a list of products. To build this view, the Controller must call the database, call an external weather API to show shipping conditions, and call an identity service to check user permissions. Loading the page is slow. How do you utilize View Components to improve this?**

View Components are like mini-controllers specifically designed to render reusable chunks of a View, entirely independent of the main Controller's execution cycle.

**The Solution:**
Instead of the main `ProductsController` doing all this heavy lifting (which violates the Single Responsibility Principle), you isolate the independent UI parts into View Components.

**The Mechanism:**
1. **Create the View Component:** Create a `WeatherViewComponent` class that inherits from `ViewComponent`.
2. **Move the Logic:** Move the HTTP call to the external weather API into its `InvokeAsync` method. 
3. **Render the Component:** In your Razor View (`Index.cshtml`), you invoke the component directly: 
   `@await Component.InvokeAsync("Weather", new { zipCode = 10001 })`

**The Benefits:**
- **Separation of Concerns:** The `ProductsController` now only cares about fetching products.
- **Reusability:** You can easily drop the `@await Component.InvokeAsync("Weather")` code into the `Cart.cshtml` view without duplicating the HTTP call logic in the `CartController`.
- **Parallel Execution:** While the main controller processes products, View Components can be fetched asynchronously during view compilation, potentially improving response times.
