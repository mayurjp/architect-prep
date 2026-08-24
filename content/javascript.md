# JavaScript — Q&A

## Beginner — Question 1

**Q1: What is the difference between `var`, `let`, and `const`, and how does scoping differ between them?**

`var`, `let`, and `const` all declare bindings, but they differ in **scope**, **hoisting behavior**, and **mutability**.

**Scope:**
- `var` is **function-scoped** (or globally scoped if declared outside any function). It ignores block boundaries (`if`, `for`, `{}`) entirely.
- `let` and `const` are **block-scoped** — confined to the nearest enclosing `{}`.

```javascript
function demo() {
  if (true) {
    var a = 1;
    let b = 2;
  }
  console.log(a); // 1 — leaked out of the if-block
  console.log(b); // ReferenceError: b is not defined
}
```

**Hoisting:**
All three are hoisted to the top of their scope during compilation, but `var` is initialized to `undefined` immediately, while `let`/`const` remain in the **Temporal Dead Zone (TDZ)** — accessible in memory but throwing a `ReferenceError` if read before the actual declaration line executes.

```javascript
console.log(x); // undefined (var hoisted + initialized)
var x = 5;

console.log(y); // ReferenceError: Cannot access 'y' before initialization
let y = 5;
```

**Mutability:**
`const` prevents **reassignment** of the binding, not mutation of the value. A `const` object's properties can still be changed.

```javascript
const obj = { count: 1 };
obj.count = 2;      // fine — mutating the object
obj = {};            // TypeError — reassigning the binding
```

**Common pitfall:** `var` in loops creates a single shared binding across all iterations, which breaks closures that capture the loop variable (covered in detail in the Scenario tier). This is one of the strongest practical reasons `let`/`const` replaced `var` in modern code.

**Practical guidance:** Default to `const`; use `let` only when a variable must be reassigned; avoid `var` in new code — it exists today mainly for legacy compatibility.

---

## Beginner — Question 2

**Q2: What is the difference between primitive types and reference types in JavaScript?**

JavaScript has two fundamental categories of values, and the difference drives how assignment, comparison, and function arguments behave.

**Primitive types:** `string`, `number`, `boolean`, `undefined`, `null`, `symbol`, `bigint`. They are **immutable** and compared **by value**.

```javascript
let a = 10;
let b = a;   // b gets a copy of the value
b = 20;
console.log(a); // 10 — a is untouched
```

**Reference types:** `object`, `array`, `function` (arrays and functions are specialized objects). They are stored on the heap, and variables hold a **reference (pointer)** to that memory location. Assignment copies the reference, not the underlying data.

```javascript
let obj1 = { count: 10 };
let obj2 = obj1;      // obj2 points to the SAME object
obj2.count = 20;
console.log(obj1.count); // 20 — both variables reference the same object
```

**Equality follows the same rule:** two objects with identical contents are never `===` unless they're the same reference.

```javascript
console.log({ a: 1 } === { a: 1 }); // false — different objects in memory
console.log(5 === 5);               // true — primitives compare by value
```

**Function arguments:** JavaScript is always "pass by value" — but for objects, the value being passed is the reference itself, so mutating the object's properties inside a function is visible to the caller, while reassigning the parameter is not.

```javascript
function mutate(o) { o.x = 99; }      // visible to caller
function reassign(o) { o = { x: 1 }; } // NOT visible — only the local reference changes
```

**Common pitfall:** assuming `const` or a naive spread makes a deep copy — `{ ...obj }` and `[...arr]` only copy one level deep; nested objects/arrays are still shared references. Use `structuredClone(obj)` (or a deep-clone utility) for true deep copies.

---

## Beginner — Question 3

**Q3: Explain type coercion in JavaScript and the difference between `==` and `===`.**

JavaScript is **dynamically and loosely typed**, and it will automatically convert (coerce) values between types when an operator expects a different type than it received. This happens implicitly with `==`, arithmetic operators, and template literals.

**`===` (strict equality):** compares both **value and type** with no coercion. If the types differ, it's immediately `false`.

**`==` (loose equality):** coerces one or both operands to a common type before comparing, following the rules of the "Abstract Equality Comparison" algorithm.

```javascript
console.log(1 == '1');    // true  — string coerced to number
console.log(1 === '1');   // false — different types, no coercion
console.log(0 == false);  // true  — boolean coerced to number
console.log(null == undefined); // true  — special-cased equal to each other
console.log(null === undefined); // false
console.log('' == 0);     // true  — empty string coerces to 0
console.log(NaN == NaN);  // false — NaN is never equal to anything, including itself
```

**Coercion also happens with arithmetic and concatenation:**

```javascript
console.log('5' + 3);   // '53'  — '+' with a string operand triggers string concatenation
console.log('5' - 3);   // 2     — '-' has no string meaning, so both sides coerce to number
console.log('5' * '2'); // 10    — both coerce to number
```

**Common pitfall:** `==`'s coercion rules are famously inconsistent (`[] == false` is `true`, `[] == ![]` is also `true`) and are a frequent source of subtle bugs, especially around `0`, `''`, `null`, and `undefined` all being "falsy" but not equal to each other under `===`.

**Practical guidance:** Use `===`/`!==` by default in all new code — it's predictable and eliminates an entire class of bugs. The only broadly accepted exception is `== null`, which conveniently matches both `null` and `undefined` in one check (`if (value == null)`).

---

## Beginner — Question 4

**Q4: What are truthy and falsy values in JavaScript?**

Every value in JavaScript is implicitly convertible to a boolean when used in a boolean context (an `if` condition, `&&`/`||`, a ternary, `!value`). Values that convert to `false` are called **falsy**; everything else is **truthy**.

**The complete list of falsy values** — there are exactly eight:

```javascript
false
0
-0
0n        // BigInt zero
''        // empty string
null
undefined
NaN
```

Everything else is truthy, including values that feel like they "should" be falsy:

```javascript
if ('0')      // truthy — non-empty string
if ('false')  // truthy — non-empty string
if ([])       // truthy — an empty array is still an object
if ({})       // truthy — an empty object is still an object
```

**Practical use in short-circuit patterns:**

```javascript
const name = userInput || 'Guest';    // fallback if userInput is falsy
const isLoggedIn = user && user.isActive; // returns user.isActive, or the falsy short-circuit value
```

**Common pitfall:** using `||` for a default when `0` or `''` are legitimate valid values.

```javascript
function setVolume(level) {
  const v = level || 10; // BUG: setVolume(0) silently becomes 10
}
```

The fix is the **nullish coalescing operator** `??`, which only falls back on `null`/`undefined`, not on other falsy values:

```javascript
function setVolume(level) {
  const v = level ?? 10; // setVolume(0) correctly stays 0
}
```

**Practical guidance:** reach for `??` over `||` whenever `0`, `''`, or `false` could be a legitimately intended value — this is one of the most common real-world bugs in JS codebases.

---

## Beginner — Question 5

**Q5: Explain how functions are "first-class citizens" in JavaScript, and the difference between arrow functions and regular functions.**

**First-class functions** means functions are treated like any other value: they can be assigned to variables, passed as arguments, returned from other functions, and stored in data structures. This is what enables callbacks, higher-order functions (`map`, `filter`), and functional composition.

```javascript
const greet = function (name) { return `Hi ${name}`; }; // assigned to a variable
function withLogging(fn) {                               // passed as an argument
  return (...args) => { console.log('calling'); return fn(...args); }; // returned from a function
}
```

**Arrow functions (`=>`)** are a concise syntax with several concrete behavioral differences from regular `function` declarations/expressions — they are not purely syntax sugar:

1. **No own `this`.** An arrow function captures `this` **lexically** from its enclosing scope at definition time; a regular function's `this` is determined by *how it's called* (the call site).
2. **No `arguments` object.** Arrow functions don't have their own `arguments`; they see the enclosing scope's, if any.
3. **Cannot be used as constructors** — calling one with `new` throws a `TypeError`.
4. **No `prototype` property.**

```javascript
const obj = {
  name: 'Widget',
  regularMethod: function () {
    console.log(this.name); // 'Widget' — this is the object obj (call-site binding)
  },
  arrowMethod: () => {
    console.log(this.name); // undefined — this is inherited from the outer (module/global) scope
  },
};
obj.regularMethod(); // 'Widget'
obj.arrowMethod();   // undefined
```

**A very common real-world pattern:** arrow functions are preferred for callbacks specifically *because* they inherit `this`, avoiding the classic `var self = this;` workaround needed with regular functions inside methods.

```javascript
class Timer {
  constructor() { this.seconds = 0; }
  start() {
    setInterval(() => { this.seconds++; }, 1000); // arrow: `this` stays bound to the Timer instance
  }
}
```

**Common pitfall:** defining object methods as arrow functions (as shown above) — since they don't bind `this` to the object, they silently break `this.property` access. Use regular function syntax (or shorthand method syntax) for object/class methods, and arrow functions for callbacks nested inside them.

---

## Beginner — Question 6

**Q6: What are template literals, and how do array/object destructuring work?**

**Template literals** (backtick strings `` ` `` ) support embedded expressions via `${...}` and multi-line strings without escape characters, replacing most string-concatenation code.

```javascript
const name = 'Ada';
const age = 30;
const msg = `${name} is ${age} years old and turns ${age + 1} next year.`;
const multiline = `Line one
Line two`; // real newline preserved, no \n needed
```

They also support **tagged templates** — a function placed before the literal receives the string parts and interpolated values separately, useful for sanitization or i18n:

```javascript
function highlight(strings, ...values) {
  return strings.reduce((acc, str, i) => `${acc}${str}${values[i] ? `**${values[i]}**` : ''}`, '');
}
highlight`Score: ${95}`; // "Score: **95**"
```

**Destructuring** extracts values from arrays/objects into individual variables in one expression.

```javascript
// Array destructuring — position-based
const [first, second, , fourth] = [1, 2, 3, 4]; // skips index 2
const [a = 10, b = 20] = [undefined, 5];         // a=10 (default used), b=5

// Object destructuring — key-based, order doesn't matter
const { name: userName, age: userAge = 18 } = { name: 'Ada' }; // rename + default
const { address: { city } = {} } = user; // nested destructuring, guarded against a missing address

// Common in function parameters:
function printUser({ name, age }) { console.log(name, age); }

// Swapping variables without a temp variable:
let x = 1, y = 2;
[x, y] = [y, x];
```

**Common pitfall:** destructuring a property from `null`/`undefined` throws immediately (`const { a } = null;` → `TypeError`), so nested destructuring of possibly-missing data needs a default (`= {}`) at each level or optional chaining beforehand.

**Practical guidance:** destructuring in function signatures is the idiomatic way to accept "options objects" in JS, roughly analogous to named/optional parameters in C#.

---

## Beginner — Question 7

**Q7: What do the spread (`...`) and rest (`...`) operators do? They use the same syntax — how do you tell them apart?**

Both use the `...` token, but the direction of data flow tells them apart: **spread expands** a collection into individual elements; **rest collects** individual elements into a collection. Which one you're looking at depends entirely on context.

**Spread — expanding:**

```javascript
// Arrays
const a = [1, 2, 3];
const b = [...a, 4, 5];        // [1, 2, 3, 4, 5] — a's elements copied out
const max = Math.max(...a);    // spreads array elements as individual arguments

// Objects
const base = { x: 1, y: 2 };
const extended = { ...base, z: 3 };      // shallow copy + merge
const overridden = { ...base, x: 99 };   // { x: 99, y: 2 } — later keys win

// Function calls
function sum3(x, y, z) { return x + y + z; }
sum3(...[1, 2, 3]); // 6
```

**Rest — collecting (always the last item in a destructuring pattern or parameter list):**

```javascript
function sum(...nums) {           // rest parameter: gathers all args into an array
  return nums.reduce((a, b) => a + b, 0);
}
sum(1, 2, 3, 4); // 10

const [first, ...rest] = [1, 2, 3, 4]; // first=1, rest=[2,3,4]
const { id, ...otherFields } = user;   // pull out id, keep everything else together
```

**Common pitfall:** both spread and the object rest pattern only perform a **shallow copy** — nested objects/arrays inside are still shared references, exactly as with destructuring (see Q2). A rest parameter must also be the last parameter in a function signature; `function f(...rest, last)` is a syntax error.

**Practical guidance:** spread is the idiomatic way to write immutable updates in JS (`{ ...state, updated: true }`), which is central to patterns like React state updates and Redux reducers, since it avoids mutating the original object.

---

## Intermediate — Question 1

**Q1: What is a closure? Give a practical use case and a common pitfall.**

A **closure** is formed when a function "remembers" the variables from its enclosing lexical scope even after that outer function has finished executing. In JavaScript, every function forms a closure over the scope in which it was defined — this isn't optional or something you opt into; it's a fundamental property of the language's lexical scoping.

```javascript
function makeCounter() {
  let count = 0; // this variable lives in makeCounter's scope
  return function () {
    count++;      // the inner function "closes over" count
    return count;
  };
}
const counter = makeCounter();
console.log(counter()); // 1
console.log(counter()); // 2 — count persisted between calls, private to this counter instance
```

**Mechanism:** normally a function's local variables are garbage-collected once it returns. But if an inner function referencing those variables escapes (is returned, stored, or passed elsewhere), the JS engine keeps the enclosing scope alive as long as the inner function itself is reachable.

**Practical use case:** encapsulation/data privacy (as above — `count` is inaccessible from outside except through the returned function), memoization caches, and the module pattern that predates ES modules.

**Common pitfall — closures inside loops with `var`:**

```javascript
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// prints: 3, 3, 3 — not 0, 1, 2
```

Because `var` is function-scoped, there is only **one** `i` binding shared across every iteration. By the time the `setTimeout` callbacks run (after the loop has fully finished), `i` is `3` for all of them. Switching to `let` fixes this because `let` creates a **new binding per iteration**, so each closure captures its own `i`. This exact scenario is explored in depth in the Scenario tier.

**Practical guidance:** closures are cheap and idiomatic in JS, but holding large objects in a long-lived closure (e.g., an event listener that never gets removed) is a classic memory-leak source — covered in the Advanced/Scenario tiers.

---

## Intermediate — Question 2

**Q2: How is `this` determined in JavaScript, and how do `call`, `apply`, and `bind` control it?**

Unlike languages with lexically-bound `this` on every method, JavaScript's `this` (outside arrow functions) is determined **dynamically by the call site** — *how* a function is invoked, not where it's defined. There are four binding rules, in order of precedence:

1. **`new` binding:** `new Foo()` — `this` is the newly created object.
2. **Explicit binding:** `fn.call(obj)`, `fn.apply(obj)`, `fn.bind(obj)` — `this` is whatever object you pass.
3. **Implicit binding:** `obj.method()` — `this` is `obj`, the object the method was called *through*.
4. **Default binding:** a plain function call `fn()` — `this` is `undefined` in strict mode (or the global object in sloppy mode).

```javascript
function show() { console.log(this.name); }
const a = { name: 'A', show };
const b = { name: 'B', show };

a.show();               // 'A' — implicit binding
b.show();                // 'B' — implicit binding

const detached = a.show;
detached();              // TypeError / undefined — default binding, `this` lost!
```

**`call` and `apply`** invoke the function immediately with an explicit `this`; they differ only in how they pass arguments:

```javascript
show.call(a);            // args passed individually: fn.call(thisArg, arg1, arg2)
show.apply(a, []);       // args passed as an array:  fn.apply(thisArg, [arg1, arg2])
```

**`bind`** doesn't call the function — it returns a **new function** permanently bound to the given `this`, regardless of how that new function is later invoked:

```javascript
const boundShow = show.bind(a);
setTimeout(boundShow, 0); // still logs 'A', even though setTimeout invokes it as a plain call
```

**Common pitfall:** passing a method as a callback (`element.addEventListener('click', obj.method)`) strips its implicit binding — inside the callback, `this` is no longer `obj`. Fix with `.bind(obj)`, an arrow-function wrapper, or defining the method as a class field arrow function.

#### Follow-up: Why don't arrow functions have their own `this`?

By design — arrow functions were introduced partly to solve the "lost `this`" problem for callbacks. They have no `this` binding of their own; a `this` reference inside an arrow function resolves lexically, walking up to the nearest enclosing non-arrow function's `this`, exactly like a normal variable lookup. This is why `call`/`apply`/`bind` cannot change an arrow function's `this`.

---

## Intermediate — Question 3

**Q3: Explain prototypal inheritance and the prototype chain. How does `class` syntax relate to it?**

JavaScript's inheritance model is fundamentally different from C#'s **classical** (class-based) inheritance. Instead of classes being blueprints that get instantiated, JavaScript objects can directly inherit from *other objects* through an internal link called `[[Prototype]]`, exposed via `Object.getPrototypeOf(obj)` or the legacy `__proto__`.

**The prototype chain:** when you access a property on an object and it isn't found directly on that object, the engine walks up the chain of `[[Prototype]]` links, checking each object in turn, until it either finds the property or reaches `null` (the end of the chain, `Object.prototype`'s own prototype).

```javascript
const animal = {
  eat() { console.log(`${this.name} is eating`); },
};
const dog = Object.create(animal); // dog's [[Prototype]] is animal
dog.name = 'Rex';
dog.eat(); // 'Rex is eating' — eat() found via the prototype chain, not on dog itself
```

**Functions and `prototype`:** every regular function has a `prototype` property (an ordinary object), and when you call it with `new`, the new object's `[[Prototype]]` is set to that function's `.prototype`. This is how "constructor functions" simulated classes before ES2015:

```javascript
function Animal(name) { this.name = name; }
Animal.prototype.eat = function () { console.log(`${this.name} is eating`); };
const dog = new Animal('Rex');
dog.eat(); // found on Animal.prototype via the chain
```

**`class` syntax is syntactic sugar over exactly this mechanism** — it does not introduce a different inheritance model:

```javascript
class Animal {
  constructor(name) { this.name = name; }
  eat() { console.log(`${this.name} is eating`); } // installed on Animal.prototype under the hood
}
class Dog extends Animal {
  bark() { console.log('Woof'); }
}
console.log(Object.getPrototypeOf(Dog.prototype) === Animal.prototype); // true
```

`extends` sets up the prototype chain between `Dog.prototype` and `Animal.prototype` automatically; `super(...)` in the constructor calls the parent constructor. `class` also adds real enforcement `function`-based prototypes never had — a class body runs in strict mode, and calling a class without `new` throws, whereas a constructor function silently runs with the wrong `this`.

**Common pitfall:** assuming `class` gives true classical inheritance (like C#) with private-by-default fields and compile-time type checking — it's still fundamentally dynamic, prototype-based delegation at runtime, just with much friendlier syntax.

---

## Intermediate — Question 4

**Q4: Explain the call stack, the event loop, and the difference between microtasks and macrotasks.**

JavaScript runs on a **single thread** with one **call stack**, but achieves non-blocking asynchronous behavior through the **event loop**, which coordinates the stack with two separate queues fed by the browser/Node runtime (not the JS engine itself).

**The pieces:**
- **Call stack:** tracks currently executing function calls, LIFO. Synchronous code runs here, top to bottom, one frame at a time.
- **Web APIs / Node APIs:** things like `setTimeout`, DOM events, and network I/O are handled outside the JS engine by the host environment; when they complete, they queue a callback rather than running immediately.
- **Macrotask queue (a.k.a. task queue):** holds callbacks from `setTimeout`/`setInterval`, I/O, UI rendering events, `postMessage`.
- **Microtask queue:** holds callbacks from resolved/rejected Promises (`.then`/`.catch`/`.finally`), `async`/`await` continuations, and `queueMicrotask`.

**The loop's algorithm, each cycle:**
1. Run everything currently on the call stack until it's empty (all synchronous code).
2. Drain the **entire** microtask queue — including any new microtasks that get added *while* draining it — before doing anything else.
3. Run **exactly one** macrotask from the macrotask queue.
4. (In browsers) possibly repaint.
5. Go back to step 2.

The critical rule: **microtasks always fully drain between every single macrotask**, and microtasks always run before the next macrotask even if that macrotask (e.g., a `setTimeout(fn, 0)`) was scheduled earlier.

```javascript
console.log('1');                                  // sync
setTimeout(() => console.log('2'), 0);              // macrotask
Promise.resolve().then(() => console.log('3'));     // microtask
console.log('4');                                   // sync
// Output: 1, 4, 3, 2
```

Even with a `0`ms delay, `setTimeout`'s callback runs *after* the Promise's microtask, because the call stack must empty and the microtask queue must fully drain first.

**Common pitfall:** assuming `setTimeout(fn, 0)` runs "immediately" — it's queued as a macrotask and always waits for the current synchronous code and all pending microtasks to finish first, and in browsers is also clamped to a minimum ~4ms after nesting.

---

## Intermediate — Question 5

**Q5: Explain Promises — states, chaining, and the differences between `Promise.all`, `Promise.race`, and `Promise.allSettled`. How does `async`/`await` relate to Promises?**

A **Promise** represents the eventual result of an asynchronous operation. It exists in exactly one of three states: **pending**, **fulfilled** (resolved with a value), or **rejected** (failed with a reason) — and once settled (fulfilled or rejected), it can never change state again.

```javascript
const promise = new Promise((resolve, reject) => {
  setTimeout(() => Math.random() > 0.5 ? resolve('ok') : reject('fail'), 100);
});
```

**Chaining:** `.then()` returns a **new** Promise, enabling sequential composition. Returning a value from `.then` fulfills the next Promise with it; returning a Promise flattens automatically; throwing (or returning a rejected Promise) propagates to the nearest `.catch`.

```javascript
fetchUser(id)
  .then(user => fetchOrders(user.id)) // returns a Promise — auto-flattened, not nested
  .then(orders => console.log(orders))
  .catch(err => console.error('failed at any step', err)); // catches errors from ANY prior step
```

**Combinators:**
- **`Promise.all(promises)`** — resolves with an array of all results once **every** promise fulfills; rejects immediately as soon as **any** one rejects ("fail fast"). Use for parallel operations that are all required.
- **`Promise.race(promises)`** — settles as soon as the **first** promise settles, whether fulfilled or rejected. Use for timeouts (`Promise.race([fetchData(), timeout(5000)])`).
- **`Promise.allSettled(promises)`** — waits for **all** promises to settle regardless of outcome, returning an array of `{status, value}` or `{status, reason}` objects. Use when you need every result even if some fail (e.g., batch operations where partial failure is acceptable).

**`async`/`await` is syntactic sugar over Promises** — `async function` always returns a Promise, and `await` pauses execution of that function (without blocking the thread) until the awaited Promise settles, then either returns its resolved value or throws its rejection reason, which `try`/`catch` can catch directly.

```javascript
async function loadDashboard() {
  try {
    const user = await fetchUser(id);       // desugars to fetchUser(id).then(user => ...)
    const orders = await fetchOrders(user.id);
    return orders;
  } catch (err) {
    console.error(err); // catches rejections from either await, just like .catch above
  }
}
```

**Common pitfall:** sequentially `await`-ing independent operations in a loop serializes work that could run in parallel — use `Promise.all(items.map(fetchItem))` instead of `for (const item of items) { await fetchItem(item); }` when the operations don't depend on each other.

---

## Intermediate — Question 6

**Q6: Explain `map`, `filter`, and `reduce`, and what "functional" patterns they encourage.**

These three array methods are the backbone of functional-style data transformation in JS: each takes a callback and returns a **new** value without mutating the original array.

```javascript
const orders = [
  { id: 1, total: 50, status: 'paid' },
  { id: 2, total: 120, status: 'pending' },
  { id: 3, total: 30, status: 'paid' },
];

const totals = orders.map(o => o.total);              // [50, 120, 30] — same length, transformed
const paid = orders.filter(o => o.status === 'paid');  // subset matching a predicate
const revenue = orders
  .filter(o => o.status === 'paid')
  .reduce((sum, o) => sum + o.total, 0);               // 80 — folds an array down to one value
```

**`map(fn)`** transforms each element 1-to-1, always returning an array of the same length.

**`filter(predicate)`** keeps only elements where the predicate returns truthy, returning a (possibly shorter) new array.

**`reduce(fn, initialValue)`** is the most general — it "folds" the array into a single accumulated value (a number, object, string, even another array), by calling `fn(accumulator, currentElement, index, array)` for each element. `map` and `filter` can both be implemented in terms of `reduce`, which is why it's considered the fundamental building block.

```javascript
const grouped = orders.reduce((acc, o) => {
  (acc[o.status] ??= []).push(o); // reduce can build arbitrarily complex accumulators
  return acc;
}, {});
```

**Why this matters as a "pattern":** chaining `map`/`filter`/`reduce` favors **pure functions** (no side effects, same input always produces same output) and **immutability** (never mutating the source array), which makes code easier to reason about and test compared to imperative `for` loops with manual mutation — directly analogous to LINQ's `.Select()`/`.Where()`/`.Aggregate()` in C#.

**Common pitfalls:**
- Forgetting `reduce`'s `initialValue` — without it, the first array element becomes the initial accumulator, which misbehaves (or throws on an empty array) if the array might be empty.
- Chaining many `.map().filter()` calls over huge arrays creates intermediate arrays at every step; for performance-critical hot paths over large datasets, a single `reduce` or an imperative loop can avoid that overhead.
- These methods (like `forEach`) don't support `break`/`continue`-style early exit; use `some`/`every`/`find` or a plain loop when you need to stop early.

---

## Intermediate — Question 7

**Q7: What's the difference between ES Modules (`import`/`export`) and CommonJS (`require`/`module.exports`)?**

Both are module systems for splitting code into reusable files, but they differ in loading model, syntax, and semantics — and the difference matters concretely when working across browser JS and Node.js.

**CommonJS (Node's traditional default):**

```javascript
// math.js
function add(a, b) { return a + b; }
module.exports = { add };

// app.js
const { add } = require('./math');
```

- **Synchronous, runtime loading:** `require()` is a plain function call, executed wherever it appears; the required module's code runs immediately and its `module.exports` object is returned.
- Values are **copied** into the requiring module at the time of the `require()` call — later mutations to the exporter's exported bindings aren't automatically reflected (with the exception of mutable object exports).
- Fully dynamic: `require(condition ? './a' : './b')` works fine since resolution happens at runtime.

**ES Modules (the standard since ES2015, native in browsers and modern Node with `"type": "module"` or `.mjs`):**

```javascript
// math.js
export function add(a, b) { return a + b; }

// app.js
import { add } from './math.js';
```

- **Static, compile-time structure:** `import`/`export` declarations are hoisted and resolved before any code runs, which is what enables **tree-shaking** (bundlers can statically determine and strip unused exports) — something CommonJS's dynamic `require()` calls make far harder.
- Bindings are **live references**, not copies — if the exporting module later reassigns an exported `let` binding, importers see the updated value automatically.
- **Asynchronous** module graph resolution under the hood, and top-level `await` is supported directly in a module.
- Dynamic imports still exist via `import('./math.js')`, which returns a Promise — used for code-splitting/lazy-loading.

**Common pitfall:** mixing the two systems in one Node project without understanding interop — CommonJS can't `require()` a pure ESM package synchronously (must use dynamic `import()`), while ESM can import CommonJS modules but only gets the default export cleanly, not always named exports, depending on how the CJS module was written.

**Practical guidance:** for new code, use ES Modules — it's the standard going forward, works identically in browsers and Node, and unlocks bundler optimizations CommonJS can't.

---

## Advanced — Question 1

**Q1: How does JavaScript's garbage collector work, and what are common sources of memory leaks?**

JavaScript uses **automatic memory management** via garbage collection (GC) — there's no manual `free()`/`delete` like in unmanaged C/C++, and no deterministic `Dispose()` timing like C#'s `IDisposable`. The dominant algorithm modern engines (V8, SpiderMonkey) use is **mark-and-sweep**, layered with a **generational** strategy for performance.

**Mark-and-sweep, conceptually:**
1. The GC starts from a set of **roots** (global object, currently executing call stack, closures currently in scope).
2. It **marks** every object reachable from those roots by traversing references, recursively.
3. Anything **not** marked after the traversal is considered unreachable garbage and is **swept** (its memory reclaimed).

This replaced the older, weaker **reference-counting** approach, which fails on **circular references** (two objects referencing each other, unreachable from any root, but each with a nonzero reference count) — mark-and-sweep handles cycles correctly since reachability, not reference count, determines liveness.

**Generational GC (V8 specifics):** V8 splits the heap into a small, fast-collected **young generation** (most objects die young — "the generational hypothesis") using a copying **Scavenger**, and an **old generation** collected less often with a slower, more thorough mark-sweep-compact pass, minimizing full-heap pauses.

**Because GC is reachability-based, "leaks" in JS really mean: something is unintentionally keeping an object reachable.** Common real-world sources:

1. **Forgotten event listeners:** `element.addEventListener('click', handler)` where `handler` closes over a large object, and the listener is never removed with `removeEventListener` — the DOM element (and everything the handler's closure references) stays reachable indefinitely.
2. **Detached DOM nodes:** removing a node from the document (`el.remove()`) but still holding a JS reference to it elsewhere (e.g., in a cache array) — the whole detached subtree stays in memory.
3. **Closures retaining large scopes:** a long-lived closure (e.g., stored in a global cache, a timer callback that's never cleared) that references a large object, keeping it alive far longer than intended, even if only one small property is actually used.
4. **Uncleared `setInterval`/`setTimeout`:** a repeating timer closure keeps its entire enclosing scope alive until `clearInterval` is called.

**Practical guidance:** always pair `addEventListener`/`setInterval` with a corresponding cleanup (`removeEventListener`/`clearInterval`), especially in component lifecycles (e.g., a framework's unmount hook); prefer `WeakMap`/`WeakSet` (Q3) for caches keyed by objects so entries can be collected automatically.

---

## Advanced — Question 2

**Q2: Trace the exact microtask/macrotask execution order for a snippet that mixes synchronous code, nested Promises, and `setTimeout`.**

Building on the event loop rules from the Intermediate tier — the entire microtask queue drains completely before the next macrotask, and this holds even when a microtask schedules another microtask during draining:

```javascript
console.log('A');

setTimeout(() => console.log('B'), 0);

Promise.resolve().then(() => {
  console.log('C');
  Promise.resolve().then(() => console.log('D'));
});

Promise.resolve().then(() => console.log('E'));

console.log('F');
```

**Trace:**
1. **Synchronous phase** (call stack runs top to bottom): logs `A`. `setTimeout` hands its callback to the host environment and returns immediately (macrotask queued, not run). The first `Promise.resolve().then(...)` registers its callback as a microtask (call it **M1**) — since the promise is already resolved, `.then` schedules immediately rather than waiting. The second `Promise.resolve().then(...)` registers its callback as a microtask (**M2**). Logs `F`. Stack is now empty.
   - Microtask queue: `[M1, M2]`. Macrotask queue: `[B's callback]`.
2. **Drain microtasks — M1 runs:** logs `C`, then schedules a new `Promise.resolve().then(...)` — call it **M3** — which goes to the *back* of the microtask queue.
   - Microtask queue is now: `[M2, M3]`.
3. **M2 runs:** logs `E`.
   - Microtask queue: `[M3]`.
4. **M3 runs:** logs `D`.
   - Microtask queue is empty — draining is complete.
5. **Exactly one macrotask runs:** the `setTimeout` callback logs `B`.

**Final output: `A, F, C, E, D, B`**

The subtle part is step 2–4: `D` runs *after* `E`, not right after `C`, even though `D`'s promise was created textually right after `C` is logged — because `M2` was already sitting in the queue ahead of the newly-scheduled `M3` (FIFO ordering), and the queue is only considered "drained" once nothing new gets added, which is checked after each individual microtask, not once at the start.

**Practical guidance:** this ordering matters in real bugs — e.g., a `then()` callback that assumes another independently-scheduled `then()` chain has already completed will fail intermittently depending on queue order, which is why shared async state should be coordinated explicitly (via `await`-ing the same promise, not relying on scheduling order).

---

## Advanced — Question 3

**Q3: What are `WeakMap` and `WeakSet`, and why do they exist?**

`WeakMap` and `WeakSet` are variants of `Map` and `Set` whose **keys** (WeakMap) or **members** (WeakSet) are held with a **weak reference** — meaning the garbage collector is free to reclaim that object even while it's still a key/member, as long as nothing else in the program references it.

```javascript
let user = { name: 'Ada' };
const cache = new WeakMap();
cache.set(user, { computedScore: 42 });

user = null; // no other strong references to the original object remain
// The engine is now free to garbage-collect the {name:'Ada'} object,
// and its entry in `cache` is automatically removed along with it —
// no memory leak, with zero manual cleanup code required.
```

**Why this matters — the problem a regular `Map` has:** a regular `Map` holds a **strong reference** to every key. If you use a plain `Map` to cache data keyed by DOM elements or objects, those objects can never be garbage collected as long as the `Map` exists — even after the rest of the program has completely finished with them — because the `Map` itself is a permanent root keeping them reachable. This is a classic, easy-to-miss memory leak in long-running applications (dashboards, SPAs) that cache per-object metadata.

**Key restrictions (deliberate, not incidental):**
- Keys/members must be **objects** (or, more recently, registered `Symbol`s) — never primitives — since primitives aren't garbage-collected the same way and weak referencing them wouldn't make sense.
- **Not iterable** — no `.keys()`, `.forEach()`, no way to enumerate entries, and no `.size`. This is intentional: since entries can silently disappear at any GC pause (a non-deterministic time from JS's perspective), any enumeration result would be immediately unreliable/inconsistent.

**Practical use cases:**
- Per-object metadata caches (e.g., memoizing an expensive computation keyed by an object, without preventing that object's collection).
- Tracking "has this object been processed" (`WeakSet`) without holding it alive — e.g., marking DOM nodes already bound with event handlers.
- Private-data patterns pre-dating native class private fields (`#field`), where a `WeakMap` external to the class stored per-instance private state.

**Common pitfall:** reaching for `WeakMap` expecting iteration or a size check — if you need to enumerate stored entries, you need a regular `Map` and must manage cleanup yourself (or accept the leak risk consciously).

---

## Advanced — Question 4

**Q4: What are generators and iterators, and how do they relate to `for...of` and async iteration?**

**Iterators:** an object implementing the **iterator protocol** — a `next()` method returning `{ value, done }` — is an iterator. **Iterables** are objects implementing `Symbol.iterator`, a method returning an iterator; this is what `for...of`, spread, and destructuring all rely on under the hood.

```javascript
const arr = [10, 20];
const it = arr[Symbol.iterator]();
it.next(); // { value: 10, done: false }
it.next(); // { value: 20, done: false }
it.next(); // { value: undefined, done: true }
```

**Generators (`function*`)** are a concise way to *implement* the iterator protocol without hand-writing `next()`/state tracking. Calling a generator function doesn't run its body — it returns a **generator object** (itself an iterator). Each call to `.next()` runs the body until the next `yield`, pausing execution and returning that value; execution resumes exactly where it left off on the following `.next()` call.

```javascript
function* range(start, end) {
  for (let i = start; i <= end; i++) {
    yield i; // pauses here, returns i, resumes on next .next() call
  }
}
for (const n of range(1, 3)) console.log(n); // 1, 2, 3 — for...of drives .next() automatically

const gen = range(1, 3);
gen.next(); // { value: 1, done: false }
```

Generators can also **receive** values: whatever is passed to `.next(value)` becomes the result of the `yield` expression that was paused, enabling two-way communication (used in older coroutine-style async patterns, and internally by some async libraries).

**Async iteration:** `async function*` generators `yield` values wrapped implicitly in Promises, consumed with `for await...of`, which awaits each yielded value before the loop body runs — the natural way to stream data (paginated API results, chunked file reads, database cursors) without loading everything into memory at once.

```javascript
async function* fetchPages(url) {
  let next = url;
  while (next) {
    const res = await fetch(next);
    const page = await res.json();
    yield page.items;
    next = page.nextUrl;
  }
}
for await (const items of fetchPages('/api/data')) {
  console.log(items); // processes one page at a time as it arrives
}
```

**Practical guidance:** generators are ideal for lazily producing large or infinite sequences (they compute values on demand rather than eagerly building an array), implementing custom iterables for your own data structures, and modeling streams/pagination cleanly. **Common pitfall:** forgetting that a generator object is a **single-use** iterator — once exhausted (`done: true`), calling `.next()` again just keeps returning `done: true`; you must call the generator function again to iterate from the start.

---

## Advanced — Question 5

**Q5: Give a basic overview of how V8 executes JavaScript — interpretation vs JIT compilation — and explain hidden classes and inline caching.**

V8 (Chrome/Node's engine) doesn't purely interpret JS, nor does it compile everything upfront like a static language — it uses a **tiered, adaptive pipeline** that starts fast and gets progressively more optimized for "hot" (frequently executed) code.

**The pipeline:**
1. **Ignition (interpreter):** parses JS into bytecode and executes it directly. This gets code running quickly with low startup overhead, at the cost of raw execution speed.
2. **Profiling:** while Ignition runs, V8 collects type feedback — what shapes of objects and types of values actually flow through each function.
3. **TurboFan (optimizing JIT compiler):** functions that run often enough ("hot" functions/loops) get recompiled into highly optimized machine code, using the collected type feedback to make aggressive assumptions.
4. **Deoptimization:** if a later call violates TurboFan's assumptions (e.g., a function suddenly receives an object shaped differently than before), V8 "bails out" back to Ignition's bytecode ("deopt") and must re-optimize from scratch if the pattern recurs — this is expensive and a real performance cliff in hot code.

**Hidden classes:** JS objects don't have static layouts like a C# class, so naive property access would require a hashmap lookup every time. V8 works around this by dynamically creating internal **hidden classes** (a.k.a. "Maps," unrelated to the `Map` type) that describe an object's shape — its properties and their memory offsets. Objects created the same way, with properties added in the same order, share a hidden class.

```javascript
function Point(x, y) { this.x = x; this.y = y; }
const p1 = new Point(1, 2); // hidden class C0 -> add x -> C1 -> add y -> C2
const p2 = new Point(3, 4); // follows the identical transition path, ends at the SAME hidden class C2
```

**Inline caching (IC):** at each property-access call site (`obj.x`), V8 caches "last time I saw this hidden class, `x` was at offset N" so subsequent accesses skip shape lookup entirely and jump straight to the memory offset — as long as the object's hidden class matches what the IC has cached (a **monomorphic** call site: one shape ever seen).

**Why this makes monomorphic code faster:** if a call site sees objects of the *same* hidden class every time, the IC stays monomorphic and TurboFan can generate near-struct-like, branch-free machine code for property access. If the same call site sees several different shapes (**polymorphic**, roughly 2–4 shapes) or many/unpredictable shapes (**megamorphic**), the IC degrades to slower generic lookups, and TurboFan can no longer specialize as aggressively — sometimes triggering deoptimization entirely.

**Practical guidance:** initialize all of an object's properties in the same order in the constructor (never add properties conditionally afterward), avoid `delete obj.prop` (it mutates the hidden class), and avoid passing differently-shaped objects through the same hot function. This is explored concretely in the Scenario tier.

---

## Advanced — Question 6

**Q6: What is the difference between debouncing and throttling? When would you use each?**

Both are techniques for controlling how often a function runs in response to a high-frequency event (scrolling, resizing, typing, mouse movement) — but they trade off differently between "wait for quiet" and "guarantee a steady rate."

**Debouncing:** delays execution until a period of **inactivity** has passed. Every new call **resets** the timer; the function only actually runs once calls *stop* coming in for the specified delay.

```javascript
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);              // cancel any pending call
    timer = setTimeout(() => fn(...args), delay);
  };
}

const onSearchInput = debounce((query) => fetchResults(query), 300);
input.addEventListener('input', e => onSearchInput(e.target.value));
// fetchResults only fires 300ms after the user STOPS typing, not on every keystroke
```

**Use case:** search-as-you-type autocomplete, form validation, resize-triggered re-layout — anywhere you only care about the *final* state after rapid-fire events settle, and want to avoid wasted work (API calls) on every intermediate keystroke.

**Throttling:** guarantees the function runs at most **once per fixed interval**, no matter how many events fire, executing on a steady cadence rather than waiting for quiet.

```javascript
function throttle(fn, interval) {
  let lastRun = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastRun >= interval) {
      lastRun = now;
      fn(...args);
    }
  };
}

const onScroll = throttle(() => updateStickyHeader(), 100);
window.addEventListener('scroll', onScroll);
// updateStickyHeader runs at most every 100ms during continuous scrolling, staying responsive throughout
```

**Use case:** scroll-position tracking, drag handlers, mouse-move-driven UI updates, rate-limiting API calls — anywhere you need continuous, regular feedback throughout the event stream, not just a final value after it stops.

**The core distinction to articulate in an interview:** debounce answers "has activity stopped?"; throttle answers "has enough time passed since I last ran?" Debounce can starve entirely under continuous input (it never fires until input pauses); throttle always fires periodically regardless of how continuous the input is.

**Common pitfall:** using debounce for scroll-linked visual updates — the UI would never update *during* the scroll, only after it stops, producing a laggy, unresponsive feel. Throttle (or `requestAnimationFrame`-based throttling) is correct there instead.

---

## Scenario — Question 1

**Q1: A teammate writes the following code to attach click handlers to a list of buttons, expecting each button to log its own index when clicked. Instead, every button logs `5`. Explain exactly why, and provide two different fixes.**

```javascript
const buttons = document.querySelectorAll('.item-button'); // 5 buttons
for (var i = 0; i < buttons.length; i++) {
  buttons[i].addEventListener('click', function () {
    console.log('Button index:', i);
  });
}
```

**Why this happens:** `var` is **function-scoped**, not block-scoped, so there is only **one** `i` binding shared across the entire loop — not a fresh `i` per iteration. All five click handler closures capture a reference to that same single variable, not a snapshot of its value at the time `addEventListener` was called. By the time any button is actually clicked (well after the loop has finished running), `i` has already been incremented past the loop condition to `5`, and every closure reads that same final value.

**Fix 1 — switch `var` to `let`:** `let` creates a **new lexical binding for every iteration** of a `for` loop specifically — this is special, standardized behavior for `let`/`const` in `for` loop headers, distinct from how they behave in other blocks. Each closure now captures its own independent `i`.

```javascript
for (let i = 0; i < buttons.length; i++) {
  buttons[i].addEventListener('click', function () {
    console.log('Button index:', i); // 0, 1, 2, 3, 4 respectively
  });
}
```

**Fix 2 — create a new scope manually with an IIFE (the pre-ES6 fix, useful to know for legacy code):**

```javascript
for (var i = 0; i < buttons.length; i++) {
  (function (capturedIndex) {
    buttons[capturedIndex].addEventListener('click', function () {
      console.log('Button index:', capturedIndex);
    });
  })(i); // i's current value is passed and captured as a new parameter binding each iteration
}
```

**Fix 3 — avoid the closure-over-loop-variable problem entirely** by reading the index off the DOM at click time instead of capturing it:

```javascript
buttons.forEach((btn, index) => {
  btn.addEventListener('click', () => console.log('Button index:', index)); // forEach's callback param is a fresh binding per call
});
```

**Practical guidance:** this is one of the most common real interview questions specifically because it tests whether a candidate understands *why* `let` fixed things (per-iteration bindings), not just that it does — a shallow "`let` is block-scoped" answer misses that `for`-loop `let` behavior is a specific carve-out in the spec, not simply "block scope" applied naively.

---

## Scenario — Question 2

**Q2: A single-page application's memory usage climbs steadily every time the user navigates between two views, never dropping back down even after garbage collection runs. The `ProductList` component adds a `window resize` listener on mount and a component-level cache keyed by product objects. What's likely causing the leak, and how do you fix each part?**

```javascript
class ProductList {
  constructor(products) {
    this.products = products;
    this.cache = new Map();           // suspect #1
    this.handleResize = () => this.relayout(this.products); // suspect #2
    window.addEventListener('resize', this.handleResize);
  }
  computeLayout(product) {
    if (!this.cache.has(product)) this.cache.set(product, expensiveLayout(product));
    return this.cache.get(product);
  }
  destroy() {
    // nothing here — that's the bug
  }
}
```

**Root cause #1 — the never-removed event listener:** `window.addEventListener('resize', this.handleResize)` registers the listener on the global `window` object, which never gets garbage collected — it lives for the whole page session. As long as `window` holds a reference to `this.handleResize`, and that closure references `this` (the whole `ProductList` instance, including `this.products` and `this.cache`), **the entire component instance is kept reachable from a GC root forever**, even after the view is torn down and a new `ProductList` is created for the next navigation. Each navigation adds another orphaned instance permanently pinned in memory — the classic "detached but still referenced" leak pattern.

**Fix:** always pair the listener with removal in a teardown/lifecycle hook:

```javascript
destroy() {
  window.removeEventListener('resize', this.handleResize); // breaks the root -> instance reference
}
```

**Root cause #2 — the regular `Map` cache keyed by objects:** `this.cache` is a plain `Map`, which holds **strong references** to its keys (`product` objects). Even if `destroy()` is called and the listener is removed, if anything else still transiently references the old `ProductList` instance (or if `destroy()` is simply forgotten on some code path, as is common), the `Map`'s strong references to every `product` object it ever cached keep all of them alive, along with their computed layout data, indefinitely.

**Fix:** use a `WeakMap` instead — its keys don't prevent garbage collection:

```javascript
this.cache = new WeakMap(); // if a product is no longer referenced elsewhere, it (and its cache entry) can be collected
```

**Why this matters practically:** the first leak is caused by a *forgotten* cleanup call (a process/discipline problem — solvable with lifecycle hooks or, in a framework, its built-in unmount cleanup); the second is caused by using the *wrong data structure* for the job (a `Map` when a `WeakMap` was the correct semantic choice) — worth calling out as two structurally different classes of leak in an interview answer, not just "add cleanup code" as a blanket fix.

---

## Scenario — Question 3

**Q3: Predict the exact console output of this snippet, and explain the reasoning step by step.**

```javascript
console.log('start');

setTimeout(() => {
  console.log('timeout');
}, 0);

Promise.resolve()
  .then(() => {
    console.log('promise 1');
  })
  .then(() => {
    console.log('promise 2');
  });

async function asyncFn() {
  console.log('async start');
  await null;
  console.log('async end');
}
asyncFn();

console.log('end');
```

**Output:**
```text
start
async start
end
promise 1
async end
promise 2
timeout
```

**Step-by-step reasoning:**

1. `console.log('start')` runs synchronously → **`start`**.
2. `setTimeout(...)` hands its callback to the host environment and returns immediately; the callback goes on the **macrotask** queue, not run yet.
3. `Promise.resolve().then(cb1).then(cb2)` — since `Promise.resolve()` is already fulfilled, `cb1` is scheduled as a **microtask** immediately. `cb2` is *not* scheduled yet — it only gets queued once `cb1` resolves the promise `cb1`'s `.then` returned.
4. `asyncFn()` is called. Its body runs **synchronously up to the first `await`**: `console.log('async start')` runs immediately → **`async start`**. Then `await null` suspends the function, and its continuation (everything after the `await`) is scheduled as a **microtask**, exactly like a `.then()` callback would be. `asyncFn()` itself returns a pending Promise back to the caller right away — execution does not block here.
5. `console.log('end')` runs synchronously → **`end`**. The call stack is now empty.
   - Microtask queue at this point, in order added: `[cb1, asyncFn's continuation]`.
   - Macrotask queue: `[timeout callback]`.
6. **Microtask draining begins.** `cb1` runs first (it was queued before `asyncFn`'s continuation, in step 3 vs step 4): logs **`promise 1`**, and its return value (`undefined`) resolves the second promise in the chain, scheduling `cb2` as a *new* microtask, appended to the back of the queue.
   - Queue now: `[asyncFn's continuation, cb2]`.
7. `asyncFn`'s continuation runs next: logs **`async end`**.
   - Queue now: `[cb2]`.
8. `cb2` runs: logs **`promise 2`**.
   - Microtask queue is now empty — draining complete.
9. With the call stack and microtask queue both empty, the event loop moves to the macrotask queue and runs the `setTimeout` callback: logs **`timeout`**.

**The key insight to articulate:** `await` doesn't yield to the macrotask queue — it yields to the **microtask** queue, exactly like a Promise `.then()`. This is why `async`/`await` code, however deeply it awaits things, will always finish running (all its microtask continuations) before a `setTimeout(fn, 0)` scheduled earlier in the same tick gets a chance to run.

---

## Scenario — Question 4

**Q4: A hot function in your Node.js service processes millions of incoming request objects per hour and has become a measurable CPU bottleneck. Profiling shows the function itself hasn't changed, but it has "deoptimized" according to `--trace-deopt`. Investigation shows the function receives objects from several different code paths that build them slightly differently. What's going on, and how do you fix it?**

```javascript
function computeScore(request) {
  // hot path — called millions of times/hour
  return request.base * request.weight + request.bonus;
}

// Path A
function fromApi(payload) {
  const r = {};
  r.base = payload.base;
  r.weight = payload.weight;
  r.bonus = payload.bonus;
  return r;
}

// Path B
function fromCache(entry) {
  const r = {};
  r.bonus = entry.bonus;   // different property ORDER
  r.base = entry.base;
  r.weight = entry.weight;
  return r;
}

// Path C
function fromLegacyQueue(msg) {
  const r = { base: msg.base, weight: msg.weight };
  if (msg.hasBonus) r.bonus = msg.bonus; // sometimes has bonus, sometimes doesn't
  return r;
}
```

**What's going on:** as covered in the Advanced tier, V8 assigns each object a **hidden class** based on the sequence in which properties are added. Objects built with properties in a **different order**, or with properties **conditionally present**, end up with **different hidden classes**, even if they end up looking structurally identical (same property names, same value types).

- `fromApi` adds `base`, `weight`, `bonus` in that order → hidden class **HC1**.
- `fromCache` adds `bonus`, `base`, `weight` → a **different** transition path → hidden class **HC2**, even though the final object "looks the same."
- `fromLegacyQueue` sometimes omits `bonus` entirely → yet another shape, **HC3**, when the property is missing.

`computeScore`'s property-access call site (`request.base`, `request.weight`, `request.bonus`) sees three-plus different hidden classes flowing through it over time. The inline cache at that call site goes from **monomorphic** (fast: one shape, direct offset lookup) to **polymorphic**, and — since production traffic mixes all three paths continuously and unpredictably — eventually **megamorphic** (falls back to a much slower generic property lookup, and TurboFan can no longer generate specialized machine code for this function, triggering the deoptimization the trace flagged).

**The fix — normalize object shape at every construction site**, so every `request` object reaching `computeScore` has properties added in the **same order**, and no property is ever conditionally missing:

```javascript
function makeRequest(base, weight, bonus = 0) {
  return { base, weight, bonus }; // one shared constructor, one consistent hidden class
}

function fromApi(payload) {
  return makeRequest(payload.base, payload.weight, payload.bonus);
}
function fromCache(entry) {
  return makeRequest(entry.base, entry.weight, entry.bonus);
}
function fromLegacyQueue(msg) {
  return makeRequest(msg.base, msg.weight, msg.hasBonus ? msg.bonus : 0); // always present, never omitted
}
```

By routing every path through a single object "constructor" function that always sets the same properties in the same order, every `request` object shares one hidden class again. The call site in `computeScore` becomes monomorphic, the inline cache stays fast, and TurboFan can re-optimize and keep the compiled version instead of continually bailing out.

**Practical guidance:** this class of bug is invisible in code review unless you specifically know to look for it — it never throws, never produces wrong output, and passes every unit test; it only shows up as a CPU/latency regression under production-scale traffic. `node --trace-deopt` and `--trace-opt`, or the Chrome DevTools Performance tab's "not optimized" annotations, are the practical tools for catching it. The broader lesson: prefer factory functions, classes, or `Object.freeze`d shapes with consistent construction over ad hoc object literals built differently across a codebase, especially in code paths handling high request volume.

---
