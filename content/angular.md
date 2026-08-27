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

## Beginner — Question 7

**Q7: How does Angular's testing story work — `TestBed`, component fixtures, and why DI makes components testable by design?**

Angular ships its own testing utilities (`@angular/core/testing`), built around the idea that because components get their dependencies through DI rather than constructing them internally, a test can swap in fakes for every collaborator without touching the component's code at all.

**`TestBed`** builds a small, isolated Angular module/environment for a single test, letting you declare which components/directives/pipes participate and which providers (real or fake) satisfy their dependencies.

```typescript
describe('UserCardComponent', () => {
  let fixture: ComponentFixture<UserCardComponent>;
  let component: UserCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCardComponent], // standalone components are imported, not declared
      providers: [{ provide: UserService, useValue: { getUser: () => of({ name: 'Ana' }) } }]
    }).compileComponents();

    fixture = TestBed.createComponent(UserCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit + initial render
  });

  it('renders the user name', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h3')?.textContent).toContain('Ana');
  });
});
```

**Mechanism:** `TestBed.createComponent` returns a `ComponentFixture`, a test-only wrapper giving you `componentInstance` (the class instance, for calling methods/reading properties directly) and `nativeElement`/`debugElement` (for asserting on the rendered DOM). Crucially, Angular does **not** run change detection automatically in tests — you must call `fixture.detectChanges()` explicitly, which is what makes tests deterministic: you control exactly when the template re-renders relative to your assertions, unlike the live app where Zone.js or signals trigger it implicitly.

**Why DI is what makes this practical:** because `UserCardComponent` never does `new UserService()` internally, a test can register a fake `{ getUser: () => of(fakeData) }` against the `UserService` token and the component is none the wiser — no real HTTP call, no test-order dependency, no slow or flaky network I/O in a unit test. A component that bypassed DI to construct its own dependencies would force every test to also exercise those real dependencies.

**Common pitfall:** forgetting `fixture.detectChanges()` and then asserting on DOM content that was never rendered — a very common source of "why is this test failing, the code looks right" confusion for developers new to Angular testing. Also, over-mocking to the point a test no longer resembles real usage — the CLI's default `ng generate component` produces a runnable `.spec.ts` file precisely to establish this pattern from day one.

---

## Beginner — Question 8

**Q8: Why does Angular wrap native HTML form elements instead of just using plain `<input>`/`<form>` tags, and what does `@angular/forms` add?**

Plain HTML forms give you almost nothing beyond raw DOM values: a native `<input>` has no built-in concept of "has this been touched by the user," "is this value currently valid against a rule I defined," or "has this value changed from what was originally loaded" — all information a real UI routinely needs (e.g., only show a validation error after the user has interacted with the field, not immediately on page load; disable "Save" until something actually changed).

`@angular/forms` (via `FormsModule` for template-driven, or `ReactiveFormsModule`/standalone `Validators`/`FormControl` for reactive forms — see Intermediate Q5) wraps each form control in an Angular-managed object that tracks this state automatically and exposes it as both plain properties and reactive `Observable` streams.

```typescript
email = new FormControl('', [Validators.required, Validators.email]);
```

Each `FormControl` (and `FormGroup`) exposes:
- **`value`** — the current value.
- **`valid` / `invalid` / `errors`** — whether the configured validators currently pass, and which failed (`{ required: true }`, `{ email: true }`).
- **`pristine` / `dirty`** — has the value ever been changed from its initial value.
- **`untouched` / `touched`** — has the control ever lost focus (blurred) at least once.
- **`valueChanges` / `statusChanges`** — Observables emitting on every value/validity change, usable for reactive behavior like autosave or cross-field validation.

```html
<input [formControl]="email" />
<div *ngIf="email.invalid && email.touched">Enter a valid email.</div>
```
That `touched` check is exactly the "don't show an error before the user has interacted" pattern raw HTML gives you no way to express without hand-rolling your own tracking with `(blur)`/`(input)` event handlers and manual boolean flags per field.

**Mechanism:** Angular directives (`ngModel`, `formControlName`, `formControl`) sit between the native DOM element and this `FormControl` object, syncing the DOM value into the control on input events and pushing the control's value back onto the DOM property — the control object, not the DOM node, becomes the real source of truth for state and validity.

**Common pitfall:** treating `@angular/forms` as unnecessary overhead for "just a simple form" and hand-rolling validation with plain `(input)` handlers and component booleans — this quickly reinvents (poorly) the dirty/touched/valid tracking Angular already provides for free, and doesn't compose with Angular's built-in error-display conventions or reactive validation patterns.

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

## Intermediate — Question 9

**Q9: What are HTTP interceptors, and how do you use one to attach an auth token to every outgoing request or handle errors globally?**

An interceptor is a function (or, historically, a class implementing `HttpInterceptor`) that sits in the pipeline between every call made through `HttpClient` and the actual network request, letting you inspect or rewrite the outgoing `HttpRequest` and the incoming response/error for **every** request in the app from one place, rather than repeating logic in each service method.

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;
  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
  return next(authedReq);
};

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) router.navigate(['/login']);
      return throwError(() => err);
    })
  );
};
```
Registered once at bootstrap, in order (order matters — they run like a chain of middleware):
```typescript
bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))]
});
```

**Mechanism:** `HttpRequest` objects are immutable, so an interceptor never mutates `req` directly — `req.clone({...})` produces a new request with the desired changes (added headers, a rewritten URL, a modified body) while leaving the original untouched, which keeps the pipeline predictable when multiple interceptors run in sequence. Calling `next(modifiedReq)` passes control to the next interceptor (or the actual HTTP backend if it's last), and the returned Observable can itself be piped through `catchError`/`retry`/`tap` to intercept the *response* side too — logging every response, retrying on transient failures, or redirecting to `/login` on a 401 exactly once instead of duplicating that check after every `subscribe()`.

**Common pitfall:** forgetting that `req.clone()` is required — since `HttpRequest` is immutable, `req.headers.set(...)` silently does nothing to the request actually sent (or throws, depending on version), a classic source of "my auth header isn't being sent" confusion. Also, adding auth headers unconditionally to *every* request, including ones to third-party domains, which can leak a bearer token to a service that shouldn't receive it — a real interceptor should typically check `req.url` against your own API's origin first.

**Practical guidance:** interceptors are the standard place for cross-cutting HTTP concerns — auth headers, request/response logging, global error handling, loading-spinner tracking (incrementing/decrementing a counter around every request) — anything that would otherwise mean repeating boilerplate in every service method.

---

## Intermediate — Question 10

**Q10: Beyond the basics, how do route guards work as functional guards, and how would you use `canDeactivate` to prevent navigating away from an unsaved form?**

Modern Angular guards are plain functions (`CanActivateFn`, `CanDeactivateFn`, `CanMatchFn`, etc.) resolved via `inject()`, run by the Router before it commits to a navigation — returning `true` allows it, `false` (or a rejected outcome) blocks it, and returning a `UrlTree` redirects instead.

**`CanActivate`** decides whether a route can be *entered* — the common auth-gate use case (Intermediate Q4). **`CanDeactivate`** decides whether the user is allowed to *leave* the currently active route, which is exactly the "you have unsaved changes" scenario:

```typescript
export interface CanComponentDeactivate {
  canDeactivate(): boolean | Observable<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component) => {
  if (!component.canDeactivate()) {
    return confirm('You have unsaved changes. Leave anyway?');
  }
  return true;
};
```
```typescript
// on the route:
{ path: 'edit/:id', component: EditFormComponent, canDeactivate: [unsavedChangesGuard] }

// on the component:
export class EditFormComponent implements CanComponentDeactivate {
  form = new FormGroup({ ... });
  canDeactivate() {
    return !this.form.dirty; // safe to leave only if nothing changed
  }
}
```

**Mechanism:** the Router calls `canDeactivate` (passing the *currently activated* component instance as its first argument, unlike `canActivate`, which runs before the target route's component exists) whenever a navigation would tear down that route — including a browser back/forward action or a hard reload attempt via `beforeunload`, though the latter needs a separate native `window.onbeforeunload` handler since the Router guard can't intercept a tab close. If the guard returns `false`, the navigation is cancelled entirely and the user stays on the current route with the URL unchanged.

**Common pitfall:** using a blocking `confirm()` dialog (as above, for simplicity) in production code — it's synchronous, can't be styled, and is generally considered poor UX; a real implementation typically returns an `Observable<boolean>` that opens an app-styled confirmation modal and resolves once the user responds, which the guard can await naturally since `CanDeactivateFn` supports returning an Observable or Promise, not just a synchronous boolean.

**Practical guidance:** keep the "is it safe to leave" logic (`form.dirty`, or a more precise deep-equality check against the original loaded value) on the component itself via the shared interface, and keep the guard function itself thin — its job is orchestrating the confirmation UI and the router decision, not owning form-state logic.

---

## Intermediate — Question 11

**Q11: What is `NgZone.runOutsideAngular`, and when is it a legitimate performance optimization?**

Under Zone.js-based change detection (Advanced Q1), *any* patched async event — a click, a timer, a DOM event — triggers a full change-detection pass. That's usually exactly what you want, but for something firing at very high frequency where most firings don't actually need a UI update — a `mousemove` listener for a drag interaction, or every incoming message on a chatty WebSocket — running full change detection on every single firing is wasted work that can visibly hurt performance (dozens of change-detection passes per second for events that only occasionally change what's rendered).

`NgZone.runOutsideAngular()` runs a callback *outside* Angular's zone, so Zone.js doesn't intercept the async APIs used inside it — no automatic change detection is triggered by anything that happens in there:

```typescript
export class DragHandleComponent {
  private ngZone = inject(NgZone);
  private elRef = inject(ElementRef);

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.elRef.nativeElement.addEventListener('mousemove', (e: MouseEvent) => {
        this.updatePositionInternal(e.clientX, e.clientY); // pure computation, no CD triggered
        if (this.shouldSyncToUi(e)) {
          this.ngZone.run(() => this.syncVisiblePosition()); // re-enter the zone only when a real UI update is needed
        }
      });
    });
  }
}
```

**Mechanism:** code registered inside `runOutsideAngular`'s callback still runs normally — the DOM listener still fires on every `mousemove` — but Zone.js's patched `addEventListener` doesn't notify Angular afterward, so no change-detection pass happens automatically. You explicitly call `this.ngZone.run(callback)` to re-enter the Angular zone only at the moments a UI-visible update is actually warranted, which triggers exactly one change-detection pass for that update instead of one per raw event.

**Common pitfall:** using `runOutsideAngular` reflexively for anything performance-sensitive without measuring first — it adds real complexity (manually tracking when to re-enter the zone, risk of a component reading stale state if you forget to call `ngZone.run` when an update *is* needed) and is really only worth it for genuinely high-frequency sources; wrapping an occasional click handler in it is pure overhead for no benefit. It's also unnecessary if the component is signal-driven and zoneless, since signals notify Angular precisely rather than relying on Zone.js's blanket interception in the first place.

**Practical guidance:** reach for this only after profiling shows a specific high-frequency event source is causing excessive change-detection churn — `mousemove`/`scroll`/`resize` listeners, WebSocket/animation-frame callbacks, or third-party libraries (like a charting library) that fire callbacks very rapidly are the classic candidates.

---

## Intermediate — Question 12

**Q12: How does dynamic component loading work with `ViewContainerRef`/`createComponent`, and how does it differ from static template composition?**

Most Angular UI composition is static: a template references `<app-user-card [user]="u" />` directly, so the compiler knows at build time exactly which components can appear where. **Dynamic component loading** creates a component instance imperatively, at runtime, by component type rather than by template reference — needed when the component to render isn't known until runtime, like a modal/dialog service that can host arbitrary content, or a plugin-style UI that loads feature components based on configuration or user permissions.

```typescript
@Injectable({ providedIn: 'root' })
export class ModalService {
  open<T>(component: Type<T>, viewContainerRef: ViewContainerRef): ComponentRef<T> {
    viewContainerRef.clear();
    const componentRef = viewContainerRef.createComponent(component);
    return componentRef; // .instance gives typed access to the created component's @Input()s/methods
  }
}
```
```typescript
// host component with an anchor point:
@Component({
  template: `<ng-container #anchor></ng-container>`,
})
export class ModalHostComponent {
  @ViewChild('anchor', { read: ViewContainerRef }) anchor!: ViewContainerRef;

  showConfirmDialog() {
    const ref = this.modalService.open(ConfirmDialogComponent, this.anchor);
    ref.instance.message = 'Are you sure?';       // set @Input()s directly on the instance
    ref.instance.confirmed.subscribe(() => { ... }); // subscribe to @Output()s directly
  }
}
```

**Mechanism:** `ViewContainerRef` represents a location in the view tree where components can be inserted programmatically; `createComponent(ComponentType)` instantiates it (running the full component lifecycle — DI resolution, `ngOnInit`, rendering) and inserts its view at that location, returning a `ComponentRef` that gives direct, typed access to `instance` (to set inputs/read outputs, since there's no template binding syntax available for a component created this way) and a `destroy()` method for manual teardown. Unlike static composition, the created component isn't declared anywhere in a template, so Angular's structural directives (`*ngIf`, `@for`) and template-level bindings don't apply — you drive its lifecycle entirely through the `ComponentRef` API.

**Common pitfall:** forgetting to call `componentRef.destroy()` (or `viewContainerRef.clear()`, which destroys everything it currently holds) when the dynamically created component is no longer needed — since it wasn't created via a structural directive, nothing tears it down automatically the way `*ngIf="false"` would, and this is a common source of leaked component instances (and any subscriptions/timers they set up) in hand-rolled modal or overlay systems.

**Practical guidance:** for anything reasonably well-known ahead of time, prefer static templates with `*ngIf`/`@if`/`@switch` — they're simpler, type-checked, and Angular manages their lifecycle for you. Reach for dynamic component creation specifically when the component type genuinely isn't known until runtime; for common cases like modals/dialogs/toasts, Angular CDK's `Overlay` and `Dialog` APIs build on exactly this mechanism and handle the lifecycle/positioning/backdrop concerns for you rather than requiring you to hand-roll it.

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

## Advanced — Question 6

**Q6: What problem does server-side rendering (Angular Universal / Angular SSR) solve, and what is hydration — including the "hydration mismatch" pitfall?**

By default, an Angular app is a nearly-empty HTML shell (`<app-root></app-root>`) plus a JavaScript bundle — the browser has to download, parse, and execute that JS before anything meaningful appears on screen. That has two costs: a slower **first contentful paint** (the user stares at a blank page during the download/bootstrap), and poor **SEO**, since crawlers that don't fully execute JavaScript (or execute it inconsistently) see an essentially empty page.

**Server-side rendering (SSR)**, via Angular SSR (the modern, built-in successor to the separate Angular Universal package), runs the Angular app once on the server per request, producing fully-rendered HTML with real content already in it, which is sent to the browser immediately — the user sees the actual page before any client-side JavaScript has run at all.

```typescript
// app.config.server.ts — enables server rendering for the app
export const config: ApplicationConfig = {
  providers: [provideServerRendering()],
};
```

**Hydration** is what happens next: the same JavaScript bundle still loads and bootstraps Angular on the client, but instead of throwing away the server-rendered DOM and rebuilding it from scratch (which causes a visible flicker/reflow, historically called "destructive hydration"), modern Angular hydration (`provideClientHydration()`) **reuses the existing server-rendered DOM nodes**, attaching event listeners and component state to them in place, and only patches nodes where client-rendered output would actually differ.

```typescript
providers: [provideClientHydration(withEventReplay())]
```
`withEventReplay()` additionally captures user interactions (like a click) that happen *before* hydration finishes, replaying them once the app is interactive — closing the gap where a page looks ready but isn't yet responsive.

**The hydration mismatch pitfall:** hydration assumes the DOM the client would have rendered is *structurally identical* to what the server actually sent. If a component renders differently depending on something only available in the browser — reading `window`/`localStorage` directly in a template-affecting way, using `Math.random()` or `Date.now()` in a way that changes output, or rendering conditionally based on viewport size — the client's re-render disagrees with the server's HTML, and Angular either logs a hydration mismatch warning and falls back to destructive re-rendering for that subtree (losing the performance benefit) or, in worse cases, produces visibly broken output.

**Common pitfall / practical guidance:** guard any browser-only API access behind `isPlatformBrowser(this.platformId)` checks (SSR runs in Node, where `window`/`document` don't fully exist) and avoid non-deterministic values in anything that affects rendered markup — treat "would the server and client produce the exact same HTML for this data" as the litmus test for SSR/hydration-safe code.

---

## Advanced — Question 7

**Q7: What are micro-frontends in an Angular context, how does Module Federation help compose them, and what trade-offs come with that approach versus a single monolithic Angular app?**

A **micro-frontend** architecture splits a large frontend into multiple independently built, independently deployed applications/modules that are composed together at runtime into what the end user perceives as one cohesive app — the frontend analogue of microservices, typically adopted when multiple teams need to ship features on independent release schedules without coordinating a single monolithic frontend's build and deploy pipeline.

**Module Federation** (a Webpack/esbuild-ecosystem capability, integrated into Angular via `@angular-architects/module-federation` or native support in newer tooling) is one common mechanism for this: one Angular app (the "shell" or "host") can load and mount a component or route from an entirely separate, independently deployed Angular application (a "remote") at runtime, over the network, without either app being compiled together.

```typescript
// host's route config — lazy-loads a remote application's exposed module at runtime
{
  path: 'billing',
  loadChildren: () =>
    loadRemoteModule({
      type: 'module',
      remoteEntry: 'https://billing.example.com/remoteEntry.js',
      exposedModule: './Routes',
    }).then(m => m.BILLING_ROUTES),
}
```

**Why teams adopt this:** independent deploy cadence (the billing team ships without coordinating a shell release), technology/version isolation between teams, and the ability to scale a large engineering org across separately owned codebases — the same organizational motivation behind backend microservices.

**The classic trade-off — shared dependency versioning:** if the shell is on Angular 18 and a remote was built against Angular 17, or each ships its own copy of a large shared library (RxJS, a design-system package), you either duplicate that dependency in every bundle (bloating total download size, since the browser can't dedupe code shipped separately by unrelated builds) or you carefully configure "shared" singleton dependencies across host and remotes — which reintroduces exactly the kind of version-coordination problem micro-frontends were meant to avoid, just moved to the dependency-version layer instead of the deploy-schedule layer. Runtime composition also means a bug in a remote's `remoteEntry.js` (a bad deploy, a CDN outage) can break a route in an otherwise-healthy shell app, and debugging spans multiple independently-versioned codebases rather than one.

**Practical guidance:** micro-frontends earn their complexity when the organizational problem (multiple teams, independent release cadence, ownership boundaries) is real and painful — for a single team or a small-to-medium app, a monolithic Angular app with lazy-loaded feature routes (Intermediate Q4) gets most of the same code-splitting/performance benefit with none of the runtime-composition and dependency-version overhead, and is the right default absent a specific organizational driver for splitting deploys.

---

## Advanced — Question 8

**Q8: How does Angular's modern build/bundling pipeline work (esbuild/Vite), and why does bundle size matter enough to actively budget it?**

Angular's CLI build pipeline has moved from a purely Webpack-based system to one built on **esbuild** (for the underlying bundling/transpilation, which is written in Go and dramatically faster than Webpack's JavaScript-based toolchain) with **Vite** powering the dev server (`ng serve`) for near-instant rebuilds during development via native ES modules and on-demand compilation rather than bundling the entire app up front. This is largely transparent to app code — it's a build-tool swap, not an API change — but it materially speeds up both `ng build` and iterative `ng serve` rebuild times on large codebases.

**Why bundle size is actively budgeted, not just an afterthought:** every kilobyte shipped to the browser has to be downloaded, parsed, and executed before the app is interactive — on a slow connection or a lower-end device, a bloated main bundle directly costs first-load performance, which is also exactly what lazy loading (Intermediate Q4) and Server-Side Rendering (Advanced Q6) exist to mitigate. The Angular CLI lets you set enforced size limits directly in `angular.json`:

```json
"budgets": [
  { "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" },
  { "type": "anyComponentStyle", "maximumWarning": "4kb", "maximumError": "8kb" }
]
```
A build that exceeds `maximumError` **fails** — turning "the bundle quietly got bigger over six months of feature work" into a build-time failure the moment a single change pushes it over the line, rather than something only noticed later via user complaints or a performance audit.

**Mechanism — tree-shaking and differential concerns:** modern builds tree-shake aggressively (removing code nothing actually references, which is why `providedIn: 'root'` services that are never injected don't ship at all) and rely on ES module static analysis to determine what's genuinely reachable. Older Angular versions supported "differential loading" — shipping two bundles, a modern one for browsers supporting ES2015+ and a legacy ES5 fallback — but this has been deprecated as the baseline browser support Angular targets has moved forward, since essentially all currently-supported browsers now support modern JS natively, making the legacy bundle mostly unnecessary weight to maintain.

**Common pitfall:** importing an entire library for one function (`import _ from 'lodash'` instead of `import debounce from 'lodash/debounce'`), or eagerly importing a rarely-used feature module in the root bundle instead of behind `loadChildren`/`loadComponent` — both defeat tree-shaking/lazy-loading and are exactly the kind of regression a bundle budget is meant to catch in CI before it reaches production.

**Practical guidance:** set budgets early (even generous ones) rather than after the bundle has already grown unchecked — a budget that's never enforced provides no protection, and ratcheting an already-bloated bundle back down later is far more disruptive than catching regressions incrementally as they happen.

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

## Scenario — Question 5

**Q5: An Angular app's initial load time has crept up steadily over many feature releases, and users are now complaining. Profiling shows a large main bundle, and a big chunk of it is several admin-only features that most users never touch but that are bundled in unconditionally. Diagnose the problem and propose a fix, including how to prevent this regressing again.**

**Diagnosis:** this is the textbook symptom of features being wired up as eagerly-loaded routes/imports instead of lazy-loaded ones. Every time a new admin feature was added, if its route/component was imported directly in the root routing config (or its module eagerly declared/imported), its entire code — component logic, its own dependencies, any large third-party libraries it pulls in (a charting library for an admin dashboard, say) — gets bundled into the **initial** (`main`) JS chunk that every single user downloads on first load, whether or not they're an admin and whether or not they ever navigate there. Over many feature releases, this accumulates invisibly: no single feature addition looks alarming in isolation, but the aggregate initial bundle grows every release until first-load time is visibly bad. Confirm with `ng build --configuration production --stats-json` fed into a bundle analyzer (e.g. `webpack-bundle-analyzer` or Angular's own build stats), which visually shows exactly which modules are contributing bytes to the initial chunk versus already-lazy chunks.

**The fix — convert admin features to lazy-loaded routes:**

```typescript
// BEFORE: eagerly imported, ships in the main bundle for every user
import { AdminDashboardComponent } from './admin/admin-dashboard.component';
export const routes: Routes = [
  { path: 'admin', component: AdminDashboardComponent },
];

// AFTER: only downloaded when a user actually navigates to /admin
export const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canMatch: [adminRoleGuard], // bonus: also gate it so non-admins never even trigger the chunk fetch
  },
];
```
For a feature that's more than one component, `loadChildren` pointing at a child `Routes` array achieves the same split for the whole feature area at once. This moves the admin feature's code (and any admin-only third-party dependencies) into a separate chunk that esbuild/the Angular CLI only fetches on navigation to `/admin` — the vast majority of users who never go there never download it, and first-load time drops proportionally to how much was moved out of the main bundle.

**Preventing regression — bundle budgets in CI:** the fix addresses today's bloat, but nothing stops the next well-intentioned feature from being wired up eagerly again by mistake. Enforce a hard `angular.json` budget so a build that pushes the initial bundle over a threshold **fails CI** rather than merging silently:

```json
"budgets": [
  { "type": "initial", "maximumWarning": "500kb", "maximumError": "750kb" }
]
```
Set the initial threshold near the current, already-reduced size (with some headroom, not the old bloated figure) so any future PR that accidentally reintroduces an eager import to the main bundle fails the build with a clear, actionable error — pointing at itself — rather than being caught only much later by another round of user complaints and profiling.

**Practical guidance:** treat "does this belong in the initial bundle" as a question asked at the time a route is added, not retroactively — anything gated behind a role, a feature flag, or a rarely-visited section of the app is close to a default candidate for `loadComponent`/`loadChildren`, and a CI-enforced budget is what makes that discipline durable across a team and over time rather than dependent on someone remembering during code review.

---

## Beginner — Question 9

**Q9: What is `ng-template`, and how does `ngTemplateOutlet` let you define a reusable, parameterized chunk of markup? How is this different from content projection with `ng-content`?**

`ng-template` declares a block of markup that Angular does **not** render inline — it's compiled into a `TemplateRef` and only rendered when something explicitly instantiates it (via a structural directive, `ngTemplateOutlet`, or a `ViewContainerRef`). By itself, an `<ng-template>` in a component's markup produces nothing in the DOM; it's a piece of "template you own" that you can render zero, one, or many times, in this component or hand off elsewhere.

**Basic reuse with `ngTemplateOutlet`:**

```html
<ng-template #rowTemplate let-item let-i="index">
  <div class="row">{{ i }}: {{ item.name }}</div>
</ng-template>

<ng-container *ngTemplateOutlet="rowTemplate; context: { $implicit: activeItem, index: 0 }"></ng-container>
<ng-container *ngTemplateOutlet="rowTemplate; context: { $implicit: archivedItem, index: 1 }"></ng-container>
```
`let-item` binds the context's `$implicit` value; `let-i="index"` binds a named context key. The same template is rendered twice with different data, avoiding duplicated markup — the templating equivalent of extracting a function.

**Passing a `TemplateRef` as an `@Input()`** is the more powerful pattern: a reusable component (a table, a card, a modal) accepts a caller-supplied `TemplateRef` and decides *when and how many times* to render it, still fully controlled by the consuming component's own data:

```typescript
@Input() rowTemplate?: TemplateRef<{ $implicit: Item; index: number }>;
```
```html
<ng-container *ngFor="let item of items; let i = index">
  <ng-container *ngTemplateOutlet="rowTemplate ?? defaultRow; context: { $implicit: item, index: i }"></ng-container>
</ng-container>
```

**Contrast with `ng-content`:** `ng-content` projects markup the *consumer wrote inline* between a component's tags, rendered exactly once, at a fixed slot, with no parameterization — the consumer has no control over re-rendering it multiple times with different data. `ng-template` + `ngTemplateOutlet`/`TemplateRef` inputs instead give the *host* component control over when, how many times, and with what contextual data a caller-supplied fragment renders — much closer to passing a render function than passing static children.

**Common pitfall:** forgetting `<ng-container>` and instead wrapping the outlet in a real element adds an unwanted extra DOM node; `<ng-container>` is itself a non-rendering placeholder, which is why it pairs naturally with structural template rendering.

#### Follow-up: When would you reach for a `TemplateRef` input instead of just adding more `@Input()` flags to change a component's appearance?

Once customization needs go beyond toggling a few boolean/enum options — e.g., "the caller wants a completely different cell renderer per column in a data table" — a `TemplateRef` input scales far better than an ever-growing list of conditional `@Input()`s and `*ngIf` branches inside the reusable component, and keeps the reusable component decoupled from the specifics of what any particular caller wants to render.

---

## Intermediate — Question 13

**Q13: What is the `@defer` block, and how does it differ from route-level lazy loading? Walk through its triggers and a practical use case.**

`@defer` is Angular's built-in template-level deferred-loading mechanism (stable since v17): it lets you mark a section of a component's *own* template — along with the components, directives, and pipes it exclusively uses — to be split into a separate JS chunk and rendered only once a trigger condition is met, rather than being part of the component's initial render. This is distinct from route-level lazy loading (`loadComponent`/`loadChildren`), which splits code at the *routing* boundary (an entire page/feature); `@defer` splits code *within* a single already-loaded component, for content that isn't needed immediately even though the rest of the component is.

**Basic syntax and triggers:**

```html
@defer (on viewport) {
  <heavy-chart [data]="chartData" />
} @placeholder {
  <div class="chart-placeholder">Chart loading…</div>
} @loading (minimum 200ms) {
  <spinner />
} @error {
  <p>Couldn't load the chart.</p>
}
```
`@placeholder` renders before the trigger fires; `@loading` shows while the chunk downloads (the `minimum` avoids a loading-flash for fast connections); `@error` covers a failed dynamic import. Triggers include `on idle` (default — browser idle time), `on viewport` (IntersectionObserver-based, ideal for below-the-fold content), `on interaction` (click/keydown on the placeholder or a referenced element), `on hover`, `on timer(2000)`, and `on immediate`; multiple triggers can be combined, and a `when someCondition` form defers based on an arbitrary expression instead.

**Practical use case:** a product page with a below-the-fold "customer reviews" section that pulls in a large reviews-rendering component and its own dependencies. `@defer (on viewport)` keeps that code out of the initial bundle for the product page entirely, downloading it only once the user actually scrolls near it — improving the page's initial load and Core Web Vitals (particularly LCP/INP) without the reviews section needing its own route.

**Key mechanical detail:** Angular's compiler statically analyzes the deferred block to determine which standalone components/pipes/directives are used *only* inside it, and moves exactly those into the separate chunk — this is why deferred content must be built from standalone dependencies; anything still declared in an NgModule and shared with the eager template can't be cleanly split out.

**Common pitfall:** deferring content that's immediately visible above the fold with `on idle` still delays it slightly and can cause layout shift if the placeholder's dimensions don't match the eventual content — always reserve space in the placeholder to avoid CLS regressions.

---

## Intermediate — Question 14

**Q14: `HttpClient` interceptors run as a chain around every outgoing request. Walk through how ordering works, using a scenario with an auth interceptor, a logging interceptor, and an error-handling interceptor all applied to the same request.**

Functional interceptors are registered as an ordered array via `provideHttpClient(withInterceptors([...]))`, and they compose like middleware: each interceptor receives the request and a `next` function representing "the rest of the chain," and can inspect/transform the request before calling `next(req)`, and inspect/transform the response (or catch errors) in the Observable `next(req)` returns. Registration order **is** execution order for the request-outbound direction, and the exact reverse for the response-inbound direction — the first interceptor in the array is the outermost wrapper.

```typescript
provideHttpClient(
  withInterceptors([authInterceptor, loggingInterceptor, errorInterceptor])
)
```

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authedReq);
};

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const start = performance.now();
  return next(req).pipe(
    tap({
      next: () => console.log(`${req.method} ${req.url} — ${(performance.now() - start).toFixed(0)}ms`),
    })
  );
};

export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) inject(AuthService).logout();
      return throwError(() => err);
    })
  );
```

**Execution flow for one request:** `authInterceptor` runs first, attaching the token and forwarding a *modified* request; `loggingInterceptor` runs next, starting its timer and forwarding the same request further; `errorInterceptor` runs last before the actual HTTP call is dispatched. The response then flows back through the chain in reverse — `errorInterceptor` sees it first (able to catch a 401 and trigger logout before anyone else sees the error), then `loggingInterceptor` logs timing, then `authInterceptor`.

**Why order matters concretely here:** if `loggingInterceptor` were registered *before* `authInterceptor`, it would log the request URL/method before the Authorization header is attached — fine for logging, but if it also logged headers, it'd log an unauthenticated request. More critically, if `errorInterceptor` were registered *first* (outermost), a 401 caused by a missing/expired token would be caught and trigger logout *before* `authInterceptor` even had a chance to run on retried requests, and errors thrown deeper in the chain (e.g., a malformed request `authInterceptor` itself might produce) wouldn't be visible to it at all.

**Common pitfall:** forgetting that `next(modifiedReq)` must be called with the modified request, not the original — passing `req` instead of `authedReq` silently drops the transformation, a bug that's easy to introduce mid-refactor and easy to miss because the request still succeeds for already-unauthenticated endpoints.

---

## Intermediate — Question 15

**Q15: What accessibility (a11y) considerations are specific to building Angular SPAs, beyond generic HTML semantics? Cover focus management on route change, ARIA binding, and the Angular CDK's a11y utilities.**

SPAs break a browser behavior screen reader users rely on by default: on a traditional multi-page site, navigating to a new page moves focus to the top of the document and screen readers announce the new page title. In an Angular SPA, a route change swaps out component content via the Router without a full page load, so focus silently stays wherever it was (often on a link that no longer exists in the DOM) and nothing is announced — a genuinely common, easy-to-miss production a11y bug.

**Focus management on route change:**

```typescript
export class AppComponent {
  constructor(router: Router) {
    router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      const heading = document.querySelector('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus();
    });
  }
}
```
Moving focus to the new page's main heading (or a skip-to-content landmark) after each navigation restores the expected "you're now somewhere new" cue for keyboard and screen-reader users; `tabindex="-1"` makes a non-interactive element programmatically focusable without adding it to the tab order.

**ARIA attribute binding:** Angular binds ARIA attributes like any other attribute, using `[attr.aria-*]` (ARIA attributes aren't DOM properties, so the plain property-binding syntax doesn't apply):

```html
<button [attr.aria-expanded]="isOpen" [attr.aria-controls]="panelId" (click)="toggle()">
  Details
</button>
<div [id]="panelId" [attr.aria-hidden]="!isOpen">…</div>
```
This is easy to get wrong by binding `[aria-expanded]` directly (works in some cases via property reflection but is unreliable) instead of the explicit `attr.` prefix.

**CDK a11y utilities (`@angular/cdk/a11y`):**
- **`LiveAnnouncer`** — programmatically pushes a message into an `aria-live` region for announcements that don't correspond to a visible, focusable element (e.g., "3 results found" after an async filter update): `this.liveAnnouncer.announce('3 results found')`.
- **`FocusTrap`/`cdkTrapFocus`** — confines Tab/Shift+Tab cycling within a modal or drawer so keyboard focus can't silently escape to background content while the modal is open, and `FocusMonitor` tracks *how* an element was focused (mouse, keyboard, programmatic) for precise focus-visible styling.

**Practical guidance:** these gaps rarely show up in manual mouse-driven QA, which is exactly why they're overlooked until an audit, a keyboard-only user, or a legal accessibility requirement (WCAG/ADA compliance) surfaces them — treating route-change focus and dynamic-content announcements as a checklist item on every new route/modal, not an afterthought, is cheaper than retrofitting an entire app later.

---

## Advanced — Question 9

**Q9: What is Ivy, Angular's rendering engine, and what changed from the older View Engine compiler at a conceptual level?**

Ivy (the default rendering/compilation pipeline since Angular 9) replaced Angular's older "View Engine" compiler with a fundamentally different code-generation strategy, without changing the component-authoring API (decorators, templates, DI) that developers write against.

**Per-component compilation instead of whole-module compilation:** View Engine compiled an `NgModule` and its declared components together, producing large, interdependent generated factory files — a component's compiled output referenced its module's metadata, meaning components couldn't easily be understood or tree-shaken in isolation. Ivy compiles each component **locally and independently** into its own set of instructions (a `ɵcmp` definition containing the compiled template as a sequence of low-level instruction calls — `ɵɵelementStart`, `ɵɵtext`, `ɵɵproperty`, etc. — rather than a single opaque render function). A component's compiled artifact is self-contained and doesn't need its consuming module's metadata to exist or execute correctly.

**Why this enables smaller bundles and better tree-shaking:** because each component's compiled output is self-contained, a bundler can determine "is this component actually referenced anywhere" and eliminate it (and its compiled template instructions) if not, without needing to reason about module-wide graphs. This is also the mechanical foundation that made **standalone components** possible later — without View Engine's module-centric compilation model, a component that doesn't belong to any `NgModule` wouldn't have had a coherent compilation unit to begin with.

**Locality and incremental compilation:** because compiling one component doesn't require whole-program knowledge of other components/modules, Ivy supports faster incremental rebuilds during development, and libraries can ship pre-compiled Ivy code (via the Angular Package Format) that's directly usable rather than requiring a Metadata.json-driven re-linking step View Engine needed.

**Runtime behavior differences worth knowing (without deep compiler internals):** Ivy templates compile to actual JS instruction calls that execute directly against the DOM incrementally (closer to how other modern frameworks generate render functions), rather than View Engine's more indirect factory/definition object model — this is part of why Ivy enables faster change detection in practice and why error stack traces in Ivy point more directly at meaningful template locations.

**Practical relevance today:** View Engine was fully removed years ago (Ivy has been the only compiler since Angular 13), so this is largely historical/conceptual context now — but it's still asked because it explains *why* several modern Angular capabilities (standalone components, smaller production bundles, Angular's ability to more aggressively tree-shake unused directives/pipes) exist at all, rather than being unrelated feature additions.

**Common pitfall in interviews:** overstating Ivy as "just a performance optimization" — its bigger structural significance is decoupling compilation from the module system, which is the prerequisite for standalone APIs, not merely a speed improvement.

---

## Advanced — Question 10

**Q10: Compare Angular's built-in `$localize`/extraction-based i18n with a runtime translation library like `transloco` or `ngx-translate`. What's the build-time vs. runtime trade-off?**

**Built-in i18n (`$localize`, `ng extract-i18n`):** translatable text is marked in templates (`i18n` attribute) or code (`$localize` tagged template strings), extracted at build time into a translation source file (XLIFF/XMB), sent to translators, and the *translated* files are fed back into a **separate build per locale** — `ng build --localize` produces one fully compiled, locale-specific output bundle per language, with translations baked directly into the compiled templates as static strings.

```html
<h1 i18n="@@welcomeHeader">Welcome back, {{ userName }}</h1>
```
```typescript
const msg = $localize`:@@saveConfirm:Changes saved successfully`;
```

**Runtime i18n libraries (`transloco`, `ngx-translate`):** translations live in JSON files loaded at runtime; a pipe/directive (`{{ 'welcome' | transloco }}`) looks up the current locale's string dynamically on every render, and switching locale means loading a different JSON file and re-rendering — no rebuild required.

**The core trade-off:**
- **Bundle/deployment complexity vs. runtime cost.** Build-time i18n means N locales = N separate deployed bundles (and typically N separate URLs/subpaths, e.g. `/en/`, `/fr/`), which multiplies CI build time and hosting/CDN complexity, but each bundle ships with **zero runtime translation-lookup overhead** — no pipe evaluation, no JSON fetch, no re-render on locale change (because locale can't change without a full page navigation to a different build). Runtime libraries deploy a single bundle for all locales, trivially simple to host, but pay a small ongoing runtime cost (pipe/directive evaluation on every change-detection pass) and require shipping translation JSON as a separate asset fetched over the network.
- **Instant locale switching.** With build-time i18n, changing locale means navigating to a different deployed build (a full page reload) — there's no way to flip languages in-place. Runtime libraries support switching locale live, in-session, without a reload — important if the product requires an in-app language switcher rather than a locale chosen once (e.g. via URL/subdomain) per visit.
- **Translation workflow.** Build-time i18n's extraction files (XLIFF) are typically routed through a formal translation-management pipeline and require a rebuild+redeploy for every translation update to go live — translators can't self-serve; a developer/CI step is always in the loop. Runtime JSON files can often be edited and deployed independently of the app's build (even hot-swapped from a CDN), letting translators or a translation-management platform push updates without involving a developer per change.

**Practical guidance:** built-time i18n suits products with a small, relatively stable set of locales chosen at load (marketing sites, enterprise software with locale-per-tenant) where bundle-per-locale deployment is acceptable and runtime performance matters most. Runtime libraries suit products needing live in-app language switching, frequent translator-driven updates, or many/dynamic locales where maintaining N separate build artifacts becomes operationally unreasonable.

---

## Scenario — Question 6

**Q6: An Angular app needs to support 8 locales. The team is debating build-time i18n (`$localize`, a separate deployed bundle per locale) versus a runtime translation library (`transloco`/`ngx-translate`, one bundle, JSON-driven). Walk through the trade-offs that should actually drive this decision.**

This is a trade-off question with no universally correct answer — the right response walks through the concrete axes rather than declaring one approach categorically better.

**Deployment/CDN complexity vs. bundle size and runtime overhead:** build-time i18n with 8 locales means 8 separate compiled output directories, each needing its own hosting path (`/en/`, `/de/`, `/ja/`, …) and its own entry in CI (8x build time, unless build steps are parallelized), but each visitor downloads only *their* locale's bundle with translations already baked in as static strings — no JSON fetch, no lookup pipe evaluated on every change-detection cycle. Runtime i18n ships one bundle regardless of locale count (CI stays simple, one deployable artifact), but every visitor's bundle includes the i18n library and pulls a translations JSON file over the network, plus a small but real per-render cost for translation-key lookups at scale (long lists with many translated cells, for instance).

**Can users switch locale without a full reload?** This is often the deciding factor in practice. If the product requires an in-app language switcher (a settings toggle, a dropdown in the header) that changes the UI language *without* navigating away, build-time i18n cannot do this at all — switching locale means loading a different pre-built bundle, i.e., a full page navigation. If that in-app-switch requirement is real (not just "nice to have"), it eliminates build-time i18n regardless of how the other trade-offs shake out. If locale is instead determined once per session (via URL path, subdomain, or `Accept-Language` at first load, with users rarely if ever switching mid-session), build-time i18n's lack of live switching is a non-issue.

**Translation update workflow:** ask who updates translations and how often. If translations change frequently and non-developers (translators, a localization team, a third-party translation-management platform) need to ship updates independently, runtime JSON files decouple that from the app's release cycle — a translation fix can go out without a developer-driven rebuild+redeploy. If build-time i18n is chosen, every translation fix — even a single typo — requires a full rebuild and redeploy of that locale's bundle, which is a meaningfully heavier process for a team that iterates on copy often.

**Recommended framing for 8 locales specifically:** 8 is enough that build-time's CI multiplication (8 full builds) and hosting complexity (8 deployed bundle paths, routing logic to serve the right one) start to be a genuine operational cost, not a rounding error — this tips the scale toward runtime i18n unless the product has hard requirements for zero-runtime-cost rendering (e.g., extremely performance-sensitive, high-traffic public pages) or translations are genuinely static and rarely touched. Conversely, if per-visitor performance is paramount (a marketing/landing page optimized for Core Web Vitals) and locale is chosen once via URL/subdomain with no in-app switch, build-time i18n's zero runtime overhead is worth the added CI/deploy complexity. The decision should be driven by these three concrete factors — not by which approach is more modern or which the team has used before.

---

## Beginner — Question 10

**Q10: What do `@HostBinding` and `@HostListener` do, and why would a directive use them instead of binding to properties/events inside its own template?**

A directive (unlike a component) has no template of its own — it attaches behavior to an *existing* host element that some other template already renders. `@HostBinding` and `@HostListener` are how a directive reaches out to bind a property or listen for an event **on that host element**, rather than on something inside a template the directive doesn't have.

**`@HostBinding`** binds a directive class property to a property (or attribute/class/style) of the host element — whenever the bound class property changes, Angular updates the host element to match, the same way `[property]="expr"` would inside a template, except the "element" here is wherever the directive is applied, not something the directive itself declares.

**`@HostListener`** attaches an event listener to the host element and routes the event into a directive method, equivalent to `(event)="handler($event)"` but again targeting the host rather than a template child.

```typescript
@Directive({
  selector: '[appHighlight]',
  standalone: true,
})
export class HighlightDirective {
  @HostBinding('style.backgroundColor') backgroundColor = '';

  @HostListener('mouseenter')
  onMouseEnter() {
    this.backgroundColor = 'lightyellow';
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.backgroundColor = '';
  }
}
```
```html
<p appHighlight>Hover over me</p>
```

Here, `appHighlight` never renders any markup of its own — it's applied directly to a `<p>` that some other component's template already owns, and `@HostBinding`/`@HostListener` let it reach into that specific `<p>` to toggle a style and react to mouse events, without the directive needing (or being able) to write template markup for it.

**Modern equivalent — the `host` metadata object:** newer Angular code increasingly prefers declaring host bindings/listeners declaratively in the `@Directive`/`@Component` decorator's `host` property instead of per-property/method decorators, since it keeps all host-facing bindings in one place rather than scattered across the class:

```typescript
@Directive({
  selector: '[appHighlight]',
  host: {
    '[style.backgroundColor]': 'backgroundColor',
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()',
  },
})
export class HighlightDirective {
  backgroundColor = '';
  onMouseEnter() { this.backgroundColor = 'lightyellow'; }
  onMouseleave() { this.backgroundColor = ''; }
}
```
Both forms compile to the same underlying host-binding instructions; the `host` object is generally recommended in current style guides for readability when a directive/component has several host bindings, while `@HostBinding`/`@HostListener` remain common and equally valid for one or two.

**Common pitfall:** forgetting that `@HostBinding`/`@HostListener` (and the `host` object) target the element the directive/component is *applied to*, not an element inside the component's own template — a component wanting to bind something on its own root host element uses the same mechanism, which is a frequent point of confusion for people used to thinking "bindings only happen in templates."

**Practical guidance:** reach for host bindings whenever a directive needs to influence or react to the element it's attached to (styling, ARIA attributes, DOM events) — it's the idiomatic way to write attribute directives, and avoids the anti-pattern of directly manipulating `ElementRef.nativeElement` in code, which bypasses Angular's rendering abstraction and breaks under server-side rendering.

---

## Intermediate — Question 16

**Q16: When do you actually need `<ng-container>` instead of a plain `<div>`, and how do `@ViewChild`/`@ViewChildren` (and the newer `viewChild()`/`viewChildren()` signal queries) let a parent reach into a child's instance?**

**`ng-container` vs `<div>`:** `<ng-container>` is a logical grouping construct that Angular strips out of the rendered DOM entirely — it exists only at the template-authoring level, to attach a structural directive (`*ngIf`, `*ngFor`, `@if`/`@for` desugar similarly) or apply `ngTemplateOutlet` to a group of elements *without* introducing a real wrapping element. A `<div>` always renders as an actual DOM node, which can break CSS (`display: flex` children expecting to be direct siblings, table markup requiring `<tr>`/`<td>` as direct children with no wrapper allowed) or add meaningless nesting to the accessibility tree.

```html
<ng-container *ngIf="user as u">
  <h2>{{ u.name }}</h2>
  <p>{{ u.email }}</p>
</ng-container>
```
Using `<div *ngIf="user as u">` here would work functionally but adds a `<div>` with no styling purpose; `<ng-container>` conditionally renders the two elements with zero extra DOM footprint. It's essential inside `<table>`/`<tr>` structures, flex/grid layouts sensitive to direct-child selectors, and whenever you need to combine two structural directives that can't legally stack on one element.

**View queries — `@ViewChild`/`@ViewChildren`:** let a parent component imperatively obtain a reference to a child component instance, a DOM element, or a directive found in its *own* template (not projected content, which needs `static: false` timing awareness or `@ContentChild` instead).

```typescript
@Component({ template: `<app-chart #chart [data]="data"></app-chart>` })
export class DashboardComponent implements AfterViewInit {
  @ViewChild('chart') chart!: ChartComponent;
  ngAfterViewInit() {
    this.chart.redraw(); // call a method directly on the child instance
  }
}
```
`@ViewChild` resolves once the view is initialized (`ngAfterViewInit`, not `ngOnInit` — the child hasn't rendered yet at that point); `@ViewChildren` returns a live `QueryList` for multiple matches, updating as matching elements are added/removed.

**Signal-based queries — `viewChild()`/`viewChildren()`:** the newer functional equivalents return a `Signal` instead of requiring a lifecycle hook to read reliably:

```typescript
export class DashboardComponent {
  chart = viewChild.required(ChartComponent);
  redrawChart() {
    this.chart().redraw();
  }
}
```
Because it's a signal, the value is always current wherever read (including inside `computed()` or an `effect()`), and `viewChild.required(...)` throws clearly if the target doesn't exist, versus `@ViewChild`'s `!` non-null assertion silently masking a `undefined` until something calls a method on it and throws at runtime.

**Practical guidance:** view queries are an escape hatch for imperative interaction (calling a child's method, reading its native element for a focus/measurement need) that can't be expressed through `@Input()`/`@Output()` alone — prefer plain data-down/events-up binding when possible, since it keeps components decoupled and testable in isolation; reach for `viewChild()`/query APIs only when the interaction is genuinely imperative (a chart library's `redraw()`, a form's `focus()`).

---

## Intermediate — Question 17

**Q17: What's the actual trade-off in adopting a component library like Angular Material for a real project, versus building custom components?**

Angular Material (or any mature component library — PrimeNG, Nebular, and similar) provides a ready-made set of accessible, tested, themeable components — buttons, form fields, dialogs, data tables, date pickers, autocomplete — built to a consistent design system (Material Design, in Angular Material's case) and wired for accessibility out of the box (correct ARIA roles, keyboard navigation, focus management already implemented and tested against screen readers).

**What adopting it buys a real project:**
- **Consistency for free.** Every consumer of `MatButton`, `MatFormField`, `MatDialog` gets the same spacing, elevation, typography, and interaction patterns without a design system being hand-built and enforced by convention — meaningfully reduces UI drift across a team of several developers building different features in parallel.
- **Accessibility work already done.** Focus trapping in `MatDialog`, correct `aria-*` wiring on `MatSelect`/`MatAutocomplete`, keyboard interaction patterns for a `MatMenu` — these are genuinely hard to get fully right from scratch, and a mature library has had years of bug reports and audits to fix edge cases a custom component wouldn't hit until it ships to a real user with a screen reader.
- **Less custom CSS.** Theming is handled through a defined API (Sass theming mixins or, in current Angular Material, CSS custom properties via M3 theming) rather than hand-rolled component-by-component stylesheets.

**What it costs:**
- **API and theming constraints.** Customizing a `MatFormField`'s internals, or getting a design that deviates significantly from Material's visual language (a bespoke, brand-heavy design system), fights the library rather than being served by it — deep visual customization of Material components is possible but often requires overriding internal CSS classes not officially part of the public API, which breaks on version upgrades.
- **Bundle size and unused surface area.** Pulling in `@angular/material` and `@angular/cdk` adds weight even if only a handful of components are used, though tree-shaking mitigates this for unused component modules with standalone imports.
- **Migration lock-in.** Once dozens of components across the app are `mat-*`, moving to a different design language later is a substantial rewrite, not a targeted change.

**Practical guidance:** for internal tools, admin dashboards, and B2B products where consistent, accessible UX matters more than a unique visual identity, adopting a library like Angular Material is close to always the right call — the accessibility and consistency wins outweigh the theming friction. For a consumer-facing product with a strong, distinctive brand/design system, teams often use the CDK alone (`@angular/cdk` ships the *behavioral* primitives — overlay positioning, focus trapping, drag-drop, virtual scrolling — without Material's visual components) and build custom-styled components on top of those primitives, getting the hard-to-build interaction logic without inheriting Material's visual opinions.

---

## Intermediate — Question 18

**Q18: In modern Angular, when should you reach for a Signal versus an RxJS Observable to model a piece of state?**

They overlap for a narrow case — "a current value that changes over time" — but are built for genuinely different problems, and picking the wrong one for the wrong reason (usually "signals feel more modern") tends to produce awkward code.

**The decision framework:**
1. **Is the value fundamentally an asynchronous stream of events over time** — HTTP responses, WebSocket messages, router events, keystrokes needing debouncing, several sources combined with timing operators? Use **Observables** — this is exactly what RxJS's operator library (`switchMap`, `debounceTime`, `combineLatest`, `retry`, all covered in earlier Intermediate questions) is built for, and nothing in the signals API replaces that composition today.
2. **Is the value synchronous, local or shared state that a template reads directly, with derived values needed from it?** Use **`signal()`/`computed()`** — no subscription to manage, no leak risk (Advanced Q3), and it integrates natively with `OnPush`/zoneless change detection (Advanced Q5/Q11) without an `async` pipe.
3. **Do you need to react imperatively to a change as a side effect** (persist to `localStorage` whenever state changes, log an analytics event)? Use `effect()` for signal-based state, or `tap()`/`subscribe()` for Observable-based state — the two have direct equivalents here.

**Bridging the two at the seam where a stream becomes state:**

```typescript
private user$ = this.userService.getUser(id); // Observable<User>, from an async source
user = toSignal(this.user$, { initialValue: undefined });
fullName = computed(() => this.user() ? `${this.user()!.first} ${this.user()!.last}` : '');
```
`toSignal()`/`toObservable()` (from `@angular/core/rxjs-interop`) convert between the two worlds at exactly this boundary — the asynchronous plumbing stays in RxJS, and the resulting value a template actually consumes becomes a signal.

**Common pitfall:** converting every Observable to a signal reflexively via `toSignal()` throughout a whole pipeline, rather than only at the point where a stream becomes a piece of state to read. Doing this mid-pipeline discards RxJS's operator composition for genuinely asynchronous, multi-step logic (a chained `debounceTime` → `switchMap` → `retry` sequence, say) that has no equally concise signal-based equivalent today — convert at the boundary, not throughout.

**Practical guidance:** use RxJS for the asynchronous plumbing and Signals for the resulting state components and templates consume, with `toSignal`/`toObservable` at the seam between the two — treat this as complementary tooling, not a choice between two competing paradigms for the whole app.

---

## Intermediate — Question 19

**Q19: Lazy loading (Intermediate Q4) means a route's code isn't fetched until the user first navigates there — which means that very first navigation pays a network-fetch delay. What is a router preloading strategy, and how do you configure a custom one?**

A **preloading strategy** lets the Router fetch lazy route chunks *in the background*, after the initial app has finished loading, so that by the time a user actually navigates to one of those routes, the chunk is often already cached — trading a bit of extra background bandwidth immediately after load for a fast, no-fetch-delay experience on subsequent navigation.

**Built-in strategies:**
- **`NoPreloading`** (the default) — fetch a lazy chunk only on demand, when the user actually navigates there.
- **`PreloadAllModules`** — fetch every lazy route's chunk shortly after the initial app loads, regardless of whether the user is likely to visit it.

```typescript
provideRouter(routes, withPreloading(PreloadAllModules))
```

**A custom, selective strategy** — useful once `PreloadAllModules`'s "fetch everything" becomes wasteful for a large app with many rarely-visited routes (an admin section most users never open):

```typescript
@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] ? load() : of(null);
  }
}
```
```typescript
{ path: 'reports', data: { preload: true }, loadChildren: () => import('./reports/reports.routes').then(m => m.REPORTS_ROUTES) },
{ path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES) }, // never preloaded
```
```typescript
provideRouter(routes, withPreloading(SelectivePreloadingStrategy))
```

**Mechanism:** once the initial navigation completes, the Router walks every lazy route in the configuration and, for each, asks the configured `PreloadingStrategy.preload()` whether to fetch it now — `PreloadAllModules` always calls `load()`; a custom strategy can inspect `route.data`, a user's role, or even network conditions (`navigator.connection`) to decide selectively rather than uniformly.

**Common pitfall:** reaching for `PreloadAllModules` as a blanket "get lazy loading's benefit without the wait" fix — reasonable for a small-to-medium app, but on a very large app with many rarely-visited routes it silently reintroduces much of the bandwidth cost lazy loading exists to avoid, just deferred by a few seconds after load instead of eliminated for users who never visit those routes at all.

**Practical guidance:** `PreloadAllModules` is a fine default while an app is small enough that preloading everything is cheap; for a large app, a custom strategy driven by route metadata (or real navigation analytics — preload what users actually go to most) balances fast subsequent navigation against not wasting bandwidth on routes most visitors never touch.

---

## Intermediate — Question 20

**Q20: How do you write a custom synchronous validator and a custom asynchronous validator for a Reactive Form, and what's the mechanical difference in how Angular runs each?**

A **synchronous validator** (`ValidatorFn`) is a plain function `(control: AbstractControl) => ValidationErrors | null`, run on every value change, immediately, with no I/O.

```typescript
export function passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const strongEnough = /[A-Z]/.test(value) && /[0-9]/.test(value) && value.length >= 8;
  return strongEnough ? null : { weakPassword: true };
}
```

An **asynchronous validator** (`AsyncValidatorFn`) returns an `Observable<ValidationErrors | null>` (or a `Promise`) instead of a synchronous value, needed for validations requiring a round-trip — the classic case being "is this username already taken."

```typescript
export function uniqueUsernameValidator(userService: UserService): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> =>
    control.value
      ? userService.checkUsernameAvailable(control.value).pipe(
          map(isAvailable => (isAvailable ? null : { usernameTaken: true }))
        )
      : of(null);
}
```
```typescript
username = new FormControl('', {
  validators: [Validators.required],
  asyncValidators: [uniqueUsernameValidator(this.userService)],
  updateOn: 'blur',
});
```

**Mechanism:** Angular runs every synchronous validator first; only if all of them pass does it run the async validators, setting the control's `status` to `PENDING` while they're in flight and to `VALID`/`INVALID` once they resolve — a template checking `control.pending` can show a "checking availability…" indicator during that window. Like synchronous validators, async validators are re-run on every qualifying value change by default, which is exactly why they're almost always paired with debouncing and `updateOn: 'blur'` rather than firing a network call on every keystroke.

**Common pitfall:** assuming a `debounceTime` placed inside the async validator's own `.pipe()` delays how often the validator function itself is *invoked* — it doesn't. Angular still calls the validator on every qualifying value change; each call independently starts its own debounce timer, so debouncing inside the validator delays each individual call's emission without reducing how many calls happen in the first place. Reducing actual call volume requires debouncing the *trigger* — `updateOn: 'blur'`, or a manually-debounced `valueChanges` subscription driving validation outside the standard validator pipeline.

**Practical guidance:** default to `updateOn: 'blur'` for any field with an async validator to avoid a network call per keystroke, and make sure the validator's internal request chain is genuinely cancellable (via `switchMap` or equivalent) so a slow, stale response for an earlier value can't incorrectly overwrite the result for the value the user has since typed — see the following Scenario for exactly this race condition in practice.

---

## Advanced — Question 11

**Q11: What does it mean to run Angular fully zoneless — Zone.js removed entirely — and what are the current trade-offs of doing that versus staying on Zone.js-based change detection?**

Zone.js works by monkey-patching essentially every async browser API (`setTimeout`, `Promise`, DOM event listeners, `XMLHttpRequest`, etc.) so that Angular is notified whenever *any* async operation completes anywhere in the app, and triggers change detection across the whole component tree in response. This is what makes classic Angular "just work" without manually telling it when to re-render — but it's also inherently coarse: an unrelated `setTimeout` firing in a third-party library can trigger a full change-detection pass across components that had nothing to do with it.

**Zoneless mode** (`provideZonelessChangeDetection()`, stable as of recent Angular versions) removes Zone.js from the bundle and build entirely — Angular no longer monkey-patches async APIs or reacts to "something async happened somewhere." Instead, Angular knows exactly when to re-render because **Signals notify it directly**: a component's template reading a signal registers that dependency, and when the signal's value changes, only the components that actually read it are scheduled for a change-detection check — not the whole tree.

**Concrete trade-offs today:**
- **Bundle size and startup cost drop measurably** — Zone.js itself is removed, and its monkey-patching overhead at startup disappears.
- **Change detection becomes precise rather than global** — no more "some unrelated component's `setTimeout` triggered a full-tree check"; only signal-driven updates schedule work, which is both faster and easier to reason about.
- **Every piece of state that should trigger a re-render must be a signal (or an `async` pipe/observable feeding one), full stop.** A component that still mutates a plain class field (`this.count++`) and expects the template to reflect it has no mechanism to trigger re-render in zoneless mode — Zone.js was silently covering for exactly this pattern before, so it's the single biggest source of "works with Zone.js, breaks zoneless" migration bugs.
- **Third-party library compatibility.** Libraries that rely on Zone.js's implicit "any async triggers CD" behavior (some older component libraries, certain testing utilities built around `fakeAsync`/`tick()` which are themselves Zone.js-dependent) need auditing before a zoneless migration — a library calling a plain callback outside Angular's knowledge won't trigger a re-render unless the state it mutates is signal-based.
- **Migration is generally incremental**, not all-or-nothing: `provideZonelessChangeDetection()` can be adopted while the codebase still has non-signal state in places, but any component relying on Zone.js's implicit change detection for that state needs to be converted to signals (or manually call `ChangeDetectorRef.markForCheck()`) to keep working correctly.

**Practical guidance:** for a new project built signal-first from the start, zonelessness is close to "just the modern default" — there's little reason to pay Zone.js's bundle/precision cost. For a large existing app with substantial non-signal state and third-party dependencies assuming Zone.js's behavior, treat it as a deliberate, incremental migration (audit for direct field mutation expected to trigger re-render, replace with signals) rather than a flag flipped in an afternoon.

---

## Advanced — Question 12

**Q12: What does `strictTemplates` do, and why is enabling it worth the migration pain on a large, loosely-typed legacy template codebase?**

Angular's template compiler doesn't just parse templates into render instructions — with `strictTemplates: true` set in `tsconfig.json`'s `angularCompilerOptions`, it also **type-checks template expressions against TypeScript's type system**, the same way TypeScript checks a `.ts` file, catching binding errors at build time instead of only surfacing them as `undefined`/silent-no-op bugs at runtime.

```json
{
  "angularCompilerOptions": {
    "strictTemplates": true
  }
}
```

**What it actually catches:**

```html
<!-- Property that doesn't exist on the component's type -->
<app-user-card [naem]="user.name"></app-user-card>
<!-- Error: Property 'naem' does not exist on type 'UserCardComponent' -->

<!-- Type mismatch on an @Input() -->
<app-user-card [age]="user.name"></app-user-card>
<!-- Error: Type 'string' is not assignable to type 'number' -->

<!-- Calling a method with the wrong argument type -->
<button (click)="deleteUser(user)">Delete</button>
<!-- Error if deleteUser expects a string id, not a User object -->

<!-- Nullable access without narrowing -->
<p>{{ user.profile.bio }}</p>
<!-- Error if `profile` is `Profile | null` and hasn't been narrowed -->
```
Without `strictTemplates`, several of these fail *silently* — a misspelled `[naem]` binding is simply ignored (Angular just doesn't bind anything, no error, no warning), which is a genuinely common source of "why isn't this updating" bugs that take real debugging time to trace back to a typo, versus an immediate red squiggle and a failed build with strict mode on.

**Why it's worth the pain on a legacy codebase:** a loosely-typed template codebase typically has accumulated years of exactly these silent failures — misspelled bindings nobody noticed because the UI degraded quietly rather than erroring, `any`-typed component properties that let genuinely wrong data flow into child components undetected, optional-chaining gaps that only surface as a production null-reference error under specific data conditions. Turning on `strictTemplates` surfaces the *existing* bugs (not just prevents future ones) — the initial migration pain is largely the cost of a debt that was already there, made visible all at once instead of trickling in as user-reported production incidents.

**Migration approach for a large legacy app:** `strictTemplates` is typically enabled incrementally — start with `fullTemplateTypeCheck: true` (a lighter intermediate step) if the jump is too large, or enable `strictTemplates` and triage the resulting error list by component, fixing the highest-traffic/highest-risk components first rather than requiring a single all-at-once fix across the whole app; some teams temporarily suppress specific errors with `// @ts-ignore`-equivalent template comments on a tracked list to unblock CI while working through the backlog methodically.

**Common pitfall:** treating the initial wave of errors as "the compiler being overly strict" and disabling it again rather than fixing the underlying issues — the errors are almost always real latent bugs (or at minimum, genuinely ambiguous types worth clarifying), not compiler false positives, since template type checking reuses the same type system already trusted for the rest of the codebase's `.ts` files.

**Practical guidance:** enable `strictTemplates` on every new project by default — the cost is near zero when the codebase grows with it from day one. On a legacy app, budget it as a dedicated, tracked migration (not an afterthought squeezed into unrelated feature work), because the error volume on a large loosely-typed app can be substantial, but the alternative is leaving an entire class of runtime template bugs permanently undetectable until a user hits them.

---

## Advanced — Question 13

**Q13: What do the `@Optional`, `@Self`, `@SkipSelf`, and `@Host` decorators do in Angular's DI system, and what is a "multi-provider" (`multi: true`)?**

Building on the injector hierarchy from Advanced Q2, these decorators modify *how* a dependency is resolved rather than *what* is resolved:

- **`@Optional()`** — if no provider is found anywhere up the injector chain, inject `null` instead of throwing `NullInjectorError`.
- **`@Self()`** — only look at the current element injector; don't walk up to ancestors at all, and throw if not found there.
- **`@SkipSelf()`** — skip the current element injector and start looking from the parent upward — a classic use is a directive checking whether an *ancestor* also provides the same token, e.g. detecting (and warning against) accidentally nested instances of a directive that shouldn't be nested.
- **`@Host()`** — stop searching once reaching the current component's host boundary — mainly relevant for directives that need to interact with a specific enclosing component, less commonly needed in standalone-era code.

```typescript
@Directive({ selector: '[appControlErrorDisplay]' })
export class ControlErrorDisplayDirective {
  constructor(@Optional() @Self() private ngControl: NgControl | null) {
    if (!this.ngControl) {
      throw new Error('appControlErrorDisplay must be used on an element with a form control directive');
    }
  }
}
```

**Multi-providers:** `{ provide: TOKEN, useClass: X, multi: true }` registers `X` as one of *several* values resolved for `TOKEN` — `inject(TOKEN)` then returns an array, rather than the new provider replacing whatever was previously registered. This is exactly the mechanism behind extensible tokens like `HTTP_INTERCEPTORS` (the legacy class-based interceptor API) and `NG_VALIDATORS`: many independent features can each contribute one more interceptor/validator to a shared token without needing to know about each other or hand-assemble a combined array themselves.

```typescript
export const APP_WIDGETS = new InjectionToken<Widget[]>('APP_WIDGETS');

providers: [
  { provide: APP_WIDGETS, useClass: WeatherWidget, multi: true },
  { provide: APP_WIDGETS, useClass: NewsWidget, multi: true },
]
// inject(APP_WIDGETS) => [weatherWidgetInstance, newsWidgetInstance]
```

**Common pitfall:** forgetting `multi: true` when the intent is to *add to* a list-style token — omitting it makes the new provider silently *replace* whatever was previously registered for that token, rather than appending to it, which for something like `HTTP_INTERCEPTORS` means every interceptor registered before yours (potentially in a different, unrelated feature module) silently stops running with no error at all.

**Practical guidance:** reach for `@Optional`/`@SkipSelf` when writing a directive or component meant to be aware of its position within a hierarchy of same-typed ancestors (nested drop zones, nested form groups); use the `multi: true` pattern whenever designing an extensibility point where independent features should each be able to register a contribution without a central coordinator needing to combine them by hand.

---

## Advanced — Question 14

**Q14: Why does Angular throw `ExpressionChangedAfterItHasBeenCheckedError` in development mode, and what typically causes it?**

In development mode, after Angular finishes a normal change-detection pass, it runs an extra verification pass: it re-checks every previously-checked expression a second time and compares the value against what it just rendered. If a bound expression's value differs between the first check and this second verification — meaning it changed *as a side effect of change detection itself*, rather than before the pass began — Angular throws this error rather than silently rendering a value that's one tick behind reality. Production builds skip this double-check entirely for performance, so the identical underlying bug wouldn't throw in production — it would just render subtly stale or inconsistent data, which is exactly why the dev-mode error is valuable to fix rather than an annoyance to suppress.

**Typical causes:**

1. **A child component's `ngAfterViewInit`/`ngOnInit` mutating a value the parent already rendered this cycle:**
```typescript
// Parent template: <child [footer]="footerText"></child>
// Child:
ngAfterViewInit() {
  this.footerVisible.emit(true); // changes a parent-bound value AFTER the parent was already checked this pass
}
```
2. **A getter or unmemoized `computed`-like function used directly in a template returning a different value each time it's called** (depending on `Date.now()`, `Math.random()`, or similar) — the "check" value and the "verify" value trivially differ because the function was genuinely invoked twice and returned two different results.
3. **Mutating state inside a lifecycle hook that runs partway through a check** (`ngDoCheck`, `ngAfterContentChecked`) in a way that changes a value read earlier in that same pass.

**Fix:** defer the state change to the *next* change-detection cycle rather than performing it synchronously mid-check — `Promise.resolve().then(() => this.footerVisible.emit(true))`, or `setTimeout(() => ..., 0)`. The more idiomatic modern fix is using a signal for the value: a signal update schedules a genuinely new, separate change-detection pass rather than trying to retroactively alter the one already in progress, which sidesteps the whole class of bug structurally.

**Common pitfall:** wrapping the offending code in `setTimeout` everywhere the error appears without understanding *why* that fixes it — it defers the update by a tick and avoids the mismatch, but doesn't address the underlying design issue (state that should be derived is instead being pushed reactively mid-render), and can mask a deeper bug rather than resolving it. Understand the actual mutation-during-render cause before reaching for the timing workaround.

**Practical guidance:** treat this error as a genuinely useful signal that a component's data flow briefly produced a one-tick inconsistency, not as framework noise — the cleanest long-term fix is almost always making the value a `computed()` signal, or restructuring so a child doesn't mutate a parent-owned value during its own initialization, rather than sprinkling `setTimeout` calls to dodge the dev-mode check.

---

## Advanced — Question 15

**Q15: Beyond a single default `<ng-content>` slot, how does multi-slot content projection with `select` and `ngProjectAs` work — and whose change-detection cycle actually re-checks the projected content?**

**Multi-slot projection** uses the `select` attribute to route different projected elements into different named slots, matched much like a CSS selector (tag name, attribute, class):

```html
<!-- card.component.html -->
<div class="card">
  <header><ng-content select="[card-header]"></ng-content></header>
  <ng-content></ng-content> <!-- default/unnamed slot: catches anything not matched above -->
  <footer><ng-content select="[card-footer]"></ng-content></footer>
</div>
```
```html
<app-card>
  <h2 card-header>Title</h2>
  <p>Body content, falls into the default slot.</p>
  <button card-footer>OK</button>
</app-card>
```

**`ngProjectAs`** lets an element be matched against a slot selector it doesn't literally satisfy in the DOM — useful when the projected content is itself a component whose own tag selector doesn't match what the receiving component's `select` expects:

```html
<app-custom-header ngProjectAs="[card-header]">...</app-custom-header>
```
Here, `<app-custom-header>` is a component with its own selector, but `ngProjectAs="[card-header]"` tells Angular's projection logic to treat it as if it matched `[card-header]` for slotting purposes, without the component needing a `card-header` attribute that might conflict with its own styling or selector.

**Whose change detection actually runs the projected content — the subtle, frequently-misunderstood part:** content projected into a child's `<ng-content>` is **not** owned by that child for change-detection purposes, even though it visually renders inside the child's DOM. The projected template's bindings are evaluated against, and checked as part of, the *parent's* component instance and change-detection pass — not the child's. Concretely: if the receiving `AppCardComponent` uses `OnPush` but the parent doesn't, and the parent re-renders on every keystroke happening elsewhere on the page, the projected content's bindings still re-evaluate on every one of those keystrokes — `AppCardComponent`'s `OnPush` strategy only protects `AppCardComponent`'s *own* template bindings, not markup the parent handed it to project.

**Common pitfall:** assuming that putting `OnPush` on a wrapper/card/layout component automatically shields everything visually inside it — including projected content — from unnecessary change-detection churn. It doesn't; projected content is gated by whichever component *wrote* that template (the parent), not by the component it happens to render *inside* (the child).

**Practical guidance:** if a performance problem traces back to expensive projected content re-evaluating too often, the fix has to happen at the level of the component that *wrote* the projected template — making the parent `OnPush` as well, or wrapping the expensive expression in a `computed()`/pure pipe — since putting `OnPush` only on the receiving wrapper component won't touch it at all.

---

## Advanced — Question 16

**Q16: How do you give a custom structural directive a typed context — so that inside the `*` template, TypeScript actually knows the shape of the value the directive hands back, the way `*ngFor`'s `let item` knows `item`'s type — and what is `ngTemplateContextGuard` for?**

Building on Beginner Q16's basic structural directive, a typed context is what makes `*ngIf="value as v"` correctly narrow `v`'s type, or `*ngFor="let item of items"` correctly type `item` as the array's element type, rather than `any`.

```typescript
export interface UnwrapContext<T> {
  $implicit: T;
}

@Directive({
  selector: '[appUnwrap]',
  standalone: true,
})
export class UnwrapDirective<T> {
  private templateRef = inject(TemplateRef<UnwrapContext<T>>);
  private viewContainerRef = inject(ViewContainerRef);

  @Input() set appUnwrap(value: T | null | undefined) {
    this.viewContainerRef.clear();
    if (value != null) {
      this.viewContainerRef.createEmbeddedView(this.templateRef, { $implicit: value });
    }
  }

  static ngTemplateContextGuard<T>(
    dir: UnwrapDirective<T>,
    ctx: unknown
  ): ctx is UnwrapContext<T> {
    return true;
  }
}
```
```html
<div *appUnwrap="user$ | async as user">
  {{ user.name }}  <!-- `user` is correctly typed as `User`, not `User | null`, inside this block -->
</div>
```

**Mechanism:** `createEmbeddedView(templateRef, context)`'s second argument populates the object that `let`/`as` bindings inside the template read from — `$implicit` is what an unqualified `let x` or `as x` binds to. Without a `static ngTemplateContextGuard` method, Angular's template type-checker (`strictTemplates`, Advanced Q12) has no way to know the *type* of that context object at compile time and falls back to `any` inside the structural block, defeating the type-safety `strictTemplates` is meant to provide. `ngTemplateContextGuard` is a compile-time-only type guard — its body is never actually executed at runtime; only its *type signature* matters to the compiler — that tells the type-checker "treat this directive's template context as `UnwrapContext<T>`," letting TypeScript correctly narrow `user` to `User` instead of `User | null | undefined` inside the block.

**Common pitfall:** omitting `ngTemplateContextGuard` and being surprised that `strictTemplates` doesn't catch an obvious type error inside the structural block's content — the omission silently opts that one directive's projected context out of type-checking entirely, rather than erroring on the missing guard itself.

**Practical guidance:** this ceremony is worth it for a structural directive meant for reuse across a team or codebase (exactly like `*ngIf`/`*ngFor` themselves), where the type-safety payoff compounds across every call site; for a one-off, locally-used structural directive, a simpler untyped context is often a reasonable, pragmatic trade-off.

---

## Scenario — Question 7

**Q7: A team's Angular test suite has become extremely slow and brittle — tests frequently need `fakeAsync`/`tick()` to work around async timing, and unrelated changes keep breaking unrelated tests. Investigation shows most components subscribe to multiple services, call APIs, and coordinate application state directly inside `ngOnInit`. How do you diagnose this and guide the refactor?**

**Diagnosing the root cause:** when a component's `ngOnInit` directly subscribes to several services, kicks off HTTP calls, and coordinates the resulting state (deciding what to fetch next based on a first response, merging multiple streams, handling error/retry logic inline), testing that component means testing all of that orchestration logic *through* the component — which forces every test to mock every dependency the orchestration touches, control the timing of every async operation involved (hence the `fakeAsync`/`tick()` proliferation, since `ngOnInit`'s async work needs to be manually advanced to complete), and re-verify the same orchestration logic repeatedly across every test that touches the component, even tests that only care about a specific rendering detail. A change to *any* piece of that orchestration (a new field to fetch, a reordered API call) tends to shift async timing enough to break tests asserting on unrelated behavior — exactly the brittleness described.

**The fix: extract orchestration into an injectable service, leave the component thin.** The component's job becomes reading state (increasingly, via signals) and dispatching user actions; a dedicated service owns subscribing to dependencies, sequencing API calls, and coordinating resulting state.

```typescript
// Before: orchestration lives in the component
export class OrderDetailComponent implements OnInit {
  order?: Order;
  shipping?: ShippingInfo;
  ngOnInit() {
    this.orderService.getOrder(this.orderId).pipe(
      switchMap(order => {
        this.order = order;
        return this.shippingService.getShipping(order.shippingId);
      })
    ).subscribe(shipping => this.shipping = shipping);
  }
}
```
```typescript
// After: a service owns orchestration, exposing signals
@Injectable({ providedIn: 'root' })
export class OrderDetailStore {
  #order = signal<Order | undefined>(undefined);
  #shipping = signal<ShippingInfo | undefined>(undefined);
  order = this.#order.asReadonly();
  shipping = this.#shipping.asReadonly();

  loadOrder(orderId: string) {
    return this.orderService.getOrder(orderId).pipe(
      tap(order => this.#order.set(order)),
      switchMap(order => this.shippingService.getShipping(order.shippingId)),
      tap(shipping => this.#shipping.set(shipping))
    ).subscribe();
  }
}

export class OrderDetailComponent implements OnInit {
  private store = inject(OrderDetailStore);
  order = this.store.order;
  shipping = this.store.shipping;
  ngOnInit() { this.store.loadOrder(this.orderId); }
}
```

**Why this fixes the test problems directly:** `OrderDetailStore` can now be tested in complete isolation with `TestBed`-free unit tests (or minimal `TestBed` for `inject()`), mocking only `orderService`/`shippingService`, asserting the sequencing and resulting signal state directly — no component fixture, no `detectChanges()`, no `fakeAsync` needed for orchestration logic since it's tested as plain RxJS/service code, not through Angular's change-detection cycle. The component's own tests shrink to verifying it renders `store.order()`/`store.shipping()` correctly and calls `store.loadOrder()` on init — a shallow, fast, stable test that stubs `OrderDetailStore` entirely and never touches real async timing at all.

**Common pitfall in the refactor:** stopping halfway — extracting the service but still having the component read raw Observables and subscribe to them itself (rather than exposing signals/simple synchronous state), which keeps async-timing concerns leaking back into component tests. The goal is for component tests to need zero knowledge of *how* the data arrives, only what the component does with whatever state it currently has.

**Practical guidance:** this pattern (thin components, orchestration in injectable "store" or "facade" services) also pays off outside testing — it makes orchestration logic reusable across multiple components, keeps components focused on presentation, and is a natural fit for signal-based state management without needing a heavier third-party state library for moderate-complexity apps.

---

## Beginner — Question 11

**Q11: What is Angular?**

Angular is a popular, open-source web application framework developed by Google. It is a complete, opinionated framework for building single-page client applications (SPAs) using HTML and TypeScript. It provides a robust architecture based on components, dependency injection, and declarative templates.

---

## Beginner — Question 12

**Q12: What is a Component in Angular?**

A Component is the fundamental building block of an Angular application. 

It consists of three parts:
1. A TypeScript class that contains the application data and logic.
2. An HTML template that defines the UI.
3. CSS styles specific to that component.
Components are organized into a tree structure to form the complete user interface.

---

## Beginner — Question 13

**Q13: What is Data Binding in Angular?**

Data Binding is the automatic synchronization of data between the component's TypeScript class (the model) and its HTML template (the view). 
- **Interpolation (`{{ value }}`)**: From class to template.
- **Property Binding (`[property]="value"`)**: From class to template.
- **Event Binding (`(event)="handler()"`)**: From template to class.
- **Two-Way Binding (`[(ngModel)]="value"`)**: Synchronizes both ways simultaneously.

---

## Beginner — Question 14

**Q14: What is a Directive?**

A Directive is a class in Angular that can modify the structure or behavior of the DOM. 
- **Structural Directives** (like `*ngIf` or `*ngFor`) change the layout of the DOM by adding or removing elements.
- **Attribute Directives** (like `ngClass` or `ngStyle`) change the appearance or behavior of an existing element.
*(Note: Technically, a Component is just a Directive with a template).*

---

## Beginner — Question 15

**Q15: What is a Service in Angular?**

A Service is a broad category encompassing any value, function, or feature that an application needs. A service is typically a class with a narrow, well-defined purpose (e.g., fetching data from an API, logging, or validating input). 

Instead of writing this logic directly inside a Component, you write it in a Service and use Angular's Dependency Injection system to provide it to any Component that needs it, keeping components lean and focused purely on the UI.

---

## Scenario — Question 8

**Q8: A `NotificationService` opens toast notifications dynamically using `ViewContainerRef.createComponent()` (Intermediate Q12), one per event from a WebSocket feed. QA reports that after leaving a busy page running for an hour, the tab's memory keeps climbing, and DevTools shows a steadily growing number of detached `ToastComponent` instances — even though each toast visually disappears from the screen after a few seconds. Diagnose and fix.**

**Root diagnosis:** unlike the RxJS subscription leak in Scenario Q2, this leak is a dynamically created component (Intermediate Q12) that was never explicitly torn down. Components created via `createComponent()` have no structural directive (`*ngIf`) automatically managing their lifecycle the way declaratively-templated components do — nothing destroys them unless something calls `ComponentRef.destroy()` explicitly. "Disappearing from the screen after a few seconds" almost certainly means the toast was hidden via CSS (a fade-out animation class, or removal from a visible list) rather than actually destroyed — the DOM node, the Angular component instance behind it, its own change detector, and anything it itself set up (an internal auto-dismiss timer, say) are all still fully alive in memory, just invisible.

**Confirming it:** inspect `NotificationService`'s toast-creation code — if it calls `viewContainerRef.createComponent(ToastComponent)` and either discards the returned `ComponentRef` entirely, or only ever toggles a CSS class on it for the fade-out animation without ever calling `ref.destroy()`, every toast ever shown remains a live `ComponentRef` for the rest of the session.

**The fix:**
```typescript
@Injectable({ providedIn: 'root' })
export class NotificationService {
  show(message: string, viewContainerRef: ViewContainerRef) {
    const ref = viewContainerRef.createComponent(ToastComponent);
    ref.instance.message = message;

    setTimeout(() => {
      ref.instance.fadeOut(); // triggers the CSS animation
      setTimeout(() => ref.destroy(), 300); // destroy only once the animation actually finishes
    }, 3000);
  }
}
```
`ref.destroy()` runs `ngOnDestroy` on the toast, removes its DOM node, and releases the `ComponentRef` and its injector — closing exactly the gap that a structural-directive-managed component gets automatically (via `*ngIf`/`@if` tearing down its embedded view) but a dynamically created one does not.

**Confirming the fix:** the same heap-snapshot methodology as Scenario Q2 — before/after several dozen toast events, take heap snapshots and confirm the `ToastComponent`/`ComponentRef` count returns to (near) zero after each toast's animation completes, rather than accumulating indefinitely.

**Root lesson:** `*ngIf`/`@if`-managed components get automatic teardown "for free" the moment their condition goes false; any component created imperatively via `ViewContainerRef.createComponent()` opts out of that automatic lifecycle entirely and makes the calling code fully responsible for `destroy()` — a responsibility that's easy to forget specifically because the visual symptom ("the toast is gone") looks identical whether the component was actually destroyed or merely hidden.

---

## Scenario — Question 9

**Q9: A data table renders 500 rows, each with several columns computed by calling component methods directly in the template — `{{ formatCurrency(row.amount) }}`, `{{ getStatusLabel(row.status) }}`, `{{ calculateDiscount(row) }}`. The table is already `OnPush` and the underlying data array is treated immutably, yet scrolling and any unrelated interaction on the page still visibly stutters. Diagnose why `OnPush` didn't fix this, and fix it properly.**

**Root diagnosis:** `OnPush` (Advanced Q1) controls *whether* a component gets re-checked at all — it does nothing about *how expensive* that check is once it does run. Every method call in a template is re-invoked on **every change-detection check of that component**, for **every row**, because a function call is opaque to Angular — unlike a plain property read, Angular has no way to know a method's result hasn't changed, so it's always re-executed and re-compared. With 500 rows × 3 method calls, that's 1,500 invocations on every check — and since `OnPush` only prevents *unrelated* changes elsewhere in the app from triggering a check of this component, any event that legitimately *does* trigger a check of the table itself (virtual-scroll recycling, a row's own click handler, an `async`-piped emission) still re-runs all 1,500 calls, which is exactly the visible stutter.

**The fix — replace template method calls with pure pipes:**
```typescript
@Pipe({ name: 'currencyFormat', standalone: true, pure: true })
export class CurrencyFormatPipe implements PipeTransform {
  transform(amount: number): string { return /* formatting logic */; }
}
```
```html
<!-- Before: re-invoked on every CD check, for every row -->
<td>{{ formatCurrency(row.amount) }}</td>

<!-- After: a pure pipe only re-runs when `row.amount` itself changes -->
<td>{{ row.amount | currencyFormat }}</td>
```
Per Intermediate Q8's pure-pipe mechanism, Angular memoizes a pure pipe's result and only re-invokes `transform()` when its input actually changes — across a check where nothing about a given row changed, all three of that row's formatted values are served from the memoized result instead of recomputed, collapsing 1,500 calls per check down to effectively zero when the underlying data hasn't moved.

**Alternative fix — precompute once when the data arrives, not on every render:** for values genuinely derived from a whole row, compute them once when data is loaded rather than in the template at all:
```typescript
rows = computed(() =>
  this.rawRows().map(r => ({ ...r, discountLabel: calculateDiscount(r) }))
);
```
This moves the cost from "every change-detection check" to "only when the source data actually changes" — strictly cheaper than even a pure pipe, since it computes once at the data layer rather than once per pipe invocation per render.

**Common pitfall:** assuming `OnPush` alone is a complete performance fix and never auditing templates for method calls — one of the most common gaps in an otherwise well-optimized `OnPush` component, precisely because `OnPush` fixes the *frequency* of checks (Scenario Q1) while doing nothing about the *cost* of each individual check; the two problems produce an identical-looking symptom with entirely different root causes.

**Root lesson:** `OnPush` and "avoid function calls in templates" are independent, complementary optimizations — one bounds how often a component is checked, the other bounds how expensive each check is — and a genuinely fast large list needs both, not just whichever one happens to be top of mind.

---

## Scenario — Question 10

**Q10: A signup form's username field uses an async validator (Intermediate Q20) that calls an API to check availability. QA reports that if a user types "al", pauses briefly, then quickly types "ice" to make "alice", the field sometimes incorrectly shows "username taken" — even though "alice" is actually available and "al" was, correctly, taken. Diagnose the race condition and fix it.**

**Root diagnosis:** this is an out-of-order-response race. Typing "al" triggers an async validation call for "al"; if that call happens to be slow (backend load, a different code path), and the user finishes typing "alice" before it resolves, a second validation call fires for "alice" and returns quickly. If the validator's implementation doesn't properly cancel the in-flight "al" request when a new value arrives — because it wasn't built on `switchMap`-style cancellation internally — the slow "al" response (correctly "taken") can arrive *after* the fast "alice" response and overwrite the control's validity state, incorrectly marking "alice" as taken.

**Confirming it:** reproduce with an artificial delay on the validation endpoint keyed to specific test values (delay "al"'s response by 2s, "alice"'s by 200ms) and watch the Network tab — both requests are visibly in flight simultaneously, and the control's `errors` ends up reflecting whichever response's callback happened to execute last, not necessarily the one matching the control's *current* value.

**The fix — build the async validator on `switchMap` over the triggering pipeline itself, not as an isolated one-shot call per invocation:**
```typescript
export function uniqueUsernameValidator(userService: UserService): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    if (!control.value) return of(null);
    return timer(300).pipe(                                  // debounce inside the same cancellable pipeline
      switchMap(() => userService.checkUsernameAvailable(control.value)),
      map(isAvailable => (isAvailable ? null : { usernameTaken: true })),
      catchError(() => of(null)),                             // fail open on a network error, don't block signup
    );
  };
}
```
Angular re-invokes an `AsyncValidatorFn` on every qualifying value change; wrapping the debounce (`timer(300)`) *inside* the same `switchMap`-based pipe as the actual availability check, rather than as a separate mechanism outside the validator, means each new invocation's own internal timer/request chain is what gets cancelled when Angular calls the validator again for a newer value — rather than two independent, uncoordinated network calls racing each other to completion.

Pair this with `updateOn: 'blur'` (Intermediate Q20) as a first line of defense — reducing how often the async validator is invoked at all reduces the *frequency* of the race, even though the `switchMap`-based fix is what actually eliminates it structurally rather than just making it rarer.

**Root lesson:** an async validator that "looks correct" in a slow, one-keystroke-at-a-time manual test can hide a race condition that only surfaces under realistic fast typing with variable backend latency — and because RxJS's `switchMap` cancellation is precisely the tool built for exactly this class of bug (echoing Intermediate Q2's typeahead-search example), the fix is almost always to verify the validator's async chain is genuinely cancellable end to end, not just superficially wrapped in an Observable.

---

## Scenario — Question 11

**Q11: You've inherited a large (200+ component) Angular application built entirely on NgModules, and leadership wants it migrated to standalone components. A big-bang rewrite isn't realistic — the app has to keep shipping features throughout. Design the migration approach.**

**Framing:** this is an incremental-migration problem, not a rewrite problem — Angular explicitly supports NgModules and standalone components coexisting and interoperating during a transition (Beginner Q4), which is what makes an incremental path viable at all rather than forcing a risky big-bang switch.

**The migration approach:**

1. **Run the official `ng generate @angular/core:standalone` schematic first**, which automates the bulk of the mechanical conversion (adding `standalone: true` with an explicit `imports` array, removing entries from `NgModule.declarations`) far more reliably across 200+ components than a manual pass — tracing each component's actual template dependencies into an explicit `imports` array is exactly the tedious, error-prone part automation should own.
2. **Migrate leaf/feature modules before the app's root and shared modules.** A self-contained feature module with few or no dependents (a "reports" feature, say) can be converted end to end without touching anything else, since NgModule-declared components can still import and use standalone components, and vice versa, throughout the transition. Save `AppModule`, `SharedModule`, and `CoreModule` — the most widely depended-upon modules — for later, once enough leaf modules are converted that removing the shared module becomes a smaller, better-understood change.
3. **Convert bootstrapping only once a meaningful share of the tree is standalone.** Switching `platformBrowserDynamic().bootstrapModule(AppModule)` to `bootstrapApplication(AppComponent, { providers: [...] })`, and routing from `RouterModule.forRoot(routes)` to `provideRouter(routes)`, is a single, all-at-once cutover point — you can't half-bootstrap — so sequence it deliberately once its prerequisites (every provider previously registered via `NgModule.providers` identified and relocated) are actually ready, rather than attempting it as the very first step.
4. **Expect — and rely on — both patterns running side by side for an extended period.** A standalone component can `imports` an NgModule it still needs directives/pipes from, and an NgModule can `imports` a standalone component directly, since standalone components/directives/pipes are importable the same way another module would be. This bidirectional interop is precisely what makes a gradual, feature-by-feature migration structurally sound rather than requiring careful big-bang sequencing.
5. **Update each component's tests alongside its own conversion.** `TestBed.configureTestingModule({ imports: [MyStandaloneComponent] })` replaces `declarations: [MyComponent]` (Beginner Q7) for a newly-converted component's spec file — a small, mechanical, low-risk change to land in the same commit as the component's own conversion.
6. **Set a policy for new code immediately:** every component written from this point forward is standalone, regardless of which module its neighbors still live in — a zero-cost decision on day one that stops the backlog from continuing to grow while the existing one is worked down.

**Common pitfall:** migrating `SharedModule`/`CoreModule` early because they feel foundational — in practice this is backwards, since widely-depended-upon modules have the largest blast radius if the conversion introduces a subtle regression (a missed import, a shifted provider scope), and converting leaf modules first builds team familiarity and tooling confidence on lower-stakes code before the highest-fanout modules are touched.

**Root lesson:** the schematic-assisted, leaf-to-root, side-by-side migration path exists specifically because Angular's standalone/NgModule interop was designed for exactly this scenario — a 200+ component app doesn't need, and shouldn't attempt, a stop-the-world rewrite; it needs a sequenced, incremental conversion with the riskiest, most-depended-upon pieces deliberately saved for when the team has the most practice and the least remaining surface area to get wrong.

---

## Scenario — Question 12

**Q12: Two sibling `OnPush` components — a `CartSummaryComponent` and a `CartIconComponent` in the header — both receive the same `CartService`-provided `cart` object as an `@Input()` from their shared parent. When a user adds an item, `CartSummaryComponent` updates immediately, but `CartIconComponent`'s badge count only updates the *next* time the user clicks something else. Diagnose why the two `OnPush` siblings behave differently for what should be the same update, and fix it.**

**Root diagnosis:** this is a variant of Scenario Q4's "OnPush + mutation" cause, but the genuinely confusing part is *why one sibling updates immediately and the other doesn't*. The likely explanation: the "add to cart" action happens *inside* `CartSummaryComponent`'s own template (its own click handler) — under `OnPush`, an event originating from within a component's own template is one of the triggers that forces a check of that component (Advanced Q1's rule), so `CartSummaryComponent` gets checked and re-renders regardless of whether the `cart` reference actually changed, simply because the click happened inside it. `CartIconComponent`, meanwhile, has no event of its own firing — it's a passive `@Input()` recipient sitting in the header — so it's only checked when its own `@Input()` reference changes, an event happens inside *it*, or an `async`-piped source it depends on emits. If `CartService.addItem()` mutates the existing cart in place (`this.cart.items.push(newItem)`) rather than replacing it with a new reference, `CartIconComponent`'s `@Input()` reference never changes, so nothing tells Angular to check it — until an unrelated click elsewhere happens to trigger a check that reaches it anyway, which is why it "eventually" catches up rather than never updating at all.

**Confirming it:** inspect `CartService.addItem()` for in-place mutation versus reference replacement; add a temporary log in `CartIconComponent`'s `ngOnChanges` (or an `effect()`) to confirm it doesn't fire on the add-to-cart action itself, only on the later unrelated click.

**The fix — treat the shared cart state immutably at the source, and have both siblings read it directly rather than through a parent-owned `@Input()`:**
```typescript
@Injectable({ providedIn: 'root' })
export class CartService {
  private cartSignal = signal<Cart>({ items: [] });
  readonly cart = this.cartSignal.asReadonly();

  addItem(item: CartItem) {
    this.cartSignal.update(current => ({
      ...current,
      items: [...current.items, item], // new array AND new cart object reference
    }));
  }
}
```
With the cart exposed as a signal read directly by each sibling, both components depend on the same reactive source and are each notified precisely when it actually changes — removing the dependency on "did some unrelated click happen to also trigger a check of this specific component," which is what made the bug look inconsistent between siblings in the first place.

**Common pitfall:** "fixing" this by simply removing `OnPush` from `CartIconComponent` — the badge does update reliably then, since Default strategy checks it on any event regardless of reference changes, but this reintroduces the exact blanket-checking cost `OnPush` exists to avoid, on a component (a header badge) that's present and checked on every single page — a particularly poor place to give up that optimization.

**Root lesson:** two sibling `OnPush` components receiving the "same" shared state can behave inconsistently not because one is buggy and the other isn't, but because their own local trigger conditions differ — the durable fix is making the shared state's own change notification (a signal, an Observable) the thing each component depends on directly, rather than relying on `@Input()` propagation through a parent and hoping enough incidental events keep every consumer in sync.

---

## Scenario — Question 13

**Q13: Two services, `AuthService` and `UserPreferencesService`, each inject the other in their constructors — `AuthService` needs preferences to decide default post-login routing, and `UserPreferencesService` needs `AuthService` to know the current user ID for loading preferences. The app throws `NG0200: Circular dependency in DI detected` at startup. Diagnose why this happens and fix it.**

**Root diagnosis:** Angular's injector resolves a dependency by fully constructing it — including resolving *its own* constructor dependencies — before handing it back to whatever asked for it. If `AuthService`'s constructor asks for `UserPreferencesService`, and constructing that requires resolving `AuthService` (which isn't finished constructing yet, since we're still in the middle of building it to satisfy `UserPreferencesService`'s dependency), the injector detects it's been asked to construct something it's already in the process of constructing, and throws rather than looping forever.

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private prefs: UserPreferencesService) {} // triggers construction of UserPreferencesService
}

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  constructor(private auth: AuthService) {} // ...which needs AuthService, still mid-construction — NG0200
}
```

**Fix 1 — remove the unnecessary direction of the dependency.** Often, on inspection, one direction isn't a true construction-time dependency at all — `AuthService` doesn't need `UserPreferencesService` *injected*, it needs to trigger loading preferences *after* login succeeds, which a higher-level orchestrator (a component, or a third service) can do by calling `userPreferencesService.loadDefaults(userId)` once login completes, rather than `AuthService` owning that call internally.

**Fix 2 — use `Injector.get()` for a lazy, deferred lookup**, when the two services genuinely need to reference each other but not *during construction*:
```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private injector = inject(Injector);
  private get prefs(): UserPreferencesService {
    return this.injector.get(UserPreferencesService); // resolved on first actual use, not at AuthService's own construction
  }
}
```
This breaks the cycle because `UserPreferencesService` is no longer constructed as a side effect of constructing `AuthService` — it's resolved the first time `this.prefs` is actually accessed, by which point both services' constructors have long since finished.

**Fix 3 — extract the genuinely shared state into a third service both depend on**, usually the more architecturally honest fix: introduce a `CurrentUserService` holding just the user ID/session state both services need, with neither `AuthService` nor `UserPreferencesService` depending on the other at all:
```typescript
@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  userId = signal<string | null>(null);
}
// AuthService sets CurrentUserService.userId on login; UserPreferencesService reads it — no cycle.
```

**Common pitfall:** reaching for `Injector.get()`/lazy resolution (Fix 2) by default because it's the least invasive change, when the underlying design genuinely has two services each needing logic that depends on the other's current state — that's usually a sign the shared state belongs in a third service (Fix 3), not a signal to paper over a real circular *design* with a deferred lookup.

**Root lesson:** `NG0200` surfaces a design smell, not just a mechanical injector limitation to route around — two services needing each other at construction time almost always means they're modeling an implicit shared concept (here, "the current user and their session") that hasn't been extracted into its own service yet, and the most durable fix addresses that directly rather than choosing whichever workaround makes the error message go away fastest.

---

## Beginner — Question 16

**Q16: How would you build your own custom structural directive — say, an `*appUnless` that's the inverse of `*ngIf`?**

A custom structural directive is a class decorated with `@Directive`, applied with the `*` shorthand exactly like the built-in `*ngIf`/`*ngFor` (Beginner Q3), that decides whether (and how) to render the template it's attached to by working directly with `TemplateRef` and `ViewContainerRef`.

```typescript
@Directive({
  selector: '[appUnless]',
  standalone: true,
})
export class UnlessDirective {
  private hasView = false;
  private templateRef = inject(TemplateRef<unknown>);
  private viewContainerRef = inject(ViewContainerRef);

  @Input() set appUnless(condition: boolean) {
    if (!condition && !this.hasView) {
      this.viewContainerRef.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (condition && this.hasView) {
      this.viewContainerRef.clear();
      this.hasView = false;
    }
  }
}
```
```html
<div *appUnless="isLoading">Content shown when NOT loading</div>
```

**Mechanism:** this is the exact desugaring Beginner Q3 described for `*ngIf` — `*appUnless="cond"` becomes `<ng-template [appUnless]="cond">...</ng-template>` under the hood, so Angular compiles the element's content into a `TemplateRef` and passes `cond` into an `@Input()` whose name matches the directive's selector (`appUnless`), which is exactly what the `*` shorthand relies on to bind a single value directly. Inside the setter, `viewContainerRef.createEmbeddedView(templateRef)` instantiates the template's content into the DOM at the directive's location, and `viewContainerRef.clear()` destroys it — running `ngOnDestroy` on anything inside, precisely mirroring what `*ngIf` does internally when its condition flips.

**Common pitfall:** forgetting to track `hasView` and calling `createEmbeddedView` unconditionally on every change, which stacks duplicate views on repeated toggles instead of showing/hiding one. Also, `clear()` genuinely destroys the content's state, so any local component state inside the toggled-off block is lost on re-show — the same trade-off `*ngIf` already has versus CSS-based hiding.

**Practical guidance:** reach for a custom structural directive when you need reusable show/hide-with-teardown logic beyond what the built-in `@if`/`@for`/`@switch` express directly — e.g., a `*appHasPermission="role"` directive centralizing an authorization check across the app. For anything the built-ins already express, prefer them — they're better optimized by the compiler and need no extra code to maintain.

---

## Beginner — Question 17

**Q17: At a basic level, what is a Signal, and how is reading `count()` different from just having a plain class property `count`?**

A **Signal** (`signal(initialValue)`) is a wrapper around a value that Angular can watch — you read its current value by calling it as a function (`count()`), and you change it with `.set(newValue)` or `.update(fn)` rather than plain assignment.

```typescript
@Component({
  selector: 'app-counter',
  standalone: true,
  template: `<button (click)="increment()">Count: {{ count() }}</button>`,
})
export class CounterComponent {
  count = signal(0);
  increment() {
    this.count.update(n => n + 1);
  }
}
```

**Why this looks like it "does the same thing" as a plain property at first:** a plain `count = 0` property, incremented with `this.count++`, also updates correctly in the template under Angular's normal (Zone.js-based) change detection — the click still triggers a full change-detection pass that re-checks the binding and picks up the new value. This is the source of a common beginner question: if both "work," what's the actual difference?

**The real difference is *how* Angular finds out something changed**, not whether the update itself works. A plain property relies entirely on Angular's blanket "something happened, re-check everything relevant" behavior. A signal *actively declares* exactly which template bindings (or `computed()`s) read it, so when it changes, Angular can, in principle, update precisely those bindings rather than relying on a broad re-check triggered by an unrelated event elsewhere. That precision is what unlocks real benefits once combined with `OnPush`/zoneless change detection, covered in the Advanced tier — for now, the practical takeaway is simpler: a signal is a container Angular is explicitly watching, not just a plain variable it happens to re-read whenever something else prompts it to look.

**Common pitfall:** forgetting the parentheses in the template — `{{ count }}` prints the signal function itself (its reference, effectively unhelpful text), not its value; you must call it, `{{ count() }}`, every time you read it.

**Practical guidance:** for new component state, prefer `signal()`/`.set()`/`.update()` over plain class properties as the modern default — the payoff compounds once you start deriving values with `computed()` or reacting to changes with `effect()`, both of which only work cleanly against signals, not plain properties.

---

---