import { createHash } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 120_000;
const STALE_LOCK_MS = 10 * 60_000;

export async function withPackagePackLock<T>(
  packageRoot: string,
  callback: () => Promise<T> | T,
): Promise<T> {
  const lockPath = buildLockPath(packageRoot);
  const startedAt = Date.now();
  let acquired = false;

  while (!acquired) {
    try {
      await mkdir(lockPath);
      await writeFile(
        join(lockPath, "owner.json"),
        JSON.stringify({
          packageRoot,
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }),
        "utf8",
      );
      acquired = true;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String(error.code)
          : undefined;
      if (code !== "EEXIST") {
        throw error;
      }

      const existingLock = await stat(lockPath).catch(() => undefined);
      if (
        existingLock !== undefined &&
        Date.now() - existingLock.mtimeMs > STALE_LOCK_MS
      ) {
        await rm(lockPath, { force: true, recursive: true });
        continue;
      }

      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(
          `Timed out waiting for package pack lock at ${lockPath}.`,
        );
      }

      await Bun.sleep(LOCK_RETRY_MS);
    }
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { force: true, recursive: true });
  }
}

function buildLockPath(packageRoot: string): string {
  const rootDigest = createHash("sha256")
    .update(packageRoot)
    .digest("hex")
    .slice(0, 16);

  return join(tmpdir(), `goodmemory-package-pack-${rootDigest}.lock`);
}
