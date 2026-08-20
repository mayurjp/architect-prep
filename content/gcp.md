# Google Cloud Platform — Q&A

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

---

## Beginner — Question 2

**Q2: How does GCP's IAM resource hierarchy (Organization → Folder → Project → Resource) work, and how does policy inheritance flow through it?**

GCP structures every resource into a strict hierarchy, and IAM policies (who can do what) attach at any level and flow **downward** — a policy granted higher up the tree automatically applies to everything beneath it.

**The hierarchy:**
```text
Organization (e.g., "mycompany.com")
  └─ Folder ("Engineering")
       └─ Folder ("Production")
            └─ Project ("payments-prod")
                 └─ Resource (a specific Cloud SQL instance, GCS bucket, etc.)
```

**Policy inheritance in action:**
```bash
# Grant a role at the Folder level
gcloud resource-manager folders add-iam-policy-binding FOLDER_ID \
  --member="group:sre-team@mycompany.com" \
  --role="roles/compute.admin"
```
Every project nested under that Folder — and every resource within those projects — automatically inherits `sre-team`'s `compute.admin` access, without anyone needing to grant it again at the Project level. This is deliberate: broad, org-wide access decisions (e.g., "the security team can read audit logs everywhere") belong at the Organization or Folder level; narrow, specific access ("this one contractor can deploy to this one dev project") belongs at the Project or Resource level.

**Combining policies is always additive, never restrictive:** if a Project grants `roles/viewer` to a user and its parent Folder separately grants `roles/editor` to that same user, the **effective** permission is the union of both (Editor, since it's the broader one) — there is no IAM mechanism to *deny* or narrow a permission granted higher up the hierarchy from a lower level.

**Common Pitfall:** granting broad roles at the Organization level "for convenience" — because inheritance flows downward unconditionally, an overly broad Organization-level grant (e.g., `roles/owner` to an entire team) silently gives that access to every current *and future* project in the entire company, including ones that don't exist yet. The principle of least privilege pushes you toward granting roles as low in the hierarchy as practical, and using Folders to group projects that genuinely should share the same broad access.

---

## Intermediate — Question 2

**Q2: What is BigQuery, and how does it differ architecturally from Cloud SQL?**

Both are GCP's managed SQL-query services, but they're built for opposite workload shapes — Cloud SQL for transactional (OLTP) workloads, BigQuery for analytical (OLAP) workloads over massive datasets.

**Cloud SQL — a managed row-oriented relational database (MySQL/PostgreSQL/SQL Server):**
```sql
-- Fast for a single-row lookup/update, exactly like on-prem SQL Server
UPDATE Orders SET Status = 'Shipped' WHERE OrderId = 12345;
```
Optimized for many small, fast transactions touching few rows at a time — the same workload shape SQL Server or PostgreSQL handles on any traditional application backend.

**BigQuery — a serverless, columnar data warehouse:**
```sql
-- Scans billions of rows across petabytes, aggregating -- BigQuery's actual sweet spot
SELECT category, SUM(revenue) AS total_revenue
FROM `my-project.sales.orders`
WHERE order_date BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY category
ORDER BY total_revenue DESC;
```
**Columnar storage** means BigQuery only reads the specific columns referenced in a query (`category`, `revenue`, `order_date`) rather than entire rows — for a wide table with 200 columns, an aggregation query touching 3 columns reads roughly 3/200ths of the data volume a row-oriented engine like Cloud SQL would have to scan.

**Key architectural differences:**
- **Serverless, no instance to manage:** you don't provision CPU/RAM for BigQuery — you just run queries, and Google's infrastructure allocates massively parallel compute behind the scenes. Cloud SQL requires you to size and manage an actual instance.
- **Pricing model:** BigQuery bills primarily by *bytes scanned per query* (or a flat-rate slot reservation), not by uptime — running no queries costs nothing beyond storage. Cloud SQL bills for the instance being up, regardless of query volume.
- **No row-level transactions:** BigQuery has no equivalent of `UPDATE ... WHERE OrderId = 12345` performance — updating a single row means rewriting the entire columnar block it lives in, making BigQuery a poor fit for OLTP-style single-row mutations.

**Common Pitfall:** running a dashboard's live, per-request queries directly against BigQuery instead of Cloud SQL/a cache — even a "fast" BigQuery query has meaningfully higher fixed latency (often hundreds of milliseconds to seconds) than an indexed Cloud SQL lookup, because it's architected for scanning huge volumes efficiently, not for sub-10ms point lookups.

---

## Advanced — Question 2

**Q2: What is the difference between GKE Standard and GKE Autopilot modes?**

Both are Google Kubernetes Engine, but they represent different points on the "how much of the cluster do you want to manage yourself" spectrum.

**GKE Standard — you manage the node pools:**
```bash
gcloud container clusters create my-cluster \
  --num-nodes=3 \
  --machine-type=e2-standard-4 \
  --enable-autoscaling --min-nodes=3 --max-nodes=10
```
You choose the VM machine types, node pool sizing, and are billed for the underlying Compute Engine VMs whether or not Pods are actually scheduled on them at full capacity — you're responsible for right-sizing nodes to your workloads' actual resource requests.

**GKE Autopilot — Google manages the nodes entirely:**
```bash
gcloud container clusters create-auto my-cluster --region=us-central1
```
You never see or configure a node pool at all. You just deploy Pods with resource requests, and Google provisions exactly the compute needed underneath, billing you **per Pod resource request** (vCPU/memory/storage actually requested by your workloads) rather than per underlying VM.

**The practical trade-offs:**
- **Autopilot removes node-level operational burden entirely** — no capacity planning, no worrying about bin-packing efficiency, no manually patching node OS images — at the cost of some configuration flexibility (certain privileged workloads, DaemonSets, and custom node-level configurations aren't available).
- **Standard mode is required when you need node-level control** — custom node OS configurations, specific GPU/TPU node pools with fine-grained control, DaemonSets needing host-level access, or workloads with unusual resource shapes Autopilot's bin-packing doesn't handle well.
- **Billing philosophy differs fundamentally:** Standard bills for provisioned VM capacity (which can sit partially idle if you over-provision); Autopilot bills only for what Pods actually request, which can be cheaper for spiky/uneven workloads but potentially pricier for workloads that pack very efficiently onto Standard nodes already.

**Common Pitfall:** choosing Autopilot for a workload that genuinely needs DaemonSets (e.g., a custom node-level logging/monitoring agent) — Autopilot's restricted feature set doesn't support certain DaemonSet patterns the way Standard mode does, requiring a mode switch (which means recreating the cluster) once the limitation is discovered mid-project.

---

## Scenario — Question 5

**Q5: Your team needs to deploy identical infrastructure (a GKE cluster, Cloud SQL instance, and VPC) across three environments — dev, staging, and prod — on GCP. Manually clicking through the Console for each environment has already caused configuration drift between staging and prod, and a bug that only reproduces in prod slipped through staging. How do you fix this?**

This is the classic Infrastructure-as-Code problem, and on GCP the standard solution is **Terraform** with environment-specific variable files sharing one common module.

**The Mechanism — one module, parameterized per environment:**
```hcl
# modules/gke-cluster/main.tf -- the shared, reusable definition
variable "environment" {}
variable "node_count" {}
variable "machine_type" {}

resource "google_container_cluster" "primary" {
  name     = "app-cluster-${var.environment}"
  location = "us-central1"
  initial_node_count = var.node_count
  node_config {
    machine_type = var.machine_type
  }
}
```

```hcl
# environments/staging/main.tf
module "gke" {
  source       = "../../modules/gke-cluster"
  environment  = "staging"
  node_count   = 2
  machine_type = "e2-standard-2"
}

# environments/prod/main.tf
module "gke" {
  source       = "../../modules/gke-cluster"
  environment  = "prod"
  node_count   = 5
  machine_type = "e2-standard-4"
}
```
Both environments deploy from the **exact same underlying module** — the only differences (replica count, machine size) are explicit, reviewable variables, rather than staging and prod silently diverging because someone clicked a different dropdown in the Console six months ago.

**Detecting drift going forward:**
```bash
terraform plan -var-file=environments/prod.tfvars
# If prod's actual state differs from the Terraform config (someone manually changed
# something in the Console), `plan` shows exactly what would change to reconcile it
```
Running `terraform plan` regularly (or in a scheduled CI job) surfaces drift *before* it causes a staging/prod mismatch — any manual Console change shows up as a pending diff the next time someone runs Terraform.

**The process fix, not just the tooling fix:** pair this with revoking Console write access for engineers in staging/prod projects (leaving only Terraform's service account with deploy permissions) — Terraform alone doesn't prevent drift if people can still bypass it by clicking around in the Console; the tooling has to be the *only* path to making changes for drift-freedom to actually hold.

---
