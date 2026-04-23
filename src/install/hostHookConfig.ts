import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildUnchangedFileChange,
  relativeToRoot,
  writeManagedFile,
} from "../host/managedFiles";
import type { InstalledHostFileChange, InstalledHostKind } from "./hostInstall";

const GOODMEMORY_HOOK_MANAGED_BY_ENV = "GOODMEMORY_MANAGED_BY";
const GOODMEMORY_HOOK_MANAGED_BY_VALUE = "goodmemory";
const GOODMEMORY_HOOK_SESSION_START_MATCHER = "startup|resume|clear|compact";
const GOODMEMORY_CODEX_HOOKS_FEATURE_COMMENT = "# goodmemory-managed-hooks";
const GOODMEMORY_CODEX_HOOKS_SECTION_COMMENT = "# goodmemory-managed-hooks-section";
const GOODMEMORY_CODEX_HOOKS_FEATURE_LINE =
  `codex_hooks = true ${GOODMEMORY_CODEX_HOOKS_FEATURE_COMMENT}`;
const GOODMEMORY_CODEX_HOOKS_FEATURE_PLAIN_LINE = "codex_hooks = true";

interface ManagedHookSpec {
  command: string;
  eventName: "SessionStart" | "UserPromptSubmit";
  matcher?: string;
}

interface HookConfigRemovalResult {
  hasRemainingHooks: boolean;
  nextContent: string | null;
}

interface ValidatedHookGroup {
  hooks: Array<Record<string, unknown>>;
  matcher?: string;
}

export async function registerInstalledHostHooks(input: {
  homeRoot?: string;
  host: InstalledHostKind;
}): Promise<InstalledHostFileChange[]> {
  const resolvedHomeRoot = resolve(homeRootValue(input.homeRoot));
  const target = resolveInstalledHostHookTargetPath(input.host, resolvedHomeRoot);
  const existing = await readFileIfPresent(target.path);
  const nextContent = mergeHookConfig(
    existing,
    buildManagedHookSpecs(input.host, resolvedHomeRoot),
    input.host,
    target.relativePath,
  );
  const changes: InstalledHostFileChange[] = [
    await writeManagedFile(target.path, target.root, nextContent, {
      existingContent: existing,
    }),
  ];

  if (input.host === "codex") {
    changes.push(await registerCodexHooksFeature(resolvedHomeRoot));
  }

  return changes;
}

export async function unregisterInstalledHostHooks(input: {
  homeRoot?: string;
  host: InstalledHostKind;
}): Promise<InstalledHostFileChange[]> {
  const resolvedHomeRoot = resolve(homeRootValue(input.homeRoot));
  const target = resolveInstalledHostHookTargetPath(input.host, resolvedHomeRoot);
  const existing = await readFileIfPresent(target.path);
  let hookChange: InstalledHostFileChange;
  let hasRemainingHooks = false;

  if (existing === null) {
    hookChange = buildUnchangedFileChange(target.path, target.root);
  } else {
    const removal = removeHookConfig(
      existing,
      buildManagedHookSpecs(input.host, resolvedHomeRoot),
      target.relativePath,
    );
    hasRemainingHooks = removal.hasRemainingHooks;
    if (removal.nextContent === null) {
      await rm(target.path, { force: true });
      hookChange = {
        action: "deleted",
        path: target.path,
        relativePath: relativeToRoot(target.path, target.root),
      };
    } else {
      hookChange = await writeManagedFile(target.path, target.root, removal.nextContent, {
        existingContent: existing,
      });
    }
  }

  const changes: InstalledHostFileChange[] = [hookChange];
  if (input.host === "codex") {
    changes.push(
      await unregisterCodexHooksFeature(resolvedHomeRoot, {
        preserveEnabled: hasRemainingHooks,
      }),
    );
  }

  return changes;
}

export function resolveInstalledHostHookTargetPath(
  host: InstalledHostKind,
  homeRoot: string,
): { path: string; relativePath: string; root: string } {
  return host === "codex"
    ? {
        path: join(homeRoot, ".codex", "hooks.json"),
        relativePath: ".codex/hooks.json",
        root: homeRoot,
      }
    : {
        path: join(homeRoot, ".claude", "settings.json"),
        relativePath: ".claude/settings.json",
        root: homeRoot,
      };
}

function resolveInstalledHostHookFeatureTargetPath(homeRoot: string): {
  path: string;
  relativePath: string;
  root: string;
} {
  return {
    path: join(homeRoot, ".codex", "config.toml"),
    relativePath: ".codex/config.toml",
    root: homeRoot,
  };
}

function homeRootValue(homeRoot: string | undefined): string {
  return homeRoot ?? process.env.GOODMEMORY_HOME ?? homedir();
}

function buildManagedHookSpecs(
  host: InstalledHostKind,
  homeRoot: string,
): ManagedHookSpec[] {
  return [
    {
      command: buildManagedHookCommand(host, "session-start", homeRoot),
      eventName: "SessionStart",
      matcher: GOODMEMORY_HOOK_SESSION_START_MATCHER,
    },
    {
      command: buildManagedHookCommand(host, "user-prompt-submit", homeRoot),
      eventName: "UserPromptSubmit",
    },
  ];
}

function buildManagedHookCommand(
  host: InstalledHostKind,
  command: "session-start" | "user-prompt-submit",
  homeRoot: string,
): string {
  return [
    `GOODMEMORY_HOME=${shellQuote(homeRoot)}`,
    `${GOODMEMORY_HOOK_MANAGED_BY_ENV}=${shellQuote(GOODMEMORY_HOOK_MANAGED_BY_VALUE)}`,
    "goodmemory",
    host,
    "hook",
    command,
  ].join(" ");
}

function mergeHookConfig(
  existing: string | null,
  specs: ManagedHookSpec[],
  host: InstalledHostKind,
  relativePath: string,
): string {
  const parsed = parseHookRoot(existing, relativePath);
  const nextRoot = { ...parsed };
  const hooksValue = parsed.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw buildInvalidHostHookConfigError(relativePath, "`hooks` must stay a JSON object");
  }

  const nextHooks: Record<string, unknown> = hooksValue ? { ...hooksValue } : {};
  for (const spec of specs) {
    nextHooks[spec.eventName] = mergeHookEvent(
      nextHooks[spec.eventName],
      spec,
      host,
      relativePath,
    );
  }
  nextRoot.hooks = nextHooks;

  return JSON.stringify(nextRoot, null, 2) + "\n";
}

function removeHookConfig(
  existing: string,
  specs: ManagedHookSpec[],
  relativePath: string,
): HookConfigRemovalResult {
  const parsed = parseHookRoot(existing, relativePath);
  const hooksValue = parsed.hooks;
  if (hooksValue === undefined) {
    return {
      hasRemainingHooks: false,
      nextContent: ensureTrailingNewline(existing),
    };
  }
  if (!isRecord(hooksValue)) {
    throw buildInvalidHostHookConfigError(relativePath, "`hooks` must stay a JSON object");
  }

  const nextRoot = { ...parsed };
  const nextHooks: Record<string, unknown> = { ...hooksValue };
  for (const spec of specs) {
    const nextEvent = removeHookEvent(
      nextHooks[spec.eventName],
      spec,
      relativePath,
    );
    if (nextEvent === null) {
      delete nextHooks[spec.eventName];
    } else {
      nextHooks[spec.eventName] = nextEvent;
    }
  }

  const hasRemainingHooks = Object.keys(nextHooks).length > 0;
  if (hasRemainingHooks) {
    nextRoot.hooks = nextHooks;
  } else {
    delete nextRoot.hooks;
  }

  return {
    hasRemainingHooks,
    nextContent:
      Object.keys(nextRoot).length === 0
        ? null
        : JSON.stringify(nextRoot, null, 2) + "\n",
  };
}

function mergeHookEvent(
  value: unknown,
  spec: ManagedHookSpec,
  host: InstalledHostKind,
  relativePath: string,
): unknown[] {
  if (value === undefined) {
    return [buildManagedHookGroup(spec)];
  }
  if (!Array.isArray(value)) {
    throw buildInvalidHostHookConfigError(
      relativePath,
      `\`hooks.${spec.eventName}\` must stay an array`,
    );
  }

  const groups = value.map((group, index) =>
    validateHookGroup(group, relativePath, spec.eventName, index),
  );
  const existingManaged = findManagedHook(groups, spec.command);
  if (existingManaged) {
    existingManaged.group.hooks[existingManaged.hookIndex] = buildManagedHookRecord(spec.command);
    return groups;
  }

  if (findConflictingHook(groups, host, spec.command, spec.eventName)) {
    throw buildInvalidHostHookConfigError(
      relativePath,
      `\`hooks.${spec.eventName}\` already contains a user-managed GoodMemory hook`,
    );
  }

  return [...groups, buildManagedHookGroup(spec)];
}

function removeHookEvent(
  value: unknown,
  spec: ManagedHookSpec,
  relativePath: string,
): unknown[] | null {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw buildInvalidHostHookConfigError(
      relativePath,
      `\`hooks.${spec.eventName}\` must stay an array`,
    );
  }

  const groups = value.map((group, index) =>
    validateHookGroup(group, relativePath, spec.eventName, index),
  );

  const remainingGroups = groups
    .map((group) => ({
      ...group,
      hooks: group.hooks.filter((hook) => !isManagedHookRecord(hook, spec.command)),
    }))
    .filter((group) => group.hooks.length > 0);

  return remainingGroups.length === 0 ? null : remainingGroups;
}

function validateHookGroup(
  value: unknown,
  relativePath: string,
  eventName: ManagedHookSpec["eventName"],
  index: number,
): ValidatedHookGroup {
  if (!isRecord(value)) {
    throw buildInvalidHostHookConfigError(
      relativePath,
      `\`hooks.${eventName}[${index}]\` must stay a JSON object`,
    );
  }
  if (!Array.isArray(value.hooks)) {
    throw buildInvalidHostHookConfigError(
      relativePath,
      `\`hooks.${eventName}[${index}].hooks\` must stay an array`,
    );
  }

  return {
    ...(typeof value.matcher === "string" ? { matcher: value.matcher } : {}),
    hooks: value.hooks.map((hook, hookIndex) => {
      if (!isRecord(hook)) {
        throw buildInvalidHostHookConfigError(
          relativePath,
          `\`hooks.${eventName}[${index}].hooks[${hookIndex}]\` must stay a JSON object`,
        );
      }
      return hook;
    }),
  };
}

function buildManagedHookGroup(spec: ManagedHookSpec): Record<string, unknown> {
  return {
    ...(spec.matcher ? { matcher: spec.matcher } : {}),
    hooks: [buildManagedHookRecord(spec.command)],
  };
}

function buildManagedHookRecord(command: string): Record<string, unknown> {
  return {
    command,
    type: "command",
  };
}

function findManagedHook(
  groups: ValidatedHookGroup[],
  command: string,
): { group: ValidatedHookGroup; hookIndex: number } | null {
  for (const group of groups) {
    const hookIndex = group.hooks.findIndex((hook) => isManagedHookRecord(hook, command));
    if (hookIndex >= 0) {
      return { group, hookIndex };
    }
  }
  return null;
}

function findConflictingHook(
  groups: ValidatedHookGroup[],
  host: InstalledHostKind,
  managedCommand: string,
  eventName: ManagedHookSpec["eventName"],
): boolean {
  const conflictNeedle =
    eventName === "SessionStart"
      ? `goodmemory ${host} hook session-start`
      : `goodmemory ${host} hook user-prompt-submit`;

  return groups.some((group) =>
    group.hooks.some((hook) =>
      typeof hook.command === "string" &&
      hook.command.includes(conflictNeedle) &&
      hook.command !== managedCommand,
    ),
  );
}

function isManagedHookRecord(
  value: Record<string, unknown>,
  command: string,
): boolean {
  return value.type === "command" && value.command === command;
}

function parseHookRoot(
  existing: string | null,
  relativePath: string,
): Record<string, unknown> {
  if (existing === null || existing.trim().length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw buildInvalidHostHookConfigError(relativePath, "file is not valid JSON");
  }

  if (!isRecord(parsed)) {
    throw buildInvalidHostHookConfigError(
      relativePath,
      "root value must be a JSON object",
    );
  }

  return parsed;
}

async function registerCodexHooksFeature(
  homeRoot: string,
): Promise<InstalledHostFileChange> {
  const target = resolveInstalledHostHookFeatureTargetPath(homeRoot);
  const existing = await readFileIfPresent(target.path);
  const nextContent = mergeCodexHookFeature(existing, target.relativePath);
  return writeManagedFile(target.path, target.root, nextContent, {
    existingContent: existing,
  });
}

async function unregisterCodexHooksFeature(
  homeRoot: string,
  input: { preserveEnabled: boolean },
): Promise<InstalledHostFileChange> {
  const target = resolveInstalledHostHookFeatureTargetPath(homeRoot);
  const existing = await readFileIfPresent(target.path);
  if (existing === null) {
    return buildUnchangedFileChange(target.path, target.root);
  }

  const nextContent = input.preserveEnabled
    ? preserveCodexHookFeature(existing, target.relativePath)
    : removeManagedCodexHookFeature(existing, target.relativePath);
  if (nextContent === null) {
    await rm(target.path, { force: true });
    return {
      action: "deleted",
      path: target.path,
      relativePath: relativeToRoot(target.path, target.root),
    };
  }

  return writeManagedFile(target.path, target.root, nextContent, {
    existingContent: existing,
  });
}

function mergeCodexHookFeature(
  existing: string | null,
  relativePath: string,
): string {
  if (existing === null || existing.trim().length === 0) {
    return [
      "[features]",
      GOODMEMORY_CODEX_HOOKS_SECTION_COMMENT,
      GOODMEMORY_CODEX_HOOKS_FEATURE_LINE,
      "",
    ].join("\n");
  }

  const normalized = normalizeCodexHookFeatureConfig(existing, relativePath);
  const lines = normalized.split("\n");
  const section = findTomlSectionRange(lines, /^\s*\[\s*features\s*\]\s*(?:#.*)?$/u);
  if (section === null) {
    const trimmed = normalized.trimEnd();
    const separator = trimmed.length === 0 ? "" : "\n\n";
    return `${trimmed}${separator}[features]\n${GOODMEMORY_CODEX_HOOKS_SECTION_COMMENT}\n${GOODMEMORY_CODEX_HOOKS_FEATURE_LINE}\n`;
  }

  const featureBody = lines.slice(section.start + 1, section.end);
  const updatedFeatureBody: string[] = [];
  let sawCodexHooksLine = false;
  for (const line of featureBody) {
    const featureValue = parseCodexHooksFeatureValue(line);
    if (featureValue === null) {
      updatedFeatureBody.push(line);
      continue;
    }

    sawCodexHooksLine = true;
    if (isManagedCodexHooksFeatureLine(line)) {
      updatedFeatureBody.push(GOODMEMORY_CODEX_HOOKS_FEATURE_LINE);
      continue;
    }
    if (featureValue === false) {
      throw buildInvalidHostHookConfigError(
        relativePath,
        "`[features].codex_hooks` is explicitly disabled",
      );
    }
    updatedFeatureBody.push(line);
  }

  if (!sawCodexHooksLine) {
    let insertionIndex = 0;
    while (
      insertionIndex < updatedFeatureBody.length &&
      /^\s*(?:#.*)?$/u.test(updatedFeatureBody[insertionIndex]!)
    ) {
      insertionIndex += 1;
    }
    updatedFeatureBody.splice(insertionIndex, 0, GOODMEMORY_CODEX_HOOKS_FEATURE_LINE);
  }

  return ensureTrailingNewline([
    ...lines.slice(0, section.start + 1),
    ...updatedFeatureBody,
    ...lines.slice(section.end),
  ].join("\n"));
}

function preserveCodexHookFeature(
  existing: string,
  relativePath: string,
): string {
  const normalized = normalizeCodexHookFeatureConfig(existing, relativePath);
  const lines = normalized.split("\n");
  const section = findTomlSectionRange(lines, /^\s*\[\s*features\s*\]\s*(?:#.*)?$/u);
  if (section === null) {
    return ensureTrailingNewline(normalized);
  }

  const featureBody = lines.slice(section.start + 1, section.end);
  const nextFeatureBody = featureBody.flatMap((line) => {
    if (isManagedCodexHooksSectionComment(line)) {
      return [];
    }
    if (isManagedCodexHooksFeatureLine(line)) {
      return [GOODMEMORY_CODEX_HOOKS_FEATURE_PLAIN_LINE];
    }
    return [line];
  });

  return ensureTrailingNewline([
    ...lines.slice(0, section.start + 1),
    ...nextFeatureBody,
    ...lines.slice(section.end),
  ].join("\n"));
}

function removeManagedCodexHookFeature(
  existing: string,
  relativePath: string,
): string | null {
  const normalized = normalizeCodexHookFeatureConfig(existing, relativePath);
  const lines = normalized.split("\n");
  const section = findTomlSectionRange(lines, /^\s*\[\s*features\s*\]\s*(?:#.*)?$/u);
  if (section === null) {
    return ensureTrailingNewline(normalized);
  }

  const featureBody = lines.slice(section.start + 1, section.end);
  const trimmedFeatureBody = trimBlankTomlLines(featureBody);
  const nextFeatureBody = trimmedFeatureBody.filter(
    (line) =>
      !isManagedCodexHooksFeatureLine(line) &&
      !isManagedCodexHooksSectionComment(line),
  );
  if (nextFeatureBody.length === trimmedFeatureBody.length) {
    return ensureTrailingNewline(normalized);
  }

  if (nextFeatureBody.length === 0) {
    const before = trimTrailingBlankTomlLines(lines.slice(0, section.start));
    const after = trimLeadingBlankTomlLines(lines.slice(section.end));
    return collapseTomlContent([
      ...before,
      ...(before.length > 0 && after.length > 0 ? [""] : []),
      ...after,
    ]);
  }

  return ensureTrailingNewline([
    ...lines.slice(0, section.start + 1),
    ...nextFeatureBody,
    ...lines.slice(section.end),
  ].join("\n"));
}

function normalizeCodexHookFeatureConfig(
  content: string,
  relativePath: string,
): string {
  if (/^\s*\[\[\s*features\s*\]\]\s*(?:#.*)?$/mu.test(content)) {
    throw buildInvalidHostHookConfigError(
      relativePath,
      "`[[features]]` is unsupported for Codex feature flags",
    );
  }

  return content.replace(/\r\n/gu, "\n");
}

function findTomlSectionRange(
  lines: string[],
  headerPattern: RegExp,
): { end: number; start: number } | null {
  const start = lines.findIndex((line) => headerPattern.test(line));
  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isTomlSectionHeader(lines[index]!)) {
      end = index;
      break;
    }
  }

  return { end, start };
}

function isTomlSectionHeader(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*(?:#.*)?$/u.test(line) ||
    /^\s*\[\[[^\]]+\]\]\s*(?:#.*)?$/u.test(line);
}

function parseCodexHooksFeatureValue(line: string): boolean | null {
  const match = /^\s*codex_hooks\s*=\s*(true|false)\s*(?:#.*)?$/u.exec(line);
  if (!match) {
    return null;
  }
  return match[1] === "true";
}

function isManagedCodexHooksFeatureLine(line: string): boolean {
  return line.trim() === GOODMEMORY_CODEX_HOOKS_FEATURE_LINE;
}

function isManagedCodexHooksSectionComment(line: string): boolean {
  return line.trim() === GOODMEMORY_CODEX_HOOKS_SECTION_COMMENT;
}

function trimBlankTomlLines(lines: string[]): string[] {
  return trimLeadingBlankTomlLines(trimTrailingBlankTomlLines(lines));
}

function trimLeadingBlankTomlLines(lines: string[]): string[] {
  const nextLines = [...lines];
  while (nextLines.length > 0 && /^\s*$/u.test(nextLines[0]!)) {
    nextLines.shift();
  }
  return nextLines;
}

function trimTrailingBlankTomlLines(lines: string[]): string[] {
  const nextLines = [...lines];
  while (nextLines.length > 0 && /^\s*$/u.test(nextLines[nextLines.length - 1]!)) {
    nextLines.pop();
  }
  return nextLines;
}

function collapseTomlContent(lines: string[]): string | null {
  const merged = lines.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
  return merged.length === 0 ? null : `${merged}\n`;
}

function buildInvalidHostHookConfigError(path: string, detail: string): Error {
  return new Error(
    `Refusing to overwrite existing ${path}: ${detail}. Remove or fix the managed hook config, then rerun the GoodMemory command.`,
  );
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\"'\"'`)}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readFileIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
