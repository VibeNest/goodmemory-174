import { runCLI } from "../src/cli";

async function main(): Promise<void> {
  const result = await runCLI(process.argv.slice(2));

  if (result.stdout) {
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  process.exit(result.exitCode);
}

if (import.meta.main) {
  await main();
}
