import { writeFileSync } from "node:fs";

import { buildGoodMemoryCapabilityDescriptor } from "../src/api/capabilityDescriptor";

// Regenerate the static machine-readable descriptor that repo scanners fetch
// from `.well-known/goodmemory.json`. The running bridge serves the same object
// from the builder, so this file is a committed snapshot golden-checked in
// tests/unit/capability-descriptor.test.ts. Run after changing the builder or
// bumping the package version:
//   bun run scripts/generate-capability-descriptor.ts

const DESCRIPTOR_PATH = new URL(
  "../.well-known/goodmemory.json",
  import.meta.url,
);

const body = `${JSON.stringify(buildGoodMemoryCapabilityDescriptor(), null, 2)}\n`;
writeFileSync(DESCRIPTOR_PATH, body, "utf8");
process.stdout.write(`Wrote ${DESCRIPTOR_PATH.pathname}\n`);
