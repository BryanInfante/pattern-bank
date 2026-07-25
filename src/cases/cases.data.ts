import type { DecisionCase } from '../core/types.js';

/**
 * Curated decision cases (REQ-CORE-6, REQ-CORE-7). All prose below is
 * original — inspired by the pre-selected misuse pairs in proposal.md, not
 * copied from refactoring.guru or any other catalog.
 *
 * `anti_pattern_flag: true` marks a case as an over-engineering/misuse
 * target for `detect_antipattern` (its `rejected_alternative` is the thing
 * being flagged, its `recommended_pattern` is the simpler fix). The
 * remaining cases are "you'd benefit from applying this pattern" cases for
 * `recommend_pattern`.
 */
export const decisionCases: DecisionCase[] = [
  {
    id: 'strategy-vs-conditional-explosion',
    context:
      'A checkout function picks how to charge a customer with a switch/if-else chain keyed on ' +
      'payment method, and the team keeps adding new payment providers over time. Each new ' +
      'provider means editing the same shared function again.',
    recommended_pattern: 'Strategy',
    rejected_alternative: 'a growing if/else or switch chain inside one function',
    why_not:
      'A single shared function that branches on every payment method mixes unrelated billing ' +
      'logic together, makes each branch hard to test in isolation, and forces every future ' +
      'provider addition to edit code that already works for the others.',
    anti_pattern_flag: false,
    example_snippet:
      'interface PaymentStrategy { charge(amount: number): Promise<void>; }\n' +
      'class CardStrategy implements PaymentStrategy { async charge(a) { /* ... */ } }\n' +
      'checkout(strategy: PaymentStrategy, amount: number) { return strategy.charge(amount); }',
    tags: ['strategy', 'conditional', 'behavioral'],
  },
  {
    id: 'singleton-vs-dependency-injection',
    context:
      'A service needs one shared config/client instance across the app, so it is implemented as ' +
      'a Singleton with a static getInstance() method that any module can call directly.',
    recommended_pattern: 'Dependency Injection',
    rejected_alternative: 'Singleton',
    why_not:
      'A Singleton hides a real dependency behind a global static call, so nothing in a ' +
      "function's signature reveals that it touches shared state. Tests that run in the same " +
      'process leak state into each other through the single instance, and swapping in a fake ' +
      'for testing requires reaching into the class internals instead of just passing one in.',
    anti_pattern_flag: true,
    example_snippet:
      'class ConfigSingleton {\n' +
      '  private static instance: ConfigSingleton;\n' +
      '  static getInstance() { return (this.instance ??= new ConfigSingleton()); }\n' +
      '}',
    tags: ['singleton', 'dependency-injection', 'anti-pattern', 'testability'],
  },
  {
    id: 'observer-vs-plain-callback',
    context:
      'A single data source (e.g. a live price feed) needs to notify a growing, dynamic set of ' +
      'independent listeners when it changes — a chart widget today, a logger and an alert ' +
      'system tomorrow — and the source should not need to know about each one by name.',
    recommended_pattern: 'Observer',
    rejected_alternative: 'a single hardcoded callback function',
    why_not:
      'A single hardcoded callback forces the source to know every interested party by name; ' +
      'each new listener means editing that one callback to add another branch, coupling the ' +
      'source to code that has nothing to do with producing the data.',
    anti_pattern_flag: false,
    example_snippet:
      'class PriceFeed {\n' +
      '  private listeners: ((p: number) => void)[] = [];\n' +
      '  subscribe(fn: (p: number) => void) { this.listeners.push(fn); }\n' +
      '  private emit(p: number) { for (const l of this.listeners) l(p); }\n' +
      '}',
    tags: ['observer', 'callback', 'behavioral'],
  },
  {
    id: 'factory-vs-direct-constructor',
    context:
      'Code needs to create one of several related export formats (CSV, JSON, XML) chosen at ' +
      'runtime from user input or config, and callers throughout the app need to do this in ' +
      'several places.',
    recommended_pattern: 'Factory Method',
    rejected_alternative: 'calling each concrete constructor directly at every call site',
    why_not:
      'Scattering `new CsvExporter()` / `new JsonExporter()` type-selection logic across every ' +
      'call site duplicates the same decision repeatedly; adding a new export format means ' +
      'hunting down and editing every one of those call sites instead of one factory function.',
    anti_pattern_flag: false,
    example_snippet:
      'function createExporter(format: "csv" | "json" | "xml"): Exporter {\n' +
      '  switch (format) { case "csv": return new CsvExporter(); /* ... */ }\n' +
      '}',
    tags: ['factory', 'creational'],
  },
  {
    id: 'decorator-vs-inheritance-explosion',
    context:
      'A base notification service needs optional behaviors layered on top in different ' +
      'combinations for different callers — logging, retry, rate limiting — and the set of ' +
      'combinations is expected to keep growing.',
    recommended_pattern: 'Decorator',
    rejected_alternative: 'a growing inheritance hierarchy (one subclass per combination)',
    why_not:
      'Subclassing every combination of optional behavior (LoggingNotifier, ' +
      'LoggingRetryNotifier, RetryRateLimitedNotifier, ...) causes a combinatorial explosion of ' +
      'near-duplicate classes, and adding one more optional behavior multiplies the class count ' +
      'instead of adding one small wrapper.',
    anti_pattern_flag: false,
    example_snippet:
      'class LoggingNotifier implements Notifier {\n' +
      '  constructor(private inner: Notifier) {}\n' +
      '  send(msg: string) { console.log(msg); this.inner.send(msg); }\n' +
      '}',
    tags: ['decorator', 'inheritance', 'structural'],
  },
  {
    id: 'repository-vs-direct-db-access',
    context:
      'Business/service-layer code calls the SQL client or ORM directly, with query logic ' +
      'scattered across several service modules that all need the same underlying data.',
    recommended_pattern: 'Repository',
    rejected_alternative: 'calling the database client directly from business logic',
    why_not:
      'Direct database calls scattered across services couple business rules to persistence ' +
      'details; swapping storage backends or adding caching means touching every call site, and ' +
      'unit-testing business logic requires a real (or heavily mocked) database instead of a ' +
      'simple in-memory fake.',
    anti_pattern_flag: false,
    example_snippet:
      'interface OrderRepository { findById(id: string): Promise<Order | null>; }\n' +
      'class SqlOrderRepository implements OrderRepository { /* ... */ }',
    tags: ['repository', 'persistence', 'data-access'],
  },
  {
    id: 'premature-microservices-vs-modular-monolith',
    context:
      'A small team building an early-stage product splits a barely-used feature area into its ' +
      'own deployable microservice from day one, before any real scaling pressure or team-' +
      'ownership boundary has actually appeared.',
    recommended_pattern: 'Modular Monolith',
    rejected_alternative: 'a premature microservices split',
    why_not:
      'A distributed system adds network latency, partial-failure handling, separate deploy ' +
      'pipelines, and cross-service versioning overhead — costs paid immediately for a scaling ' +
      'need that does not exist yet. A modular monolith with clear internal module boundaries ' +
      'gets the same separation of concerns without the distributed-systems tax, and a genuine ' +
      'boundary can still be split out later once real evidence for it appears.',
    anti_pattern_flag: true,
    example_snippet:
      '// one deployable, clear module boundaries:\n' +
      'src/modules/billing/  src/modules/orders/  src/modules/notifications/',
    tags: ['microservices', 'modular-monolith', 'architecture', 'anti-pattern'],
  },
  {
    id: 'factory-overuse-vs-direct-constructor',
    context:
      'A single concrete class with a small, stable constructor is wrapped behind a "Factory" ' +
      'that always returns that one implementation — there is no branching, no config-driven ' +
      'selection, and no second implementation on the horizon.',
    recommended_pattern: 'a direct constructor call',
    rejected_alternative: 'Factory pattern',
    why_not:
      'A factory with exactly one always-taken branch (or no branch at all) adds an indirection ' +
      'layer and an extra class with no payoff: it hides a simple constructor for variability ' +
      'that does not exist, making the code harder to read for zero benefit. Add the factory ' +
      'once a real second implementation actually shows up, not before.',
    anti_pattern_flag: true,
    example_snippet:
      '// no variability to justify this indirection:\n' +
      'class WidgetFactory { create() { return new Widget(); } }',
    tags: ['factory', 'over-engineering', 'anti-pattern', 'creational'],
  },
  {
    id: 'state-vs-boolean-flags',
    context:
      'An order object tracks its lifecycle with several independent boolean fields ' +
      '(isPaid, isShipped, isCancelled, isRefunded), and every method that touches the order ' +
      'checks combinations of these flags to decide what is currently allowed.',
    recommended_pattern: 'State',
    rejected_alternative: 'a set of independent boolean flags',
    why_not:
      'Boolean flags allow invalid combinations to exist (e.g. isCancelled and isShipped both ' +
      'true) that the code must defensively guard against everywhere, and each new lifecycle ' +
      'stage means adding another flag and updating every conditional that already checks the ' +
      'others.',
    anti_pattern_flag: false,
    example_snippet:
      'interface OrderState { pay(order: Order): void; ship(order: Order): void; }\n' +
      'class PendingState implements OrderState { pay(o) { o.state = new PaidState(); } ' +
      'ship() { throw new Error("cannot ship before payment"); } }',
    tags: ['state', 'boolean-flags', 'behavioral'],
  },
  {
    id: 'adapter-vs-modifying-third-party',
    context:
      'A codebase depends on a third-party library whose interface does not match the shape the ' +
      'rest of the application expects, so callers keep special-casing the library\'s method ' +
      'names and return shapes inline wherever it is used.',
    recommended_pattern: 'Adapter',
    rejected_alternative:
      "forking or patching the third-party library, or special-casing its shape at every call site",
    why_not:
      "Patching a third-party library creates an update-blocking fork, and special-casing its " +
      "shape at every call site duplicates the same translation logic repeatedly and leaks the " +
      "library's interface details into unrelated application code.",
    anti_pattern_flag: false,
    example_snippet:
      'class LegacyLoggerAdapter implements AppLogger {\n' +
      '  constructor(private legacy: LegacyLogger) {}\n' +
      '  info(msg: string) { this.legacy.logMessage(1, msg); }\n' +
      '}',
    tags: ['adapter', 'structural', 'third-party'],
  },
  {
    id: 'god-object-vs-single-responsibility',
    context:
      'One `UserManager` class has grown to handle authentication, profile editing, email ' +
      'notifications, billing, and permission checks — every unrelated feature keeps adding one ' +
      'more method to the same class because "user stuff goes in UserManager".',
    recommended_pattern: 'Single Responsibility (split into focused collaborators)',
    rejected_alternative: 'a single God Object accumulating every user-related concern',
    why_not:
      'A God Object couples unrelated concerns (auth, billing, notifications) so a change to one ' +
      'risks breaking the others, forces every contributor to understand the whole class to ' +
      'change any part of it, and makes the class untestable in isolation since every test drags ' +
      'in every dependency the whole object accumulated.',
    anti_pattern_flag: true,
    example_snippet:
      '// before: one class doing everything\n' +
      'class UserManager { login() {} updateProfile() {} sendWelcomeEmail() {} chargeCard() {} }\n' +
      '// after: focused collaborators\n' +
      'class Authenticator {} class ProfileService {} class BillingService {}',
    tags: ['god-object', 'single-responsibility', 'anti-pattern', 'structural'],
  },
];
