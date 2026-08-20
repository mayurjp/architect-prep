# Kubernetes — Q&A

## Beginner — Question 1

**Q1: What are the core components of Kubernetes (Pods, Deployments, Services)?**

Kubernetes (K8s) is an open-source container orchestration system. It manages clusters of nodes (servers) to run containerized applications.

1. **Pod:** The smallest, most basic deployable object in Kubernetes. A Pod represents a single instance of a running process. While it usually contains one container (e.g., a single Docker container running your web API), it can contain multiple tightly-coupled containers that share the same network IP and storage volumes.
2. **Deployment:** You rarely create Pods directly. Instead, you create a Deployment. A Deployment acts as a manager—you define a desired state (e.g., "I want 3 replicas of the web API Pod running version 2.0"). The Deployment Controller ensures that the actual state matches the desired state. If a node crashes and a Pod dies, the Deployment spins up a new one.
3. **Service:** Pods are ephemeral; they die and get recreated with new IP addresses constantly. A Service provides a stable, permanent IP address and DNS name that routes traffic to a dynamic set of Pods (usually selected via labels). It acts as a permanent internal load balancer.

#### Follow-up: What is a ReplicaSet?
A ReplicaSet is the underlying object created by a Deployment that actually manages the number of running Pods. When you update a Deployment to a new container image, it creates a *new* ReplicaSet, scales it up, and scales the old ReplicaSet down. This allows for zero-downtime rolling updates and easy rollbacks.

---

## Intermediate — Question 1

**Q1: How do you inject configuration and sensitive data into a Kubernetes Pod?**

Kubernetes separates configuration from the container image, making applications more portable and secure using **ConfigMaps** and **Secrets**.

**ConfigMap:**
- Used to store non-confidential data in key-value pairs.
- Can be injected into a Pod in two ways:
  1. **Environment Variables:** Setting `ASPNETCORE_ENVIRONMENT` or connection string variables.
  2. **Mounted Volumes:** Mounting the ConfigMap as a file in the container's filesystem (useful for JSON/YAML config files).

**Secret:**
- Used to store confidential data, such as passwords, OAuth tokens, and SSH keys.
- Operates similarly to ConfigMaps (can be environment variables or mounted files) but the data is encoded in Base64 within the manifest.
- **The Mechanism:** When a Secret is mounted into a Pod, it is stored in `tmpfs` (RAM) on the node, not written to the physical disk.

**Common Pitfalls:**
Base64 encoding is *not* encryption. Anyone who can read the Secret object in Kubernetes can decode it. In production, you should encrypt Secrets at rest in `etcd`, or better yet, use an external secrets manager like Azure Key Vault or HashiCorp Vault integrated via the CSI Secret Store provider.

---

## Advanced — Question 1

**Q1: Explain the difference between a ClusterIP, NodePort, LoadBalancer, and an Ingress.**

These are all methods used to expose an application running in Kubernetes to network traffic.

1. **ClusterIP (Default):**
   - Exposes the Service on a cluster-internal IP. 
   - The Service is only reachable from *within* the cluster.
   - **Use case:** Internal microservices communicating with each other (e.g., Web API talking to an internal database).

2. **NodePort:**
   - Exposes the Service on each Node's IP at a static port (between 30000-32767).
   - You can contact the service from outside the cluster by requesting `<NodeIP>:<NodePort>`.
   - **Use case:** Rarely used in production directly because you have to manage IPs and firewall rules manually.

3. **LoadBalancer:**
   - Exposes the Service externally using a cloud provider's physical load balancer (e.g., Azure Load Balancer).
   - It automatically creates a NodePort and ClusterIP underneath.
   - **Use case:** Exposing a single service directly to the internet. However, giving every microservice its own dedicated Cloud Load Balancer becomes very expensive.

4. **Ingress:**
   - **Not a Service type.** It is a completely separate API object that sits in front of multiple Services.
   - It acts as a smart router/reverse proxy (usually powered by NGINX or Traefik running inside the cluster).
   - **Mechanism:** You point a single Cloud Load Balancer (one public IP) to the Ingress Controller. The Ingress object then defines HTTP routing rules based on hostnames or URL paths to direct traffic to internal ClusterIP services.
   - **Use case:** Exposing multiple web applications over a single IP address, handling SSL/TLS termination, and path-based routing (e.g., `example.com/api` goes to API Service, `example.com/web` goes to Web Service).

---

## Scenario — Question 1

**Q1: How do you achieve zero-downtime deployments in Kubernetes, and what role do Readiness and Liveness probes play?**

Zero-downtime deployments ensure that a new version of your application is deployed without dropping a single HTTP request from end users.

**The Mechanism (Rolling Updates):**
When you update a Deployment to a new image (e.g., `v2`), Kubernetes executes a **Rolling Update**:
1. It creates a new ReplicaSet for `v2`.
2. It spins up a `v2` Pod.
3. Once the `v2` Pod is confirmed "ready", it terminates one of the old `v1` Pods.
4. It repeats this process one by one until all `v1` Pods are replaced by `v2` Pods.

**The Critical Role of Probes:**
If Kubernetes blindly assumes a Pod is ready the moment the container starts, it will route traffic to the `v2` Pod while the .NET runtime is still booting up, causing `502 Bad Gateway` errors for users. Probes prevent this.

- **Readiness Probe:** A health check (e.g., hitting the `/health/ready` endpoint). Kubernetes will *not* route any traffic to the Pod from a Service until the Readiness Probe returns HTTP 200. During a rolling update, the old Pod is kept alive and taking traffic until the new Pod's Readiness Probe succeeds.
- **Liveness Probe:** A heartbeat check. Once the application is running, Kubernetes periodically hits the `/health/live` endpoint. If the application deadlocks or runs out of memory and the probe fails multiple times, Kubernetes will forcefully restart the container.

---

## Scenario — Question 2

**Q2: Your new deployment went live, but the new Pods are constantly restarting and never becoming fully active. When you run `kubectl get pods`, their status is `CrashLoopBackOff`. How do you figure out what went wrong?**

`CrashLoopBackOff` means the container starts, immediately crashes, and Kubernetes tries to restart it again, but with an exponentially increasing delay (backoff). This is almost always an application-level fatal error on startup.

**The Troubleshooting Steps:**
1. **Check the logs of the current crashing container:** 
   Run `kubectl logs <pod-name>`. 
   *If the container crashes too fast, the logs might be empty.*
2. **Check the logs of the PREVIOUS crashed container:** 
   This is the most critical step. Run `kubectl logs <pod-name> --previous`. This will show you the exact stack trace or error message that caused the container to die moments ago. Common culprits in .NET include a bad database connection string, a missing configuration value, or a failed Entity Framework database migration on startup.
3. **Check the Kubernetes Events:** 
   Run `kubectl describe pod <pod-name>`. Scroll to the "Events" section at the bottom. This will tell you if Kubernetes itself killed the pod.
   - For example, if it says `OOMKilled` (Out Of Memory), it means your application exceeded the memory limit defined in the Deployment manifest, and the Linux kernel forcefully terminated the process.
   - If it says `Liveness probe failed`, it means your application technically started, but it failed to respond to the health check endpoint in time, so Kubernetes killed it assuming it was deadlocked.

---

## Scenario — Question 3

**Q3: Your application processes background jobs. You need to ensure that when a node crashes, the jobs are restarted on another node. However, you also need to ensure that when Kubernetes scales down the application (removes a Pod), it doesn't kill a Pod right in the middle of processing a critical 5-minute job. How do you handle graceful shutdown in Kubernetes?**

Kubernetes is a highly dynamic environment; Pods can be terminated at any moment due to scaling, updates, or node maintenance. Your application must be designed to shut down gracefully.

**The Mechanism:**
1. **The SIGTERM Signal:** When Kubernetes decides to terminate a Pod, it doesn't just instantly kill it. First, it sends a `SIGTERM` (Signal Terminate) to the main process inside the container (PID 1).
2. **Application Handling (.NET):** ASP.NET Core natively listens for `SIGTERM`. When it receives it, it fires the `IHostApplicationLifetime.ApplicationStopping` event. 
3. **Wait for Completion:** In your background worker (`BackgroundService`), you check the `CancellationToken` (which is triggered by the `SIGTERM`). If cancellation is requested, your code must stop pulling *new* jobs from the queue, but it should finish processing the *current* job before exiting the method.
4. **The Grace Period:** Kubernetes waits for a specific duration (default 30 seconds, configured via `terminationGracePeriodSeconds` in the Pod spec). If your application finishes its current job and exits with code 0 before the 30 seconds are up, great.
5. **The SIGKILL Signal:** If your application is still running after the 30-second grace period (e.g., the job takes 5 minutes), Kubernetes loses patience and sends a `SIGKILL` (Signal Kill), which violently terminates the process immediately, regardless of what it's doing.

**The Fix for Long Jobs:**
If your jobs take 5 minutes, you must increase the `terminationGracePeriodSeconds` in your Deployment YAML to something like `360` (6 minutes). This guarantees the application has enough time to gracefully finish its current work after receiving the `SIGTERM` before Kubernetes brings down the hammer.

---

## Beginner — Question 2

**Q2: What is a Kubernetes namespace, and what are the built-in resource limit mechanisms tied to it?**

A Namespace is a virtual partition within a single physical cluster, letting you organize and isolate groups of resources (Pods, Services, ConfigMaps) — most commonly one per team, environment, or application.

**Creating and using a namespace:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: payments-team
```
```bash
kubectl apply -f namespace.yaml
kubectl get pods --namespace=payments-team
```
Resources in different namespaces are isolated by *name* (two namespaces can each have their own `Deployment` named `order-service` without colliding) but **not** isolated at the network level by default — a Pod in `payments-team` can still reach a Service in `search-team` by its fully-qualified DNS name (`service-name.search-team.svc.cluster.local`) unless a `NetworkPolicy` explicitly restricts it.

**Resource limits tied to a namespace — `ResourceQuota`:**
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: payments-team
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    pods: "50"
```
This caps the *total* CPU/memory/Pod count the entire namespace can consume across all its workloads combined — preventing one team's runaway deployment from starving the whole cluster.

**Per-Pod defaults — `LimitRange`:**
```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: payments-team
spec:
  limits:
    - default: { cpu: "500m", memory: "256Mi" }        # applied if a Pod spec omits limits
      defaultRequest: { cpu: "250m", memory: "128Mi" }  # applied if a Pod spec omits requests
      type: Container
```
This ensures every container gets *some* resource request/limit even if a developer forgets to specify one in their Deployment manifest, preventing an unbounded container from silently consuming an entire node's resources.

**Common Pitfall:** assuming namespaces provide security isolation by default — without an explicit `NetworkPolicy`, any Pod in the cluster can reach any Service in any other namespace. Namespaces are an *organizational* boundary out of the box, not a *security* boundary, until you deliberately lock down traffic.

---

## Intermediate — Question 2

**Q2: What is a Kubernetes `Job` and `CronJob`, and how do they differ from a `Deployment`?**

A `Deployment` is built for **long-running** processes that should always be up (a web API). `Job` and `CronJob` are built for **run-to-completion** workloads — work that finishes and should not be restarted just because it exited.

**`Job` — run something to completion, exactly (or at-least) once:**
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  backoffLimit: 3            # retry up to 3 times on failure, then give up
  template:
    spec:
      restartPolicy: Never   # Jobs cannot use "Always" -- that's what Deployments are for
      containers:
        - name: migrator
          image: myregistry/order-service-migrator:1.4.2
          command: ["dotnet", "ef", "database", "update"]
```
Unlike a `Deployment`, Kubernetes considers this workload "done" once the container exits with code `0` — it does **not** restart a successfully-completed Pod, only a *failed* one (up to `backoffLimit` times).

**`CronJob` — run a `Job` on a recurring schedule:**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-billing
spec:
  schedule: "0 0 * * *"              # standard cron syntax -- midnight every day
  concurrencyPolicy: Forbid          # don't start a new run if the previous one is still going
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: billing-job
              image: myregistry/billing-batch:2.1.0
```
`concurrencyPolicy: Forbid` is the key safety net for a job like nightly billing — if last night's run is somehow still executing when the next scheduled time arrives, Kubernetes skips starting a new one instead of running two billing jobs concurrently (the same distributed-double-execution problem a Redis-based distributed lock solves for a `Deployment`-based scheduled task, but built directly into the primitive here).

**Common Pitfall:** using a `Deployment` with `replicas: 1` for a batch job "because it only needs to run once" — a `Deployment`'s entire purpose is to keep its Pod *continuously running*; if the batch job's process exits successfully (code 0), the Deployment considers that a crash and immediately restarts it, causing the job to run in an infinite loop. `Job`/`CronJob` exist specifically to express "this should run to completion and then genuinely stop."

---

## Advanced — Question 2

**Q2: How does the Horizontal Pod Autoscaler (HPA) work, and what's the difference between scaling on CPU vs. custom metrics?**

The HPA automatically adjusts the number of replicas in a `Deployment` based on observed load, so you don't manually run `kubectl scale` during a traffic spike.

**Scaling on built-in CPU metrics:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70   # scale up if average CPU across pods exceeds 70% of its request
```
**The Mechanism:** the HPA controller polls the Metrics Server every ~15 seconds, computes `desiredReplicas = ceil(currentReplicas × currentMetric / targetMetric)`, and adjusts the Deployment's replica count accordingly — gradually, with built-in cooldown windows to prevent rapid flapping up and down.

**Why CPU alone is often the wrong signal:** a .NET API doing mostly I/O-bound work (waiting on a database or downstream HTTP call) can have a growing request queue and rising latency while CPU usage stays comfortably low — CPU-based scaling would never trigger, even though the service is genuinely falling behind.

**Scaling on custom/external metrics instead:**
```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_in_flight   # exposed via Prometheus Adapter from your app's own metrics
      target:
        type: AverageValue
        averageValue: "50"              # scale up if avg in-flight requests per pod exceeds 50
```
This requires a **metrics adapter** (like the Prometheus Adapter) translating your application's own exported metrics (queue depth, in-flight requests, custom business metrics) into a form the HPA controller can consume — letting you scale on the signal that actually reflects load for *your* workload, not a generic proxy for it.

**Common Pitfall:** setting `minReplicas` too low for a service with a slow cold start (JIT warm-up, EF Core model building) — if traffic spikes faster than new Pods can become "Ready" (pass their readiness probe), the existing Pods get overwhelmed before the HPA's scale-up has actually finished taking effect, since new replicas take real wall-clock time to start and warm up, not just to be scheduled.

---

## Beginner — Question 3

**Q3: What is a Kubernetes `Secret`, and what does "encoded, not encrypted" actually mean about how it's stored?**

A `Secret` is a Kubernetes object for storing sensitive data (passwords, tokens, TLS certificates) separately from a Pod's own configuration/image — but it's important to understand precisely what protection it does and doesn't provide by default.

**Creating and mounting a Secret:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  password: cGFzc3dvcmQxMjM=   # this is Base64("password123") -- NOT encrypted
```
```yaml
containers:
  - name: api
    envFrom:
      - secretRef:
          name: db-credentials
```

**What "encoded, not encrypted" means concretely:** the `data` field's values are Base64-encoded, a reversible, non-secret encoding scheme — `echo cGFzc3dvcmQxMjM= | base64 -d` instantly reveals `password123`. Base64 exists here purely so the YAML can represent arbitrary binary data as text, **not** as a security mechanism; anyone with read access to the Secret object (via `kubectl get secret db-credentials -o yaml`) can trivially decode it.

**Where actual protection comes from:**
- **RBAC** — restricting *who* can read Secret objects in the first place is the primary real defense, not the Base64 encoding itself.
- **Encryption at rest in `etcd`** — Kubernetes supports (but doesn't enable by default in every distribution) encrypting Secret data within `etcd`'s own storage, protecting against someone gaining direct access to the underlying `etcd` data files.
- **External secret managers** — mounting secrets from Azure Key Vault or HashiCorp Vault via a CSI driver keeps the actual secret value out of `etcd`/Kubernetes objects entirely, with Kubernetes only holding a reference to fetch it dynamically.

**Common Pitfall:** treating a Kubernetes `Secret` as sufficiently protected purely because it's a different object `kind` than a `ConfigMap` — without RBAC restrictions and/or etcd encryption at rest actually configured, a `Secret` provides essentially the same protection as a `ConfigMap` against anyone who already has cluster read access; the "Secret" naming describes intent, not an automatic security guarantee.

---

## Intermediate — Question 3

**Q3: What is a Kubernetes `StatefulSet`, and why can't a plain `Deployment` handle workloads like a database cluster?**

A `Deployment` treats its Pods as interchangeable, disposable replicas — any Pod can be killed and replaced by an identical one at any time, with no notion of individual Pod identity. A `StatefulSet` exists specifically for workloads where each replica needs a **stable, unique identity** and **stable, persistent storage** tied to that specific identity — exactly what a database cluster needs and a stateless web API doesn't.

**What a `Deployment` can't guarantee:**
```text
Deployment "web-api" with 3 replicas:
  web-api-7d9f8b-x4k2p, web-api-7d9f8b-m9q1r, web-api-7d9f8b-z8t3w
  -- random suffixes, no ordering, any pod can be replaced by a NEW pod with a DIFFERENT name
```
For a stateless API, this is fine — every replica is identical and interchangeable. For a database cluster where "node 0 is the primary, nodes 1-2 are replicas," it's not.

**What a `StatefulSet` provides instead:**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: postgres }
spec:
  serviceName: postgres
  replicas: 3
  volumeClaimTemplates:
    - metadata: { name: data }
      spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "10Gi" } } }
```
```text
Resulting Pods: postgres-0, postgres-1, postgres-2
-- stable, PREDICTABLE names (not random suffixes)
-- postgres-0's PersistentVolumeClaim ALWAYS reattaches to a recreated postgres-0, never to postgres-1
-- Pods are created/scaled/terminated in ORDER (0, then 1, then 2), not all simultaneously
```
If `postgres-1` crashes and is recreated, it comes back as `postgres-1` again, with the *same* persistent volume it had before — a plain `Deployment`'s replacement Pod would get a brand-new random name and (without extra configuration) potentially a fresh, empty volume, which is catastrophic for a database node expecting its data to still be there.

**Common Pitfall:** using a `Deployment` with a shared `PersistentVolumeClaim` across multiple replicas as a workaround for stateful workloads — most storage backends don't support multiple Pods writing to the same volume concurrently in a safe way (`ReadWriteOnce` access mode explicitly forbids it), making this a data-corruption risk rather than a genuine substitute for `StatefulSet`'s per-replica volume model.

---

## Advanced — Question 3

**Q3: What is a Kubernetes Admission Webhook, and how does it differ from RBAC in what it can enforce?**

RBAC answers "is this user/service account *allowed* to perform this action at all" (a yes/no permission check). An Admission Webhook runs **after** RBAC authorization succeeds but **before** an object is actually persisted to `etcd`, letting you validate or even mutate the object's *content* — enforcing rules RBAC has no concept of, like "every Pod must declare resource limits" or "images must come from our approved registry."

**Validating Admission Webhook — reject an object that violates a policy:**
```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata: { name: require-resource-limits }
webhooks:
  - name: require-limits.mycompany.com
    clientConfig:
      service: { name: policy-webhook-service, namespace: policy-system, path: "/validate" }
    rules:
      - operations: ["CREATE"]
        apiGroups: ["apps"]
        resources: ["deployments"]
```
The referenced webhook service receives the incoming Deployment object, inspects it (e.g., checking every container has `resources.limits` set), and returns an allow/deny decision — a user with full RBAC permission to create Deployments can still have their specific Deployment rejected here for violating the resource-limits policy, something RBAC itself has no mechanism to express (RBAC only knows about verbs and resource types, not the *content* of the object being created).

**Mutating Admission Webhook — silently modify an object before it's stored:**
```text
A Pod is submitted without a "team" label
    -> Mutating webhook intercepts it
    -> automatically injects labels: { team: "unspecified", cost-center: "shared" }
    -> the object that actually gets stored in etcd already has these labels added
```
This is how tools like Istio's automatic sidecar injection work — a Pod submitted with no awareness of the service mesh gets an Envoy sidecar container silently added to its spec by a mutating webhook before it's ever actually scheduled.

**Why this matters architecturally:** admission webhooks are the mechanism behind policy-as-code tools like OPA Gatekeeper and Kyverno — letting platform teams enforce organization-wide standards (mandatory labels, banned image registries, required security contexts) uniformly across every team's Kubernetes manifests, at the API server level, rather than relying on every team remembering to follow a written convention.

**Common Pitfall:** deploying a validating/mutating webhook without a correctly configured `failurePolicy` — if the webhook service itself becomes unavailable, `failurePolicy: Fail` (the safer default for security-critical policies) blocks *all* matching object creation cluster-wide until the webhook recovers, which can cause a wider outage than the policy violation it was meant to prevent if the webhook's own reliability isn't held to a very high standard.

---
