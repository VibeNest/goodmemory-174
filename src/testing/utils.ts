import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class DeterministicClock {
  private current: Date;

  constructor(initial: string | Date) {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceMs(ms: number): Date {
    this.current = new Date(this.current.getTime() + ms);
    return this.now();
  }
}

export function createDeterministicIdGenerator(prefix: string): () => string {
  let counter = 0;

  return () => {
    counter += 1;
    return `${prefix}-${String(counter).padStart(4, "0")}`;
  };
}

export interface TempWorkspace {
  root: string;
  cleanup(): Promise<void>;
}

export async function createTempWorkspace(prefix: string): Promise<TempWorkspace> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  await mkdir(join(root, "fixtures"), { recursive: true });

  return {
    root,
    async cleanup(): Promise<void> {
      await rm(root, { recursive: true, force: true });
    },
  };
}
