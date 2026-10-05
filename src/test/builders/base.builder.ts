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
