#!/usr/bin/env bun
import type { GoodMemoryConfig } from "../src";
import type {
  GoodMemoryHttpBridgeCaller,
  GoodMemoryHttpBridgeOperation,
} from "../src/http";
import { createGoodMemory } from "../src";
import {
  GOODMEMORY_HTTP_MEMORY_BRIDGE_CONTRACT_VERSION,
  createGoodMemoryHttpMemoryBridge,
  createLifeCoachHttpRememberConfig,
} from "../src/http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8739;
const HTTP_BRIDGE_HOST_ENV = "GOODMEMORY_HTTP_BRIDGE_HOST";
const HTTP_BRIDGE_PORT_ENV = "GOODMEMORY_HTTP_BRIDGE_PORT";
const HTTP_BRIDGE_TOKEN_ENV = "GOODMEMORY_HTTP_BRIDGE_TOKEN";
const HTTP_BRIDGE_AUTH_ENV = "GOODMEMORY_HTTP_BRIDGE_AUTH";
const HTTP_BRIDGE_AUTH_HEADER = "x-goodmemory-bridge-auth";
const HTTP_BRIDGE_PROFILE_ENV = "GOODMEMORY_HTTP_BRIDGE_PROFILE";
const HTTP_BRIDGE_ALLOW_INSECURE_ENV =
  "GOODMEMORY_HTTP_BRIDGE_ALLOW_INSECURE";

type GoodMemoryHttpBridgeProfile = "default" | "life-coach";

interface GoodMemoryHttpBridgeServeOptions {
  allowInsecure: boolean;
  host: string;
  port: number;
  profile: GoodMemoryHttpBridgeProfile;
  token?: string;
}

interface ParsedArgs extends GoodMemoryHttpBridgeServeOptions {
  help: boolean;
}

function printHelp(): void {
  console.log(`GoodMemory HTTP memory bridge

Usage:
  goodmemory-http-bridge [--host <host>] [--port <port>] [--profile <default|life-coach>] [--token <token>]

Environment:
  ${HTTP_BRIDGE_TOKEN_ENV}              Bearer token required by default
  ${HTTP_BRIDGE_AUTH_ENV}               Bearer token alias for hosts that reserve TOKEN variable names
  ${HTTP_BRIDGE_HOST_ENV}               Hostname, defaults to ${DEFAULT_HOST}
  ${HTTP_BRIDGE_PORT_ENV}               Port, defaults to ${DEFAULT_PORT}
  ${HTTP_BRIDGE_PROFILE_ENV}            default or life-coach
  ${HTTP_BRIDGE_ALLOW_INSECURE_ENV}=1   Allow header-only auth for local development

Requests authenticate with Authorization: Bearer <token> (or ${HTTP_BRIDGE_AUTH_HEADER}: Bearer <token> behind proxies)
and still pass caller scope through x-goodmemory-* headers or the JSON caller field.`);
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Expected --port to be an integer between 0 and 65535.");
  }

  return port;
}

function parseProfile(value: string | undefined): GoodMemoryHttpBridgeProfile {
  if (value === undefined || value === "default" || value === "life-coach") {
    return value ?? "default";
  }

  throw new Error("Expected --profile to be default or life-coach.");
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function parseArgs(argv: string[], env: NodeJS.ProcessEnv): ParsedArgs {
  const options: ParsedArgs = {
    allowInsecure: isEnabled(env[HTTP_BRIDGE_ALLOW_INSECURE_ENV]),
    help: false,
    host: env[HTTP_BRIDGE_HOST_ENV] ?? DEFAULT_HOST,
    port: parsePort(env[HTTP_BRIDGE_PORT_ENV]),
    profile: parseProfile(env[HTTP_BRIDGE_PROFILE_ENV]),
    token:
      env[HTTP_BRIDGE_AUTH_ENV]?.trim() ||
      env[HTTP_BRIDGE_TOKEN_ENV]?.trim() ||
      undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--allow-insecure") {
      options.allowInsecure = true;
      continue;
    }
    if (token === "--host") {
      options.host = readFlagValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--port") {
      options.port = parsePort(readFlagValue(argv, index, token));
      index += 1;
      continue;
    }
    if (token === "--profile") {
      options.profile = parseProfile(readFlagValue(argv, index, token));
      index += 1;
      continue;
    }
    if (token === "--token") {
      options.token = readFlagValue(argv, index, token);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function parseOperationsHeader(
  value: string | null,
): GoodMemoryHttpBridgeOperation[] | "*" {
  const operations = value
    ?.split(",")
    .map((operation) => operation.trim())
    .filter(Boolean);

  return operations?.includes("*")
    ? "*"
    : (operations as GoodMemoryHttpBridgeOperation[] | undefined) ?? [];
}

function parseOperationsValue(value: unknown): GoodMemoryHttpBridgeOperation[] | "*" {
  if (value === "*") {
    return "*";
  }
  if (typeof value === "string") {
    return parseOperationsHeader(value);
  }
  if (Array.isArray(value)) {
    return value
      .filter((operation): operation is string => typeof operation === "string")
      .map((operation) => operation.trim())
      .filter(Boolean) as GoodMemoryHttpBridgeOperation[];
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function resolveHeaderCaller(
  request: Request,
): GoodMemoryHttpBridgeCaller | null {
  const userId = request.headers.get("x-goodmemory-user-id")?.trim();
  if (!userId) {
    return null;
  }

  return {
    authorizedOperations: parseOperationsHeader(
      request.headers.get("x-goodmemory-operations"),
    ),
    tenantId: request.headers.get("x-goodmemory-tenant-id")?.trim() || undefined,
    userId,
    workspaceId:
      request.headers.get("x-goodmemory-workspace-id")?.trim() || undefined,
  };
}

function resolveBodyCaller(
  body: Record<string, unknown> | undefined,
): GoodMemoryHttpBridgeCaller | null {
  if (!body || !isRecord(body.caller)) {
    return null;
  }

  const userId = readOptionalString(body.caller.userId);
  if (!userId) {
    return null;
  }

  return {
    authorizedOperations: parseOperationsValue(body.caller.authorizedOperations),
    tenantId: readOptionalString(body.caller.tenantId),
    userId,
    workspaceId: readOptionalString(body.caller.workspaceId),
  };
}

function bridgeAuthMatches(value: unknown, token: string): boolean {
  const bridgeAuth = readOptionalString(value);
  return bridgeAuth === token || bridgeAuth === `Bearer ${token}`;
}

function requestCarriesBridgeToken(
  request: Request,
  token: string,
  body: Record<string, unknown> | undefined,
): boolean {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization === `Bearer ${token}`) {
    return true;
  }

  return (
    bridgeAuthMatches(request.headers.get(HTTP_BRIDGE_AUTH_HEADER), token) ||
    bridgeAuthMatches(body?.bridgeAuth, token)
  );
}

function createTokenAwareCallerResolver(
  options: Pick<GoodMemoryHttpBridgeServeOptions, "allowInsecure" | "token">,
): (
  request: Request,
  body?: Record<string, unknown>,
) => GoodMemoryHttpBridgeCaller | null {
  return (request, body) => {
    if (options.token) {
      if (!requestCarriesBridgeToken(request, options.token, body)) {
        return null;
      }

      return resolveHeaderCaller(request) ?? resolveBodyCaller(body);
    }

    if (options.allowInsecure) {
      return resolveHeaderCaller(request);
    }

    return null;
  };
}

function createMemoryConfig(
  profile: GoodMemoryHttpBridgeProfile,
): GoodMemoryConfig {
  if (profile === "life-coach") {
    return {
      remember: createLifeCoachHttpRememberConfig(),
    };
  }

  return {};
}

function serveHttpBridge(options: GoodMemoryHttpBridgeServeOptions): void {
  if (!options.token && !options.allowInsecure) {
    throw new Error(
      `Refusing to start without ${HTTP_BRIDGE_TOKEN_ENV} or ${HTTP_BRIDGE_AUTH_ENV}; set a token or pass --allow-insecure for local development.`,
    );
  }

  const memory = createGoodMemory(createMemoryConfig(options.profile));
  const bridge = createGoodMemoryHttpMemoryBridge({
    healthMetadata: {
      authMode: options.token
        ? "bearer"
        : options.allowInsecure
          ? "insecure"
          : "disabled",
      bridgeFeatures: "auth-env-alias,body-auth,body-caller",
      profile: options.profile,
    },
    memory,
    resolveCaller: createTokenAwareCallerResolver(options),
  });
  const server = Bun.serve({
    fetch: bridge.fetch,
    hostname: options.host,
    port: options.port,
  });

  const ready = {
    auth: options.token ? "bearer" : "insecure-header",
    contractVersion: GOODMEMORY_HTTP_MEMORY_BRIDGE_CONTRACT_VERSION,
    event: "ready",
    profile: options.profile,
    url: server.url.href.replace(/\/$/, ""),
  };

  console.log(JSON.stringify(ready));

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.stop(true);
      process.exit(0);
    });
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2), process.env);
  if (options.help) {
    printHelp();
    return;
  }

  serveHttpBridge(options);
}

if (import.meta.main) {
  main();
}
