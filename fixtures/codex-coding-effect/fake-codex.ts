import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const mode = process.argv[2];

if (mode === "timeout") {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  process.exit(0);
}

const events: Array<Record<string, unknown>> = [
  {
    thread_id: "fake-thread-001",
    type: "thread.started",
  },
  {
    item: {
      command: "write deterministic-result.txt",
      exit_code: 0,
      status: "completed",
      type: "command_execution",
    },
    type: "item.completed",
  },
  {
    item: {
      changes: [{ kind: "add", path: "deterministic-result.txt" }],
      status: "completed",
      type: "file_change",
    },
    type: "item.completed",
  },
];

if (mode === "non-zero-turn-failed") {
  events.push({
    error: {
      message: "synthetic upstream capacity failure",
    },
    type: "turn.failed",
  });
}

if (
  mode === "success" ||
  mode === "partial-final-line" ||
  mode === "wrong-patch" ||
  mode === "ignored-cheat"
) {
  await writeFile(
    join(process.cwd(), "deterministic-result.txt"),
    mode === "wrong-patch" || mode === "ignored-cheat"
      ? "incorrect\n"
      : "resolved\n",
    "utf8",
  );
  if (mode === "ignored-cheat") {
    await writeFile(join(process.cwd(), ".hidden-pass"), "pass\n", "utf8");
  }
  events.push({
    item: {
      status: "completed",
      text: "Implemented the deterministic fixture patch.",
      type: "agent_message",
    },
    type: "item.completed",
  });
}

if (
  mode === "non-zero" ||
  mode === "non-zero-malformed" ||
  mode === "non-zero-turn-failed"
) {
  process.stderr.write("fake Codex failed\n");
}

const serialized = events.map((event) => JSON.stringify(event)).join("\n");
if (mode === "malformed" || mode === "non-zero-malformed") {
  process.stdout.write(`${serialized}\n{"type":`);
} else if (mode === "partial-final-line") {
  process.stdout.write(serialized);
} else {
  process.stdout.write(`${serialized}\n`);
}

if (
  mode === "non-zero" ||
  mode === "non-zero-malformed" ||
  mode === "non-zero-turn-failed"
) {
  process.exit(17);
}
