import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants } from "node:zlib";

import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

const ASSET_DIR = fileURLToPath(
  new URL("../../dist/inspector-web/assets/", import.meta.url),
);

export default defineConfig({
  base: "/",
  build: {
    emptyOutDir: true,
    outDir: "../../dist/inspector-web",
    sourcemap: false,
  },
  plugins: [react(), compressStaticAssets()],
});

function compressStaticAssets(): Plugin {
  return {
    name: "goodmemory-inspector-brotli-assets",
    async closeBundle() {
      const entries = await readdir(ASSET_DIR, { withFileTypes: true });
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && /\.(?:css|js)$/u.test(entry.name))
          .map(async (entry) => {
            const path = join(ASSET_DIR, entry.name);
            const compressed = await compressBrotli(await readFile(path));
            await writeFile(`${path}.br`, compressed);
            await rm(path);
          }),
      );
    },
  };
}

function compressBrotli(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    brotliCompress(
      input,
      {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
        },
      },
      (error, output) => {
        if (error) {
          reject(error);
        } else {
          resolve(output);
        }
      },
    );
  });
}
