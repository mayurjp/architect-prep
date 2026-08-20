## Beginner — Question 1

**Q1: What are the primary compute options in Google Cloud Platform (GCP)?**

GCP provides several compute options depending on how much control you need versus how much management you want Google to handle.

1. **Compute Engine (IaaS):** Highly customizable Virtual Machines (VMs). You have full root access to the OS, but you are responsible for patching, securing, and scaling.
2. **App Engine (PaaS):** A fully managed serverless platform for deploying web applications. You just upload your code, and GCP handles the provisioning, load balancing, and scaling (even to zero).
3. **Cloud Run (Serverless Containers):** A fully managed compute platform that automatically scales stateless containers. You provide a Docker container, and it runs it on demand.
4. **Google Kubernetes Engine / GKE (CaaS - Containers as a Service):** A managed Kubernetes environment for deploying and orchestrating containerized applications. You manage the cluster configuration, Google manages the control plane.

#### Follow-up: When would you choose Cloud Run over App Engine?
While both are serverless, App Engine requires your code to conform to specific supported language runtimes (e.g., Python, Java, Node.js). Cloud Run is language-agnostic because it runs standard Docker containers. If your application requires a custom runtime, specific system libraries, or you simply want to standardize on Docker containers across your organization, Cloud Run is the better choice.

---

## Intermediate — Question 1

**Q1: What is Google Cloud Storage (GCS) and how do its storage classes work?**

Google Cloud Storage (GCS) is GCP's globally scalable, highly durable (11 nines) object storage service. It is the equivalent of Azure Blob Storage or AWS S3.

**Mechanism & Storage Classes:**
Data is stored in "buckets". GCS offers different storage classes based on how frequently you expect to access the data. The less frequently you access it, the cheaper the storage cost, but the higher the access (retrieval) cost.

1. **Standard:** For actively accessed ("hot") data. Lowest access cost, highest storage cost. (e.g., streaming videos, serving website images).
2. **Nearline:** For data accessed less than once a month. (e.g., monthly reporting, recent backups).
3. **Coldline:** For data accessed less than once a quarter. (e.g., disaster recovery archives).
4. **Archive:** For data accessed less than once a year. Lowest storage cost, highest access cost. (e.g., regulatory compliance archives kept for 7 years).

**Common Pitfalls:**
Using Coldline or Archive storage for data you read frequently. Because retrieval costs are significant for cold storage tiers, downloading a file from Archive storage every day will result in a much higher total bill than if it were stored in the Standard tier.

---

## Advanced — Question 1

**Q1: How does Google Cloud Pub/Sub differ from traditional message queues like RabbitMQ?**

Pub/Sub is GCP's fully managed, real-time messaging service. It fundamentally differs from traditional message brokers in its architecture and scaling capabilities.

**The Mechanism of Pub/Sub:**
- It is a globally distributed system designed for massive throughput (gigabytes per second).
- It uses a **Publish/Subscribe** model. Publishers send messages to a *Topic*. Subscribers attach *Subscriptions* to that Topic to receive the messages.
- It is fully serverless. You do not provision clusters, nodes, or instances (unlike RabbitMQ where you must manage the broker).

**Key Differences vs RabbitMQ:**
1. **Routing:** RabbitMQ uses complex routing topologies (exchanges, routing keys, bindings) to route messages to specific queues. Pub/Sub is much simpler: a message published to a topic goes to all attached subscriptions (fan-out). If you need complex routing, you must build it in the subscriber logic.
2. **Ordering:** RabbitMQ natively guarantees FIFO (First-In-First-Out) ordering within a single queue. Historically, Pub/Sub did not guarantee ordering (messages could arrive out of order or multiple times). While Pub/Sub now supports "Message Ordering" via ordering keys, it requires careful architectural design to avoid head-of-line blocking.
3. **Delivery Guarantees:** Pub/Sub guarantees **at-least-once** delivery. This means a subscriber might receive the same message twice due to network retries.

#### Follow-up: How do you handle "at-least-once" delivery in a subscriber?
Because a message might arrive multiple times, the subscriber application must be **idempotent**. This means that processing the same message twice must have the same final effect on the system as processing it once (e.g., using a database UPSERT instead of an INSERT, or checking a unique Message ID against a cache before processing).

---

## Scenario — Question 1

**Q1: You are designing a globally distributed application that requires a strictly consistent, relational database that can scale horizontally across continents without sharding logic in your application. What GCP service do you use?**

You would choose **Cloud Spanner**.

**Why Cloud Spanner is unique:**
Traditionally, if you wanted the strict ACID guarantees and relational structure (SQL) of a database like PostgreSQL, you had to scale vertically (buying a bigger server). If you wanted to scale horizontally across thousands of servers globally, you had to abandon SQL and use a NoSQL database like Cassandra (giving up strict consistency and joins).

Cloud Spanner bridges this gap. It is a globally distributed, highly available, strictly consistent relational database. 

**The Mechanism:**
It achieves this seemingly impossible feat using Google's **TrueTime API**. TrueTime uses atomic clocks and GPS receivers in Google's data centers to provide highly synchronized global time with bounded uncertainty. This allows Spanner nodes across the world to agree on the exact order of distributed transactions without requiring expensive, slow network consensus protocols for every write.

---

## Scenario — Question 2

**Q2: Your team deployed a web application to Google Kubernetes Engine (GKE). The application needs to securely access a Cloud SQL database and read files from Cloud Storage. The junior developer suggests creating a Service Account, generating a JSON key file, and embedding it as a Kubernetes Secret. Why is this a bad practice in GCP, and what is the modern, secure alternative?**

Generating and distributing long-lived JSON Service Account keys is a major security risk. If that key is accidentally committed to source control or leaked, anyone can access your database and storage buckets.

**The Solution: Workload Identity**
GCP provides a feature called **Workload Identity** specifically for this scenario. It allows a Kubernetes service account (KSA) to act as a Google service account (GSA) without needing to download any key files.

**The Mechanism:**
1. You create a Google Service Account (GSA) in IAM and grant it permissions to access Cloud SQL and GCS.
2. You create a Kubernetes Service Account (KSA) in your GKE cluster.
3. You bind the KSA to the GSA using IAM policies (a process called "annotating").
4. You configure your Pod deployment to run as the KSA.

**Result:**
When the code running inside the Pod uses the standard Google Cloud SDK, the SDK automatically detects the Workload Identity environment. It silently requests short-lived, ephemeral access tokens directly from the GCP metadata server. No long-lived keys ever touch the disk or Kubernetes secrets, entirely eliminating the risk of a leaked key file.

---

## Scenario — Question 3

**Q3: You have a Cloud Run service processing user uploads. To save costs, it scales down to zero instances when traffic stops. However, when a new user hits the service after a period of inactivity, the request takes 8 seconds (a "cold start"), leading to a poor user experience. How do you mitigate this cold start latency?**

Serverless platforms like Cloud Run (and Cloud Functions) scale to zero, which saves money but introduces latency when the platform must provision a new container from scratch.

**The Causes of Cold Starts:**
1. **Infrastructure Provisioning:** GCP must allocate a VM, pull your Docker image from the registry, and start the container.
2. **Application Initialization:** Your code must start up (e.g., establishing database connection pools, JIT compiling, loading configuration).

**The Mitigations:**
1. **Minimum Instances:** The most robust solution is to configure a minimum number of instances (e.g., `--min-instances 1`). Cloud Run will keep at least one container running and ready to serve traffic at all times, completely eliminating cold starts (though you pay for that instance even when idle).
2. **Optimize Application Startup:** If you must scale to zero, optimize the code. Defer heavy initialization (like loading large machine learning models) until it's strictly needed, or use a lighter runtime (e.g., Go or Native AOT in .NET instead of a heavy Java/Spring Boot container).
3. **CPU Allocation:** In Cloud Run, CPU is typically only allocated *during* a request. Ensure you aren't doing heavy background work during startup that gets throttled. (Note: Cloud Run now supports "CPU always allocated," which is required if you use minimum instances to keep background threads alive).

---

## Scenario — Question 4

**Q4: You have an App Engine application that connects to a Cloud SQL database using a public IP address. The security team mandates that all database traffic must remain strictly on Google's internal network and cannot traverse the public internet. However, App Engine is a serverless product without a standard VPC attachment. How do you secure this connection?**

Serverless platforms in GCP (like App Engine and Cloud Run) run in Google's managed tenant network, not your custom Virtual Private Cloud (VPC), making private connections tricky by default.

**The Solution: Serverless VPC Access**

You must bridge the gap between Google's serverless environment and your private VPC network.

**The Mechanism:**
1. **Remove Public IP:** You configure the Cloud SQL instance to only have a Private IP address within your VPC (e.g., `10.0.0.5`).
2. **Serverless VPC Access Connector:** You provision a Serverless VPC Access Connector in your VPC. This connector provisions a small cluster of internal VMs that act as a bridge.
3. **Egress Configuration:** You configure your App Engine `app.yaml` (or Cloud Run service) to route its outbound traffic (egress) through this Connector.
4. **The Flow:** When your App Engine code connects to `10.0.0.5`, the traffic flows from the serverless environment, through the Connector, directly into your VPC, and hits the Cloud SQL instance without ever touching the public internet. This satisfies strict enterprise security and compliance requirements.
