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
