# Angular — Q&A

## Beginner — Question 1

**Q1: What is Angular, and what problem does it solve?**

Angular is a TypeScript-first, opinionated framework (not just a library) for building single-page applications (SPAs), maintained by Google. "Opinionated" is the key word: unlike React, which is a rendering library you assemble a stack around, Angular ships with routing, forms, HTTP client, dependency injection, testing utilities, and a CLI all built in and designed to work together out of the box.

**The problem it solves:** before SPA frameworks, browser apps were built as server-rendered pages with jQuery sprinkled on top for interactivity — every navigation meant a full page reload, and DOM manipulation code became unmaintainable as complexity grew. Angular (and its peers) let you build a component-based UI where the browser holds application state, the DOM updates declaratively in response to that state, and navigation between "pages" happens client-side without a full reload.

**Core building blocks:**
- **Components** — TypeScript classes decorated with `@Component`, pairing a template (HTML) with logic and state.
- **Templates** — HTML extended with Angular's binding syntax (interpolation, directives, event handlers).
- **Services + Dependency Injection** — reusable, injectable classes for logic that doesn't belong in a component (HTTP calls, shared state, business logic).
- **Modules or standalone components** — the unit of composition and lazy-loading boundary (see Q4).
- **RxJS** — Angular leans heavily on reactive streams for async data (HTTP responses, router events, form value changes).

**Common pitfall:** treating Angular like a lightweight library and fighting its conventions (e.g., avoiding DI, manually querying the DOM) leads to code that's harder to test and maintain than idiomatic Angular. Its opinionated structure is a feature — it gives large teams a shared, consistent way to build features.

**Practical guidance:** Angular tends to be favored in enterprise contexts — exactly where a "backend-in-.NET, frontend-in-Angular" pairing is common — because its batteries-included approach, strict TypeScript typing, and CLI-enforced project structure scale well across large teams and long-lived codebases, at the cost of a steeper initial learning curve than React.

#### Follow-up: Why is Angular written in and for TypeScript specifically?

TypeScript is a superset of JavaScript that adds static typing, interfaces, decorators, and compile-time checking. Angular is built with TypeScript and expects it: `@Component`, `@Injectable`, and `@Input` are TypeScript decorators, and the framework's tooling (the Angular Language Service, strict template type-checking) relies on type information to catch binding errors — like passing a `string` to an `@Input()` typed as `number` — at build time rather than as a runtime bug in production. It also makes refactoring large codebases dramatically safer, since renaming a property or changing a method signature surfaces every broken call site immediately instead of failing silently at runtime.

---

## Beginner — Question 2

**Q2: Explain Angular components and templates, and the four types of data binding.**

A component is a TypeScript class decorated with `@Component`, which associates it with an HTML template, optional styles, and a CSS selector used to instantiate it in other templates.

```typescript
@Component({
  selector: 'app-user-card',
  standalone: true,
  template: `
    <div class="card" [class.vip]="user.isVip" (click)="select()">
      <h3>{{ user.name }}</h3>
      <input [(ngModel)]="user.nickname" />
    </div>
  `
})
export class UserCardComponent {
  @Input() user!: { name: string; isVip: boolean; nickname: string };
  select() { console.log('selected', this.user.name); }
}
```

**The four binding types:**

1. **Interpolation** `{{ expression }}` — renders a component property as text inside the template. One-way, component → view.
2. **Property binding** `[property]="expression"` — binds a DOM element/component property (not an HTML attribute) to a component value. E.g. `[class.vip]="user.isVip"` toggles a CSS class; `[disabled]="isLoading"` sets the `disabled` DOM property directly (not the string attribute).
3. **Event binding** `(event)="handler($event)"` — wires a DOM or custom component event to a component method. View → component.
4. **Two-way binding** `[(ngModel)]="expression"` — syntactic sugar ("banana in a box") combining property and event binding: `[ngModel]="value" (ngModelChange)="value = $event"`. Requires importing `FormsModule` (or the `FormsModule` import in a standalone component).

**Mechanism:** Angular compiles templates ahead-of-time (AOT, the default since Angular 9) into JavaScript instructions that create and update DOM nodes directly — templates aren't parsed at runtime. Bindings are re-evaluated during change detection (see the Advanced tier) and only touch the DOM when a value actually changed.

**Common pitfall:** confusing property binding with attribute binding — `[value]="x"` sets the live DOM property, while `value="x"` sets a static HTML attribute that doesn't update. For custom attributes with no matching DOM property (e.g., `aria-*`), you need explicit attribute binding: `[attr.aria-label]="label"`.

---

## Beginner — Question 3

**Q3: What's the difference between structural and attribute directives? Give examples.**

Directives are classes that attach behavior to DOM elements. Angular has three kinds: components (directives with a template), attribute directives, and structural directives.

**Attribute directives** change the appearance or behavior of an existing element without adding or removing it from the DOM.

```html
<div [ngClass]="{ active: isActive, disabled: isDisabled }">...</div>
<div [ngStyle]="{ color: textColor }">...</div>
```

`ngClass` and `ngStyle` are built-in attribute directives; you can write your own with `@Directive` (e.g., a `appHighlight` directive that changes background color on hover using `HostListener`/`HostBinding`).

**Structural directives** add, remove, or repeat entire chunks of DOM based on a condition, identified by the leading `*` shorthand.

```html
<div *ngIf="user.isLoggedIn; else guestBlock">Welcome, {{ user.name }}</div>
<ng-template #guestBlock>Please log in.</ng-template>

<ul>
  <li *ngFor="let item of items; trackBy: trackById; let i = index">
    {{ i }}: {{ item.name }}
  </li>
</ul>
```

**Mechanism:** the `*` prefix is sugar. `*ngIf="cond"` desugars to `<ng-template [ngIf]="cond"><div>...</div></ng-template>` — `ngIf` actually destroys and recreates the embedded view, unlike CSS `display: none`, which only hides it. This matters: `*ngIf="false"` tears down component instances (running `ngOnDestroy`, losing form state), while a CSS-hidden element stays alive.

**Modern replacement:** Angular 17+ introduced built-in control flow (`@if`, `@for`, `@switch`) as a template syntax replacing `*ngIf`/`*ngFor`/`*ngSwitch`. It's compiled more efficiently (no `ng-template` indirection), has better type-narrowing in strict mode, and `@for` requires an explicit `track` expression (the modern equivalent of `trackBy`), which prevents the accidental-full-list-rerender pitfall common with `*ngFor`.

```html
@if (user.isLoggedIn) {
  <div>Welcome, {{ user.name }}</div>
} @else {
  <div>Please log in.</div>
}
@for (item of items; track item.id) {
  <li>{{ item.name }}</li>
}
```

**Common pitfall:** stacking two structural directives on one element (`<div *ngIf="x" *ngFor="let y of ys">`) — not allowed, since each desugars to its own wrapping `<ng-template>`. You need a wrapping element (or `<ng-container>`) for one of them.

---

## Beginner — Question 4

**Q4: What's the difference between NgModules and standalone components?**

**NgModules (`@NgModule`)** were, until Angular 14, the mandatory unit of compilation and dependency organization. Every component, directive, and pipe had to be declared in exactly one module, and a module's `imports` array pulled in other modules (`CommonModule` for `*ngIf`, `FormsModule` for `ngModel`, feature modules for lazy-loaded routes).

```typescript
@NgModule({
  declarations: [UserCardComponent],
  imports: [CommonModule, FormsModule],
  exports: [UserCardComponent]
})
export class UserModule {}
```

**Standalone components** (stable since Angular 15, the default for new projects since Angular 17/`ng new`) let a component, directive, or pipe declare its own dependencies directly, with `standalone: true` and an `imports` array on the `@Component` decorator itself — no wrapping `NgModule` required.

```typescript
@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-card.component.html'
})
export class UserCardComponent { }
```

Bootstrapping also changes: `bootstrapApplication(AppComponent, { providers: [...] })` replaces `platformBrowserDynamic().bootstrapModule(AppModule)`, and routing config becomes a flat array of `Routes` passed via `provideRouter(routes)` instead of `RouterModule.forRoot(routes)`.

**Why the shift:** NgModules added a layer of indirection that was mostly boilerplate — every new component meant editing a module's `declarations` array, and the mental model of "which module provides this directive" was a common source of confusion, especially for developers coming from React, where imports are just imports. Standalone components make each piece self-describing and tree-shake more predictably.

**Practical guidance:** for any new Angular codebase today, standalone is the recommended and default approach — NgModules aren't deprecated and still work (and you'll see them constantly in existing enterprise code and older tutorials), but greenfield code and most current interview expectations assume standalone. Know both: you'll likely maintain NgModule-based legacy code while writing new standalone code side by side, and Angular supports mixing them during migration.

---

## Beginner — Question 5

**Q5: How do Services and Dependency Injection work in Angular?**

A **service** is just a plain TypeScript class, typically decorated with `@Injectable()`, that holds logic or state you don't want tied to a specific component's lifecycle — API calls, shared application state, logging, utility functions.

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  getUser(id: number) {
    return this.http.get<User>(`/api/users/${id}`);
  }
}
```

**Dependency Injection (DI)** is the mechanism that supplies a class with the instances it depends on, rather than the class constructing them itself. Instead of `new UserService()` inside a component, you declare the dependency and Angular's injector resolves and hands you an instance:

```typescript
@Component({ ... })
export class UserProfileComponent {
  private userService = inject(UserService); // modern function-based injection
  // constructor(private userService: UserService) {} // older constructor injection, still valid
}
```

**Mechanism:** `providedIn: 'root'` registers the service with the application's root injector, making it an application-wide singleton, lazily instantiated on first use, and automatically tree-shakeable (if nothing ever injects it, it's not bundled). Angular resolves dependencies by walking up a hierarchy of injectors (root → module → component) until it finds a provider for the requested token — see the Advanced tier for the full hierarchical mechanism.

**Why this matters:** DI decouples components from concrete implementations, which is what makes unit testing tractable — in a test, you provide a mock `UserService` instead of the real HTTP-backed one, without touching `UserProfileComponent`'s code.

**Common pitfall:** creating `new UserService()` manually instead of injecting it — you lose the singleton guarantee, testability, and any dependencies *that* service itself needs (which Angular would have resolved for you).

---

## Beginner — Question 6

**Q6: What is the Angular CLI, and why does it matter in practice?**

The Angular CLI (`@angular/cli`, invoked as `ng`) is the official command-line tool for scaffolding, building, testing, and maintaining Angular projects. It matters because Angular is opinionated about project structure, and the CLI is what enforces and automates that structure rather than leaving it to convention or manual setup.

**Common commands:**

```bash
ng new my-app --standalone         # scaffold a new project (standalone by default in modern Angular)
ng generate component user-card    # or `ng g c user-card` — scaffolds component + spec + files, updates references
ng generate service user           # scaffolds an @Injectable service
ng serve                           # dev server with live reload (webpack/esbuild under the hood)
ng build --configuration production # AOT-compiled, minified, tree-shaken production bundle
ng test                            # runs unit tests (Karma/Jasmine by default, or Jest/Vitest in newer setups)
ng update                          # automates dependency + codemod-based migrations between Angular versions
```

**Why it matters practically:**
- It removes bikeshedding over folder structure, build tooling, and config — every `ng new` project looks the same, which matters enormously for onboarding in larger teams.
- `ng update` runs automated code migrations (schematics) when upgrading major versions — e.g., converting `*ngIf` usages is manual, but many mechanical renames/API changes are handled automatically.
- `ng build --configuration production` wires up Ahead-of-Time (AOT) compilation, minification, and tree-shaking without hand-rolled webpack config — recent Angular versions default to esbuild/Vite for significantly faster builds than the older webpack-based pipeline.

**Common pitfall:** hand-editing generated boilerplate (like route configuration or module declarations) instead of using `ng generate` with the right schematic, which drifts the project away from what `ng update`'s automated migrations expect and can make future upgrades harder.

---

## Intermediate — Question 1

**Q1: What are RxJS Observables, and how do they differ from Promises?**

An **Observable** is a lazy, push-based stream of values over time, from the RxJS library that Angular uses pervasively (HTTP responses, router events, form value changes, custom event streams). A **Promise** represents a single future value.

| | Promise | Observable |
|---|---|---|
| Values | Resolves exactly once | Can emit zero, one, or many values over time |
| Execution | Eager — starts as soon as it's created | Lazy — nothing happens until you `.subscribe()` |
| Cancellation | Not cancellable | Cancellable via `.unsubscribe()` |
| Operators | `.then()`/`.catch()` chaining only | Rich operator library: `map`, `filter`, `switchMap`, `debounceTime`, `retry`, `combineLatest`, dozens more |
| Cold vs Hot | N/A | Most are "cold" — a fresh execution starts per subscriber |

```typescript
// Promise: fires the HTTP request immediately, whether or not you ever .then() it
fetch('/api/users').then(r => r.json());

// Observable: nothing happens until subscribe — and unsubscribing before it resolves cancels the request
const sub = this.http.get('/api/users').subscribe(users => this.users = users);
sub.unsubscribe(); // aborts the underlying XHR if still in flight
```

**Mechanism:** an Observable is essentially a function that takes an Observer (`next`/`error`/`complete` callbacks) and returns a teardown function. `subscribe()` invokes that function; `unsubscribe()` invokes the teardown. This laziness plus cancellability is why Angular prefers Observables for HTTP and events — a component that navigates away mid-request can cancel it, and a search box can cancel a stale in-flight request when the user keeps typing (see `switchMap`, next question).

**Common pitfall:** treating an Observable like a Promise and forgetting it can emit *multiple* times — code that assumes `subscribe(value => ...)` fires once will silently misbehave against a stream like `valueChanges` on a form control, which emits on every keystroke.

**Practical guidance:** use Observables for anything Angular already gives you as one (HTTP, router, forms, `EventEmitter`), and reach for the `async` pipe in templates rather than manual `subscribe()` calls wherever possible (see the Advanced tier on subscription leaks).

---

## Intermediate — Question 2

**Q2: Explain some common RxJS operators — `map`, `switchMap`, `mergeMap`, and `debounceTime`.**

Operators are pure functions that transform an Observable's stream via `.pipe()`, without mutating the source.

```typescript
searchTerm$: Observable<string>;

results$ = this.searchTerm$.pipe(
  debounceTime(300),                 // wait for 300ms of silence between keystrokes
  distinctUntilChanged(),            // skip if the value didn't actually change
  switchMap(term => this.api.search(term)) // map to a new Observable, cancelling the previous one
);
```

- **`map`** — transforms each emitted value synchronously, like `Array.prototype.map`: `source$.pipe(map(x => x * 2))`.
- **`debounceTime(ms)`** — waits for a pause of `ms` between emissions before emitting the latest value; classic use is search-as-you-type, to avoid firing an API call on every keystroke.
- **`switchMap`** — a "flattening" operator: maps each source value to a new inner Observable (e.g., an HTTP call), and **cancels the previous inner Observable** when a new source value arrives. Ideal for typeahead search, where only the latest request's result matters and stale in-flight requests should be discarded.
- **`mergeMap`** (alias `flatMap`) — also flattens to an inner Observable, but runs all inner Observables **concurrently** without cancelling previous ones. Use when you want every request's result, e.g., firing off several independent save operations in parallel.
- **`concatMap`** — like `mergeMap` but queues inner Observables to run **sequentially**, one at a time — useful when order matters and requests must not overlap (e.g., an ordered sequence of writes).

**The critical distinction to articulate in an interview:** `switchMap` vs `mergeMap` vs `concatMap` is a classic question because picking the wrong one causes real bugs — using `mergeMap` for a search box lets stale, out-of-order responses overwrite newer ones (a race condition), while using `switchMap` for a sequence of dependent save requests can silently cancel a save that was still in flight.

**Common pitfall:** nesting a manual `.subscribe()` inside another `.subscribe()` instead of using a flattening operator — this defeats cancellation, complicates error handling, and is a strong code-smell interviewers watch for.

---

## Intermediate — Question 3

**Q3: How does Angular's `HttpClient` work, and how do you handle errors and typed responses?**

`HttpClient` (from `@angular/common/http`) is Angular's built-in service for making HTTP requests, returning Observables rather than Promises so requests are cancellable and composable with RxJS operators.

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  getUser(id: number): Observable<User> {
    return this.http.get<User>(`/api/users/${id}`).pipe(
      retry(2),
      catchError((err: HttpErrorResponse) => {
        console.error('Failed to load user', err.status, err.message);
        return throwError(() => new Error('Could not load user'));
      })
    );
  }
}
```

Setup requires providing it once at bootstrap: `provideHttpClient(withInterceptors([authInterceptor]))` in `app.config.ts` (or `HttpClientModule` in the NgModule era).

**Mechanism — Interceptors:** interceptors let you hook into every outgoing request/incoming response globally — attaching an auth token, logging, handling 401s, transforming errors — without repeating that logic in every service call.

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;
  const cloned = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return next(cloned);
};
```

**Typed responses:** `http.get<User>(url)` gives you a compile-time-typed Observable, but this is a *compile-time-only* assertion — Angular doesn't runtime-validate the response shape matches `User`. A backend contract change silently produces `undefined` properties at runtime unless you add schema validation (e.g., zod) at the boundary.

**Common pitfalls:**
- Forgetting `catchError` — an unhandled HTTP error Observable errors out silently unless the component subscribing to it has its own error handler, often leaving the UI stuck in a loading state.
- Calling `.subscribe()` just to trigger a `POST`/`PUT` without keeping the subscription — usually fine since `HttpClient` Observables complete after one emission (unlike a `Subject`), but the request itself won't fire at all until you subscribe, since `HttpClient` calls are lazy like all Observables.

---

## Intermediate — Question 4

**Q4: How does the Angular Router work — routes, guards, resolvers, and lazy loading?**

The Router maps URL paths to components, drives client-side navigation without full page reloads, and supports nested/child routes.

```typescript
export const routes: Routes = [
  { path: 'users/:id', component: UserDetailComponent, resolve: { user: userResolver } },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES)
  }
];
```

**Guards** control whether navigation is allowed to proceed. Modern Angular uses functional guards (a plain function, injected via `inject()`), replacing the older class-based `CanActivate` interface:

```typescript
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};
```
Types include `canActivate` (can this route be entered), `canDeactivate` (can the user leave — e.g., an "unsaved changes" prompt), `canMatch` (should this route even be considered a match, useful for conditionally hiding a lazy chunk).

**Resolvers** pre-fetch data *before* the route activates, so the component never renders in a state where its data is still loading:

```typescript
export const userResolver: ResolveFn<User> = (route) =>
  inject(UserService).getUser(+route.paramMap.get('id')!);
```
The component then reads `route.snapshot.data['user']` already populated. Trade-off: resolvers delay navigation until the data arrives, which can feel sluggish on slow networks compared to navigating immediately and showing a loading spinner inside the component.

**Lazy loading** (`loadChildren`/`loadComponent`) splits the route's code into a separate JS chunk, fetched only when the user navigates there — this is the single biggest lever for reducing initial bundle size in a large app, since features like an admin panel most users never visit don't ship in the main bundle.

**Common pitfall:** putting expensive, rarely-needed logic in an eagerly-loaded root route config instead of behind `loadChildren`, defeating lazy loading's purpose — or using a resolver for data that's genuinely optional to display immediately, needlessly blocking navigation.

---

## Intermediate — Question 5

**Q5: Compare Reactive Forms and Template-driven Forms.**

Angular offers two form-building APIs, both built on `FormsModule`/`ReactiveFormsModule`.

**Template-driven forms** define the form's structure in the template using directives like `ngModel`, with Angular building the form model behind the scenes.

```html
<form #f="ngForm" (ngSubmit)="submit(f.value)">
  <input name="email" [(ngModel)]="user.email" required email />
</form>
```

**Reactive forms** define the form model explicitly in the component class as a tree of `FormControl`/`FormGroup`/`FormArray` objects, and bind the template to that model.

```typescript
form = new FormGroup({
  email: new FormControl('', [Validators.required, Validators.email]),
  address: new FormGroup({
    city: new FormControl('')
  })
});
```
```html
<form [formGroup]="form" (ngSubmit)="submit()">
  <input formControlName="email" />
</form>
```

| | Template-driven | Reactive |
|---|---|---|
| Source of truth | The template (implicit, async) | The component class (explicit, synchronous) |
| Testability | Harder — form state lives in the DOM/directives | Easy — `FormGroup` is a plain object, testable without rendering |
| Dynamic forms | Awkward | Natural — build/modify `FormArray`/`FormGroup` programmatically |
| Validation | Template-bound validator directives | Composable `Validators`/custom `ValidatorFn`, plus reactive `valueChanges`/`statusChanges` Observables |
| Complexity for simple forms | Less boilerplate | More upfront ceremony |

**Practical guidance:** template-driven forms suit small, static forms (a login form) where minimal code matters most; reactive forms are the standard choice for anything with dynamic fields, cross-field validation, or complex business logic, since the form model is a first-class, unit-testable object and integrates naturally with RxJS (`form.valueChanges.pipe(debounceTime(300), ...)` for autosave, for example).

**Common pitfall:** mixing the two paradigms in one form (e.g., `ngModel` inside a `[formGroup]`) — Angular explicitly disallows this combination without an extra opt-in directive, and it's rarely a good idea even when possible.

---

## Intermediate — Question 6

**Q6: What are Angular's component lifecycle hooks, and when does each fire?**

Angular calls specific methods on a component at defined points in its life, if the component implements the corresponding interface.

1. **`ngOnChanges(changes: SimpleChanges)`** — fires before `ngOnInit` and again whenever an `@Input()`-bound value changes (from the parent), receiving the old and new values. Fires on every `@Input` change, not just the first.
2. **`ngOnInit`** — fires once, after the first `ngOnChanges`, once Angular has set initial `@Input()` values. This is where you typically fetch data or set up initial state — *not* the constructor, since `@Input()` values aren't guaranteed to be available yet at construction time.
3. **`ngDoCheck`** — fires on every change detection run, for custom change-detection logic Angular's default checks wouldn't catch (e.g., detecting mutation of an object's internal properties, which reference equality checks miss). Rarely needed and easy to misuse into a performance problem, since it fires very frequently.
4. **`ngAfterContentInit` / `ngAfterContentChecked`** — after content projected via `<ng-content>` has been initialized/checked.
5. **`ngAfterViewInit` / `ngAfterViewChecked`** — after the component's own view (and child components) has been initialized/checked — the earliest safe point to access `@ViewChild` references.
6. **`ngOnDestroy`** — fires just before Angular destroys the component (e.g., navigated away, or removed by `*ngIf`/`@if`). This is where you clean up: unsubscribe from Observables not using the `async` pipe, clear `setInterval` timers, detach event listeners — otherwise you leak memory (see the Advanced/Scenario tiers).

**Common pitfall:** doing HTTP calls or heavy DOM work in the constructor instead of `ngOnInit` — the constructor should only initialize the class's own fields and receive injected dependencies; `@Input()` values aren't yet bound, and mixing DI setup with business logic makes the component harder to test.

**Practical guidance:** `ngOnInit` + `ngOnDestroy` cover the vast majority of real component needs; reach for `ngOnChanges` only when you must react specifically to *which* input changed and to what value, and avoid `ngDoCheck`/`ngAfterViewChecked` unless you have a concrete, narrow reason — both run on every change-detection cycle and are easy performance foot-guns.

---

## Intermediate — Question 7

**Q7: How do `@Input()`/`@Output()` work for parent-child communication, and what is content projection?**

**`@Input()`** exposes a component property that a parent can bind into; **`@Output()`** exposes an `EventEmitter` a parent can listen to — together they're the primary mechanism for passing data down and events up the component tree.

```typescript
@Component({ selector: 'app-rating', standalone: true, template: `...` })
export class RatingComponent {
  @Input({ required: true }) value!: number;
  @Output() valueChange = new EventEmitter<number>();
  setRating(n: number) {
    this.valueChange.emit(n);
  }
}
```
```html
<app-rating [value]="product.rating" (valueChange)="product.rating = $event"></app-rating>
<!-- or, following the Input/valueChange naming convention, as two-way syntax: -->
<app-rating [(value)]="product.rating"></app-rating>
```
Naming an `@Output()` `xChange` for an `@Input()` named `x` unlocks Angular's banana-in-a-box `[(x)]` syntax on your own components, the same sugar `[(ngModel)]` uses.

**Modern alternative — Signal inputs:** Angular 17.1+ introduced `input()` and `output()` as function-based, signal-backed alternatives to the decorators, giving you a read-only `Signal<T>` instead of a plain property:

```typescript
value = input.required<number>();
valueChange = output<number>();
```
These compose more naturally with computed signals and the newer reactivity model (see the Advanced tier), though `@Input()`/`@Output()` remain fully supported and common in existing code.

**Content projection (`<ng-content>`)** is the other communication direction — it lets a *parent* inject arbitrary template content into designated slots of a child component, similar to React's `children` prop or Web Components' `<slot>`.

```html
<!-- card.component.html -->
<div class="card">
  <ng-content select="[card-title]"></ng-content>
  <div class="body"><ng-content></ng-content></div>
</div>

<!-- usage -->
<app-card>
  <h2 card-title>Order #4521</h2>
  <p>Shipped yesterday.</p>
</app-card>
```
`select="[card-title]"` projects only matching content into that slot; unmatched content falls into the default (unnamed) `<ng-content>`.

**Common pitfall:** trying to pass data *down* through `@Output()` or events *up* through `@Input()` — a frequent beginner mix-up. Also, over-using deeply nested `@Input()` chains ("prop drilling") for state that many unrelated components need — that's a signal you likely want a shared service (with a `BehaviorSubject` or signal) instead.

---

## Intermediate — Question 8

**Q8: What are Pipes, and what's the difference between pure and impure pipes?**

A pipe transforms a value for display directly in a template, using the `|` syntax, without changing the underlying data.

```html
{{ order.total | currency:'USD' }}
{{ user.createdAt | date:'mediumDate' }}
{{ items | filterBy:searchTerm }}  <!-- a custom pipe -->
```

Built-in pipes include `date`, `currency`, `uppercase`/`lowercase`, `json`, `slice`, and `async` (which subscribes to an Observable/Promise and unwraps its value automatically — see the Advanced tier).

```typescript
@Pipe({ name: 'filterBy', standalone: true })
export class FilterByPipe implements PipeTransform {
  transform(items: Item[], term: string): Item[] {
    return term ? items.filter(i => i.name.includes(term)) : items;
  }
}
```

**Pure pipes** (the default, `pure: true`) only re-execute when Angular detects the pipe's *input reference* has changed — a new object/array reference, or a changed primitive. They're cheap: Angular can skip re-running them on every change-detection cycle if the reference is stable.

**Impure pipes** (`@Pipe({ name: 'x', pure: false })`) re-execute on *every* change-detection cycle, regardless of whether the input reference changed — necessary if the pipe needs to react to internal mutation of an object/array (e.g., filtering an array that gets items pushed into it in place, without ever getting a new array reference).

**Why this matters — the pitfall:** a pure `filterBy` pipe run against `items.push(newItem)` (mutating in place) will **not** re-run, since `items` is still the same array reference — the filtered list silently goes stale. The fix is either to make the pipe impure (accepting the performance cost of it running every cycle) or, far more commonly the better fix, to treat data immutably: `items = [...items, newItem]`, which gives pure pipes (and `OnPush` change detection, see Advanced) a new reference to detect.

**Practical guidance:** default to pure pipes and immutable data patterns; reach for impure pipes only when truly necessary (they're a known performance smell, since an impure pipe recalculating over a large array on every keystroke/scroll can visibly slow down a page) — and even then, consider whether a computed value in the component (or a `computed()` signal) is a better fit than a template pipe.

---

## Advanced — Question 1

**Q1: How does Angular's change detection actually work — Zone.js, and the difference between Default and OnPush strategies?**

Angular's job is to keep the DOM in sync with component state. **Change detection** is the process that walks the component tree and checks whether any bound expression's value has changed since last time, updating the DOM where it has.

**Zone.js — how Angular knows *when* to check:** Angular (in its Zone.js-based mode, still the default in most existing apps) patches all common async browser APIs — `setTimeout`, `Promise.then`, DOM event listeners, XHR/fetch — via a library called Zone.js. Whenever any of these fire (a click, a timer, an HTTP response), Zone.js notifies Angular, and Angular triggers a full change detection pass from the root component down. This is why, historically, you never had to manually tell Angular "something changed" — Zone.js caught essentially every possible trigger automatically.

**Default strategy:** on every change-detection pass, Angular checks *every* component in the tree, top to bottom, comparing each template-bound expression's current value against its previous value (dirty-checking) and patching the DOM where it differs. Simple and correct, but potentially wasteful in a large tree — one button click can trigger a check of thousands of components.

**`OnPush` strategy:** opts a component out of unconditional checking. With `changeDetection: ChangeDetectionStrategy.OnPush`, Angular skips checking that component (and its subtree) **unless**:
1. One of its `@Input()` references changes (reference equality, not deep equality — mutating an object in place does *not* count),
2. An event originates from within the component or its template (a click, form input),
3. An `async`-piped Observable it's subscribed to emits, or
4. You manually call `ChangeDetectorRef.markForCheck()`.

```typescript
@Component({
  selector: 'app-user-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-user-row *ngFor="let u of users" [user]="u" />`
})
export class UserListComponent {
  @Input() users: User[] = [];
}
```

**Common pitfall:** mutating an `@Input()`-bound object/array in place (`this.users.push(x)`) under `OnPush` — since the reference didn't change, Angular never re-checks the component, and the UI silently doesn't update. The fix is always to produce a new reference: `this.users = [...this.users, x]`.

**Practical guidance:** `OnPush` combined with immutable data (and `trackBy`/`track` for lists) is the standard performance pattern for large trees — it turns an O(n) check-everything pass into checking only the branches that plausibly changed, and it's the direction Signals push the whole framework toward by default (next question).

---

## Advanced — Question 2

**Q2: Explain Angular's Dependency Injection internals — hierarchical injectors, providers, and injection tokens.**

Angular's DI is **hierarchical**: injectors form a tree that mirrors the component tree, and resolving a dependency walks *up* that tree until a provider is found.

**The injector hierarchy (simplified, standalone-era):**
1. **Platform injector** — shared across multiple Angular apps on one page (rare).
2. **Root/environment injector** — services registered with `providedIn: 'root'`, or via `providers` in `bootstrapApplication`; effectively application-wide singletons, lazily created.
3. **Route-level environment injectors** — providers on a lazy-loaded route get their own child environment injector.
4. **Element injectors** — every component has one, populated by its `providers` array; a service provided here gets a *new instance per component instance*, not a singleton.

```typescript
@Component({
  selector: 'app-shopping-cart',
  providers: [CartService], // a fresh CartService instance for every <app-shopping-cart>
  ...
})
export class ShoppingCartComponent { }
```

When a component asks for `CartService`, Angular checks its own element injector first, then walks up through ancestor element injectors, then the route/environment injector, then root — returning the first match. This is why `providedIn: 'root'` and a component-level `providers: [CartService]` behave completely differently despite injecting "the same" service type: root gives you one shared instance app-wide; component-level gives every instance of that component its own isolated instance (useful for something like a wizard where each open instance needs independent state).

**Providers and tokens:** a "provider" tells the injector how to construct a value for a given token. The token is usually the class itself, but for interfaces, primitive config values, or multiple implementations of an abstraction, you need an `InjectionToken` (since TypeScript interfaces don't exist at runtime and can't be used as DI tokens):

```typescript
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

providers: [
  { provide: API_BASE_URL, useValue: 'https://api.example.com' },
  { provide: Logger, useClass: ConsoleLogger },
  { provide: PaymentProcessor, useFactory: (config: AppConfig) => new StripeProcessor(config.key), deps: [AppConfig] }
]
```

**Common pitfall:** assuming a `providedIn: 'root'` service is a true global singleton in every scenario — lazy-loaded routes with their own environment injector, or a component that re-provides the same token, can each get their own separate instance, silently breaking an assumption that state is shared everywhere.

#### Follow-up: What's the difference between `useClass`, `useValue`, `useExisting`, and `useFactory`?

`useClass` instantiates a given class (letting you substitute an implementation, e.g. a `MockPaymentProcessor` in tests, for the token `PaymentProcessor`). `useValue` provides a pre-built, static value (config objects, constants) rather than constructing anything. `useExisting` aliases one token to resolve to whatever another token already resolves to (useful for backward-compatible renames). `useFactory` runs a function (optionally itself with injected `deps`) to compute the value at injection time — needed when construction requires logic or other injected values, as in the `PaymentProcessor` example above.

---

## Advanced — Question 3

**Q3: How do RxJS subscriptions cause memory leaks in Angular, and how do you prevent them?**

Every `.subscribe()` call creates a live subscription that keeps running — and keeps a reference to the component's callback closure (often closing over `this`) — until either the source Observable completes, or you explicitly `.unsubscribe()`. A component's `ngOnDestroy` does **not** automatically unsubscribe anything; Angular only tears down the component's DOM and injector, not arbitrary subscriptions you created.

```typescript
export class DashboardComponent implements OnInit, OnDestroy {
  ngOnInit() {
    // LEAK: this interval keeps firing and holding a reference to `this`
    // long after the component is destroyed and navigated away from.
    interval(1000).subscribe(() => this.refreshStats());
  }
  ngOnDestroy() { /* nothing cleaned up */ }
}
```
Each time the user navigates to this component and away again, a new leaked subscription accumulates — over a long user session, this is a classic slow memory leak, and in this specific example it also means `refreshStats()` keeps firing (and potentially throwing, since the component's view no longer exists) on a component instance that should be dead.

**Fix 1 — the `async` pipe (preferred wherever the value is used directly in a template):** it subscribes when the template is created and automatically unsubscribes when the component is destroyed — no manual cleanup code at all.

```html
<div *ngIf="stats$ | async as stats">{{ stats.total }}</div>
```

**Fix 2 — `takeUntil` with a destroy `Subject` (for subscriptions needed in component logic, not just templates):**

```typescript
private destroy$ = new Subject<void>();

ngOnInit() {
  interval(1000).pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshStats());
}
ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```
`takeUntil` completes the source Observable (and therefore unsubscribes) the moment `destroy$` emits, which you trigger from `ngOnDestroy`.

**Fix 3 — the `takeUntilDestroyed()` operator** (Angular 16+), which reads the component's `DestroyRef` automatically, removing the boilerplate `Subject` entirely:

```typescript
interval(1000).pipe(takeUntilDestroyed()).subscribe(() => this.refreshStats());
```

**Common pitfall:** believing `HttpClient` calls never need cleanup because they "complete after one emission" — true in isolation, but if the component is destroyed *while the request is still in flight*, an un-cancelled subscription still fires its callback against a dead component, which can throw or silently mutate state nobody reads anymore. Cancelling in-flight requests on navigation (which the Router does automatically for route-driven observables, but not for ones you `subscribe()` to manually) avoids wasted work too.

**Practical guidance:** prefer the `async` pipe by default; reach for `takeUntilDestroyed()`/`takeUntil` only for subscriptions that must live in component/service logic rather than a template.

---

## Advanced — Question 4

**Q4: What are the common approaches to state management in Angular — a service with `BehaviorSubject`, versus NgRx?**

**Service + `BehaviorSubject` (or Signals)** — the simplest form of shared state: a singleton service (`providedIn: 'root'`) holds a `BehaviorSubject` (which, unlike a plain `Subject`, always has a current value and replays it to new subscribers) and exposes it as a read-only Observable.

```typescript
@Injectable({ providedIn: 'root' })
export class CartStateService {
  private cartSubject = new BehaviorSubject<CartItem[]>([]);
  readonly cart$ = this.cartSubject.asObservable();

  addItem(item: CartItem) {
    this.cartSubject.next([...this.cartSubject.value, item]);
  }
}
```
Any component injecting `CartStateService` and subscribing (ideally via `async` pipe) sees the same shared, reactive state. This pattern is lightweight, requires no extra library, is easy to test, and is entirely sufficient for a large share of real applications.

**NgRx (or similar: Akita, NGXS)** applies the Redux pattern to Angular: a single immutable store, state changes only via dispatched **actions** processed by pure **reducers**, derived data read via memoized **selectors**, and asynchronous side effects (API calls) isolated in **effects**.

```typescript
export const cartFeature = createFeature({
  name: 'cart',
  reducer: createReducer(initialState,
    on(CartActions.addItem, (state, { item }) => ({ ...state, items: [...state.items, item] }))
  )
});
// component:
this.store.dispatch(CartActions.addItem({ item }));
this.items$ = this.store.select(selectCartItems);
```

**When to choose which:**
- A `BehaviorSubject`-based service is the right default for most feature-level or app-level shared state — less ceremony, no new mental model for the team, and RxJS is already something the team knows.
- NgRx earns its considerable boilerplate when the app has genuinely complex, cross-cutting state: many features reading/writing the same data, a need for strict traceability of *what* changed state and *why* (time-travel debugging, action logs), or a large team where an enforced unidirectional data flow prevents accidental, hard-to-trace state mutations scattered across services.

**Common pitfall:** reaching for NgRx by default on every project "because it's the standard enterprise choice" — for small-to-medium apps this adds substantial boilerplate (actions, reducers, effects, selectors for even trivial state) without a commensurate benefit, and is a common source of over-engineering complaints in Angular codebases. Conversely, ad-hoc `BehaviorSubject`s scattered across many unrelated services with no consistent pattern can become just as hard to reason about as no state management at all — the point of NgRx-like tools is precisely to avoid that outcome at scale.

---

## Advanced — Question 5

**Q5: What are Angular Signals, and how do they relate to Zone.js-based change detection?**

**Signals** (stable since Angular 17) are a new reactivity primitive: a wrapper around a value that notifies interested consumers exactly when it changes, and tracks its own dependencies automatically.

```typescript
count = signal(0);
doubled = computed(() => this.count() * 2);  // recomputes only when `count` changes, and is memoized

increment() {
  this.count.update(n => n + 1); // or this.count.set(n)
}
```
```html
<p>{{ count() }} doubled is {{ doubled() }}</p>
```
Reading a signal's value is calling it as a function (`count()`); this is what lets Angular's compiler track *which* signals a template or `computed()` actually reads, without you manually declaring dependencies.

**Why Signals matter for change detection:** Zone.js's approach is coarse — it tells Angular *something, somewhere* might have changed, and (under Default strategy) Angular re-checks the whole tree to find out what. Signals invert this: because a signal knows exactly which components/computeds read it, Angular can (increasingly) skip the "is anything dirty?" guesswork entirely and update only the specific bindings that depend on a signal that actually changed — closer to fine-grained reactivity, as used by frameworks like SolidJS.

**The migration is incremental, not a rewrite:** Signals interoperate with the existing RxJS/Zone.js model rather than replacing it outright.
- `toSignal(observable$)` and `toObservable(mySignal)` (from `@angular/core/rxjs-interop`) convert between the two worlds.
- `input()`/`output()` (Q7, Intermediate) are signal-based alternatives to `@Input()`/`@Output()`.
- Angular is actively working toward **zoneless** change detection (`provideExperimentalZonelessChangeDetection()`, maturing across recent versions) — an app built entirely on signals for its reactive state doesn't need Zone.js's blanket monkey-patching of async APIs at all, since signals themselves notify Angular precisely when a UI-relevant update is needed. This removes Zone.js's runtime overhead and its well-known monkey-patching side effects (it patches essentially every async browser API, which occasionally conflicts with third-party libraries).

**Common pitfall in an interview:** describing Signals as simply "a replacement for `OnPush`" — more precisely, Signals are a complementary, finer-grained reactivity model; `OnPush` still exists and pairs naturally with them (a signal-only component's inputs, converted via `input()`, behave correctly under `OnPush` automatically), but the long-term direction is that signal-driven, potentially zoneless change detection reduces or removes the need to reason about `OnPush` and Zone.js triggers manually at all.

**Practical guidance:** for new code, prefer `signal()`/`computed()` for local component state and simple cross-component state over `BehaviorSubject`, reserving RxJS for genuinely asynchronous, stream-based work (HTTP, complex event composition, debouncing) where its operator library still has no real signal-based equivalent.

---

## Scenario — Question 1

**Q1: A `ProductListComponent` renders a few hundred `ProductRowComponent` children. Every time the user types in an unrelated search box elsewhere on the page, the whole product list visibly stutters, even though the products themselves haven't changed. How do you fix it, and why does it happen in the first place?**

**Why it happens:** with Angular's Default change-detection strategy (Zone.js-driven), *any* event anywhere in the app — including a keystroke in an unrelated search box — triggers a full change-detection pass from the root component down through the entire tree. Every one of the few hundred `ProductRowComponent` instances gets re-checked (every binding in every row re-evaluated) on every keystroke, even though nothing about the products changed. With enough rows, that's enough work per keystroke to visibly drop frames.

**The fix — `OnPush` plus immutable data:**

```typescript
@Component({
  selector: 'app-product-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div>{{ product.name }} — {{ product.price | currency }}</div>`
})
export class ProductRowComponent {
  @Input() product!: Product;
}
```
With `OnPush`, `ProductRowComponent` is only re-checked when its `@Input()` reference changes, an event originates inside it, or an `async`-piped source it depends on emits. A keystroke in an unrelated part of the tree no longer forces Angular to touch these components at all — Angular can skip the entire subtree.

**The immutability requirement is not optional:** if the parent's product-update logic mutates the array in place (`this.products[i].price = newPrice`), the `@Input()` reference passed to that row never changes, so `OnPush` means the row is now *never* re-checked and the UI goes stale — silently, which is the classic gotcha with this fix. The parent must always produce new references:

```typescript
updatePrice(id: string, price: number) {
  this.products = this.products.map(p => p.id === id ? { ...p, price } : p);
}
```

**Verifying the fix:** confirm with `@for (... ; track product.id)` (or `trackBy` for legacy `*ngFor`) so Angular can match rows by identity across re-renders rather than destroying/recreating every DOM row whenever the array reference changes — `OnPush` alone doesn't help if every update still replaces the entire list wholesale in the DOM.

**Practical guidance:** this OnPush + immutable-data + trackBy combination is the standard, first-reach-for performance fix for exactly this symptom (a big list stuttering on unrelated updates) before considering heavier tools like virtual scrolling (`cdk-virtual-scroll-viewport`) or moving to signal-based fine-grained reactivity.

---

## Scenario — Question 2

**Q2: A `LiveOrdersComponent` polls an endpoint every 3 seconds using `interval(3000).pipe(switchMap(...)).subscribe(...)` inside `ngOnInit`. Users report the browser tab's memory usage climbs steadily the longer they leave the app open, navigating between the orders page and other pages repeatedly. What's happening, and how do you fix it?**

**Diagnosis:** `interval(3000)` never completes on its own — it emits forever until explicitly unsubscribed. `ngOnDestroy` isn't implemented (or doesn't unsubscribe), so every time the user navigates to `LiveOrdersComponent` and away again, a *new* polling subscription is created and the old one is never torn down. Each leaked subscription keeps firing its HTTP call every 3 seconds indefinitely, and each holds a closure referencing the (now-orphaned) component instance, preventing it from being garbage collected. After N visits to the page, there are N concurrent polling loops running simultaneously — visible not just as growing memory, but eventually as a visibly growing number of network requests in the DevTools Network tab, a good diagnostic tell for this exact bug.

**The fix:**

```typescript
export class LiveOrdersComponent implements OnInit {
  orders$ = interval(3000).pipe(
    startWith(0),
    switchMap(() => this.orderService.getOrders()),
    takeUntilDestroyed() // ties the subscription's lifetime to this component's DestroyRef
  );
}
```
```html
<div *ngFor="let order of orders$ | async">{{ order.id }}</div>
```
Using the `async` pipe here means Angular subscribes when the template initializes and automatically unsubscribes on destroy — combined with `takeUntilDestroyed()` as a belt-and-suspenders guard (relevant if `orders$` were ever also subscribed to manually elsewhere), the polling loop reliably stops the moment the user navigates away, and restarts cleanly on the next visit rather than stacking.

**Confirming the fix:** open Chrome DevTools' Performance/Memory tab, take a heap snapshot, navigate to the orders page and away several times, force a GC, and take another snapshot — before the fix, snapshots show a growing count of detached `LiveOrdersComponent` instances (and their retained closures); after the fix, the count stays flat.

**Broader lesson:** any Observable that doesn't complete on its own (`interval`, `fromEvent`, a `Subject` you push to, WebSocket streams) is a subscription-leak risk by default in a component — the `async` pipe or `takeUntilDestroyed()` should be treated as close to mandatory for these, whereas one-shot Observables like a single `HttpClient` GET are lower-risk (though still worth guarding if the component might be destroyed mid-request).

---

## Scenario — Question 3

**Q3: You're starting a new feature in a mid-sized Angular application that already has a handful of `BehaviorSubject`-based state services. The feature needs to share moderately complex state — a multi-step wizard's form data — across five components that aren't all direct parent/child. Do you introduce NgRx for this, or extend the existing service pattern? How do you decide?**

This is a trade-off question, not a "correct tool" question — the right answer demonstrates reasoning about cost versus benefit, not reflexive tool preference.

**Arguments for extending the existing `BehaviorSubject`-service pattern:**
- The codebase already has an established convention; introducing NgRx now means the team maintains *two* different state-management mental models side by side, which is itself a maintenance cost.
- A wizard's state, while shared across five components, is typically **scoped to that one feature/flow** — it doesn't need to be globally addressable, time-travel-debuggable, or read by unrelated parts of the app. A service `providedIn` at the wizard's route level (not `'root'`) gives properly scoped, feature-local shared state with no extra library:
```typescript
@Injectable() // provided in the wizard's route config, not root — one instance per wizard session
export class WizardStateService {
  private state = signal<WizardData>(initialWizardData);
  readonly data = this.state.asReadonly();
  updateStep(patch: Partial<WizardData>) {
    this.state.update(s => ({ ...s, ...patch }));
  }
}
```
- Five components and one feature is well within what a plain service comfortably handles without becoming unmanageable — the complexity that justifies NgRx (cross-cutting global state, many independent features mutating the same data, need for auditability) isn't present here.

**Arguments for reaching for NgRx anyway:**
- If this wizard is the first of several similar cross-cutting features expected soon, and the team anticipates needing consistent patterns, action logs, or devtools time-travel debugging across all of them, introducing NgRx *now*, deliberately, for this feature can be the right seed rather than premature.
- If "not all direct parent/child" hints at a genuinely tangled dependency graph (component D needs to know something changed in a sibling B without a clean shared ancestor to hold state), a formalized action/reducer/selector structure can make the data flow easier to trace than an ad-hoc web of injected services calling each other's methods.

**Recommended decision, and how to justify it in an interview:** for a *single* feature scoped to five related components, default to extending the existing service pattern (with a signal or `BehaviorSubject`, route-scoped rather than root-scoped) — it matches the existing convention, has far less ceremony, and the actual complexity described doesn't yet warrant NgRx's overhead. Revisit that decision only if a second or third similarly complex, cross-cutting feature appears and a genuine pattern of pain (untraceable state bugs, duplicated logic across ad-hoc services) emerges — introduce NgRx in response to demonstrated complexity, not in anticipation of hypothetical future complexity.

---

## Scenario — Question 4

**Q4: A component displays `user.displayName` in its template. After a save action, the network tab confirms the PATCH request succeeds and the response contains the updated name, but the UI still shows the old name until the user manually refreshes the page or navigates away and back. What are the possible causes, and how do you debug it?**

This is deliberately open-ended — "why isn't my UI updating" is one of the most common real Angular bugs, and there are several distinct root causes that produce the identical symptom.

**Cause 1 — mutating state instead of replacing it, under `OnPush`.** If the save handler does `this.user.displayName = response.displayName` (mutating the existing object) and the component (or an ancestor holding `user` as an `@Input()`) uses `ChangeDetectionStrategy.OnPush`, Angular never sees a reference change and skips re-checking that component. **Fix:** `this.user = { ...this.user, displayName: response.displayName }`.

**Cause 2 — the update happens outside Angular's zone.** If the save logic runs inside a callback from a non-patched API — a third-party library that was loaded before Zone.js patched it, a Web Worker `onmessage` handler, or code explicitly wrapped in `NgZone.runOutsideAngular()` for performance — Zone.js never observes the change, so no change-detection pass is triggered at all, even though the component's data genuinely changed via mutation-free, well-formed code. **Fix:** re-enter the zone explicitly: `this.ngZone.run(() => { this.user = updatedUser; })`, or, in a signals-based component, note that signals notify Angular directly regardless of zone context, which is one of the reasons zoneless apps can be *more* predictable here, not less.

**Cause 3 — subscribing to the wrong Observable, or a stale closure.** If the save flow does `this.userService.updateUser(...).subscribe()` and separately expects some *other* `user$` stream (e.g., a cached `BehaviorSubject` the service never updated after the PATCH) to reflect the change, the UI is correctly rendering — it's just bound to state that was never told about the update. **Fix:** ensure the service's update method also pushes the new value into whatever shared state stream the template actually reads (`this.userSubject.next(updated)`), not just returns the HTTP response to the caller.

**Cause 4 — a `*ngIf`/`@if` truthy-check masking it.** Less likely given the described symptom, but worth ruling out: if the template only reads `user` through a locally cached snapshot (`{{ cachedUser.displayName }}` set once in `ngOnInit` rather than bound live to the service), no amount of underlying state change will show up until that local snapshot is explicitly reassigned.

**How to debug systematically:** first confirm *whether change detection ran at all* — temporarily add `{{ (checkCount = checkCount + 1) }}`-style logging or a `console.log` in `ngDoCheck`; if it never fires after the save, that points at Cause 1 or 2 (a CD-triggering problem). If it *does* fire but the bound value is still stale, that points at Cause 3 or 4 (a data-flow problem, not a CD problem) — inspect exactly which Observable/property the template binds to versus which one the save logic actually updates.

---
