# Entity Framework & SQL Server — Learning Q&A

A progressive question-and-answer guide covering beginner, mid, and advanced levels.

---

## Beginner — Question 1

**What is Entity Framework, and what problem does it solve?**

**Answer:**

Entity Framework (EF) is an **Object-Relational Mapper (ORM)** for .NET. It lets you work with a database using C# objects and classes instead of writing raw SQL.

**The problem it solves:** Normally, to talk to a database you'd write SQL strings, open connections, execute commands, and manually map each row/column into your C# objects. This is repetitive and error-prone.

With EF, you define C# classes (called **entities**) that map to database tables, and EF handles the SQL generation, connection management, and data mapping for you.

```csharp
// Without EF (raw ADO.NET) — tedious
var cmd = new SqlCommand("SELECT * FROM Products WHERE Id = @id", conn);
cmd.Parameters.AddWithValue("@id", 1);
// ... read rows, map manually ...

// With EF — clean
var product = context.Products.FirstOrDefault(p => p.Id == 1);
```

**Key terms to remember:**

- **Entity** — a C# class mapped to a table
- **DbContext** — the main class that manages the connection and coordinates queries/saves
- **DbSet** — represents a table (a collection of entities)

There are two flavors you'll hear about: **EF6** (older, .NET Framework) and **EF Core** (modern, cross-platform). We focus on **EF Core**, since that's what all new projects use.

---

## Beginner — Question 2

**What is a DbContext and a DbSet, and how do you set them up?**

**Answer:**

The **DbContext** is the heart of EF Core. It represents a session with the database and is responsible for querying, tracking changes, and saving data. You create your own class that inherits from `DbContext`.

A **DbSet&lt;T&gt;** is a property on your context that represents a table. Each `DbSet` corresponds to one entity type (one table).

Here's a complete minimal setup:

```csharp
// 1. The entity — maps to a "Products" table
public class Product
{
    public int Id { get; set; }        // becomes the primary key by convention
    public string Name { get; set; }
    public decimal Price { get; set; }
}

// 2. The DbContext
public class AppDbContext : DbContext
{
    // Each DbSet is a table
    public DbSet<Product> Products { get; set; }

    // Tell EF how to connect to the database
    protected override void OnConfiguring(DbContextOptionsBuilder options)
    {
        options.UseSqlServer(
            "Server=localhost;Database=ShopDb;Trusted_Connection=True;TrustServerCertificate=True;");
    }
}
```

**Using it:**

```csharp
using var context = new AppDbContext();

// Add a row
context.Products.Add(new Product { Name = "Keyboard", Price = 49.99m });
context.SaveChanges();   // EF generates and runs the INSERT

// Query
var products = context.Products.ToList();  // SELECT * FROM Products
```

**Key points:**

- **Conventions do a lot of work.** A property named `Id` (or `ProductId`) automatically becomes the primary key.
- `SaveChanges()` is when EF actually writes to the database. Before that, changes live only in memory.
- `using` ensures the context (and its DB connection) is disposed properly. A `DbContext` is meant to be **short-lived** — create one, use it, dispose it.
- In real apps, you usually configure the connection string via **dependency injection** rather than `OnConfiguring`.

---

*More questions to follow: continue the conversation with "next" to add Beginner Question 3 and beyond.*
