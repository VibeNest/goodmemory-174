export interface KeyedMutationLock {
  runExclusive<T>(
    keys: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T>;
}

export function createKeyedMutationLock(): KeyedMutationLock {
  const tails = new Map<string, Promise<void>>();

  async function runForKey<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    tails.set(key, tail);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (tails.get(key) === tail) {
        tails.delete(key);
      }
    }
  }

  return {
    async runExclusive<T>(
      keys: readonly string[],
      operation: () => Promise<T>,
    ): Promise<T> {
      const orderedKeys = [...new Set(keys)].sort();

      async function acquire(index: number): Promise<T> {
        const key = orderedKeys[index];
        if (!key) {
          return operation();
        }
        return runForKey(key, () => acquire(index + 1));
      }

      return acquire(0);
    },
  };
}
