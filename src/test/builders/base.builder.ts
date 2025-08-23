/**
 * Base builder class for test data
 */
export abstract class Builder<T> {
  protected data: Partial<T> = {};
  protected built = false;

  /**
   * Set a property value
   */
  with<K extends keyof T>(key: K, value: T[K]): this {
    if (this.built) {
      throw new Error("Cannot modify builder after building");
    }
    this.data[key] = value;
    return this;
  }

  /**
   * Set multiple properties
   */
  withMany(data: Partial<T>): this {
    if (this.built) {
      throw new Error("Cannot modify builder after building");
    }
    this.data = { ...this.data, ...data };
    return this;
  }

  /**
   * Build the object
   */
  build(): T {
    if (this.built) {
      throw new Error("Builder has already been built");
    }
    this.built = true;
    return this.doBuild();
  }

  /**
   * Build multiple objects
   */
  buildMany(count: number, modifier?: (index: number) => Partial<T>): T[] {
    return Array.from({ length: count }, (_, index) => {
      const builder = this.clone();
      if (modifier) {
        builder.withMany(modifier(index));
      }
      return builder.build();
    });
  }

  /**
   * Clone the builder
   */
  clone(): this {
    const cloned = Object.create(Object.getPrototypeOf(this));
    cloned.data = { ...this.data };
    cloned.built = false;
    return cloned;
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.data = {};
    this.built = false;
    return this;
  }

  /**
   * Get the current data without building
   */
  peek(): Partial<T> {
    return { ...this.data };
  }

  /**
   * Abstract method to implement the build logic
   */
  protected abstract doBuild(): T;

  /**
   * Get default values
   */
  protected abstract getDefaults(): T;
}

/**
 * Chainable builder with common patterns
 */
export abstract class ChainableBuilder<
  T,
  Self extends ChainableBuilder<T, Self>,
> extends Builder<T> {
  /**
   * Apply a conditional modification
   */
  if(condition: boolean, fn: (builder: Self) => Self): Self {
    if (condition) {
      return fn(this as unknown as Self);
    }
    return this as unknown as Self;
  }

  /**
   * Apply a modification unless condition is false
   */
  unless(condition: boolean, fn: (builder: Self) => Self): Self {
    return this.if(!condition, fn);
  }

  /**
   * Apply a random modification
   */
  random(probability: number, fn: (builder: Self) => Self): Self {
    return this.if(Math.random() < probability, fn);
  }

  /**
   * Apply one of multiple modifications randomly
   */
  oneOf(...fns: Array<(builder: Self) => Self>): Self {
    const fn = fns[Math.floor(Math.random() * fns.length)];
    return fn(this as unknown as Self);
  }

  /**
   * Tap into the builder for side effects
   */
  tap(fn: (data: Partial<T>) => void): Self {
    fn(this.peek());
    return this as unknown as Self;
  }

  /**
   * Transform the data
   */
  transform<K extends keyof T>(
    key: K,
    transformer: (value: T[K] | undefined) => T[K],
  ): Self {
    const currentValue = this.data[key];
    this.data[key] = transformer(currentValue);
    return this as unknown as Self;
  }
}

/**
 * Builder with state management
 */
export abstract class StatefulBuilder<T, State = any> extends ChainableBuilder<
  T,
  StatefulBuilder<T, State>
> {
  protected state: State;

  constructor(initialState: State) {
    super();
    this.state = initialState;
  }

  /**
   * Update state
   */
  setState(updater: (state: State) => State): this {
    this.state = updater(this.state);
    return this;
  }

  /**
   * Get current state
   */
  getState(): State {
    return this.state;
  }

  /**
   * Apply modification based on state
   */
  whenState<K extends keyof State>(
    key: K,
    value: State[K],
    fn: (builder: this) => this,
  ): this {
    if (this.state[key] === value) {
      return fn(this);
    }
    return this;
  }
}

/**
 * Builder factory for creating multiple builders
 */
export class BuilderFactory<T, B extends Builder<T>> {
  constructor(
    private BuilderClass: new () => B,
    private defaults?: Partial<T>,
  ) {}

  /**
   * Create a new builder instance
   */
  create(): B {
    const builder = new this.BuilderClass();
    if (this.defaults) {
      builder.withMany(this.defaults);
    }
    return builder;
  }

  /**
   * Create and build immediately
   */
  build(overrides?: Partial<T>): T {
    const builder = this.create();
    if (overrides) {
      builder.withMany(overrides);
    }
    return builder.build();
  }

  /**
   * Create multiple built objects
   */
  buildMany(count: number, modifier?: (index: number) => Partial<T>): T[] {
    return Array.from({ length: count }, (_, index) => {
      const overrides = modifier ? modifier(index) : {};
      return this.build(overrides);
    });
  }

  /**
   * Set default values for all builders
   */
  setDefaults(defaults: Partial<T>): this {
    this.defaults = { ...this.defaults, ...defaults };
    return this;
  }
}

/**
 * Composite builder for building related objects
 */
export class CompositeBuilder<T extends Record<string, any>> {
  private builders: Map<keyof T, Builder<any>> = new Map();
  private built = false;

  /**
   * Register a builder for a key
   */
  register<K extends keyof T>(key: K, builder: Builder<T[K]>): this {
    if (this.built) {
      throw new Error("Cannot modify composite builder after building");
    }
    this.builders.set(key, builder);
    return this;
  }

  /**
   * Get a registered builder
   */
  get<K extends keyof T>(key: K): Builder<T[K]> | undefined {
    return this.builders.get(key);
  }

  /**
   * Configure a specific builder
   */
  configure<K extends keyof T>(
    key: K,
    fn: (builder: Builder<T[K]>) => Builder<T[K]>,
  ): this {
    const builder = this.builders.get(key);
    if (!builder) {
      throw new Error(`No builder registered for key: ${String(key)}`);
    }
    fn(builder);
    return this;
  }

  /**
   * Build all registered objects
   */
  build(): T {
    if (this.built) {
      throw new Error("Composite builder has already been built");
    }
    this.built = true;

    const result = {} as T;
    for (const [key, builder] of this.builders) {
      result[key as keyof T] = builder.build();
    }
    return result;
  }

  /**
   * Clone the composite builder
   */
  clone(): CompositeBuilder<T> {
    const cloned = new CompositeBuilder<T>();
    for (const [key, builder] of this.builders) {
      cloned.register(key as keyof T, builder.clone());
    }
    return cloned;
  }
}

/**
 * Helper type for builder method chaining
 */
export type BuilderMethods<T> = {
  [K in keyof T as `with${Capitalize<string & K>}`]: (
    value: T[K],
  ) => BuilderMethods<T>;
} & {
  build(): T;
  buildMany(count: number): T[];
};

/**
 * Create a fluent builder from a class
 */
export function createBuilder<T>(
  defaults: T,
  validators?: Partial<Record<keyof T, (value: any) => boolean>>,
): BuilderMethods<T> {
  class FluentBuilder extends Builder<T> {
    protected getDefaults(): T {
      return defaults;
    }

    protected doBuild(): T {
      const result = { ...this.getDefaults(), ...this.data };

      // Validate if validators provided
      if (validators) {
        for (const [key, validator] of Object.entries(validators)) {
          if (
            validator &&
            typeof validator === "function" &&
            !validator(result[key as keyof T])
          ) {
            throw new Error(`Invalid value for ${key}`);
          }
        }
      }

      return result as T;
    }
  }

  const builder = new FluentBuilder();

  // Add fluent methods for each property
  const proxy = new Proxy(builder, {
    get(target, prop) {
      if (typeof prop === "string" && prop.startsWith("with")) {
        const key = prop.slice(4).charAt(0).toLowerCase() + prop.slice(5);
        return (value: any) => {
          target.with(key as keyof T, value);
          return proxy;
        };
      }
      return target[prop as keyof Builder<T>];
    },
  });

  return proxy as any;
}
