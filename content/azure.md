## Beginner — Question 1

**Q1: What is the difference between IaaS, PaaS, and SaaS in Azure?**

These are the three main service models of Cloud Computing:

1. **IaaS (Infrastructure as a Service):** You rent IT infrastructure (servers, virtual machines, storage, networks) from Azure. You manage the OS, runtime, and application. Azure manages the physical hardware and virtualization.
   - *Azure Service:* Azure Virtual Machines (VMs), Azure Virtual Network (VNet).
   - *Use case:* Lift-and-shift migrations from on-premises datacenters.

2. **PaaS (Platform as a Service):** Azure provides a managed environment for developing, testing, delivering, and managing applications. You manage the application code and data; Azure manages the underlying infrastructure, OS, middleware, and runtime.
   - *Azure Service:* Azure App Service, Azure SQL Database, Azure Functions.
   - *Use case:* Rapid development of web apps or APIs without worrying about server maintenance or OS patches.

3. **SaaS (Software as a Service):** A complete software solution is hosted and managed by the cloud provider. You just rent the software and use it over the internet.
   - *Microsoft Service:* Microsoft 365, Outlook, Dynamics 365.
   - *Use case:* End-user applications where you don't care about code or infrastructure at all.

---

## Intermediate — Question 1

**Q1: What are the differences between Azure Blob Storage, Azure Files, and Azure Disks?**

All three are part of Azure Storage, but they serve completely different operational needs:

1. **Azure Blob Storage:**
   - **What it is:** Massively scalable object storage for unstructured data (images, documents, videos, logs).
   - **Mechanism:** Data is stored in a flat namespace (containers and blobs) accessed via HTTP/REST APIs. It doesn't have a traditional directory structure (though it fakes it with prefixes).
   - **Use case:** Storing images for a website, big data analytics, backups.

2. **Azure Files:**
   - **What it is:** Fully managed file shares in the cloud that are accessible via the industry-standard Server Message Block (SMB) protocol or Network File System (NFS).
   - **Mechanism:** It looks and acts exactly like a traditional network drive. You can mount it directly to Windows, Linux, or macOS.
   - **Use case:** Lift-and-shift legacy applications that expect a file share (e.g., writing logs to `\\server\share`).

3. **Azure Disks:**
   - **What it is:** Block-level storage volumes that are managed by Azure and used specifically with Azure Virtual Machines.
   - **Mechanism:** Think of it as a virtual hard drive (VHD). It is attached to a VM, formatted with a file system (NTFS, ext4), and accessed directly by the VM's OS.
   - **Use case:** The OS drive (C:) or data drives (D:) for an Azure VM.

---

## Advanced — Question 1

**Q1: How do you design for High Availability (HA) across multiple Azure regions?**

Designing for High Availability means ensuring your application stays online even if underlying infrastructure (servers, racks, datacenters, or entire regions) fails.

**The Strategy:**
To survive a complete region outage (e.g., East US goes offline due to a natural disaster), you must deploy an **Active-Active** or **Active-Passive** architecture across at least two paired regions (e.g., East US and West US).

1. **Traffic Routing (Front Door / Traffic Manager):**
   - You place **Azure Front Door** or **Azure Traffic Manager** at the global edge.
   - They monitor the health of your regional endpoints. If East US fails, it automatically routes all user traffic to West US.

2. **Compute (App Service / AKS):**
   - You deploy identical instances of your application code to an Azure App Service in East US and another in West US.

3. **Data Replication (Cosmos DB / Azure SQL):**
   - Compute is stateless, but data is hard. You cannot have two completely isolated databases.
   - **Azure Cosmos DB:** Native global distribution. You can configure multi-region writes, meaning both East US and West US can write simultaneously, and Cosmos handles the synchronization and conflict resolution.
   - **Azure SQL Database:** You configure **Active Geo-Replication** or **Auto-Failover Groups**. This creates a primary read-write database in East US and a read-only secondary replica in West US. If East US fails, Azure promotes the West US database to primary, and the application resumes writing.

**Common Pitfalls:**
Synchronous replication across regions is physically bounded by the speed of light, introducing significant latency. Therefore, cross-region replication is almost always *asynchronous*. This introduces the concept of **RPO (Recovery Point Objective)**—in a sudden catastrophic failure, you might lose the last few seconds of data that hadn't replicated across the country yet.

---

## Scenario — Question 1

**Q1: You have an Azure App Service that needs to securely access Azure SQL and an Azure Key Vault without storing connection strings or passwords in your code. How do you implement this?**

The most secure way to handle authentication between Azure services is using **Managed Identities** backed by Microsoft Entra ID (formerly Azure AD).

**The Mechanism:**
1. **Enable Managed Identity:** You turn on a "System-assigned managed identity" in your Azure App Service. Azure automatically registers an identity (effectively an invisible service account) for the App Service in Microsoft Entra ID.
2. **Assign Roles (RBAC):** 
   - You go to your Azure SQL Database and run a SQL command to add that specific identity as a database user with `db_datareader` and `db_datawriter` roles.
   - You go to your Azure Key Vault and create an Access Policy (or RBAC assignment) granting that identity "Get" permissions for Secrets.
3. **Connect from Code (.NET):** You use the `DefaultAzureCredential` class from the Azure SDK. 
   - When running locally, `DefaultAzureCredential` uses your personal Visual Studio or Azure CLI login.
   - When deployed to Azure, it automatically detects the App Service's Managed Identity, silently fetches a short-lived OAuth token from Entra ID, and uses that token to authenticate against SQL and Key Vault.

**Why this is the best practice:**
There are absolutely zero passwords, client secrets, or API keys stored in configuration files, environment variables, or source code. If a hacker steals your source code or compromises your config server, they get nothing they can use outside the Azure environment.

---

## Scenario — Question 2

**Q2: You have an Azure Function that processes incoming order files. Occasionally, you receive a massive burst of 100,000 files in a single minute. Processing each file takes 5 seconds and requires significant CPU. You want the system to process these as quickly as possible without crashing, but you don't want to pay for 50 VMs running 24/7. What Azure architecture do you use?**

The most cost-effective and resilient way to handle massive, unpredictable spikes in compute workloads is an **Event-Driven Serverless Architecture**.

**The Architecture:**
1. **Azure Blob Storage:** The incoming files are dropped into a Blob Storage container.
2. **Azure Service Bus (or Storage Queues):** Instead of the Azure Function triggering directly on the Blob upload (which can lead to throttling issues at massive scale), you configure Azure Event Grid to instantly drop a tiny message into a Service Bus Queue every time a blob is created.
3. **Azure Functions (Consumption Plan):** You deploy your processing logic to an Azure Function running on the Serverless Consumption Plan.

**The Mechanism:**
- **Zero Scale:** When there are no files, the Azure Function scales to 0 instances. You pay absolutely nothing for compute.
- **Rapid Scale-Out:** When the burst of 100,000 files hits, the Service Bus queue instantly fills up. Azure's underlying infrastructure (the Scale Controller) detects the massive queue depth and aggressively spins up hundreds of instances of your Azure Function in parallel.
- **Execution:** Each Function instance grabs a message from the queue, processes the specific file, and deletes the message. 
- **Scale-In:** As the queue drains back down to zero, Azure automatically kills off the Function instances.

**Why this is perfect:**
You only pay for the exact milliseconds of CPU time used to process the files. The queue acts as a "shock absorber," ensuring that no matter how many files arrive, the system won't crash—it will just scale out to match the demand and then scale back down to save money.

---

## Scenario — Question 3

**Q3: You are designing a microservices architecture in Azure. Service A communicates with Service B. If Service B is temporarily down or overloaded, you want Service A to retry the request gracefully without failing the entire operation. However, you also want to avoid overwhelming Service B with constant retry attempts when it's already struggling. What Azure messaging service and architectural pattern should you use?**

This scenario requires decoupling the services and implementing a **Queue-Based Load Leveling** pattern with built-in retry mechanics, combined with a **Circuit Breaker** pattern.

**The Architecture:**
1. **Azure Service Bus:** Instead of Service A calling Service B directly via synchronous HTTP (which tightly couples them and forces Service A to fail if B fails), Service A sends a message to an Azure Service Bus Queue.
2. **Asynchronous Processing:** Service B pulls messages from the queue at its own pace.

**The Mechanism:**
- **Dead-Lettering and Retries:** Service Bus natively supports message peek-lock and retries. If Service B processes a message and throws an exception (because a downstream database is locked), the message is safely abandoned and returns to the queue. Service Bus will automatically retry delivery up to a configured `MaxDeliveryCount`. If it repeatedly fails, the message is automatically moved to a **Dead-Letter Queue (DLQ)** for manual inspection, ensuring no data is ever lost.
- **Load Leveling:** If a burst of traffic hits Service A, the queue absorbs the shock. Service B won't be overwhelmed because it only pulls messages as fast as it can process them.
- **Resilience:** If Service B goes completely offline for maintenance, Service A can continue operating normally, writing messages to the queue. When Service B comes back online, it simply processes the backlog.

---

## Scenario — Question 4

**Q4: Your web application hosted on Azure App Service frequently crashes due to a memory leak in a third-party library that you cannot fix. Until the vendor provides a patch, you need a temporary workaround to ensure the application stays online for users. How do you configure Azure App Service to automatically mitigate this?**

You must use **Azure App Service Auto-Heal (Proactive Auto-Heal)**.

**The Solution:**
Auto-Heal is a built-in feature of Azure App Service that automatically takes action when specific unhealthy conditions are met within the worker process.

**The Mechanism:**
1. Navigate to the **Diagnose and solve problems** blade in the Azure Portal for your App Service.
2. Select **Auto-Heal**.
3. **Set the Trigger Condition:** You configure a rule to monitor memory. For example: "If the Private Memory of the `w3wp.exe` (or `dotnet`) process exceeds 800 MB for more than 30 seconds."
4. **Set the Action:** You configure the action to be **Recycle Process**.

**Result:**
When the memory leak causes the application's RAM usage to spike past 800MB, Azure instantly intercepts the metric and automatically recycles the application pool. The process restarts, instantly freeing all leaked memory, before the application ever reaches the point of an `OutOfMemoryException` crash. This ensures minimal disruption to end users while you wait for the permanent code fix.
