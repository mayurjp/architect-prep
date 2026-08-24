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
