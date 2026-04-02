import { readFile } from "node:fs/promises";

export async function loadJsonFixture<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON fixture at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
