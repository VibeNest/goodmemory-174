import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export async function assertCanaryExecutableInsidePrefix(
  executablePath: string,
  label: string,
  prefix: string,
): Promise<string> {
  const source = await lstat(executablePath);
  if (!source.isFile() && !source.isSymbolicLink()) {
    throw new Error(`${label} must be a file or symlink: ${executablePath}`);
  }

  const [resolvedExecutable, resolvedPrefix] = await Promise.all([
    realpath(executablePath),
    realpath(prefix),
  ]);
  const relativePath = relative(resolve(resolvedPrefix), resolve(resolvedExecutable));
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `${label} must resolve inside the isolated npm prefix: ${executablePath}`,
    );
  }

  const target = await lstat(resolvedExecutable);
  if (!target.isFile()) {
    throw new Error(`${label} must resolve to a regular file: ${executablePath}`);
  }
  return resolvedExecutable;
}
