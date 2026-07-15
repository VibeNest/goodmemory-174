import { parseCodexNativeCanaryOptions } from "./codex-coding-effect/canary-options";
import { runCodexNativeCanary } from "./codex-coding-effect/native-canary";

if (import.meta.main) {
  try {
    const options = parseCodexNativeCanaryOptions(process.argv.slice(2));
    const result = await runCodexNativeCanary(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
