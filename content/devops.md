## Beginner — Question 1

**Q1: What is the difference between Continuous Integration (CI) and Continuous Deployment (CD)?**

CI and CD form the backbone of modern DevOps pipelines, automating the building, testing, and release of software.

1. **Continuous Integration (CI):** The practice of automating the integration of code changes from multiple contributors into a single software project.
   - **Mechanism:** When a developer pushes a commit to a branch (or opens a Pull Request), a CI server (e.g., GitHub Actions, Azure Pipelines) automatically triggers a build. It restores dependencies, compiles the code, and runs all unit tests.
   - **Goal:** To detect integration errors as quickly as possible. If the code doesn't compile or tests fail, the build turns "red," and the developer is notified immediately.

2. **Continuous Deployment / Delivery (CD):** The automated process of pushing the successfully built code into environments (Testing, Staging, Production).
   - **Continuous Delivery:** Code is automatically built and prepared for a release to production, but the actual deployment requires a *manual human approval* (a button click).
   - **Continuous Deployment:** Every change that passes the automated tests in the CI pipeline is deployed to production *automatically*, with absolutely no human intervention.
   - **Goal:** To get new features and bug fixes into the hands of users rapidly and safely.

---

## Intermediate — Question 1

**Q1: What is Infrastructure as Code (IaC) and why is it important?**

Infrastructure as Code (IaC) is the practice of managing and provisioning computing infrastructure through machine-readable definition files, rather than through physical hardware configuration or interactive configuration tools (like clicking through the Azure Portal).

**The Mechanism:**
Instead of a human logging into the Azure Portal and clicking "Create Web App," a developer writes a declarative file (using ARM Templates, Bicep, or HashiCorp Terraform). This file states exactly what resources should exist.
The IaC tool evaluates the file against the current state of the cloud provider. If the resource doesn't exist, it creates it. If it exists but differs from the file, it updates it.

**Why it's important:**
1. **Version Control:** Infrastructure changes can be committed to Git, reviewed via PRs, and rolled back just like application code.
2. **Consistency (Idempotency):** Applying the same script 100 times yields the exact same environment. It eliminates "Configuration Drift" where the Staging environment subtly diverges from Production over time due to manual tweaks.
3. **Disaster Recovery:** If an entire cloud region goes down, you can execute your IaC scripts against a new region and rebuild your entire architecture in minutes.

#### Follow-up: What is the difference between Imperative and Declarative IaC?
- **Imperative (e.g., Bash scripts, Azure CLI commands):** You write explicit commands specifying *how* to achieve the desired state (e.g., "Run create VM command, then run attach disk command"). It is harder to maintain because you must handle error states and retries.
- **Declarative (e.g., Terraform, Bicep):** You declare *what* the final state should be (e.g., "I want a VM with this specific disk"). The tool figures out the sequence of API calls required to make reality match your declaration.

---

## Advanced — Question 1

**Q1: Explain Blue-Green Deployments and Canary Releases.**

These are two advanced CD deployment strategies designed to minimize downtime and reduce risk when deploying new versions to production.

1. **Blue-Green Deployment:**
   - **Mechanism:** You maintain two identical production environments: "Blue" (the current live version) and "Green" (the new, updated version). 
   - You deploy the new code to the Green environment. It is completely isolated, allowing you to run final integration tests against it safely.
   - When ready, you flip a router or load balancer switch to direct all user traffic from Blue to Green. Green becomes the new live environment.
   - **Pros:** Zero downtime. If a massive bug is discovered, rollback is instantaneous (just flip the router back to Blue).
   - **Cons:** Very expensive, as it requires double the infrastructure. Data migration (database schema changes) between the two environments is highly complex.

2. **Canary Release:**
   - **Mechanism:** You release the new version to a small, controlled subset of your users (the "canaries") while the vast majority remain on the old version.
   - For example, you route 5% of traffic to the new version. You monitor error rates and performance metrics carefully. If everything looks stable, you gradually increase the traffic (10%, 50%, 100%).
   - **Pros:** Limits the blast radius of a bad release. You get real-world user testing without taking down the entire system.
   - **Cons:** Requires complex load balancing or feature flag management to split traffic intelligently.

---

## Scenario — Question 1

**Q1: You discover a critical security flaw in your main web application. A developer has a fix ready. What is the fastest and safest way to deploy this fix to production using modern DevOps practices?**

The correct approach relies on an established CI/CD pipeline and the practice of "Rolling Forward," completely avoiding manual interventions or scary "server patching."

**The Sequence:**
1. **Code & Commit:** The developer writes the fix, adds a unit test proving the fix works, and commits it to the main branch (or a hotfix branch).
2. **Automated CI:** The commit instantly triggers the CI pipeline. The pipeline restores dependencies, builds the application, and runs the entire suite of unit and integration tests. (This proves the fix didn't break anything else).
3. **Artifact Creation:** The CI pipeline packages the compiled code into a secure, immutable artifact (e.g., a Docker Image) and pushes it to a Container Registry.
4. **Automated CD (Rolling Update):** The CD pipeline is triggered. If deploying to Kubernetes, it initiates a **Rolling Update**.
   - It spins up a new pod with the secure code.
   - It runs a Readiness Probe against the new pod.
   - Once healthy, it directs a portion of user traffic to the new pod and terminates an old, vulnerable pod.
   - It repeats this until all pods are updated.

**Why this is the best practice:**
There is zero downtime for the users. No one had to manually log into a production server via SSH to copy files or restart services (which invites human error). If the new version fails the Readiness Probe, Kubernetes halts the deployment automatically, preventing an outage.

---

## Scenario — Question 2

**Q2: Your microservice ecosystem is growing. Each microservice repository has its own Azure Pipelines YAML file. Whenever the security team mandates a new static analysis tool, you have to manually update 50 different YAML files across 50 repositories. How do you architect your CI/CD pipelines to prevent this massive maintenance overhead?**

Copying and pasting CI/CD pipeline definitions across repositories is a severe violation of the DRY (Don't Repeat Yourself) principle and creates an unmaintainable sprawl.

**The Solution: Centralized Pipeline Templates**
Modern CI/CD platforms (Azure DevOps, GitHub Actions, GitLab CI) support reusable templates.

**The Architecture:**
1. **The Shared Repository:** You create a dedicated repository (e.g., `DevOps-Templates`). In this repo, you write a single, parameterized YAML template for building a .NET Microservice. This template includes the security team's static analysis step.
   ```yaml
   # DevOps-Templates/dotnet-build.yml
   parameters:
     - name: solutionPath
       type: string
   steps:
     - script: dotnet build ${{ parameters.solutionPath }}
     - script: run-security-scan.sh
   ```

2. **The Microservice Repositories:** The individual microservice repositories delete all their custom pipeline logic. Their YAML files simply reference the central template and pass in variables.
   ```yaml
   # Microservice-A/azure-pipelines.yml
   resources:
     repositories:
       - repository: templates
         type: git
         name: DevOps-Templates

   jobs:
     - template: dotnet-build.yml@templates
       parameters:
         solutionPath: 'src/ServiceA.sln'
   ```

**The Result:**
When the security team mandates a new tool, you update exactly *one* file in the `DevOps-Templates` repository. Every single one of the 50 microservices automatically inherits the new security step on their very next build.

---

## Scenario — Question 3

**Q3: Your CI/CD pipeline builds a .NET application and deploys it to Azure. The application requires a database connection string and an API key. A developer hardcodes these values into the `appsettings.json` file committed to the Git repository. What are the security implications, and how do you securely manage these secrets in a DevOps pipeline?**

Hardcoding secrets into source control (even private repositories) is a severe vulnerability. Anyone with read access to the repo can steal the secrets. Furthermore, if the code is ever made open-source, the secrets are instantly compromised.

**The Secure Solution:**
You must separate configuration from code and inject secrets dynamically at runtime or during deployment.

**The Mechanism:**
1. **Centralized Secret Store:** Store the actual secrets in a secure, encrypted vault like **Azure Key Vault** or **HashiCorp Vault**.
2. **Pipeline Integration:**
   - In your CI/CD pipeline (e.g., Azure Pipelines), you configure a task to connect to Azure Key Vault using a managed service identity or secure service connection.
   - The pipeline retrieves the secret at deployment time.
3. **Environment Variable Injection:** The CD pipeline injects the secret into the deployment environment (e.g., Azure App Service environment variables or Kubernetes Secrets).
4. **Application Runtime:** The .NET application reads the secret from the environment variables at startup (`builder.Configuration.AddEnvironmentVariables()`), rather than from the physical `appsettings.json` file. 

Alternatively, the application can use **Managed Identities** to connect directly to Azure Key Vault at runtime to retrieve its own secrets, meaning the CI/CD pipeline never even sees the secrets.
