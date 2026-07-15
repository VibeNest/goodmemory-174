export interface BoundaryProcessRequest {
  args: readonly string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  executable: string;
  stdin?: string;
  timeoutMs: number;
}

export interface BoundaryProcessResult {
  durationMs: number;
  exitCode: number | null;
  spawnError?: string;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

const FORCE_KILL_GRACE_MS = 250;

export async function runBoundaryProcess(
  request: BoundaryProcessRequest,
): Promise<BoundaryProcessResult> {
  const startedAt = performance.now();
  try {
    const child = Bun.spawn({
      cmd: [request.executable, ...request.args],
      cwd: request.cwd,
      detached: process.platform !== "win32",
      env: request.env,
      stderr: "pipe",
      stdin: request.stdin === undefined ? "ignore" : "pipe",
      stdout: "pipe",
    });
    if (request.stdin !== undefined) {
      if (!child.stdin) {
        throw new Error("spawned process did not expose writable stdin");
      }
      child.stdin.write(request.stdin);
      child.stdin.end();
    }
    let timedOut = false;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      killBoundaryProcess(child.pid, child.kill.bind(child), "SIGTERM");
      forceKill = setTimeout(() => {
        killBoundaryProcess(child.pid, child.kill.bind(child), "SIGKILL");
      }, FORCE_KILL_GRACE_MS);
    }, request.timeoutMs);

    try {
      const [exitCode, stderr, stdout] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
        new Response(child.stdout).text(),
      ]);
      return {
        durationMs: performance.now() - startedAt,
        exitCode,
        stderr,
        stdout,
        timedOut,
      };
    } finally {
      clearTimeout(timeout);
      if (forceKill !== undefined) {
        clearTimeout(forceKill);
      }
    }
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      exitCode: null,
      spawnError: error instanceof Error ? error.message : String(error),
      stderr: "",
      stdout: "",
      timedOut: false,
    };
  }
}

function killBoundaryProcess(
  pid: number,
  killChild: (signal?: number | NodeJS.Signals) => void,
  signal: "SIGKILL" | "SIGTERM",
): void {
  if (process.platform === "win32") {
    killChild(signal);
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!hasErrorCode(error, "ESRCH")) {
      killChild(signal);
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
