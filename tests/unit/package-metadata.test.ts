import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildPackageTarballName,
  loadPackageMetadata,
  loadPackageMetadataSync,
  resolveCurrentPackageMetadata,
  resolveCurrentPackageMetadataSync,
} from "../../scripts/package-metadata";

describe("package metadata helpers", () => {
  it("builds tarball names for unscoped packages", () => {
    expect(
      buildPackageTarballName({
        name: "goodmemory",
        version: "1.0.0",
      }),
    ).toBe("goodmemory-1.0.0.tgz");
  });

  it("normalizes scoped package names to the pack artifact convention", () => {
    expect(
      buildPackageTarballName({
        name: "@scope/pkg",
        version: "1.0.0",
      }),
    ).toBe("scope-pkg-1.0.0.tgz");
  });

  it("loads package metadata from package.json asynchronously and synchronously", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-package-metadata-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify(
        {
          name: "goodmemory",
          version: "0.1.1",
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect(loadPackageMetadata(root)).resolves.toEqual({
      name: "goodmemory",
      version: "0.1.1",
    });
    expect(loadPackageMetadataSync(root)).toEqual({
      name: "goodmemory",
      version: "0.1.1",
    });
  });

  it("resolves the current package metadata from a script url", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-package-metadata-url-"));
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify(
        {
          name: "@scope/pkg",
          version: "2.3.4",
        },
        null,
        2,
      ),
      "utf8",
    );

    const scriptUrl = pathToFileURL(join(root, "scripts/tool.ts")).href;

    await expect(resolveCurrentPackageMetadata(scriptUrl)).resolves.toEqual({
      name: "@scope/pkg",
      version: "2.3.4",
    });
    expect(resolveCurrentPackageMetadataSync(scriptUrl)).toEqual({
      name: "@scope/pkg",
      version: "2.3.4",
    });
  });

  it("fails closed when package.json omits a name or version", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-package-metadata-invalid-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify(
        {
          name: "goodmemory",
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect(loadPackageMetadata(root)).rejects.toThrow(
      "package.json must define a non-empty name and version.",
    );
    expect(() => loadPackageMetadataSync(root)).toThrow(
      "package.json must define a non-empty name and version.",
    );
  });
});
