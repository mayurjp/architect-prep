# Architect Practice — Q&A

## Beginner — Question 1

**Q1: What is an Architecture Decision Record (ADR), and why do teams use them?**

An ADR is a short, immutable document that captures one significant technical decision: the context that forced the decision, the decision itself, the alternatives considered, and the consequences (both positive and negative) of making it. It is not a design document or a spec — it is a dated snapshot of *why* a choice was made, written by the people who made it, at the time they made it.

**Why it matters:**
The knowledge an architect actually needs to protect is not "what did we build" (that's visible in the code) but "why did we build it this way instead of the obvious alternative." Six months later, a new engineer looks at a synchronous call between two services that "should obviously" be async, tries to change it, and breaks something — because the sync call was a deliberate choice to guarantee ordering, made after rejecting a message queue for a documented reason. Without a record, that reasoning lives only in the memory of whoever was in the room, and leaves with them.

**What a minimal ADR looks like:**

```markdown
# ADR-014: Use PostgreSQL row-level locking instead of a distributed lock service

## Status
Accepted

## Context
The order-reservation flow needs to prevent double-booking of the last unit of
inventory. We evaluated a Redis-based distributed lock (Redlock) vs a
SELECT ... FOR UPDATE transaction against the existing Postgres inventory table.

## Decision
Use `SELECT ... FOR UPDATE` inside the existing order transaction.

## Consequences
+ No new infrastructure, no new failure mode to operate.
+ Lock scope is exactly the transaction boundary we already reason about.
- Ties inventory checks to Postgres throughput; will need revisiting if
  inventory writes become a bottleneck under 10x current load.
- Does not generalize to a future multi-service ownership of inventory.
```

**Common pitfalls:** treating ADRs as change-approval bureaucracy (they record a decision, they don't gate one), writing them after the fact from memory (context decays fast — write within days), or never revisiting "Accepted" status when a decision is later superseded (mark it `Superseded by ADR-021`, don't delete it — the history is the point).

**Practical guidance:** keep ADRs to one page, store them in the repo next to the code they govern (`/docs/adr/`), and write one only for decisions that are expensive to reverse or that a reasonable engineer would question later — not for routine implementation choices.

---

## Beginner — Question 2

**Q2: What's the actual difference between what a Software Architect worries about and what a Senior Developer worries about?**

They are not different job titles for the same skill at different seniority — they optimize for different things, and a strong senior developer moving into an architect role has to consciously widen their aperture, because the two roles can genuinely disagree about what the "right" answer is.

| Dimension | Senior Developer | Software Architect |
|---|---|---|
| Scope | One service, module, or feature | The system, and how services relate to each other |
| Time horizon | This sprint / this release | Years — what will this choice cost to reverse in 18 months |
| Primary question | "How do I implement this correctly and well?" | "What are we optimizing for, and what are we consciously giving up?" |
| Failure mode they guard against | Bugs, bad local design, poor test coverage | Coupling that blocks independent team delivery, decisions that quietly foreclose future options |
| Main tool | Code, tests, code review | ADRs, diagrams, conversations, fitness functions, review forums |
| Relationship to trade-offs | Usually implements a trade-off someone else made | Explicitly identifies, names, and communicates the trade-off |

**A concrete example:** a senior developer asked to add a new field to an API response will correctly focus on backward compatibility, validation, and test coverage for that endpoint. An architect looking at the same change asks a different question first: does this field expose an internal data model that three other teams are about to start depending on, making the *next* schema change expensive? The developer's instinct ("ship it correctly") and the architect's instinct ("what does shipping it lock in") are both right at their own altitude — the architect's job is specifically to hold the cross-cutting, long-horizon view that no single team is incentivized to hold on its own.

**Common misconception:** that an architect is simply "a developer who writes less code." In practice a good architect still writes code — often exactly the highest-risk, cross-cutting parts of the system (shared libraries, integration points, proofs of concept) — but the *default* activity shifts from implementation to alignment: making sure the eight teams building against a platform are converging rather than diverging.

**Practical guidance:** if you're a senior developer stepping into this role, the hardest adjustment isn't technical — it's resisting the urge to solve every problem by writing the best possible code for it, and instead asking whether the problem should exist in its current shape at all.

---

## Beginner — Question 3

**Q3: What does "technical debt" actually mean, and what's the difference between deliberate and accidental debt?**

Technical debt is a financial metaphor (coined by Ward Cunningham): shipping a quick, imperfect solution now is like taking a loan — you get speed today, but you pay ongoing "interest" in the form of extra effort every time that code is touched again, until you "pay down the principal" by refactoring it properly. Critically, technical debt is not a synonym for "bad code." Code can be sloppy without being a deliberate trade-off, and a trade-off can be entirely reasonable engineering without being sloppy at all.

**Martin Fowler's technical debt quadrant** splits debt along two axes — was it deliberate, and was it a reckless or a prudent choice:

| | Reckless | Prudent |
|---|---|---|
| **Deliberate** | "We don't have time for proper error handling, ship it." | "We must ship now; we'll deal with the consequences of this shortcut later." (with a plan) |
| **Inadvertent** | "What's a bounded context?" | "Now we know how we should have done it." |

- **Deliberate + prudent** is the healthy quadrant: a team knowingly picks the faster path, understands the cost, and plans to revisit it — this is a legitimate architectural tool, not a failure.
- **Deliberate + reckless** is corner-cutting under pressure with no intention of repayment — this is where debt compounds silently until it causes an outage.
- **Inadvertent** debt (both rows) isn't a moral failing either — it's what happens when a team learns more about the problem after building the first version, which is normal and unavoidable; the trouble is only in never acting on that new knowledge.

**Why the distinction matters practically:** an architect's job isn't to eliminate technical debt (that's neither possible nor desirable — some debt is the correct choice under real deadlines) but to make sure debt is *visible and tracked* rather than silent. A deliberate, tracked shortcut with a documented payback plan is healthy engineering. The same shortcut, unrecorded and forgotten, is how systems rot: eighteen months later nobody remembers it was a shortcut at all, and it gets treated as permanent design.

**Practical guidance:** track debt the same way you'd track a financial loan — in a backlog item or ADR that states what was skipped, why, and what triggers paying it back (a load threshold, a specific date, a second team starting to depend on it), not as a vague "refactor later" comment nobody owns.

---

## Beginner — Question 4

**Q4: What is a Non-Functional Requirement (NFR), and why do architects have to elicit it explicitly rather than wait for stakeholders to state it?**

A Non-Functional Requirement describes *how well* a system must do something, as opposed to a Functional Requirement, which describes *what* the system must do. "Users can search for a product by name" is functional. "Search results must return in under 300ms at the 95th percentile, for up to 10,000 concurrent users, with 99.95% availability" is non-functional — the same feature, but with the quality attributes attached that determine whether the implementation can be a single unindexed database query or needs a dedicated search cluster with caching and horizontal scaling.

**Why architects specifically have to go dig for these:** stakeholders naturally describe systems in terms of visible, functional behavior — screens, workflows, buttons, reports — because that's what they experience and can picture. Performance targets, security posture, scalability ceilings, availability guarantees, and compliance requirements are largely invisible when the system works, and only become visible, painfully, when it doesn't. A product owner asking for "a dashboard showing order history" is unlikely to volunteer "and it needs to stay responsive when we have 50x today's order volume during the holiday sale" — not because they don't care, but because it doesn't occur to them to say it; they assume it's implied. It is architecturally significant precisely because it's unstated: build the dashboard against unindexed queries with no caching, and the holiday-sale requirement (learned only when it's too late to redesign cheaply) forces a rewrite under the worst possible time pressure.

**How to elicit NFRs properly:** ask directly and concretely, category by category — expected load and its peak-to-average ratio, latency expectations users will actually notice, required uptime and what "down" costs per hour, who can see what data (security/compliance), and how long data must be retained. Push for numbers, not adjectives: "fast" and "reliable" aren't requirements an architecture can be designed against; "under 500ms" and "99.9% monthly uptime" are.

**Common pitfall:** treating NFRs as a one-time checklist filled in at kickoff and never revisited — a system's actual load and availability needs shift as the business grows, and yesterday's NFRs quietly become wrong assumptions baked into the architecture.

**Practical guidance:** most of the decisions that are expensive to reverse later (see Beginner Q5, on architecturally significant decisions) trace back to an NFR, not a functional feature — so eliciting NFRs explicitly, early, and in concrete numbers is one of the highest-leverage things an architect does before design even starts.

---

## Beginner — Question 5

**Q5: What makes a decision "architecturally significant," and why shouldn't an architect try to weigh in on every decision?**

Not every decision on a project needs an architect's attention, and trying to review everything is both exhausting and counterproductive — it slows teams down on low-stakes choices and, worse, dilutes the architect's authority so that when they do raise a concern, it reads as just more of the same background noise. The useful filter is **reversibility, not size**: a decision is architecturally significant when it is expensive, slow, or risky to change later — regardless of how much code it takes to implement — and not significant when it can be changed cheaply even if it looks like a big decision on the surface.

**A quick checklist — a decision is likely architecturally significant if:**

| Question | If "yes" |
|---|---|
| Does it define a boundary between systems/teams (an API contract, a database schema shared across services)? | Likely significant — boundaries are expensive to renegotiate once other parties depend on them |
| Does reversing it require a data migration, not just a code change? | Likely significant — data outlives code and is far harder to move |
| Does it lock in a specific vendor, protocol, or platform with high switching cost? | Likely significant |
| Would reversing it require coordinating multiple teams, not just one? | Likely significant |
| Can a single engineer change their mind next sprint with a local code change and no one else notices? | Not significant — leave it to the team |

**Concrete contrast:** choosing whether a particular class uses a `for` loop or LINQ is not architecturally significant — it's trivially reversible, contained to one file, and reversing it costs minutes. Choosing the message format two services will use to communicate (say, a specific versioned schema, synchronous REST vs. async events) *is* architecturally significant — once a second team builds against it, changing it means a coordinated migration across every consumer, which can take months and carry real production risk.

**Why this matters for how an architect spends their time:** attention is the scarcest resource an architect has. Reviewing every pull request or sitting in every design conversation for low-reversibility decisions is not diligence, it's a failure to prioritize — and it trains teams to either wait for permission on things they should just decide, or to route around the architect entirely because engaging them is slow. The discipline of asking "how expensive would it be to undo this?" before deciding whether to get involved is what lets an architect stay focused on the small number of decisions that actually carry long-term risk, and move fast (or delegate entirely) on everything else.

**Practical guidance:** make the reversibility filter explicit and shared with the team, not just held privately — when engineers know which category of decision needs architect sign-off and which doesn't, they stop escalating everything defensively and start making the reversible calls themselves, which is exactly the outcome you want.

---

## Intermediate — Question 1

**Q1: How do you decide whether to build a capability in-house or buy/adopt a third-party or SaaS solution?**

The Build vs Buy decision is one of the most consequential and most frequently made-badly calls an architect makes, because engineers are naturally biased toward building (it's more interesting, and "we can do it better") and that bias needs to be checked against a structured framework rather than gut feeling.

**Core factors to weigh:**

1. **Is this a core differentiator or a commodity capability?** If the capability is part of what makes your product genuinely better than competitors, build it — it deserves ongoing investment and you want full control. If it's undifferentiated infrastructure everyone needs (authentication, payment processing, email delivery, search indexing), buy it — you gain nothing competitively from reinventing it, and a vendor who does only that one thing will out-invest your side project on it.
2. **Total cost of ownership, not just sticker price.** A vendor's subscription fee looks expensive next to "we could build this in a sprint" — but the sprint estimate almost never includes ongoing maintenance, on-call burden, security patching, edge cases the vendor already solved, and the opportunity cost of the engineers who built it instead of working on the differentiator. Compare five-year TCO, not month-one cost.
3. **Vendor lock-in risk.** How painful is it to leave later? Favor vendors with data export, standard protocols/formats, and an abstraction seam in your own code (an interface your app talks to, with the vendor SDK behind it) so switching is a contained change rather than a rewrite.
4. **Time-to-market.** If being first matters more than owning the stack, buy now and revisit later — you can always build a replacement once the product's core value is proven and you know exactly what you actually need.
5. **Regulatory/compliance and data sensitivity.** Some domains (health data, payment card data) push toward vendors who already carry the certification burden — building it yourself means you also build the compliance program.

**Concrete example:** a fintech startup needs fraud detection. Building a bespoke ML fraud model is tempting, but it's rarely the differentiator early on — buying a vendor (Sift, Stripe Radar) gets a mature, continuously-trained model on day one, and the team can invest engineering time in the actual product. Two years later, once fraud patterns specific to their product are well understood and the vendor's generic model is visibly underperforming for their use case, building a specialized replacement may finally earn its cost — that's the differentiator threshold being crossed.

**Common pitfall:** treating this as a one-time decision. Buy decisions should be revisited as the company matures — "buy now, reconsider building once we understand the requirement precisely" is often the right sequencing, and requires no shame in either direction.

---

## Intermediate — Question 2

**Q2: How do you translate a technical trade-off into language a non-technical stakeholder can actually make a decision on?**

The failure mode here is presenting the technical vocabulary itself ("we'll use eventual consistency") and expecting a business stakeholder to evaluate it — they have no framework to judge "eventual consistency" as good or bad, so they either rubber-stamp it without understanding the risk, or block it for reasons that have nothing to do with the actual risk. The architect's job is to do the translation, not to ask the stakeholder to learn distributed systems.

**The translation method:**
1. Name the technical property.
2. State the concrete, observable behavior it produces — something a non-engineer would actually notice.
3. State the business consequence in terms of what it costs or risks (money, trust, compliance exposure, support burden).
4. State the alternative and its cost, so the choice is a real trade-off, not a scare tactic.

**Concrete example — "eventual consistency" in an inventory system:**

- *Bad:* "We're going to use eventual consistency between the inventory service and the storefront, is that OK?"
- *Good:* "When a customer buys the last unit of an item, there's a brief window — typically under two seconds, occasionally longer during peak load — where another customer could still see it as available and place an order for it too. If that happens, we'll cancel the second order and email the customer a discount code as an apology. Building it so that window never exists at all would mean the storefront can't render pages instantly during traffic spikes — checkout would slow down for every customer, every time, to prevent an edge case that will affect roughly 0.1% of high-demand items. Given we're optimizing for a fast storefront during Black Friday traffic, I recommend we accept the rare double-sell and handle it with a customer-service process instead of slowing everyone down to prevent it."

This gives the stakeholder an actual decision to make — speed for everyone vs. a small, bounded, mitigated risk for a few — instead of a vocabulary quiz.

**Practical guidance:** always pair the risk with (a) how often it actually happens, (b) what it costs when it does, and (c) how it's mitigated — a stakeholder can reason about "small, rare, and handled," but not about "eventual consistency" as an abstract property. And always be honest about the alternative's cost too; presenting only the downside of your recommended option (without the downside of the alternative) is a subtle form of manipulation, and stakeholders learn to distrust architects who do it.

---

## Intermediate — Question 3

**Q3: What is a "fitness function" in architecture, and how does it help enforce a design decision over time?**

A fitness function (the term comes from *Building Evolutionary Architectures* by Ford, Parsons, and Kua) is an automated, objective test that continuously verifies whether the system still exhibits an architectural characteristic you've decided matters — the same way a unit test verifies behavior, a fitness function verifies a structural or quality property of the architecture itself, and it runs in CI so violations are caught the moment they're introduced rather than discovered months later during an incident or a painful audit.

**Why this matters:** an architecture diagram and an ADR describe an intended structure, but nothing stops the codebase from drifting away from it over time — a new engineer adds "just one" direct database call from Service A into Service B's schema because it's faster than going through the API, and six months later there are a dozen such shortcuts and the service boundary is fiction. A fitness function makes the boundary a build failure, not a suggestion.

**Concrete examples of fitness functions:**

- **No dependency cycles between bounded contexts** — a static-analysis check (e.g. ArchUnit for Java/.NET, or a custom script parsing `using`/`import` statements) that fails the build if module `Billing` starts referencing module `Fulfillment` directly instead of through its published interface.

```yaml
# Simplified CI step — fails the build if a forbidden dependency direction appears
- name: Enforce module boundaries
  run: |
    dotnet tool run archunit-check \
      --rule "Billing must not depend on Fulfillment.Internal" \
      --rule "no cyclic dependencies between bounded-contexts"
```

- **Response-time budget** — a load test in the pipeline that fails if the 95th-percentile latency of the checkout API exceeds 300ms, enforcing a performance characteristic continuously rather than trusting it stays true.
- **No secrets in code** — a static scan that fails the build if an API key pattern is detected, enforcing a security characteristic.
- **Deployability** — a check that a service can be deployed independently of others (no shared migration step, no coordinated release), enforcing an operational characteristic that matters for microservices specifically.

**Common pitfall:** writing fitness functions for properties nobody actually decided mattered ("just in case"), which creates noisy false alarms and gets the whole mechanism ignored. A fitness function should trace back to an explicit architectural decision (often the same one documented in an ADR) — it exists to keep that decision true, not to police style.

**Practical guidance:** start with a small number of fitness functions around your highest-risk boundaries (the ones most likely to erode under delivery pressure) and add more as specific violations actually occur in practice — this keeps the suite meaningful instead of becoming ceremony.

---

## Intermediate — Question 4

**Q4: How do you run an effective architecture review, and what's the most common way reviews go wrong?**

An architecture review exists to catch expensive-to-reverse mistakes before they're built, by getting a second set of eyes — ideally from people outside the immediate team, who don't share its blind spots — on a design before code is committed to it. Done well, it's one of the highest-leverage activities an architect runs. Done badly, it becomes a ritual everyone dreads and route around.

**What an effective review actually examines, roughly in priority order:**

1. **Does this design match the actual requirement, including the non-functional ones?** Not "is this well-engineered" in the abstract, but does it meet the specific throughput, latency, consistency, and availability needs of *this* system — over-engineering for requirements nobody has is as much a review finding as under-engineering.
2. **What are the failure modes, and are they acceptable?** What happens when the downstream dependency is slow or down? Is there a retry storm risk? A single point of failure hiding in what looks like a distributed design?
3. **What does this do to the boundaries of the system?** Does it introduce new coupling between teams/services that will be expensive to unwind, or does it respect existing boundaries?
4. **Is it operable?** Can the team that owns this actually debug it at 3am? Does it have observability built in, or is that an afterthought?
5. **What's the blast radius of getting this wrong, and is it reversible?** A design choice that's cheap to change later deserves a lighter review than one that locks in a database schema or a public API contract for years.

**The most common failure mode: bikeshedding.** Named after Parkinson's observation that a committee will spend more time debating the paint color of a bike shed than the design of a nuclear reactor, because everyone has an opinion on paint color and almost nobody feels qualified to challenge the reactor design. In practice this looks like a review spending 40 minutes debating naming conventions, whether to use a `Result<T>` pattern vs exceptions, or formatting — easy, low-stakes, opinion-driven topics — while the actual risk (a synchronous call chain across five services with no timeout, on the critical path of checkout) goes unexamined because it requires harder, more uncomfortable judgment to raise.

**Practical guidance:** as the reviewer or facilitator, explicitly timebox and separate concerns — "style and naming go in a follow-up PR comment thread, this review is for boundaries, failure modes, and requirements fit" — and come with the requirements document open, so every design choice is checked against a concrete need rather than debated on taste. Reviews work best as a conversation the presenting team wants, not a gate they fear; that culture is set by whether past reviews felt like genuine risk-finding or like point-scoring.

---

## Intermediate — Question 5

**Q5: What is "last responsible moment" decision-making, and how do you tell the difference between deferring wisely and just being indecisive?**

The last responsible moment (a term from lean software development) is the point at which deferring a decision any longer would start costing more than the extra information you'd gain by waiting. It sits between two failure modes that both feel like discipline but aren't: deciding too early, locking in a choice on incomplete information because "we need to decide something," and deciding too late, sitting on an architecturally significant decision (Beginner Q5) past the point where the delay itself is blocking other work.

**Why deciding early is a real risk, not just caution:** an architecturally significant decision made before you understand the domain well tends to be wrong in ways that are expensive to unwind, precisely because it's significant — that's the whole definition. A team that locks in a specific database technology in week one, before anyone has profiled the actual read/write pattern the product will need, is optimizing for the comfort of having decided over the quality of the decision.

**Why deciding late is an equally real risk:** every day a significant decision stays open, other work stacks up waiting on it, or people build around the ambiguity in inconsistent ways that themselves become hard to unwind — indecision isn't neutral, it has its own compounding cost, and "we're keeping our options open" can quietly become an excuse to avoid an uncomfortable call.

**How to actually find the last responsible moment, rather than just guessing:**
1. Identify what specific information you're missing that would change the decision — not "more confidence" in general, but a concrete unknown (e.g., "we don't yet know if writes will be 10x or 1000x reads").
2. Identify the cheapest way to learn that specific thing — often a spike or POC (Intermediate Q6), sometimes just waiting for a milestone that will naturally resolve it (the first real customer's usage pattern, the results of a load test already scheduled).
3. Identify what's genuinely blocked by not deciding yet, and its cost per day of delay.
4. Decide when cost-of-delay starts exceeding value-of-more-information — that crossover point is the last responsible moment, not "as late as possible" and not "as early as possible."

**Concrete example:** choosing between two message brokers for a system still in early design. Rather than deciding in week one, the team defers the choice for three weeks while building the message-producing and message-consuming code against an abstraction interface — genuinely useful work that isn't blocked by the choice — and uses that window to prototype both brokers against the actual expected throughput. By week three, real data exists and the decision is made with far less risk of reversal.

**Practical guidance:** the discipline isn't "defer everything" or "decide everything fast" — it's naming, for each significant decision, what specifically you're waiting to learn and what it's costing you to wait, so deferring is a deliberate strategy with an end condition, not a default avoidance.

---

## Intermediate — Question 6

**Q6: How should a Proof of Concept (POC) or spike be scoped and evaluated so it does its job properly, and what's the most common way it goes wrong?**

A POC's entire job is to answer one specific, risky, currently-unknown question as cheaply as possible — "can this database handle our write pattern at the load we expect," "does this third-party API actually support the auth flow we need," "is this UI framework compatible with our existing component library." It is explicitly not meant to become production code. That distinction sounds obvious stated directly, but it's the single most common way POCs fail in practice.

**How to scope a POC properly:**
1. **State the specific unknown it exists to answer, in one sentence, before writing any code.** If you can't state it precisely, you're not ready to start the POC — you're just exploring, which is fine, but shouldn't be called a POC with a deadline attached.
2. **Build only what's needed to answer that question** — skip error handling, skip tests, skip production configuration, skip anything not directly load-bearing for answering the specific unknown. A POC proving a database can sustain a write pattern doesn't need a UI, auth, or logging; it needs a script that writes at the target rate and measures the result.
3. **Set a hard time box.** A POC without a deadline tends to quietly grow features because "it's basically working," which is exactly how it starts sliding toward production without anyone deciding that on purpose.
4. **Decide up front what "answered" looks like** — a specific measurable outcome (throughput achieved, latency measured, feature confirmed present in the vendor's API), not a vague sense that "it seems to work."
5. **Plan to throw it away.** State this explicitly to the team before starting — the code exists to produce a decision, not to be shipped, and anyone extending it afterward should be doing so as a deliberate, separate decision to actually build the feature properly, not by inertia.

**The common failure mode, and why it's dangerous:** a POC "works," a deadline is looming, and someone reasons "it already works, let's just harden it a little and ship it" — the exact load-bearing "temporary" workaround pattern examined in Scenario Q4, except caught earlier, before 18 months of dependencies accumulate. The danger is that a POC was deliberately built without NFRs in mind (Beginner Q4) — no security review, no error handling for the failure modes production traffic will actually hit, no thought given to scaling past the narrow scenario it proved — so shipping it directly means shipping code that was never evaluated against the requirements production code needs to meet.

**Practical guidance:** treat "ship the POC as-is" as a request that needs the same scrutiny as any other corner-cutting-under-deadline-pressure scenario (Scenario Q3) — name what NFRs it hasn't been evaluated against, and negotiate either a scoped hardening pass with a real deadline or an honest, documented acceptance of the risk, rather than letting "it already works" silently substitute for "it's ready."

---

## Intermediate — Question 7

**Q7: What is a Reference Architecture (or "Golden Path"), and what's the trade-off in adopting one?**

A Reference Architecture is a documented, supported, default way of building a given class of system within an organization — for example, "every new customer-facing REST service starts from this service template: this logging library, this auth middleware, this deployment pipeline, this database access pattern." A Golden Path is the same idea framed operationally: the path of least resistance for a team building something new is also the organizationally-sanctioned, well-supported one, so teams don't have to independently discover (or rediscover) the same architectural decisions from scratch.

**Why this matters at organizational scale:** without a reference architecture, every team independently re-derives answers to the same questions — which logging format, which retry policy, which auth pattern, which deployment approach — and they typically converge on *different* answers, each locally reasonable, collectively expensive. The cost shows up later: a platform team can't build one shared observability dashboard because every service logs differently; a security audit takes months because every service authenticates differently; a new hire takes weeks to get productive on a second team because nothing about their first team's setup transfers. A reference architecture converts N teams' worth of redundant decision-making and inconsistency into one well-reasoned default, documented once and reused.

**What makes a good one, practically:**
- It's backed by working, runnable scaffolding (a template repo, a starter kit), not just a document nobody actually opens.
- It's opinionated about the things that are expensive to get inconsistent across teams (auth, observability, deployment, data-access patterns) and silent about things that don't matter at that level (internal code style within a single service).
- It's owned and kept current — a golden path referencing a deprecated library is worse than no golden path, because it actively misleads teams who trust it.

**The real trade-off — flexibility for genuinely unusual needs:** a reference architecture is, by design, optimized for the common case, and a team with a genuinely atypical requirement (unusually high throughput, an unusual compliance regime, a legacy integration the template can't accommodate) pays a real cost if forced onto it anyway — the "golden path" becomes a straitjacket rather than a shortcut. The failure mode runs in both directions: treating the reference architecture as mandatory for every case discourages legitimate deviation and produces awkward workarounds bolted onto a template that doesn't fit; treating it as merely a suggestion that everyone quietly ignores loses the entire benefit of convergence.

**Practical guidance:** make the reference architecture the strong default with an explicit, lightweight exception process (an architect conversation and a short ADR explaining why this team's case is different) — most teams should follow it without debate, and the rare team with a genuine reason to deviate has a clear, sanctioned path to do so rather than either silently complying with a bad fit or silently ignoring the standard.

---

## Advanced — Question 1

**Q1: Make the real case for Monolith vs Microservices — not "microservices are modern," but the actual trade-offs, and when does a modular monolith beat both?**

The "microservices are the modern, correct architecture" framing is wrong, and it's wrong in a way that has cost real companies real money — plenty of teams have adopted microservices for a system with one small team and modest scale, and paid a permanent operational tax for a scaling problem they never had. The correct framing is: monolith and microservices are two points on a spectrum of coupling, and the right point depends on your organization, not on your ambition.

**What microservices actually cost you, unconditionally, regardless of scale:**
- Network calls where there used to be function calls — new failure modes (partial failure, timeouts, retries, cascading failure) that don't exist in a monolith.
- Distributed data — no more cross-table transactions; you now need sagas, eventual consistency, and idempotency for anything spanning two services.
- Operational surface area — N services to deploy, monitor, version, and secure instead of one; you need service discovery, distributed tracing, and a mature CI/CD pipeline just to reach parity with what a monolith gets for free.
- Debugging difficulty — a bug that spans three services requires correlating logs across three services instead of reading one stack trace.

**What microservices buy you, and when that payoff actually exceeds the cost:**
- **Independent deployability for independent teams.** If you have eight teams that need to ship on their own schedule without coordinating a release train, service boundaries that match team boundaries remove the coordination tax. This is a *team-scaling* problem, not a technology problem — the payoff comes from Conway's Law (see Q4), not from the runtime architecture itself.
- **Independent scaling of hot paths.** If one part of the system (e.g., image processing) needs 50x the compute of the rest, splitting it out lets you scale that piece alone instead of the whole monolith.
- **Fault isolation for specific critical paths**, when justified by the actual availability requirement.

**The real decision framework:**

| Factor | Favors Monolith (or Modular Monolith) | Favors Microservices |
|---|---|---|
| Team count / size | 1–3 teams, can coordinate a release | Many teams needing independent release cadence |
| Domain understanding | Boundaries still shifting, domain not settled | Bounded contexts well understood and stable |
| Operational maturity | Limited DevOps/observability investment | Mature CI/CD, tracing, service mesh already in place |
| Scale | Uniform load across the system | Wildly different scaling needs per component |
| Org structure | Team topology not yet fixed | Team topology already matches desired boundaries |

**Why a "modular monolith" is often the right starting point:** it's a single deployable unit, internally organized into modules with enforced boundaries (via fitness functions — see Intermediate Q3) that mirror where service boundaries would eventually go. You get most of the design discipline of microservices (clear ownership, low coupling, no accidental cross-module reach-in) without paying the distributed-systems tax before you have the team scale or the domain clarity to justify it. Critically, a well-modularized monolith is also the *cheapest possible starting point for an eventual split* — the module boundaries become the service boundaries later, via Strangler Fig (Advanced Q3), whereas a badly modularized monolith is exactly as hard to split as a well-modularized one, minus a working system.

**Practical guidance:** default to a modular monolith. Earn microservices when you can point to a specific team-scaling or load-scaling pain that's actually happening, not one you're anticipating — the cost is real and immediate, the benefit only materializes past a threshold most systems never reach.

---

## Advanced — Question 2

**Q2: How do you prioritize architectural characteristics ("-ilities") when you can't maximize all of them at once, and how do you make that prioritization explicit?**

Architectural characteristics — performance, scalability, availability, security, simplicity, maintainability, testability, and dozens more — are largely in tension with each other, not independent dials you can all turn to maximum. Adding redundancy for availability adds operational complexity, which works against simplicity. Adding defense-in-depth security layers adds latency, which works against performance. Adding flexibility for future extensibility (abstraction layers, plugin points) adds indirection, which works against a new engineer's ability to understand the code, which works against maintainability. Treating this as a solvable optimization problem is a category error — it's an explicit prioritization problem, and the architect's job is to make the priority order visible and defensible rather than let it be decided implicitly by whoever touched the code last.

**How to actually prioritize, per system:**
1. **Start from the business context, not a generic best-practices list.** A payments ledger and an internal analytics dashboard have entirely different correct answers, even though both are "just a web service." The ledger prioritizes consistency and auditability above almost everything, including performance. The dashboard prioritizes iteration speed and simplicity, and can tolerate stale data and even occasional downtime.
2. **Pick a small number (3–5) of "driving" characteristics explicitly**, and be honest that the rest are secondary — not absent, just not the ones you'll spend engineering budget optimizing when they conflict with a driver.
3. **Document the ranking**, ideally in the same place as your ADRs, so a future engineer who's tempted to "improve" performance by weakening an audit guarantee can see that was a deliberate, ranked choice, not an oversight.
4. **Revisit the ranking when the business context changes** — a system that started as an internal tool prioritizing simplicity, and is now customer-facing at 100x the traffic, needs its priorities re-ranked, not just its code optimized.

**Concrete example:** an e-commerce checkout service. A plausible explicit ranking: (1) availability — checkout must never be down, revenue depends on it directly; (2) data consistency for payment state specifically — a payment must never be double-charged or lost; (3) performance — sub-second response, users abandon slow checkouts; (4) simplicity — kept intentionally lower because the first three justify some real complexity (idempotency keys, retries, careful state machines); (5) extensibility for adding new payment providers — deliberately not over-invested in until a second provider is actually on the roadmap, because speculative flexibility here would trade against simplicity for a benefit that may never materialize.

**Common pitfall:** ranking characteristics based on what's technically interesting to build rather than what the business actually needs — architects (like all engineers) are drawn to solving hard scalability problems even when the system's real risk is around consistency or operability. Grounding the ranking in the business context, and writing it down, is the check against that bias.

---

## Advanced — Question 3

**Q3: How do you introduce a major architectural change into a live, running system without a risky "big bang" rewrite?**

The pattern is the **Strangler Fig**, named by Martin Fowler after the strangler fig vine, which grows around a host tree, gradually taking over its structure, until eventually the original tree can be removed while the vine continues standing in its place. Applied to software: you build the new system incrementally alongside the old one, gradually route traffic from old to new one piece at a time, and only decommission the old system once nothing depends on it anymore — the system is never down, and you're never betting the business on a single high-risk cutover.

**Why a big-bang rewrite fails so often in practice:** it requires the new system to reach full feature parity before it can replace anything, during which time the old system keeps evolving (the business doesn't pause for your rewrite), so the target keeps moving. It concentrates all the risk into one cutover event, and it typically takes far longer than estimated because the last 20% of parity — the edge cases nobody remembered building — is where most of the effort actually lives. Several well-known industry failures (Netscape's rewrite that effectively lost them the browser war, several public "great rewrite" projects that were later scrapped) trace back to exactly this pattern.

**How the Strangler Fig actually works mechanically:**
1. Put a routing façade (a reverse proxy, an API gateway, or a routing layer in the existing entry point) in front of the system, so you control where a given request goes without the caller knowing or caring.
2. Pick the first slice — usually the piece with the clearest boundary and lowest risk, not the biggest piece — and build it as a new, independent service.
3. Route only that slice's traffic to the new service through the façade; everything else still goes to the old monolith.
4. Verify in production with real traffic (often via a shadow-traffic or canary approach first — send requests to both, compare results, cut over only once confident).
5. Repeat, slice by slice, until nothing meaningful is left in the old system.
6. Decommission the old code path for that slice — this step is easy to skip and shouldn't be; leaving dead code paths "just in case" defeats the purpose and leaves confusion for the next engineer.

**Concrete example:** migrating a monolithic e-commerce platform's product-catalog module to a new microservice. Put an API gateway in front of `/api/products/*`. Build the new catalog service, backed by its own database, kept in sync with the monolith's database initially via a change-data-capture pipeline. Route read traffic for a small percentage of product categories to the new service first, verify correctness and performance under real load, then widen. Once all reads are migrated and verified, migrate writes the same way, then finally remove the catalog code and tables from the monolith.

**Common pitfall:** underestimating the cost of running two systems in parallel — you need a synchronization mechanism between old and new data stores during the transition, and that synchronization layer is itself real engineering work, often as much work as either system alone. Budget for it explicitly rather than treating it as incidental plumbing.

**Practical guidance:** choose the first slice specifically to build organizational confidence — a real, visible win with a clean boundary and modest risk — rather than the technically most interesting or most urgent piece. Momentum and trust in the migration matter as much as the technical plan.

---

## Advanced — Question 4

**Q4: What is Conway's Law, and what is the Inverse Conway Maneuver?**

Conway's Law, stated by Melvin Conway in 1968: "Organizations which design systems... are constrained to produce designs which are copies of the communication structures of these organizations." In plain terms — your system's architecture will end up mirroring how your teams talk to each other, whether you plan it that way or not. If three teams each own a piece of a system and mostly communicate through tickets and scheduled syncs rather than constant real-time collaboration, the system they build will naturally fracture along those same lines, with well-defined (if sometimes awkward) interfaces at the seams — because that's the only way teams that don't talk much can coordinate at all. If instead two teams are tightly intertwined, sitting in each other's code daily, the system they build will tend toward a tangled, tightly-coupled shared module, because that's what their communication pattern actually supports.

**Why this isn't just a curiosity — it's a practical warning:** an architect can design a beautiful set of clean service boundaries on a whiteboard, hand it to a team structure that doesn't match those boundaries, and watch the *implementation* drift back toward the team structure regardless of the diagram — because the people building it will naturally take the path their actual daily communication supports, not the path a document describes. A single team asked to jointly own two "separate" services will, over time, blur the boundary between them out of simple convenience, no matter how clean the original design was.

**The Inverse Conway Maneuver:** if architecture follows team structure, then to get a *target* architecture, deliberately restructure the teams first (or in parallel), rather than only handing down a design document and hoping implementation complies. Want a set of loosely-coupled microservices with clean boundaries? Organize independent, cross-functional teams (each with the skills to own their service end-to-end: backend, some frontend, ops) around each intended service boundary, with genuinely light coordination overhead between them — and the architecture will tend to follow, because that's now what the team's actual communication pattern supports.

**Concrete example:** a company wants to split a monolithic order-processing system into `Ordering`, `Payments`, and `Fulfillment` services aligned to independently-releasable bounded contexts. If the existing team structure has one shared backend team touching all three areas interchangeably, splitting the *code* first tends to fail — the shared team keeps reaching across the new boundaries because that's how they're used to working, and the "microservices" end up calling each other synchronously and sharing a database in practice. Applying the Inverse Conway Maneuver, the company instead splits the *team* first into three teams, each given ownership of one bounded context and told to minimize cross-team synchronous dependencies — and the service boundaries that emerge from that team structure tend to hold, because now the org's communication pattern reinforces rather than fights the design.

**Common pitfall:** applying Conway's Law only as an explanation after the fact ("that's why our services are tangled") without using its inverse proactively — team topology should be treated as a first-class architectural decision, not an HR concern the architecture is optimized around after the org chart is fixed. This is the core thesis of *Team Topologies* (Skelton & Pais), a natural extension of Conway's Law into a practical team-design method.

---

## Advanced — Question 5

**Q5: What is architectural risk assessment ("risk storming"), and how is it different from a general design review?**

A general architecture review (Intermediate Q4) evaluates a specific design against requirements, boundaries, and failure modes as a whole — it's reactive in the sense that it examines a design someone has already proposed. Architectural risk assessment, sometimes run as a structured workshop called "risk storming," is narrower and more proactive: its entire purpose is to surface the biggest unknowns and single points of failure *before* they're baked into a committed design, specifically the things most likely to be expensive to discover late.

**What it looks for, specifically:**
- **Unproven integrations** — a dependency on a third-party API, a new internal service, or a library the team has never used in production at this scale, where "will this actually work the way the documentation says" is still an open question.
- **Single points of failure** — a component with no redundancy where the diagram implies a distributed, resilient system but a closer look reveals one database, one queue, or one service instance that, if it fails, takes everything down with it.
- **The biggest unknowns** — not everything unknown, but ranked: which unknowns, if they turn out badly, would be the most expensive to have discovered late. A team typically has a long list of small unknowns and one or two that actually threaten the project; risk storming exists to find those one or two before committing.
- **Load-bearing assumptions nobody has verified** — "the vendor's API can handle our expected volume," "the existing team has the on-call capacity to run one more service," assumptions a design quietly depends on without anyone having checked they're actually true.

**How it's typically run, as a lightweight workshop:** the team walks through the proposed architecture diagram component by component, and for each one asks explicitly: what could go wrong here, how likely is it, how bad would it be, and how would we know it's happening. Risks get plotted on a simple likelihood-vs-impact grid, and the highest-risk items get an owner and a concrete mitigation or a decision to spike/POC (Intermediate Q6) that specific unknown before committing further — the point isn't to eliminate all risk, which is impossible, it's to make sure the team is *choosing* which risks to accept rather than discovering them by accident in production.

**Why doing this early matters disproportionately:** the cost of discovering a single point of failure or a bad integration assumption rises sharply the later it's found — cheap to redesign on a whiteboard, expensive to redesign after three teams have built against the flawed assumption, catastrophic to discover during a production incident. Risk storming is specifically positioned to happen *before* that cost curve steepens.

**Practical guidance:** run a lightweight risk assessment on any architecturally significant decision (Beginner Q5) before it's finalized, not as a substitute for the full design review but as an earlier, narrower pass focused purely on "what could go badly wrong here" — it's cheap (an hour, a whiteboard, the right people in the room) relative to the cost of the risks it catches.

---

## Advanced — Question 6

**Q6: What does it mean for an architecture to have "option value," and how do you judge which flexibility is actually worth preserving versus wasted effort?**

Borrowed from finance, an "option" is the right, but not the obligation, to take some future action at a cost paid now. Applied to architecture: a design choice has option value when it preserves your ability to change direction later at a low cost, even if you never end up needing to — the value isn't in using the flexibility, it's in having it available cheaply if a future need materializes that you can't fully predict today. A repository interface sitting between your application code and your specific database technology is a small, deliberate cost paid now (an extra layer of indirection) that buys the option to swap databases later without rewriting the application layer — whether or not that swap ever actually happens.

**Why this is a genuinely different lens than "just build it well":** it reframes flexibility from a vague virtue ("good code should be extensible") into a specific, costed trade-off — every abstraction boundary you add costs something real today (more indirection, more code to understand, a slower path for a new engineer to trace how something actually works) in exchange for an option whose value depends entirely on whether you'll ever need to exercise it. Architecture-as-option-value asks you to price both sides explicitly, the same discipline used elsewhere in this material (Advanced Q2 on prioritizing -ilities, Intermediate Q2 on translating trade-offs) rather than treating "flexible" as an unqualified good.

**Why over-designing for hypothetical flexibility has a real, often underestimated cost:** a system built with abstraction layers for every dimension it might conceivably need to change in — pluggable database, pluggable message broker, pluggable auth provider, configurable everything — pays the indirection cost on every one of those axes permanently, whether or not any of them ever gets exercised. This is the well-known trap of speculative generality: the code becomes harder to read and reason about today, in service of options that in practice are rarely all cashed in, and the team that built the flexibility often isn't even the one that ends up needing (or not needing) it two years later.

**How to judge which options are actually worth preserving:**
1. **Estimate the probability the option gets exercised**, honestly, based on concrete signals (an actual second vendor already being evaluated, not "vendors sometimes change").
2. **Estimate the cost of the option today** (the abstraction's ongoing indirection tax) versus **the cost of not having it if needed later** (a much larger, forced rewrite under pressure).
3. **Favor options at boundaries that are already showing signs of instability or genuine uncertainty** (Advanced Q1's point about domain boundaries still shifting) over boundaries that have been stable and well-understood for years — flexibility is worth more where the uncertainty is real.
4. **Prefer cheap options over expensive ones** — an interface boundary around a database call is nearly free; a full plugin architecture supporting arbitrary swappable persistence engines is not, and rarely earns its cost.

**Practical guidance:** default to building the option only at the one or two boundaries where change is plausible and the cost of not having flexibility later is genuinely high (often exactly where an NFR, Beginner Q4, is least certain) — and be willing to say no to "let's make this configurable just in case" everywhere else, naming the real cost of that flexibility out loud rather than granting it by default because it sounds prudent.

---

## Scenario — Question 1

**Q1: A team is frustrated with a legacy monolith and proposes rewriting it from scratch as microservices, citing "the old code is bad" as the entire justification. As the architect, how do you respond?**

"The old code is bad" is a real signal worth taking seriously, but it's not by itself a justification for the specific proposed remedy (full rewrite, and specifically as microservices) — it conflates two separate questions: *is the current code too costly to keep working in* and *is a full microservices rewrite the right-sized fix for that*. The architect's job here is neither to rubber-stamp the rewrite nor to dismiss the frustration, but to push the team toward diagnosing the actual problem before committing to a solution shaped by frustration rather than analysis.

**How to push back constructively:**

1. **Ask what "bad" actually means, concretely.** Get specifics: is it hard to test? Frequently causes production incidents? Slow to add features to? Just aesthetically displeasing to work in? Each of these points to a different fix, and some of them (poor test coverage, tangled internal modules) are fixable *inside* the current architecture without a rewrite at all.
2. **Separate "the code is poorly organized" from "the architecture is wrong."** A monolith with badly-drawn internal module boundaries is a modularity problem, solvable by refactoring toward a modular monolith (with fitness functions to keep the new boundaries honest) — far cheaper and lower-risk than a full rewrite, and it's often the actual root cause "bad code" frustration is pointing at.
3. **Name the real cost and risk of a full rewrite explicitly**, using the reasoning from the monolith-vs-microservices discussion: a full rewrite pauses feature delivery for months to years, the team is guessing at scope up front (the "we'll do it properly this time" trap that historically overruns badly), and a full-microservices target specifically adds distributed-systems complexity that has to be justified by an actual team-scaling or load-scaling need — not simply by dissatisfaction with the current code.
4. **Offer the right-sized alternative: selective decomposition via Strangler Fig.** Identify the one or two areas of the monolith that are genuinely the worst offenders — highest change frequency, most incidents, clearest natural boundary — and strangler-fig *those specific pieces* out first, leaving the rest of the monolith alone. This delivers the team relief where it actually hurts, proves out the new patterns on a contained slice, and keeps the door open to decomposing further pieces later if the pain and the team-scaling justification are still there.
5. **Write the decision down as an ADR**, including the rejected full-rewrite option and why — this protects the next architect from re-litigating the same debate from scratch, and gives the frustrated team a documented commitment that their pain is being addressed, just not in the form they first proposed.

**What good looks like in practice:** the team leaves the conversation with a concrete, scoped, funded first slice to strangler-fig out within the next quarter — not with "no" and not with an open-ended greenfield rewrite. The frustration gets a real outlet; the business doesn't take on unjustified risk.

---

## Scenario — Question 2

**Q2: Two senior engineers are deadlocked over Kafka vs Azure Service Bus for a new messaging requirement, and the disagreement has clearly become about personal preference rather than the actual requirement. How do you facilitate a resolution?**

This is one of the most common architect interventions, and the mistake to avoid is picking a winner yourself based on your own preference — that just replaces one engineer's bias with another's and teaches the team that technology debates get settled by authority rather than by evidence. The fix is to redirect the conversation away from the tools and back onto the requirements, because a genuine disagreement about tools almost always turns out to be an *unstated* disagreement about which requirements matter most.

**How to facilitate it:**

1. **Stop the tools debate and write down the actual non-functional requirements first**, as a group, before either option is mentioned again: expected message throughput, ordering guarantees needed (per-key ordering? global?), delivery guarantees (at-least-once vs exactly-once), retention requirements, existing team expertise, existing infrastructure (already running Kafka elsewhere? already deep in Azure?), latency requirements, and operational budget (who's going to run this — is a managed service required, or can the team operate a self-hosted cluster?).
2. **Ask each engineer to map their preferred technology against those requirements explicitly**, not against the other technology's weaknesses. This surfaces whether the disagreement is actually about requirements weighting (one engineer implicitly prioritizes raw throughput and ecosystem maturity, the other implicitly prioritizes operational simplicity and existing Azure investment) rather than about the technologies themselves.
3. **Look for a requirement that's actually decisive.** Often one exists and was simply never said aloud — e.g., "we're an all-Azure shop with a two-person platform team and no Kafka operational experience" is a decisive, unglamorous requirement that settles the debate on operational-cost grounds regardless of Kafka's technical merits elsewhere.
4. **If no requirement is decisive, say so, and pick based on the cheapest-to-reverse option** — favor whichever choice is easier to migrate away from later (an abstraction layer over the message bus, standard message formats) so a wrong guess doesn't become permanent lock-in.
5. **Write the outcome as an ADR**, explicitly including the rejected option and the reasoning, with both engineers' input reflected — this converts a personal disagreement into a documented team decision, which is easier for both engineers to accept than "losing" to the other's opinion, and gives the next person who wonders "why not Kafka" a real answer instead of a reopened debate.
6. **Move on and hold the decision, even if it's later shown to be imperfect** — the point of the exercise isn't to guarantee the optimal technology choice (there rarely is one, cleanly), it's to make the decision-making process legible and evidence-based so the team doesn't relitigate every technology choice through personality conflict.

**Why this works:** engineers rarely dig in on "I just like Kafka better" — they dig in because they're implicitly weighting requirements differently and haven't said so. Making the requirements explicit and shared almost always resolves the standoff on its own, because the disagreement was never really about the tools.

---

## Scenario — Question 3

**Q3: A stakeholder demands a delivery date that can only be hit by cutting corners on architecture — for example, skipping proper service boundaries and having two "separate" services share a database directly. How do you communicate the resulting technical debt's real cost, and negotiate a workable compromise?**

The wrong responses here are both common: silently complying and cutting the corner without saying anything (the debt becomes invisible, and by the time it causes pain nobody remembers it was a deliberate trade — see Beginner Q3 on debt visibility), or refusing outright and blowing the deadline without offering the stakeholder any path to what they actually need. Neither serves the business. The right response treats this exactly like a financial decision, because that's what it is.

**How to negotiate it:**

1. **Confirm the actual constraint is real and understand what's driving it** — a hard external date (a contractual commitment, a regulatory deadline, a marketing launch already announced) is different from an arbitrary internal target, and the negotiating room is different in each case.
2. **Translate the shortcut into concrete future cost, the same way you'd translate any technical trade-off (Intermediate Q2).** "Sharing a database between these two services means that six months from now, when Team B wants to change their schema, they'll have to coordinate every change with Team A first, because Team A is silently depending on the exact same tables. Based on how often each of these two teams currently ships, I'd estimate that adds roughly 2-3 days of coordination overhead to every schema change from here forward, indefinitely, until it's fixed — and the eventual fix, unwinding a live shared database, is meaningfully harder and riskier to do later than building it separately now would be."
3. **Offer the deliberate-and-prudent version of the shortcut, not the reckless one.** This is the core move: agree to take the shortcut, but insist it's tracked, not silent. Concretely — file the debt as a real backlog item with the specific cost stated, get agreement now on what triggers paying it back (e.g., "before Team B's next major feature that touches this schema," or a fixed date), and put both in an ADR so it's a documented, revisited decision rather than a forgotten hack.
4. **Negotiate the trade explicitly**: "I can hit your date if we share the database now and commit to separating it before the next major release touches this area — can you commit engineering time for that separation work then, as part of this agreement?" This turns a one-sided concession into a two-sided deal the stakeholder has skin in, which is far more likely to actually get paid down than an unprompted "we'll clean it up later."
5. **If the stakeholder won't commit to the payback, at minimum ensure it's visible** — tracked, dated, and revisited at a regular architecture review — so it can't quietly become permanent by default the way undocumented shortcuts always do.

**Why this works better than either extreme:** the business gets its date. The architect gets the debt tracked instead of hidden, with a real trigger for repayment instead of a vague promise. And critically, the stakeholder made an informed trade-off rather than an uninformed one — which is the entire point of doing this translation work in the first place.

---

## Scenario — Question 4

**Q4: An architecture review surfaces that a "temporary" workaround from 18 months ago has quietly become permanent, load-bearing infrastructure that nobody wants to touch. How do you assess and prioritize fixing it against new feature work?**

This is the predictable end state of undocumented, unvisible technical debt (Beginner Q3): a shortcut taken under pressure, with every intention of revisiting it, that instead got built on top of, depended on by other systems, and eventually became too risky to touch — the exact failure mode that tracking debt explicitly is meant to prevent, discovered after the fact. The instinct to either ignore it (it's working, leave it) or demand it be fixed immediately (it's clearly wrong, stop everything) are both wrong; the right response is to assess it with the same rigor you'd apply to any other architecture risk, and then prioritize it against real, comparable alternatives rather than by anxiety level.

**How to assess it:**

1. **Establish what it actually does and who depends on it now** — not what it was built to do 18 months ago. A workaround that started as "a script that patches the nightly export" may now be something three other teams silently poll, making it de facto infrastructure regardless of its original intent. Map the actual blast radius of touching or removing it.
2. **Assess the risk it currently carries**, concretely: is it a single point of failure with no owner? Does it depend on a person's specific knowledge with no documentation (the "hit by a bus" risk)? Does it silently violate an invariant the rest of the system assumes holds (e.g., it writes directly to a table other services read from, bypassing normal validation)? Rate this the way you'd rate any operational risk — likelihood and impact — not by how uncomfortable it makes people.
3. **Assess the cost of fixing it now vs. later.** Debt, like financial debt, tends to compound — the longer a shared dependency lives on top of the shaky foundation, the more expensive it is to replace, because more things now depend on its exact (accidental) behavior. Get a real estimate for "fix now" vs. a realistic projection for "fix in another 18 months," including how many more things will likely depend on it by then.
4. **Prioritize it like any other backlog item, with real cost and risk numbers, not by decree.** Put it next to the actual feature work competing for the same engineering time, and let the stakeholders holding both budgets make an informed call — using the same translation technique as Scenario Q3: "leaving this as-is carries an estimated X% chance per quarter of an incident costing roughly Y hours of engineering response, and gets more expensive to fix the longer we wait, because Z more systems are integrating with it every quarter." That's a comparable statement to "this feature is worth $N in projected revenue," and lets it compete honestly rather than being deprioritized by default because it's invisible, or overprioritized by default because it's suddenly scary.
5. **If it's not fixed immediately, at minimum bring it into the light**: give it a named owner, write the ADR that should have existed 18 months ago (context, what it actually does now, why it's risky, what fixing it would take), and add a fitness function or monitoring check if there's a way to at least detect when it's approaching a failure condition, even before it's replaced.

**The deeper lesson to bring back to the team:** this is exactly the scenario the "deliberate and tracked, not silent" discipline from Beginner Q3 exists to prevent. The corrective action isn't only fixing this one instance — it's using it as a concrete, visible example to reinforce the norm that "temporary" workarounds get an ADR and an explicit revisit trigger the day they're introduced, not 18 months later when a review happens to stumble onto them.

---

## Scenario — Question 5

**Q5: A team asks you to sign off on shipping a POC directly to production next week, arguing "it already works and we're out of time." How do you assess the real risk and negotiate a responsible path forward?**

"It already works" is answering the wrong question. A POC's job, done properly (Intermediate Q6), is to cheaply answer one narrow, risky unknown — it was never evaluated against the NFRs (Beginner Q4) production traffic actually needs: security posture, error handling for realistic failure modes, observability, and scalability past the specific scenario it was built to prove. "It works" in the sense of "the happy path I tested by hand behaves correctly" is a very different claim from "it is production-ready," and treating the two as equivalent is exactly the load-bearing-"temporary"-workaround failure mode (Scenario Q4) forming in real time, except this time it's catchable before it ships rather than discovered 18 months later.

**How to assess the real risk, concretely:**
1. **Establish what the POC was actually built to prove**, and confirm it proved only that. If it was built to answer "can this third-party API do the auth flow we need," that tells you nothing about whether its error handling, logging, or input validation are production-grade — because none of that was in scope for what it was trying to answer.
2. **Walk the NFRs the production system needs and check each one explicitly against what actually exists** — security review done? Rate limiting and input validation present? Failure modes for the downstream dependency being down handled, or does it just crash? Logging and alerting wired up so an on-call engineer can actually debug it at 3am? Load-tested anywhere near expected production volume?
3. **Name the gap in concrete terms**, the same translation technique used for any trade-off (Intermediate Q2): "this hasn't been checked for what happens if the payment provider times out — right now it just hangs the request indefinitely, which at our expected traffic would exhaust connections within about twenty minutes of a partial outage."

**Negotiating a path forward — three real options, not a binary yes/no:**
- **A scoped hardening pass with a hard deadline**, when the gap is narrow and specific — the POC solved the genuinely hard, novel part correctly, and what's missing is a short, bounded list of production concerns (error handling, basic observability, a security pass) that can be added in days, not weeks. This is usually the right answer when the underlying approach is sound.
- **A fuller rebuild of the risky parts**, when the POC's shortcuts go deeper than surface hardening — for example, it was built against an in-memory data structure that fundamentally won't survive a restart, or the "auth flow" was stubbed out entirely rather than proven. Here, "it already works" was true only in a sense that doesn't transfer, and papering over that with a quick pass would just be building the next load-bearing workaround.
- **Accepting the risk explicitly and documenting it**, when the deadline is genuinely immovable and the gap is real but survivable for a bounded time — ship it as a deliberate, tracked exception (the deliberate-and-prudent quadrant from Beginner Q3) with a named owner, a documented list of exactly what's missing, and a committed date to close the gap, rather than shipping it silently as if it were finished.

**Practical guidance:** never accept "it already works" as a substitute for checking it against the requirements it was never built to meet — the negotiation isn't architect-says-no versus team-ships-anyway, it's making the actual gap and its cost visible so the team and stakeholders choose one of the three paths above deliberately, the same discipline applied to every other deadline-pressure scenario in this material.

---

## Beginner — Question 6

**Q6: What is an architectural "smell," analogous to a code smell? Give examples.**

A code smell is a surface-level pattern in source code that isn't provably a bug, but reliably correlates with deeper design problems — a long parameter list, a god class. An architectural smell is the same idea one level up: a structural warning sign visible from the outside of a system's boundaries — deployment topology, data ownership, team coupling — that suggests a boundary problem worth investigating, without necessarily being proof that anything is wrong yet.

**Common examples:**

| Smell | What it looks like | What it usually indicates |
|---|---|---|
| Lockstep deployment | Two "independent" services must always be deployed together, or one breaks | The service boundary doesn't match the real seam in the domain — they're one logical unit split in two |
| Shared database | Several services read/write the same tables directly, no owning service | No real data ownership; a schema change anywhere risks breaking everyone silently |
| Chatty integration | Two services exchange many small synchronous calls to complete one logical operation | The boundary was drawn through the middle of a single business transaction |
| Sprawling shared library | A "common" package that every service depends on and that changes constantly | Shared code is acting as a stealth service, coupling everyone to its release cadence |
| Divergent naming for the same concept | "Customer," "Account," and "Client" all mean the same entity in different services | No agreed bounded context; integration code is full of ad hoc translation |

**Why "smell," not "defect":** none of these prove the architecture is wrong. Lockstep deployment between two services might be entirely appropriate if they genuinely share a single transactional invariant that can't be safely split. The value of naming it a smell is that it flags *where to look* — it earns an investigation, a conversation, maybe a fitness function to track it over time — without demanding an immediate fix or triggering a redesign on suspicion alone.

**Practical guidance:** train the team to notice and name these out loud the moment they're seen ("that's a shared-database smell") rather than silently working around them. Naming them early is cheap; the alternative is the same pattern getting worse for months until it's an incident, at which point it's indistinguishable from the load-bearing-workaround problem (see Scenario Q4) — expensive to unwind and nobody remembers deciding to build it that way.

---

## Intermediate — Question 8

**Q8: How does an RFC or design-doc process complement a formal ADR? When would a team use one vs. the other?**

The distinction is about *when in the decision's lifecycle* the document exists. An ADR is written **after** a decision has been made — it's a historical record: this is what we chose, why, and what we rejected. An RFC (or design doc) is written **before** a decision is finalized — it's a proposal, circulated to gather feedback, poke holes, and surface objections while the decision is still changeable. Confusing the two causes real friction: writing an ADR too early locks in a decision before it's been stress-tested by the people who'll live with it; writing an RFC and never following it with an ADR means the eventual decision — which may differ from the original proposal after feedback — is never actually recorded.

**How they fit together as a pipeline:**

1. **RFC/design doc drafted** by whoever is proposing the change, laying out the problem, the proposed approach, alternatives considered, and open questions — deliberately incomplete in places, inviting comment.
2. **Review period** — asynchronous comments, a review meeting, or both. This is where the disagreement (Scenario Q2-style) happens *on paper*, before code exists, which is far cheaper to resolve than after implementation starts.
3. **Decision reached**, possibly different from the original RFC proposal after feedback folded in.
4. **ADR written** capturing the final decision, referencing the RFC as background context but standing alone as the permanent record — the RFC can be archived or left as historical discussion; the ADR is what future readers rely on.

**When to use which:** reach for an RFC when the decision is still genuinely open, involves multiple stakeholders whose input will materially change the outcome, or is contentious enough that skipping review risks a costly reversal later. Skip straight to an ADR when the decision is narrow, uncontroversial, or already effectively made (documenting a choice, not soliciting one) — running a full RFC cycle for a decision nobody's going to contest is process for its own sake.

**Common pitfall:** treating the RFC as the permanent record and never writing the ADR — six months later nobody can find "the decision," only a debate thread with an ambiguous ending.

---

## Intermediate — Question 9

**Q9: How should a team right-size its architecture documentation? What failure modes appear at each extreme?**

Documentation volume for architecture, like technical debt, has a cost curve with a minimum, not a monotonic "more is better" relationship — both too little and too much cause real, distinct failure modes, and the job is finding the point between them where documentation is trusted and worth maintaining.

**Failure mode 1 — too little (tribal knowledge loss):** decisions live only in the heads of the people who made them. This looks fine day to day — the team ships, everyone "just knows" why things are the way they are — until someone leaves, and the knowledge leaves with them (the exact scenario in Scenario Q6). New hires ramp slowly because there's nothing to read, only people to interrupt. Worse, undocumented rationale gets silently violated: someone "fixes" a deliberate workaround because nothing recorded *why* it existed, reintroducing a bug that was already solved once.

**Failure mode 2 — too much (documentation that goes stale and loses trust):** a team that documents everything upfront — every component diagram, every sequence flow, every field-level data dictionary — produces artifacts that are expensive to maintain and, in practice, don't get maintained. The code changes daily; the 40-page design doc doesn't. Within a few months the documentation actively lies about the system, and once someone catches it lying once, nobody trusts it again — at which point maintaining it is pure waste, since engineers default back to reading the code directly, and new documentation efforts inherit the same distrust.

**How to right-size it in practice:**
1. Document *decisions and their rationale* (ADRs), not implementation detail that the code already expresses better and more accurately than prose ever will.
2. Keep documents living only where they're cheap to update — next to the code, reviewed in the same pull request, so a change that invalidates the doc is caught at review time rather than drifting silently.
3. Prefer a small number of high-signal artifacts (ADRs, a lightweight current-state diagram, an onboarding doc) over exhaustive coverage — completeness is less valuable than the top 10% of decisions actually being findable.
4. Periodically audit for staleness and either fix or explicitly retire documents that no longer match reality — a doc marked "known stale, do not trust" is more honest, and less damaging, than one silently rotting.

**Practical guidance:** the test for "is this worth documenting" is the same test used for ADRs (Beginner Q1) — would a reasonable engineer question this decision later, and is it expensive to reverse or rediscover? If yes, write it down once, keep it short, and keep it near the code it governs.

---

## Intermediate — Question 10

**Q10: How are the roles of Solution Architect, Enterprise Architect, and Software/Technical Architect commonly distinguished? Why do the boundaries blur in smaller organizations?**

These three titles overlap heavily in practice, but the distinction most organizations intend is one of **scope**: how much of the organization a given architectural decision is expected to affect.

| Role | Primary scope | Typical concerns | Time horizon |
|---|---|---|---|
| **Software/Technical Architect** | A single system or a small set of closely related services | Internal structure, service boundaries, technology choices within the system, code-level and integration-level design | Weeks to a couple of years — the life of the system |
| **Solution Architect** | Delivery of one specific solution or project, often spanning multiple systems and teams | How several existing systems, new components, and integrations fit together to satisfy one business initiative; owns the technical design for a single delivery effort end to end | The length of the project/initiative |
| **Enterprise Architect** | The whole organization's technology portfolio | Standards, shared platforms, technology strategy, reducing duplicate capability across teams, alignment between IT investment and business strategy | Multi-year, often outlives any single project |

A useful way to hold the distinction: a Technical Architect asks "how should *this system* be built," a Solution Architect asks "how do these systems come together to deliver *this initiative*," and an Enterprise Architect asks "what should *every* system in this organization look like, and are we duplicating investment across them."

**Why the boundaries blur in smaller organizations:** all three concerns still exist in a small company — someone still has to think about single-system design, cross-system delivery, and organization-wide consistency — but there usually isn't enough volume of work in any one scope to justify a dedicated headcount for it. A 30-engineer company doesn't need a full-time Enterprise Architect setting portfolio-wide standards across dozens of systems when there are only four systems total; the same person who designs the flagship system's internals is also, by necessity, the one keeping the handful of other systems consistent with each other. The *concerns* don't disappear, they just consolidate onto fewer people — which is why a "Staff Engineer" or "Architect" at a smaller company is routinely expected to operate at all three altitudes depending on the week, while at a large enterprise those altitudes are deliberately separated into different roles, different reporting lines, and even different departments, precisely because the coordination overhead of consolidating them at that scale would be worse than the overhead of separating them.

**Practical guidance:** when joining or structuring a team, name which scope a given decision actually requires — a decision made with system-level authority but enterprise-level blast radius (e.g., picking a new database engine that becomes a de facto organizational standard) is exactly where mismatched scope causes the most damage.

---

## Advanced — Question 7

**Q7: How does the classic "iron triangle" of scope, time, cost, and quality apply specifically to architectural decisions?**

The iron triangle states that of scope, time, and cost (with quality often held as the implicit fourth corner, or the thing that suffers when the other three are fixed), you cannot fix all of them simultaneously — improving one requires releasing slack on at least one other. Most engineers understand this at the *project* level (more scope needs more time or more people). The distinctly architectural version of this is that the trade-off shows up **inside individual technical decisions**, often invisibly, and the architect's job is to make the sacrificed corner explicit rather than let it be decided by default.

**How it shows up concretely in architecture work:**
- **Cutting scope** to hit a date: shipping with two services sharing a database instead of properly separated (Scenario Q3) — the boundary work is descoped, not the deadline moved.
- **Cutting quality** to hit a date: skipping the load test, deferring the security review, accepting a POC's error handling as "good enough" (Scenario Q5) — the corners being sacrificed are non-functional requirements, which are easy to cut because their absence isn't visible until later.
- **Spending more cost** to preserve scope and quality on a fixed timeline: buying a managed service instead of building one (see Build vs Buy material), or adding contractors to parallelize work that has real limits on parallelization.
- **Extending time** to preserve scope and quality: the honest option, and often the hardest to get approved, because it requires someone with authority to move a date that was announced before the technical reality was understood.

**Why naming the sacrifice explicitly matters:** every one of these trade-offs happens whether or not anyone says it out loud — the difference between a healthy team and an unhealthy one is not whether trade-offs occur, it's whether they're decided deliberately or fallen into silently. An architect who lets "we'll cut the corner" happen implicitly (nobody says which corner, it's just quietly under-tested) reproduces the exact undocumented-debt failure mode from Beginner Q3. An architect who says explicitly, in front of the stakeholders who own the date, "hitting this date means we are cutting quality specifically in the areas of load testing and security review — here's the resulting risk" converts an invisible default into an informed decision someone actually chose.

**Practical guidance:** whenever a deadline, budget, or scope constraint is handed down as fixed, treat it as an instruction to explicitly identify which of the remaining corners is being sacrificed, translate that sacrifice into concrete risk (the same translation discipline as Intermediate Q2 and Scenario Q3), and get it acknowledged by whoever owns the constraint — not silently absorbed by the engineering team.

---

## Advanced — Question 8

**Q8: How should a public/external API be versioned and evolved without breaking existing consumers? Why is this a good case study in decisions that are expensive to reverse?**

A public API is architecturally unusual because the "consumers" of the interface are, by definition, systems you don't control and often can't even see — you can't grep for every caller the way you can inside your own codebase, and you frequently can't force them to upgrade on your schedule. That combination — invisible callers, no forced migration — is what makes API design decisions some of the most expensive to reverse in all of architecture: a mistake in an internal service can be fixed by coordinating with the three teams that call it; a mistake in a public API might be depended on by thousands of integrations you'll never identify, some of which will never upgrade voluntarily.

**The discipline that manages this:**

1. **Semantic versioning with real meaning, not just a marketing number.** MAJOR changes break compatibility, MINOR adds functionality compatibly, PATCH fixes bugs compatibly — and consumers must be able to trust that a MINOR or PATCH bump is genuinely safe to pull in without review, or the versioning scheme is worthless.
2. **Additive-only changes within a major version.** New optional fields, new endpoints, new enum values (if consumers are contractually required to tolerate unknown ones) are safe; removing fields, renaming fields, tightening validation, or changing the meaning of an existing field are not — even if the change feels small internally, an external consumer's brittle client can break on any of them.
3. **Explicit deprecation windows with real, communicated timelines**, not "eventually." A deprecated field or endpoint should keep working, emit a deprecation signal (a header, a changelog entry, an email to registered API consumers), and carry a stated sunset date far enough out that realistic integration teams — who may not treat your API as a priority — have time to act.
4. **Version the contract, not just the code.** Whether via URL path (`/v2/...`), a header, or content negotiation, old and new versions must be able to run simultaneously in production for the length of the deprecation window — this is an operational cost (running two contract surfaces at once) that has to be planned for, not discovered.
5. **Monitor actual usage of deprecated surfaces** before removing them — "we announced it" is not the same as "nobody's using it anymore"; usage telemetry is the only reliable signal that a breaking removal is actually safe.

**Why this is a strong case study for expensive-to-reverse decisions:** the cost of a bad choice here doesn't show up at decision time — it shows up months or years later, multiplied by every external integration built on top of it, and by then the "fix" isn't a code change, it's a multi-party negotiation and migration project. It's the sharpest illustration in this material of why architecturally significant decisions deserve disproportionate upfront care relative to how small they might look in a diff.

---

## Scenario — Question 6

**Q6: A legacy system's original architect has left the company, no ADRs exist, and the current team is now afraid to change a critical piece of infrastructure because nobody understands why it was built that way. How do you recover the lost context safely before making any change?**

This is the tribal-knowledge failure mode (Intermediate Q9) fully realized: the rationale was never written down, the person holding it left, and the team is now paying for it in the worst way — not just slower work, but genuine fear of touching something they don't understand, which is itself a risk (an unmaintained, unmodifiable critical system is a slow-motion incident). The instinct to either leave it completely alone forever, or to rewrite it from scratch to "finally understand it," are both premature. The right approach is archaeology first, change second — and to treat understanding as something to be actively reconstructed and recorded, not assumed.

**How to recover the context safely:**

1. **Git archaeology.** Read the commit history for the component in full, not just the latest state — commit messages, PR descriptions, and especially any linked tickets or discussion threads often preserve fragments of the original reasoning even when no formal ADR exists. Look for the *shape* of the change over time: was this built incrementally in response to specific incidents, or designed upfront? Each tells a different story about what constraints were real.
2. **Interview whoever's left who touched it**, even peripherally — the original architect leaving doesn't mean all context left with them. Former teammates, downstream consumers, on-call engineers who've had to work around its quirks at 3am, and support/ops staff who've seen it fail all hold partial pieces. Ask specifically for war stories ("what's the worst incident this thing caused, and what did we learn") — incidents are where undocumented constraints usually surface.
3. **Trace what actually depends on it now**, not what it was originally built to serve — the same blast-radius mapping used for any load-bearing workaround (Scenario Q4). Current dependents often reveal *de facto* requirements that were never explicit anywhere, because something downstream quietly started relying on an implementation detail.
4. **Write a retroactive ADR before touching anything** — capturing the best current understanding: what it does, the best-reconstructed reasoning for why it was built this way, what currently depends on it, and what remains genuinely unknown. Mark the unknowns as unknowns explicitly rather than guessing confidently; a documented "we don't know why it does X, treat with caution" is more useful than a false narrative.
5. **Treat the first change as a controlled experiment in understanding, not just a fix.** Make the smallest possible change, instrument it heavily, and use the system's actual behavior under that change to confirm or correct the reconstructed model from step 4 — updating the retroactive ADR afterward with what was actually learned, so the next person inherits a real, tested account instead of another guess.

**Why this order matters:** skipping straight to a rewrite risks silently dropping a constraint nobody remembered was load-bearing (Scenario Q4's failure mode, but self-inflicted this time); skipping straight to "just fix the bug" without reconstructing context risks the same. Recovering the context first, writing it down, and only then changing the system — carefully, and using the change itself to validate the reconstructed understanding — is the only version of this that leaves the system in better shape than it was found, for the next person too.

---

## Beginner — Question 7

**Q7: What's the actual difference between a "principle" and a "pattern" in architecture discussions, and why does conflating them cause confusion?**

Both terms get thrown around loosely in conversation, often interchangeably, but they operate at different altitudes and answer different questions. A **principle** is a general guideline — broadly applicable, context-independent, and deliberately abstract, like "favor composition over inheritance," "single responsibility," or "depend on abstractions, not concretions." A principle doesn't tell you *what* to build; it tells you what quality to optimize for whenever you're deciding between options. A **pattern**, by contrast, is a specific, named, reusable solution *shape* for a recurring problem — Strangler Fig (Advanced Q3), Circuit Breaker, Repository, Saga. A pattern is concrete enough that two engineers who both know it can sketch the same diagram from just its name.

**A useful test:** can you violate it and still be doing something reasonable, depending on context? Principles are near-universal — "single responsibility" is rarely wrong to want, even if applying it takes judgment. Patterns are situational — Circuit Breaker is the right tool for a flaky downstream dependency and actively unhelpful complexity if there's no unreliable call to protect. Principles guide *when* and *why* you'd reach for a pattern in the first place; a pattern is one concrete way of honoring one or more principles in a specific recurring situation.

**Why conflating them causes real confusion:** it shows up as two failure modes. First, treating a principle like a pattern — applying "single responsibility" as a rigid rule ("every class must have exactly one public method") rather than a judgment call, producing absurd over-fragmentation nobody asked for. Second, treating a pattern like a principle — reaching for Circuit Breaker or Strangler Fig reflexively, everywhere, as if they were universal good practice rather than a specific answer to a specific problem, adding complexity nothing in the system actually needed. A team discussing "should we use this pattern here" is asking a narrow, falsifiable question about fit; a team discussing "are we honoring this principle" is asking a broader, more subjective one — mixing the two mid-conversation ("well Circuit Breaker follows single responsibility, so we should use it") skips the step of asking whether the problem the pattern solves is actually present.

**Practical guidance:** when a design conversation stalls, ask explicitly which altitude you're arguing at — a disagreement about principle ("should this be more decoupled") needs a different resolution than a disagreement about pattern fit ("is Circuit Breaker the right tool here"), and naming which one you're actually debating usually unsticks the conversation.

---

## Intermediate — Question 11

**Q11: How do you estimate and communicate the cost of a large architectural change to leadership, when the honest answer is "we don't fully know yet"?**

The instinct when asked "how much will this cost and how long will it take" for something like "rewrite the payments system" is to produce a single number, because that's what the question seems to be asking for — but a single number for an intimidating, poorly-bounded change is close to fiction, and everyone involved usually knows it, which is exactly why these asks stall: leadership can't approve an unknowable number, and the architect can't honestly defend one. The fix isn't a better estimate — it's changing the shape of what's being estimated.

**The reframe: break the large ask into a roadmap of smaller, independently-estimable, independently-valuable slices, using Strangler Fig (Advanced Q3) as the mechanical pattern.** Instead of "rewrite the whole payments system: 9-14 months, ask again in a year," the architect proposes: slice one (say, migrating refund processing, the smallest and best-understood piece) is scoped, estimated with real confidence because its boundary is small and known, and — critically — ships real value on its own, independent of whether any later slice ever happens. Each subsequent slice is estimated only once the prior slice is done and has taught the team something concrete about the system's actual shape, cost per slice, and hidden complexity.

**Why this is a better answer to leadership, not a dodge:** it converts "trust me, it'll take about a year" (an unfalsifiable promise) into "here's a scoped, funded first step with a real estimate, that delivers value on its own even if we stop after it" (a checkable commitment). It also surfaces bad news early and cheaply — if slice one reveals the domain is far messier than expected, that's learned after weeks, not after eleven months of a monolithic project with nothing shippable yet. Leadership gets the ability to reprioritize or halt after each slice based on real data, not a sunk-cost hostage situation at month nine.

**Practical guidance:** present it explicitly as a roadmap, not a project — a small number of slices, each with its own estimate, business value, and go/no-go point — and be upfront that later slices' estimates will sharpen as earlier ones complete. This is a harder sell in a single meeting than a confident wrong number, but it's the version that's still true a year later.

---

## Intermediate — Question 12

**Q12: What does it mean that architecture is "a shared understanding," not "a document" — and why does a perfectly-documented architecture nobody has internalized still count as a failure?**

It's tempting to treat architecture documentation — diagrams, ADRs (Beginner Q1), RFCs (Intermediate Q8) — as the deliverable itself: write it well, keep it current, and the job is done. That's a category error. The actual goal was never the document; it's that the team collectively understands and agrees on the system's structure and the reasoning behind it, well enough to make consistent decisions when the architect isn't in the room. The document is a *means* to that shared understanding, one tool among several — it is not the end itself, and optimizing for the artifact instead of the outcome it's supposed to produce is how teams end up with beautiful documentation and a codebase that doesn't resemble it.

**What this looks like when it goes wrong:** a set of pristine diagrams and ADRs exists, reviewed and approved, sitting in a wiki nobody opens after week one. Six months later, three different engineers independently make three different, mutually inconsistent assumptions about how a service boundary works, each confident in their own reading — not because the documentation was wrong, but because reading a document once during onboarding isn't the same as *understanding*, and understanding is the thing that was actually needed to make good day-to-day decisions. The system drifts from the diagram the same way it drifts from any unenforced intention (see the fitness-function discussion, Intermediate Q3) — not because anyone rejected the design, but because nobody was actually carrying it in their head when they made the next hundred small decisions.

**What building genuine shared understanding actually requires, beyond writing things down:** repetition in different forms — a design walkthrough where the team discusses and pokes at the reasoning live, not just reads it; new engineers explaining a boundary back in their own words during onboarding, not just acknowledging a doc; architecture decisions revisited out loud in reviews (Intermediate Q4) so the reasoning stays active rather than archived; and, ideally, fitness functions that make the intended structure a live, enforced fact rather than a historical claim.

**Practical guidance:** treat a document's publication as the start of building shared understanding, not its completion — and judge documentation efforts by whether the team can correctly explain and apply the reasoning unprompted, not by whether the document exists and is accurate. A doc nobody internalized has failed at its real job even if every word in it is true.

---

## Advanced — Question 9

**Q9: How does an architect honestly evaluate a system's architecture in retrospect, a year or more after it went live — and why does distinguishing "reasonable at the time" from "avoidably wrong" matter for review culture?**

Retrospective architecture evaluation is easy to do badly: with a year of production data, incidents, and hindsight, almost every past decision looks obviously flawed from where you're standing now — that ease is exactly the trap. Pure hindsight-driven criticism ("why didn't we just use X") produces a review culture people dread and route around, the same failure mode as bikeshedding (Intermediate Q4) but pointed at people instead of designs. The honest version of this exercise requires deliberately reconstructing what was actually knowable *at decision time*, not what's obvious now.

**The core distinction to draw, for each significant past decision:**
- **Reasonable given what was known then:** the decision was made with a genuine, defensible read of the information, constraints, and risk available at the time — even though it turned out badly. Choosing a database that couldn't have been known to hit a scaling wall without load data nobody had yet is reasonable-but-wrong, not a mistake in the blameworthy sense.
- **Avoidably wrong:** the information needed to make a better call was actually available at the time and was skipped, ignored, or never sought — a risk storming pass (Advanced Q5) that would have surfaced a known single point of failure, simply never run; an NFR (Beginner Q4) that stakeholders stated clearly and the design silently didn't meet.

**How to actually run the retrospective:** for each decision under review, reconstruct the ADR's original context (if one exists — if not, this is exactly the archaeology of Scenario Q6) and ask specifically what information existed at the time, not what exists now. Separate "the assumption was reasonable and the world changed" from "the assumption was never validated." Track patterns across multiple retrospectives, not just single incidents — a team that keeps landing in "avoidably wrong" for the same category of gap (say, never load-testing before committing to a data store) has a process problem worth fixing, distinct from any single decision's outcome.

**Why the distinction matters for culture:** a review process that punishes "reasonable at the time" decisions for turning out badly teaches people to stop making judgment calls under uncertainty at all — they'll either over-hedge every decision or stop documenting reasoning that could later be used against them, which quietly kills the ADR practice (Beginner Q1) this whole discipline depends on. A blameless review that still names avoidable gaps precisely is what keeps retrospectives useful instead of either toothless or punitive.

---

## Advanced — Question 10

**Q10: How do architectural decisions interact with hiring and team composition — why is "we're adopting this niche technology" a genuinely architectural trade-off, not just an HR concern?**

Technology choices are usually evaluated on technical merit — throughput, fit for the problem, operational maturity — and rarely evaluated on a dimension that compounds for years afterward: how hard the choice makes it to hire, onboard, and retain people who can operate it. This isn't a peripheral HR footnote bolted onto an otherwise-technical decision; it's a real cost with the same shape as vendor lock-in (Intermediate Q1) or option value (Advanced Q6) — paid continuously, easy to underweight because it doesn't show up in a benchmark or a proof of concept.

**Where the cost actually shows up:**
- **Hiring pool size.** A mainstream technology (Postgres, Kubernetes, Kafka, mainstream cloud services) has a large, liquid talent pool — job postings fill faster, at a more predictable salary band, with candidates who already carry the operational instincts the role needs. A niche technology (an exotic database, an in-house DSL, a language with a small industry footprint) shrinks that pool dramatically — sometimes to the point that hiring specifically for it becomes the bottleneck on team growth, not budget or headcount approval.
- **Onboarding cost.** Even when a candidate is hired, a mainstream technology's new hire arrives with transferable muscle memory; a niche one requires training an engineer into competence from a much lower baseline, extending time-to-productivity for every single hire, indefinitely, as long as the technology stays in use.
- **Retention and bus-factor risk.** A small team of specialists in a niche technology is a concentration risk — losing one or two people can mean losing most of the organization's operational knowledge of a system component, a sharper version of the tribal-knowledge problem in Intermediate Q9 and Scenario Q6, because there's no large external market to rehire the expertise from quickly.
- **Compounding over the technology's lifetime**, not a one-time cost: every year the system runs on the niche choice, the hiring and onboarding tax gets paid again for every new team member, long after the original technical advantage that motivated the choice may have narrowed or vanished as competing mainstream tools matured.

**How to weigh it, practically:** treat hireability as an explicit line item in any significant technology decision, alongside the technical evaluation — quantify the pool size and expected time-to-fill for the role this creates, not just the tool's benchmark numbers. A niche technology can still be the right call when its technical advantage is large and durable enough to justify the ongoing hiring tax; the failure mode is making that trade silently, discovering the real cost eighteen months later as an unfillable open req, and having no record (Beginner Q1) of whether anyone actually weighed it.

---

## Scenario — Question 7

**Q7: An architect inherits a system where a past technology choice — say, a particular NoSQL database or messaging technology — is now a clearly poor fit for how the system evolved, but migrating away is a multi-quarter effort with real business risk. How do you build the case for the investment and sequence the migration safely?**

The trap here runs in both directions: ignoring the mismatch indefinitely because it "still works" lets the cost compound silently the same way any undocumented debt does (Beginner Q3), while forcing an unjustified big-bang rewrite risks the exact failure mode Strangler Fig exists to avoid (Advanced Q3) — betting the business on a long, high-risk cutover for a problem that may not need one. The job is building a case grounded in real, comparable numbers, then sequencing the fix to de-risk it the same way any other large change should be de-risked.

**Building the case — quantify the cost of staying, not just the cost of migrating.** Leadership naturally sees the migration's cost clearly (it's a line item with an estimate) and the status quo's cost invisibly (it's diffuse, ongoing, easy to mistake for zero). Make the staying-cost concrete and comparable, the same translation discipline used throughout this material (Intermediate Q2): engineering hours per quarter spent working around the technology's limitations, the incident rate and on-call burden it's directly responsible for, the features that are slower to build or flatly blocked because the current technology can't support them, and — per Advanced Q10 — the hiring and retention cost of staffing a team around a technology that's increasingly a poor fit. Presented next to the migration's estimated cost, "staying costs roughly $X per quarter and rising" versus "migrating costs $Y once" is a decision leadership can actually evaluate, rather than an abstract technical complaint.

**Sequencing it safely, via Strangler Fig:** pick the first slice by lowest risk and clearest boundary, not by which part hurts most today — often a read-only or non-critical-path piece of functionality, migrated first to prove the new technology's behavior under real production load before anything critical depends on it. Run old and new in parallel with a synchronization mechanism during the transition (budgeted explicitly as real engineering work, per Advanced Q3's common pitfall), verify each slice with real traffic before cutting over, and decommission the old path per slice rather than leaving both running "just in case."

**Practical guidance:** write the whole thing up as an ADR (Beginner Q1) documenting the quantified case, the rejected big-bang alternative, and the slice sequence — this converts "we should really migrate off this someday" from a recurring complaint into a funded, trackable roadmap with a first concrete step, the same move used in Intermediate Q11 for any large architectural ask.

---

## Beginner — Question 8

**Q8: What is event storming, and why do architects use it for domain discovery instead of just reading existing documentation or code?**

Event storming (created by Alberto Brandolini) is a collaborative workshop technique for discovering how a business domain actually works, run by covering a wall (physical or digital) with orange sticky notes, each naming one **domain event** — something that happened, written in past tense: "Order Placed," "Payment Declined," "Refund Approved." Domain experts, developers, and product people build the timeline together, in the same room, arguing over the sequence and the edge cases live — the output is a shared, event-ordered map of the business process, not a diagram one person drew alone and circulated for approval.

**Why this beats reading documentation or existing code:** documentation describes what someone *intended* the system to do, and code describes what it *currently* does — neither reliably captures what the business actually needs, especially for a domain nobody has modeled carefully yet. Reading code alone is worse for domain discovery specifically because code answers "how," not "why," and the actual business rules are often scattered across validation logic, database constraints, and tribal knowledge in three different developers' heads, each holding a partial and sometimes contradictory picture. Event storming forces disagreement to surface in the room, in real time — when the fulfillment lead says "Order Shipped" happens before "Payment Captured" and the finance lead insists the opposite, that's not a scheduling detail, it's a previously invisible modeling conflict that would otherwise have been discovered as a production bug.

**How a session typically unfolds:**
1. **Chaotic exploration** — everyone writes domain events they know about, no filtering, no ordering yet; duplicates and gaps are expected and fine at this stage.
2. **Enforce the timeline** — the group physically arranges events left to right in the order they occur, which is where the real disagreements (and real learning) happen.
3. **Add commands, actors, and aggregates** — who or what triggers each event ("Customer submits Place Order"), and which entity owns the invariant behind it — this is where the eventual service or module boundaries start to emerge organically from the domain's own shape, rather than being imposed by an org chart or a technology preference.
4. **Mark pain points and hotspots** — places where the group genuinely disagrees or nobody's sure what happens; these become the highest-priority questions to resolve before design starts, not after.

**Common pitfalls:** running the session without the actual domain experts in the room (developers alone will model their assumptions, not the real business rules); treating the resulting wall as a permanent artifact instead of the discovery tool it is — the value was largely in the conversation itself, not the sticky notes; and stopping at step 1, generating a pile of events with no enforced timeline, which skips the step that actually surfaces disagreement.

**Practical guidance:** run event storming early, before any service boundaries or database schemas are proposed — the emergent groupings of events and their owning aggregates are a strong, evidence-based starting point for bounded contexts, which is far cheaper to get right before code exists than to re-derive from a tangled implementation later.

---

## Beginner — Question 9

**Q9: What's the difference between scaling a system vertically and horizontally, and how does that choice factor into basic capacity planning?**

**Vertical scaling** ("scaling up") means giving a single machine more resources — more CPU, more RAM, a faster disk — to handle more load. **Horizontal scaling** ("scaling out") means adding more machines running the same workload, and distributing load across all of them, typically behind a load balancer. Both increase the system's total capacity; they differ in *how*, and that difference carries very different constraints and costs.

**Why the distinction matters practically, not just semantically:**

| Dimension | Vertical scaling | Horizontal scaling |
|---|---|---|
| Implementation effort | Usually trivial — resize the instance, restart | Often requires real design work — statelessness, session handling, data partitioning |
| Ceiling | Hard limit — the biggest machine available, eventually | Practically unbounded — add more machines |
| Cost curve | Increasingly expensive per unit of extra capacity near the top end (the biggest instances carry a steep price premium) | Roughly linear — ten small machines cost close to ten times one small machine |
| Downtime to scale | Often requires a restart or brief outage | Can typically add capacity with zero downtime |
| Failure characteristics | Single point of failure — that one (bigger) machine going down still takes everything with it | Naturally more resilient — losing one of many machines degrades capacity rather than taking the system down |
| Prerequisite | None — works on almost anything as-is | The application must support running multiple instances correctly (no reliance on local, in-memory state that other instances can't see) |

**Why horizontal scaling isn't automatically "the better default":** it requires the application to actually be built for it — a system holding user sessions in an in-process memory cache breaks the moment a second instance is added, because half of requests land on an instance that's never heard of that session. Making an application horizontally scalable (externalizing session state, ensuring any instance can serve any request, handling data partitioning) is real, deliberate engineering work, not a free switch you flip later — which is why it's a decision worth making consciously early rather than discovering the gap under a traffic spike.

**A simple way to think about capacity planning with this in mind:** start by estimating expected peak load (not average — the number that matters is the worst realistic moment, like a holiday sale or a marketing launch) and how far past today's load that peak needs headroom for. A system with a modest, predictable load and a low peak-to-average ratio may never need to scale past a single, periodically-resized machine — reaching for horizontal scaling there is solving a problem the system doesn't have. A system expecting unpredictable, large traffic spikes needs horizontal scaling designed in from the start, because vertical scaling's ceiling and restart-to-resize characteristics make it a poor fit for sudden, large jumps in demand.

**Common pitfalls:** treating "just scale it up" as a permanent strategy without noticing the cost curve steepening or the single-point-of-failure risk it quietly accepts; and over-engineering for horizontal scale on a system with genuinely low, stable load, paying the statelessness and partitioning tax for a scaling need that will never materialize.

**Practical guidance:** default to vertical scaling for simplicity while load is modest and predictable, but design the application to *tolerate* horizontal scaling (avoid local in-memory state as a load-bearing dependency) well before you actually need it — retrofitting statelessness under production pressure, during an actual capacity crisis, is far more painful than building it in from day one.

---

## Beginner — Question 10

**Q10: How does the practice of architecture actually differ between a startup and an enterprise — is it the same skill applied at different scale, or does the calculus genuinely change?**

It's not the same skill turned up or down — the two contexts optimize for different things, and an architectural instinct that's correct in one is often actively wrong in the other. A startup's central constraint is usually survival and speed of learning: the biggest risk isn't that the architecture won't scale, it's that the company runs out of runway before it learns whether the product is worth building at all. An enterprise's central constraint is usually the opposite: the product's viability is already proven, and the risk shifts to coordination cost across many teams, regulatory and compliance exposure, and the blast radius of a mistake affecting existing paying customers at scale.

**How the calculus actually changes, concretely:**

| Consideration | Startup default | Enterprise default |
|---|---|---|
| Biggest risk | Building the wrong thing before funding runs out | Breaking something that already works, at scale, for existing customers |
| Reversibility bar | Very low — almost everything should be a cheap, fast, two-way-door decision, because the whole product might pivot next quarter | Higher stakes — many decisions genuinely are one-way doors (see Advanced Q12) because of scale, contracts, and integration surface area |
| Team coordination | Minimal — often one team, sometimes one person, making most decisions | Significant — Conway's Law (Advanced Q4) and cross-team governance (Advanced Q11) become first-order concerns |
| Appropriate documentation | Light — an ADR for the rare genuinely hard-to-reverse call; most things live in people's heads because there are few people | Necessary — tribal knowledge doesn't survive at headcount, and undocumented decisions become expensive to reconstruct (see Scenario Q6) |
| Build vs buy default | Strongly favor buy for anything non-differentiating — engineering time is the scarcest resource | Still favor buy for commodities, but security/compliance and long-term TCO get real scrutiny buy decisions can't skip |
| Appropriate process (reviews, RFCs) | Minimal — a two-person conversation often *is* the review | Real process earns its cost — a design affecting many teams needs the review and RFC discipline (Intermediate Q4, Q8) to avoid silent, costly divergence |

**Why applying enterprise instincts at a startup is a real failure mode, not just "being careful":** a startup that insists on a full architecture review board, exhaustive ADRs for every decision, and a reference architecture before the product has found real users isn't being disciplined — it's spending its scarcest resource (time before the runway runs out) on process built for a problem (coordinating hundreds of engineers) it doesn't have yet. The opposite failure — an enterprise team making fast, undocumented, individually-reversible-feeling decisions on a system that's actually deeply integrated with a dozen other teams — is equally real, and tends to produce exactly the untracked, tribal-knowledge debt this material keeps returning to (Beginner Q3, Intermediate Q9).

**Practical guidance:** calibrate process and rigor to the actual current risk profile, not to what "good engineering" is supposed to look like in the abstract — and revisit the calibration explicitly as a company grows, because the instincts that were correct at 10 engineers become actively harmful at 500, and the transition rarely announces itself; it has to be noticed and adjusted for on purpose.

---

## Intermediate — Question 13

**Q13: What is an Architecture Review Board (ARB), what value does it genuinely provide, and how does it become an organizational bottleneck?**

An Architecture Review Board is a standing group — typically senior architects, sometimes with security, data, and platform representation — that reviews significant technical decisions before (or shortly after) teams commit to them, with the authority to approve, block, or send a proposal back for revision. Where an individual architecture review (Intermediate Q4) is one architect or team examining one design, an ARB is a formal, recurring, cross-organizational governance mechanism — it exists specifically to catch the class of risk that no single team is positioned to see: duplicated investment across teams, decisions that quietly violate enterprise-wide standards, and cross-cutting risk (security, compliance, vendor concentration) that a team focused on its own delivery has no reason to notice on its own.

**What it genuinely provides, when it's working:** a forcing function for decisions that would otherwise never get a second, independent look — a team deep in its own delivery pressure is structurally biased toward shipping its own proposal, and an ARB with no stake in that team's deadline can ask the uncomfortable questions a team under pressure won't ask itself. It also creates a single point of institutional memory across the organization's portfolio of architecturally significant decisions (Beginner Q5), which no individual team-level review can provide.

**How it becomes a bottleneck, and why this failure mode is so common:** an ARB that reviews everything, meets infrequently (say, biweekly), and requires a full submission package before a slot is even granted turns "get an architecturally significant decision approved" into a multi-week detour that teams learn to route around — either by shrinking their proposal until it no longer looks significant enough to require review (gaming the trigger), or by quietly shipping first and asking forgiveness later, which defeats the entire purpose of having proactive review at all. The board's own incentives often make this worse: a board that's graded on "how many risky decisions did we catch" tends toward excessive caution and scope creep in what it reviews, while a board with no clear scope drifts into reviewing everything, including decisions far below the bar that actually needs governance (Beginner Q5's reversibility filter applies here too, at the org level).

**How to keep it valuable instead of becoming the thing teams dread:**
1. **Scope it tightly to genuinely architecturally significant decisions** — the same reversibility filter used for any architect's attention (Beginner Q5), applied at the org level: a new vendor with security implications, a decision creating a new de facto enterprise standard, cross-team API contracts. Routine team-level decisions never reach the board.
2. **Make the cadence match the business's speed**, or make async/lightweight review the default with synchronous meetings reserved for genuine disagreement — a two-week wait for a routine approval is what pushes teams toward routing around the board entirely.
3. **Publish clear, written criteria for what needs review**, so teams can self-serve the answer to "do I need the board" instead of guessing or escalating everything defensively.
4. **Track and report on how much the board actually catches vs. how much friction it adds** — an ARB that hasn't changed a decision's outcome in a year is pure overhead; one that's catching real, expensive mistakes is earning its cost, and that data should drive whether to loosen or tighten its scope.

**Practical guidance:** treat the ARB's own scope and process as an architectural decision subject to the same scrutiny as anything else it reviews — if teams are visibly routing around it, that's a direct, measurable signal the board's cost has exceeded its value for the decisions it's currently scoped to catch, and the fix is narrowing scope and speeding cadence, not adding more enforcement.

---

## Intermediate — Question 14

**Q14: Beyond translating a single trade-off (Intermediate Q2), how do you quantify and communicate architectural risk across an entire program to executives who need to compare it against other business risks?**

Translating one trade-off into plain language (Intermediate Q2) works for a single decision in a single conversation. A program with dozens of open architectural risks — some serious, some minor, competing for the same limited remediation budget — needs something executives can actually compare and prioritize against every other risk on their plate (financial, market, legal), not a series of one-off explanations. The tool for this is a **quantified risk register**, using the same likelihood-times-impact discipline used in risk storming (Advanced Q5), but rolled up to a level executives can act on.

**How to build one that executives actually trust and use:**
1. **Name each risk as a specific, concrete failure**, not a vague worry — "the payments service has no redundancy; a single instance failure causes a full checkout outage," not "the payments architecture feels fragile."
2. **Estimate likelihood and impact in terms the business already uses.** Likelihood as a rough frequency (once a quarter, once a year, once in five years) grounded in actual history where available (past incident rate) rather than gut feel. Impact in the business's own units — revenue at risk per hour of outage, customers affected, compliance exposure in dollars or regulatory terms — not "high/medium/low" alone, which different readers interpret inconsistently.
3. **Compute or estimate an expected cost** (roughly, likelihood × impact, annualized) so risks of very different character become comparable on one axis — a rare but catastrophic risk and a frequent but minor one can now sit on the same list and be honestly weighed against each other, and against the cost of the fix.
4. **Pair every risk with a remediation cost and a mitigation status**, so the register isn't just a list of scary things but an actual decision aid: fix now, accept and monitor, or insure against (some risks are cheaper to accept and handle operationally than to engineer away entirely).
5. **Keep the register alive and reviewed on a cadence**, not a one-time slide for a single budget meeting — risk profiles shift as the system and its load change, and a stale register loses trust the same way stale documentation does (Intermediate Q9).

**A simplified example row:**

| Risk | Likelihood | Impact | Annualized expected cost | Remediation cost | Status |
|---|---|---|---|---|---|
| Payments service single point of failure | ~1x/year, based on last 3 years' incident data | ~$180k (avg. 3hr outage × revenue/hr) | ~$180k/yr | ~$60k, one quarter of engineering time | Recommended: fix this quarter |
| Legacy reporting DB on unsupported OS version | ~1x/5 years (unpatched vulnerability exploited) | ~$40k (breach response, limited data exposure) | ~$8k/yr | ~$15k to migrate | Accept and monitor for now; revisit after payments fix |

**Why this format works where prose alone doesn't:** it puts architectural risk on the same footing executives already use for every other kind of business risk — expected cost against remediation cost — so a request for engineering budget to fix an architectural risk competes honestly against a marketing budget request or a legal risk mitigation, instead of being dismissed as abstract technical anxiety or approved reflexively because it sounds alarming.

**Common pitfall:** inflating likelihood or impact estimates to make a pet technical concern win the prioritization fight — this works exactly once; the first time an executive discovers a padded number, every future register from that architect is read with suspicion, which is a far more expensive loss than losing one budget argument honestly.

**Practical guidance:** be as rigorous and conservative with these estimates as you'd want a finance team to be with theirs, cite the actual data behind each number when it exists, and be explicit about which numbers are estimates versus measured — a risk register's entire value rests on being trusted more than a gut-feeling opinion, and that trust is earned by honesty about uncertainty, not by confident-sounding numbers.

---

## Intermediate — Question 15

**Q15: How do you evaluate vendor lock-in risk before adopting a dependency, and how much lock-in is actually acceptable?**

Vendor lock-in is the cost of leaving a dependency once you're using it — and the mistake most teams make is evaluating a vendor purely on its capability and price today, without pricing in how expensive it will be to leave later if the relationship sours, the pricing changes, or a better option appears. Some lock-in is unavoidable and even fine; the discipline is evaluating it explicitly rather than discovering the exit cost only when you actually need to leave.

**A practical framework for evaluating lock-in before committing:**

1. **How proprietary is the interface?** A vendor accessed through a standard, widely-supported protocol (SQL, S3-compatible object storage, OAuth) is far cheaper to leave than one requiring a proprietary SDK with no equivalent elsewhere — the standard-interface case means competitors can be swapped in behind the same integration code; the proprietary case means the integration code itself has to be rewritten.
2. **Can you get your data out, in a usable form, on your own schedule?** A vendor that supports full data export in an open format (CSV, standard SQL dump, documented API) is fundamentally different from one where your data effectively lives only inside their platform — data portability is usually the single biggest driver of actual exit cost, bigger than API differences.
3. **How deeply is the dependency woven through the codebase?** A vendor accessed behind a clean abstraction layer (an interface your application calls, with the vendor SDK hidden behind it — see Advanced Q6 on option value) is swappable with contained, estimable effort. A vendor whose specific concepts (their query language, their proprietary event model) leak directly into application logic throughout the codebase means leaving requires touching that logic everywhere it appears.
4. **What's the realistic alternative, and how many are there?** Lock-in to the only viable provider in a category (there's effectively one company that does what a specific compliance-certified provider does) is a different risk profile than lock-in to one of many interchangeable providers of a commodity capability, even if the technical switching cost looks similar on paper.
5. **What's the business's actual sensitivity to this vendor's failure modes?** A pricing increase is usually survivable with negotiation leverage or a slow migration; a vendor going out of business, having a major outage, or failing a compliance audit your business depends on can be existential — weight the evaluation by how catastrophic, not just how likely, the vendor's failure would be.

**How much lock-in is actually acceptable:** this isn't a call for zero lock-in — building your own version of every commodity capability specifically to avoid lock-in is usually a worse trade than the lock-in itself (see Build vs Buy, Intermediate Q1), and some amount of lock-in is simply the cost of using any vendor at all. The right target is *proportional* lock-in: accept significant, harder-to-reverse lock-in for capabilities that are genuinely commodity, low-risk to switch away from later, or where the vendor's alternative would cost more than the lock-in risk is worth insuring against — and actively minimize lock-in (via abstraction layers, open standards, verified data export) specifically for the dependencies where the business's actual exposure to that vendor's failure is high.

**Common pitfall:** evaluating lock-in only at adoption time and never revisiting it — a vendor that was a reasonable, low-risk choice at a small scale can become a genuinely dangerous concentration risk once the business has grown to depend on it for something now load-bearing and hard to leave, and nobody re-runs the evaluation until a crisis (see Scenario Q11) forces it.

**Practical guidance:** write the lock-in evaluation into the same ADR that documents the vendor decision (Beginner Q1) — name the exit cost explicitly, alongside the capability and price being evaluated, so a future team deciding whether to deepen or reduce the dependency inherits a real assessment instead of having to reconstruct one under pressure.

---

## Intermediate — Question 16

**Q16: What does it mean to evaluate an architecture decision through a "total cost of ownership" (TCO) lens, beyond the build-vs-buy comparison it's most often associated with?**

Total cost of ownership is the discipline of pricing a decision across its *entire* lifecycle — build, run, maintain, secure, staff, and eventually retire — rather than just its upfront cost. It's introduced in this material as one factor within build vs buy (Intermediate Q1), but TCO is a broader lens that applies to nearly every architecturally significant decision, not only "should we buy this or build it": the same discipline applies to choosing a database, a hosting model, a programming language for a new service, or an architecture style.

**The categories TCO forces you to price out, using a new database technology choice as the running example:**

| Cost category | What it includes | Easy to underestimate because... |
|---|---|---|
| Acquisition | License fees, initial infrastructure | This is the number everyone naturally compares upfront |
| Build/integration | Engineering time to adopt it, migrate existing data, build tooling around it | The estimate is made before the real integration surprises are known |
| Operational | Hosting, scaling costs as data grows, monitoring/alerting setup | Scales with success — cheap at launch, expensive once real traffic arrives |
| Maintenance | Patching, version upgrades, schema evolution over years | Invisible day to day; shows up as a recurring tax nobody budgeted for |
| Staffing | Hiring and training people who can operate it well (see Advanced Q10) | Rarely modeled as a cost at all, treated as a fixed headcount that "just exists" |
| Risk/incident cost | On-call burden, expected incident frequency and severity for this technology at this team's maturity with it | Only visible in hindsight, after the incidents happen |
| Exit/retirement | Cost to migrate away or decommission eventually (see Advanced Q14 on sunsetting) | Nobody's thinking about the exit at adoption time — but everything gets replaced eventually |

**Why the upfront-cost comparison alone is systematically misleading:** the categories most often skipped — maintenance, staffing, and eventual exit — tend to be the largest over a multi-year horizon, precisely because they're the least visible at decision time. A "free," self-hosted open-source database looks cheaper than a managed, paid alternative until the staffing and on-call cost of running it reliably at 2am is priced in; a managed vendor's subscription fee looks expensive next to that same open-source option until the same accounting is applied honestly to both sides.

**How to use TCO without turning every decision into a research project:** the rigor should scale with the decision's significance (Beginner Q5) — a routine internal tool doesn't need a five-year TCO model, but a decision that will be expensive to reverse and will run for years deserves at least a rough pass through every category above, even if some numbers are honest estimates rather than precise figures. The point isn't spreadsheet precision; it's forcing the categories that are easy to forget into the comparison before the decision is made, not after the maintenance burden has already been paid for a year.

**Common pitfall:** running a TCO comparison that's honest about the option being rejected but generous about the option being favored — the same discipline of presenting both sides fairly that applies to translating any trade-off (Intermediate Q2) applies here; a TCO model that's quietly built to justify a decision already made isn't TCO, it's motivated reasoning with a spreadsheet.

**Practical guidance:** for any architecturally significant decision, spend one page walking through each TCO category above with real numbers or explicit estimates, attach it to the ADR, and revisit it if the assumptions behind it (scale, team size, usage pattern) change materially — a TCO estimate is a snapshot of assumptions at a point in time, not a permanent verdict.

---

## Advanced — Question 11

**Q11: How do you balance centralized architectural governance against team autonomy, and what determines where a given organization should sit on that spectrum?**

Every organization with more than one team building software sits somewhere on a spectrum between two failure modes, and the healthy zone is neither extreme. Full centralized governance — every technology choice, every schema, every deployment pattern approved by a central authority — produces consistency but kills the speed and ownership that made small, empowered teams valuable in the first place; teams stop innovating because every deviation requires permission, and the center becomes a bottleneck (the same failure mode examined for review boards specifically in Intermediate Q13). Full autonomy — every team choosing its own stack, patterns, and standards with no coordination — produces speed locally but chaos organizationally: duplicated effort, inconsistent security posture, and an operability nightmare when a platform team tries to support a dozen teams' worth of divergent choices, discovered exactly the way Conway's Law predicts (Advanced Q4).

**The framework that resolves this isn't "pick a point on the spectrum" — it's applying different governance levels to different classes of decision, deliberately:**

| Decision class | Appropriate governance level | Why |
|---|---|---|
| Decisions with organization-wide blast radius (auth, core data platform, network/security boundaries) | Centralized — a shared standard, enforced | Divergence here is expensive for everyone, not just the deciding team, and mistakes propagate broadly |
| Decisions affecting only the deciding team, cheap to reverse | Full team autonomy | Central review adds cost with no corresponding risk reduction — this is exactly Beginner Q5's reversibility filter applied at the governance-model level |
| Decisions that are team-local today but could become de facto organizational standards if copied (a novel technology choice, an unusual pattern) | Autonomous, but visible — teams decide, but publish the decision (an ADR, a lightweight notification) so it's discoverable, not centrally gated | Balances speed with the option to intervene before an accidental pattern spreads uncontrolled |

This is often called **federated governance**: a small set of genuinely cross-cutting standards set and enforced centrally (ideally via fitness functions, Intermediate Q3, so enforcement is automatic rather than a person's approval bottleneck), with everything else left to team judgment, inside guardrails rather than gates.

**Why getting this classification right matters more than picking "more" or "less" governance in the abstract:** an organization that centralizes the wrong decisions (say, requiring central approval for internal library choices, which is low-risk and team-local) pays the coordination tax without buying real risk reduction, and teams predictably route around it — the exact review-board bottleneck pattern (Intermediate Q13). An organization that leaves the wrong decisions fully autonomous (say, each team independently deciding its own authentication approach) buys speed today at the cost of a security and operability mess that a platform team inherits later, at a much higher cost to fix than it would have cost to govern upfront.

**Common pitfall:** treating the governance level as a fixed, permanent org design rather than something that should shift as the organization matures — a five-team startup can often run almost everything on autonomy with light, informal coordination; the same posture at fifty teams silently accumulates the fragmentation costs Conway's Law predicts, and the transition to more deliberate federated governance needs to be a conscious redesign, not something that happens automatically.

**Practical guidance:** make the classification explicit and written down — which decisions require central alignment, which are team-local, and which need visibility without a gate — and revisit it at deliberate intervals as headcount and team count grow, rather than letting the governance model calcify around whatever informally worked at a smaller scale.

---

## Advanced — Question 12

**Q12: What's the difference between a "one-way door" and a "two-way door" decision, and how should that distinction change how fast — and by whom — a decision gets made?**

The one-way door / two-way door framing (popularized by Amazon) sorts decisions by a different axis than significance alone (Beginner Q5): a **two-way door** decision is one you can walk back through — reverse cheaply, quickly, with limited cost, if it turns out wrong. A **one-way door** decision is one you can't easily walk back through — reversing it is slow, expensive, or in the extreme, effectively impossible. The insight this framing adds beyond "is this architecturally significant" is prescriptive: it says the *process* used to make a decision should match which kind of door it is, not just that the decision deserves attention.

**Why this changes process, not just risk-awareness:** a two-way door decision made slowly, with a full review cycle, a design doc, and a committee sign-off, wastes the organization's speed for no corresponding safety benefit — if it's wrong, you just walk back through the door and try again at low cost, so the expensive process bought nothing. Applying heavy process uniformly to every decision, regardless of door type, is a subtler version of the same waste examined in review-board bottlenecks (Intermediate Q13): process that doesn't discriminate by actual risk becomes a tax on everything, including the decisions that never needed it.

**How to actually classify a decision as one-way or two-way, concretely:**

| Question | One-way door signal | Two-way door signal |
|---|---|---|
| Does reversing it require a data migration? | Yes | No — a config change or code deploy suffices |
| Does it lock in a public commitment (a versioned public API, a contractual SLA)? | Yes | No — purely internal |
| Would reversing it require coordinating multiple teams, not just the deciding one? | Yes | No |
| Can it be shipped behind a flag, to a subset of traffic, and rolled back instantly if wrong? | No | Yes |

This overlaps heavily with the reversibility filter from Beginner Q5, but adds a crucial operating-model conclusion: **two-way doors should be delegated and decided fast, by the people closest to the work, without waiting for architect or committee sign-off** — the cost of a wrong two-way-door decision is walking back through it, which is cheap, while the cost of *slow* two-way-door decisions, multiplied across every team, every week, is a real and compounding organizational tax that dwarfs the occasional wrong call.

**The corresponding discipline for one-way doors:** these deserve the full weight of this material's other tools precisely because the reversal cost is real — risk storming (Advanced Q5) to surface what could go wrong before committing, a proper architecture review (Intermediate Q4), and an ADR (Beginner Q1) recording the reasoning, because a bad one-way-door decision is exactly the kind of mistake that's expensive to discover late and impossible to walk back cheaply.

**Common pitfall — misclassifying a decision in either direction:** treating a decision as two-way when it's actually one-way (shipping a public API field "we can always change it later," discovering external consumers depend on it within weeks — see Advanced Q8) causes real damage. The opposite error — treating an actually-reversible, team-local decision as if it needs one-way-door scrutiny — is the more common failure in mature organizations, and it's what quietly produces an organization full of people afraid to decide anything without permission, because nobody has clearly named which doors are actually one-way.

**Practical guidance:** make "which kind of door is this" an explicit, fast first question before any decision-making process begins, not an afterthought — and design the organization's default process for the common case (most decisions genuinely are two-way doors) to be fast and delegated, reserving the heavier machinery specifically for the minority that are truly one-way.

---

## Advanced — Question 13

**Q13: Under what circumstances is a big-bang rewrite actually the right call, given that incremental modernization via Strangler Fig (Advanced Q3) is the strongly preferred default?**

The default answer throughout this material, for good reason, is incremental: Strangler Fig lets you reverse course, learn as you go, and never bets the whole business on a single cutover. But treating "incremental, always" as an absolute rule rather than a strong default is itself a mistake — there's a real, if narrow, set of conditions under which a big-bang rewrite (or at least a much larger, less incremental cutover than Strangler Fig typically implies) is genuinely the correct call, and an architect needs to be able to recognize those conditions rather than dogmatically defaulting to incrementalism when it doesn't actually fit.

**The conditions under which big-bang becomes the right call, not just the tempting one:**

1. **A hard external forcing function with a fixed, non-negotiable date** — a vendor is discontinuing a platform you depend on entirely (an end-of-life mainframe, a deprecated cloud service with a hard shutdown date), a regulatory change mandates a specific new capability by law, or a critical security vulnerability in unsupported infrastructure has no incremental patch path. Here, "incremental, taking longer but lower risk per step" isn't actually available as an option, because the clock doesn't negotiate.
2. **The old and new systems genuinely cannot coexist**, technically or operationally — sometimes the old architecture's fundamental assumptions (a data model, a consistency guarantee, a security boundary) are incompatible with the new one in a way that makes a synchronized dual-running period (the core mechanism Strangler Fig depends on) infeasible to build safely, not just expensive.
3. **The system is small and low-risk enough that "big bang" doesn't actually carry big-bang-scale risk** — a genuinely small, low-traffic, low-criticality system with a handful of well-understood integration points can sometimes be safely replaced wholesale in a way that would be reckless for anything larger; the label "big bang" is really about risk concentration, and a small system concentrates very little risk even in a single cutover.
4. **The cost of running two systems in parallel (Strangler Fig's own well-documented tax, Advanced Q3) exceeds the cost of the risk being avoided** — for a system with a simple, well-bounded scope, building and maintaining a synchronization layer between old and new for months can genuinely cost more, in both money and risk surface, than a well-tested, well-rehearsed single cutover with a solid rollback plan.

**How to make a big-bang decision responsibly, when one of these genuinely applies:** treat it with *more* upfront risk assessment, not less — risk storming (Advanced Q5) specifically focused on the cutover itself, a rehearsed rollback plan tested before the real cutover (not designed on paper and never exercised), and the heaviest possible investment in pre-cutover verification (shadow traffic, parallel-run validation of outputs) precisely because there's no gradual, low-stakes way to discover a mistake after the fact.

**Common pitfall:** rationalizing a big-bang rewrite under the label of one of these conditions when the real reason is impatience with Strangler Fig's slower pace, or a team's preference for a clean-slate rewrite over the harder work of untangling an existing system incrementally — the conditions above are genuinely narrow, and "we didn't want to do the incremental work" is not the same claim as "incremental modernization was not technically available to us."

**Practical guidance:** require an explicit, written justification against these specific conditions — not general dissatisfaction with the current system — before approving a big-bang approach, and hold that justification to the same scrutiny Scenario Q1 applies to a team proposing a rewrite for "the old code is bad" alone; the bar for skipping the strongly-preferred default should be genuinely high and specific, not a matter of preference.

---

## Advanced — Question 14

**Q14: How should an architect approach sunsetting or deprecating a system that active stakeholders still depend on, as a designed process rather than an afterthought?**

Systems get built, but architecture rarely treats their retirement with the same deliberate design attention given to their construction — deprecation tends to be handled ad hoc, as a scramble, once someone finally notices a system is costing more to keep than it's worth. That asymmetry is backwards: a system that's expensive or risky to retire safely is exactly the kind of situation this material keeps returning to — an undocumented dependency (Scenario Q6), a load-bearing "temporary" fixture (Scenario Q4), a vendor or technology nobody planned an exit from (Intermediate Q15). Treating sunsetting as a first-class architectural discipline, planned as deliberately as a migration, is what prevents deprecation from becoming its own crisis.

**The discipline, as a sequence:**

1. **Map actual current dependents, not assumed ones.** The same blast-radius exercise used for any load-bearing workaround (Scenario Q4) — instrument the system to find out who's actually calling it, reading its output, or relying on its side effects today, because the answer is reliably different (and larger) than whoever originally scoped its users.
2. **Classify dependents by how hard they are to migrate**, not just how many there are — a handful of internal consumers you can coordinate directly with is a very different problem than a long tail of external partners you can't force onto a timeline, which is the same asymmetry that makes public API changes expensive to reverse (Advanced Q8).
3. **Build and communicate a genuine migration path, not just a shutoff date.** A deprecation notice with a date and no replacement, or no help getting there, reads to dependents as abandonment rather than a plan — provide the equivalent capability, migration tooling or documentation, and a realistic timeline informed by how long dependents actually need, not how fast the owning team wants to be done with it.
4. **Run the deprecation itself incrementally, using the same Strangler-Fig-style discipline used for building new systems (Advanced Q3), in reverse** — redirect or migrate the easiest, most cooperative dependents first, monitor usage of the old system as it shrinks, and use dropping real usage as the evidence that it's actually safe to remove, rather than trusting an announcement alone.
5. **Keep a hard, communicated final date and hold it**, once genuine migration support has been offered — an indefinitely extended deprecation, granted every time a stakeholder pushes back, teaches the organization that deprecation dates are theoretical, and the old system never actually gets removed, compounding its cost indefinitely.

**Why stakeholder resistance to sunsetting is often legitimate, not just inertia:** a stakeholder who resists losing a system isn't automatically being obstinate — they may be depending on a specific behavior (an undocumented report format, a timing guarantee) that the deprecation plan hasn't accounted for, in which case the resistance is surfacing a real gap in the migration plan, the same way pushback in an architecture review sometimes surfaces a real requirement the reviewer missed (Intermediate Q4). The right response is to investigate the specific dependency before assuming the resistance is unreasonable.

**Practical guidance:** treat "how will this eventually be retired" as a question worth at least a brief answer at the time a system is *built*, not only when retirement finally becomes urgent — a system designed with clean boundaries, documented dependents, and no deeply-buried implicit behavior is dramatically cheaper to sunset later than one that accreted undocumented dependents for years with no owner ever tracking who relied on what.

---

## Scenario — Question 8

**Q8: A legacy internal reporting system is expensive to maintain and clearly should be retired, but a small group of power users — including a VP who built their team's workflow around it — actively resist losing it. How do you navigate the sunsetting?**

This is Advanced Q14's framework under real organizational pressure, and the trap is treating the VP's resistance as a political obstacle to be overcome rather than a signal that might be pointing at a real gap in the sunsetting plan. Architects who've internalized "legacy systems should be retired" as a general truth sometimes stop investigating the *specific* reasons for resistance once they've decided the system is obviously a liability — which is exactly how a technically sound decision turns into an unnecessary organizational fight.

**How to work through it:**

1. **Find out precisely what the power users actually depend on, not the system in the abstract.** Sit with them and their workflow directly — is it a specific report format nothing else replicates, a timing guarantee (data available by 6am, which a newer system's batch schedule doesn't match), or genuinely just familiarity and resistance to change? Each answer changes the plan completely, and guessing instead of asking is how deprecation plans miss the one dependency that actually matters.
2. **Quantify the cost of keeping it, the same way any staying-cost case gets built (Scenario Q7).** Maintenance burden, security exposure of unpatched legacy infrastructure, the engineering time it consumes that could go toward the replacement, and the opportunity cost of the team that has to keep it alive — put a real number on it so "we should retire this" isn't just an aesthetic preference against old technology.
3. **If the dependency is real and specific (say, an exact report format the VP's team built quarterly planning around), treat that as a genuine requirement for the replacement, not an obstacle to argue past.** Build that specific capability into the migration path deliberately, the same way Advanced Q14 calls for a real migration path rather than a bare shutoff date — this converts the VP from an opponent of the plan into a validated requirement the new system has to meet.
4. **If the dependency turns out to be pure inertia rather than a functional gap, don't let that alone become the case for keeping the system** — familiarity is real, but it's not the same category of cost as a genuine functional gap, and it doesn't compound the way the legacy system's maintenance burden does. Address it with training, a clear migration date, and direct support during the transition rather than an indefinite extension.
5. **Escalate the trade-off explicitly to whoever has authority over both the VP and the maintaining team**, using the same quantified framing as any executive risk communication (Intermediate Q14) — "keeping this costs $X per year in maintenance and security exposure; the identified functional gap costs $Y to close in the replacement; here's the recommended path and timeline" — rather than letting the VP's seniority alone settle a technical question that has a real, calculable answer.

**Why this works better than either overriding the VP or indefinitely delaying the retirement:** overriding a legitimate functional dependency without addressing it doesn't make the dependency disappear — it just means the retirement breaks something real, damages trust in the next migration, and often forces the old system to be quietly resurrected under worse conditions than a planned migration would have offered. Indefinitely delaying to avoid the conflict lets the maintenance cost compound (Beginner Q3) with no plan to ever actually stop paying it. Investigating the specific dependency, building the real gap into the migration, and holding a firm date once that gap is closed gets the system retired without an unforced political fight.

---

## Scenario — Question 9

**Q9: Your Architecture Review Board has become a two-week bottleneck, and teams have started quietly shipping first and asking forgiveness later rather than submitting proposals. How do you fix the governance model without losing the risk oversight the board was created to provide?**

This is Intermediate Q13's bottleneck failure mode fully realized, and the instinct to respond by tightening enforcement — mandating the board be consulted, adding audit checks to catch teams who skip it — treats the symptom, not the cause, and will make the underlying problem worse: teams already routing around a slow process will get better at hiding it, not more compliant, and the board's actual purpose (catching real cross-cutting risk before it ships) gets further from being served, not closer. The real fix is diagnosing why teams found bypassing the board rational in the first place, and redesigning the governance model so following it is actually the faster path.

**How to diagnose and fix it:**

1. **Find out what teams are actually shipping without review, and whether any of it has caused real problems.** This tells you two critical things at once: whether the board's current scope is genuinely too broad (catching low-risk decisions that never needed review, which is why teams don't bother) or whether real risk is slipping through unreviewed (which makes this urgent to fix, not just annoying).
2. **Re-scope what actually requires the board, using the same reversibility filter (Beginner Q5) applied at the governance level (Advanced Q11).** In most cases that have reached this point, the board has quietly scope-crept into reviewing decisions that were never architecturally significant enough to justify a two-week wait — narrowing scope to genuinely one-way-door, cross-cutting decisions (Advanced Q12) usually removes the majority of submissions and the majority of the backlog in one move.
3. **Separate the board's two functions — review and enforcement — and speed up review specifically.** Move routine, lower-ambiguity approvals to an async written process (a short proposal, a defined SLA for written feedback, escalate to a live meeting only on genuine disagreement) rather than requiring every submission to wait for a scheduled synchronous slot; reserve the meeting for the small number of proposals that actually need debate.
4. **Publish the new criteria and cadence clearly, and make the case explicitly to teams that this is a real change, not a promise** — teams that have already learned the board is a bottleneck to route around won't trust a policy update alone; they need to see submissions actually turn around fast a few times before behavior shifts back.
5. **Instrument the new process the way you'd instrument any fitness function (Intermediate Q3)** — track submission volume, turnaround time, and how often review actually changes a decision's outcome, so the board's scope and speed can keep being tuned against real data rather than drifting back into the same failure mode unnoticed.

**Why enforcement alone would have failed here:** the underlying incentive — the board is slower than shipping without it, and teams are optimizing for their own delivery pressure exactly as any team under deadline pressure would (see Scenario Q3) — doesn't change just because bypassing it now carries a compliance risk on top of the time cost; it just pushes the workaround further underground, and the architect loses visibility into real risk instead of gaining oversight of it.

**Practical guidance:** treat "teams are routing around governance" as data about the governance model's design, not about the teams' discipline — a bottleneck is a design flaw in the process, and the fix that actually restores oversight is making the compliant path the fast path, not making the fast path riskier to take.

---

## Scenario — Question 10

**Q10: During a seasonal traffic spike, a core service starts timing out under load with no time to redesign it properly. Do you scale it vertically to survive the spike, or is this the moment to force through horizontal scaling — and how do you decide under pressure?**

This is capacity planning (Beginner Q9) under the worst possible conditions — no time, real customer impact accumulating by the minute, and a decision that has to be made now, not researched carefully over a week. The instinct to treat this as "we should have built this horizontally scalable already, let's fix that now" is understandable but dangerous in the moment: retrofitting statelessness and horizontal scaling into a service that wasn't built for it, live, during an active incident, is exactly the kind of change most likely to introduce a second, worse failure on top of the first.

**How to actually decide, in the moment:**

1. **Ask the only question that matters right now: can this service run more than one instance safely, today, as it's currently built?** If it holds in-memory session state, relies on local file writes other instances can't see, or has any other single-instance assumption baked in, horizontal scaling right now isn't a faster fix — it's a second incident waiting to happen, because you'd be shipping an unvalidated architectural change under the worst possible testing conditions.
2. **If vertical scaling is available and the current instance genuinely has room to grow, take it — it's almost always the safer, faster stopgap during an active incident.** Resizing an instance is a well-understood, low-risk operation compared to introducing multi-instance behavior for the first time under load; the goal during an active incident is stabilizing the system with the least novel risk, not architecting the ideal long-term solution.
3. **If vertical scaling has already hit its ceiling (the biggest available instance is already running and still can't keep up), horizontal scaling becomes necessary, not optional — but scope it as narrowly as possible.** Don't attempt a full redesign live; look for the minimal, safe way to run a second instance (a read replica behind a load balancer for read-only traffic, for instance, if writes are the part that isn't safely parallel) rather than solving the general case under pressure.
4. **Use every other lever before or alongside scaling** — shedding non-critical load (turning off a non-essential feature consuming the same capacity), adding caching in front of the hot path, or rate-limiting lower-priority traffic can buy meaningful headroom without touching the scaling model at all, and these are typically lower-risk than either scaling path during an active incident.

**After the spike passes — the part that actually matters for next time:** this incident is the risk-storming exercise (Advanced Q5) the team should have run before the season started, arriving instead as a live production event. Run the retrospective honestly (Advanced Q9): was hitting this ceiling reasonable given what was known, or was it avoidable — did anyone flag the capacity risk before the season and get deprioritized under other work? Either way, the corrective action is the same: before the next known seasonal peak, deliberately decide and build for the vertical-vs-horizontal question in advance, with load testing against realistic peak numbers, so the next spike is handled by capacity already designed for it rather than another live, high-stakes improvisation.

**Practical guidance:** during the incident, optimize for the least novel, most reversible mitigation available, even if it's not the "correct" long-term architecture — an incident is exactly the wrong moment to introduce untested architectural changes, and the discipline of choosing the safest stopgap now, then treating the underlying capacity gap as a real, funded piece of follow-up work, is what actually prevents a repeat next season.

---

## Scenario — Question 11

**Q11: A key vendor your platform depends on heavily suddenly triples its pricing at renewal, and it becomes clear during the scramble that nobody had ever assessed how locked in you actually were. How do you respond, and what do you fix so this doesn't happen again?**

This is vendor lock-in risk (Intermediate Q15) discovered the expensive way — under negotiating pressure, with no prior assessment to draw on, which is the worst possible time to be evaluating exit cost for the first time. The immediate temptation is to either capitulate to the new pricing because leaving looks too risky to even consider on this timeline, or to announce an emergency migration without actually knowing what that migration costs — both are decisions made blind, and blind decisions under pressure tend to be expensive ones.

**How to respond in the moment:**

1. **Do the lock-in assessment now that should have existed already, as fast as honestly possible** — how proprietary is the integration, can the data actually be exported in usable form, how deeply does the vendor's specific model leak into application code, and what would a realistic (not optimistic) migration timeline and cost actually look like. This is the Intermediate Q15 framework, compressed into days instead of the calm evaluation it should have had at adoption time.
2. **Use the assessment to establish real negotiating leverage, even if leaving isn't ultimately the right call.** A vendor that knows you have a costed, credible exit path negotiates very differently than one that knows you have no alternative — even a partial migration plan, credibly presented, often moves the pricing conversation more than pure appeal to the relationship.
3. **Run the TCO comparison (Intermediate Q16) honestly for both staying at the new price and migrating**, including the categories that are easy to skip under pressure — the migration's own engineering cost, the risk of the migration itself going wrong on a compressed timeline, and the ongoing operational cost of whatever replacement is being considered — rather than reflexively choosing the path that feels less scary in the moment.
4. **If staying is the right near-term call (often true, given how expensive a rushed migration's own risk can be), negotiate a bridge, not a permanent acceptance** — a shorter contract term, a price freeze while a deliberate, properly-sequenced migration (via Strangler Fig, Advanced Q3, not a rushed cutover) is planned and executed on a realistic timeline.
5. **If migrating is the right call, sequence it the way any large de-risked change should be sequenced** (Scenario Q7's pattern) — quantify the case, pick the lowest-risk slice first, and avoid compounding the original mistake (no lock-in assessment) with a new one (a rushed, unplanned cutover).

**What to actually fix afterward, so this doesn't recur:** the root cause here isn't the vendor's price increase — vendors are entitled to reprice, and a business relying entirely on a vendor's goodwill not to do so was always exposed. The root cause is that no lock-in evaluation existed for a dependency that turned out to be load-bearing, discovered only under crisis pressure. Fix that specifically: require a lock-in assessment (Intermediate Q15) as a standard part of adopting any vendor above a defined significance threshold, and periodically re-run the assessment for existing critical vendors as the business's dependency on them deepens over time — the same "revisit, don't just evaluate once" discipline this material applies to technical debt (Beginner Q3) and reference architectures alike.

**Practical guidance:** treat every vendor renewal for a significant dependency as a scheduled trigger to re-check the lock-in assessment before the negotiation starts, not after a shock forces it — the entire value of doing this work is having it ready before you need the leverage, not scrambling to produce it under a deadline the vendor set, not you.

---

## Scenario — Question 12

**Q12: Your company is legally required to migrate off an end-of-life platform within six months due to a vendor-mandated shutdown — there's no time for an incremental Strangler Fig migration. How do you run a responsible big-bang cutover under a genuinely fixed deadline?**

This is Advanced Q13's narrow big-bang justification arriving for real: a hard external forcing function with a fixed date the business doesn't control. The mistake to avoid here is treating "we have to move fast" as license to skip the risk discipline that normally comes from Strangler Fig's incremental pace — a compressed timeline is exactly when that discipline matters most, it just has to be compressed and reordered to fit inside a single cutover instead of spread across many small ones.

**How to run it responsibly under real time pressure:**

1. **Confirm the constraint is actually as fixed as it's being presented, and understand its exact shape.** Is the six-month date the platform's genuine hard shutdown, or a vendor's initial announcement with historical precedent for extension? Get this confirmed in writing rather than assumed — the entire plan depends on how real and how immovable the deadline actually is, and this is worth spending real effort to verify before committing to big-bang risk on the strength of an assumption.
2. **Compress the risk-assessment work Strangler Fig would normally spread over months into an intensive upfront pass.** Run risk storming (Advanced Q5) specifically on the cutover itself — every integration point, every single point of failure, every unverified assumption about how the new platform will behave under real production load — and prioritize ruthlessly by what's most likely to fail and most expensive if it does, because there's no time to catch everything with equal depth.
3. **Build and rehearse the rollback plan before the real cutover, not as a theoretical fallback.** A rollback plan that's never been exercised is not a real safety net — schedule an actual rehearsal, on a realistic environment, with the team that will execute the real cutover, so the rollback path is proven rather than assumed.
4. **Use every low-cost verification technique available even without full Strangler Fig, to avoid cutting over blind.** Shadow traffic to the new platform in parallel with the old one for as much of the timeline as possible, parallel-run output comparison on real data, and a staged internal-only or limited-blast-radius rehearsal before the full cutover — none of these require the months Strangler Fig normally takes, but they meaningfully reduce the risk of the single cutover itself.
5. **Communicate the constraint and the plan honestly up the chain**, using the same translation discipline as any trade-off (Intermediate Q2) — "we have a legally fixed date, here's the compressed risk plan we're running instead of our normal incremental approach, and here specifically is the residual risk that compression leaves us carrying" — so leadership understands this is a deliberately elevated-risk path taken because the alternative (missing a legal deadline) is worse, not because the team skipped the normal discipline out of convenience.

**Why documenting the justification matters here specifically:** this is exactly the scenario Advanced Q13 warns needs a genuinely high, specific bar — a legally mandated platform shutdown clears that bar cleanly, and writing the ADR (Beginner Q1) that states the constraint, the compressed risk process used, and the residual risk accepted protects the decision from being second-guessed later as recklessness, when it was in fact the disciplined response to a constraint nobody on the team chose.

**Practical guidance:** a forced big-bang deadline is not permission to skip risk management — it's a demand to compress it, prioritize ruthlessly, and rehearse relentlessly, because the absence of Strangler Fig's gradual, self-correcting rollout means every other risk-reduction technique available has to carry more weight than it would normally need to.

---

## Scenario — Question 13

**Q13: A product team, operating under a genuinely autonomous "two-way door" mandate, independently adopted a data model that turns out to have been a one-way door — it's now deeply embedded in customer-facing contracts and can't be cheaply reversed. Whose failure is this, and how do you fix the governance without crushing the autonomy that made the team fast in the first place?**

This is Advanced Q12's classification framework failing in the one direction that actually causes damage — a decision was treated as reversible and delegated accordingly, but turned out to be a one-way door, and the mistake surfaces only after the cost of reversing it has already become real. The instinct to respond by clawing back autonomy broadly — requiring central review for every data model decision going forward — punishes the entire organization for a misclassification in one instance, and reproduces the exact governance-bottleneck failure mode (Intermediate Q13, Scenario Q9) this material keeps warning against.

**How to work through it without overcorrecting:**

1. **Diagnose whether this was a misclassification or a process failure, because the fix is different for each.** Did the team have the information needed to recognize this was actually a one-way door (customer contracts were already being negotiated against this data model when the decision was made) and miss it — a training and judgment gap? Or was the door-type genuinely ambiguous at decision time, and it only became one-way *after* other teams and contracts built on top of it — a case that was reasonable at the time (Advanced Q9's distinction) and became irreversible through nobody's fault?
2. **Fix the specific gap in the classification criteria that let this slip through, rather than removing autonomy generally.** If the actual failure was "the team didn't know that anything touching customer contract terms is automatically a one-way-door signal regardless of how reversible it looks technically," that's a concrete, narrow addition to the shared classification checklist (Advanced Q12) — not a reason to require central review of every team-local decision going forward.
3. **Address the immediate damage using the same rigor as any expensive-to-reverse mistake** — assess the actual cost and blast radius of the data model now (who depends on it, what would it take to migrate), build the case with real numbers (Scenario Q7's staying-cost/migrating-cost framing), and treat it as a real, funded piece of remediation work rather than either ignoring it or demanding an emergency fix that introduces new risk under pressure.
4. **Run the retrospective the way Advanced Q9 prescribes** — reasonable-at-the-time versus avoidably-wrong, without turning it into blame, because a team that gets punished for a genuinely reasonable judgment call under a real autonomy mandate will stop making autonomous decisions at all, which defeats the entire point of the governance model they were operating under.
5. **Reinforce, explicitly, that the autonomy model itself isn't being reversed** — the team's authority to make two-way-door decisions fast, without central sign-off, remains the default; what's changing is a sharper, shared understanding of which signals reliably mean a decision that looks two-way is actually one-way, applied going forward by every team operating under the same autonomy, not just the one that got burned.

**Why overcorrecting toward central control is the more common and more costly mistake here:** the organization adopted federated governance (Advanced Q11) specifically because full central review was too slow to sustain the pace it needed — one painful misclassification, however costly, is a single data point, and reflexively reversing the entire operating model in response is a much larger, permanent cost traded against a single incident's cost, which rarely holds up under the same expected-value scrutiny (Intermediate Q14) applied to any other risk decision.

**Practical guidance:** treat this the way a mature engineering organization treats a production incident — a blameless retrospective that produces a specific, narrow fix to the actual gap in judgment or process, not a broad rollback of the autonomy that was working correctly everywhere else it was applied.

---
