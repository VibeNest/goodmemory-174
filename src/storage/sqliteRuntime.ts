export type SQLiteVectorExtensionMode = "off" | "prefer" | "require";

interface EnvironmentMap {
  [key: string]: string | undefined;
}

export interface SQLiteCustomLibraryConfig {
  customLibraryPath?: string;
}

export interface SQLiteVectorExtensionConfig {
  entryPoint?: string;
  mode: SQLiteVectorExtensionMode;
  path?: string;
}

export interface SQLiteRuntimeConfig extends SQLiteCustomLibraryConfig {
  vectorExtension: {
    entryPoint?: string;
    mode: SQLiteVectorExtensionMode;
    path?: string;
  };
}

interface SQLiteLibraryController {
  setCustomSQLite(path: string): boolean;
}

interface SQLiteExtensionLoader {
  loadExtension(path: string, entryPoint?: string): void;
}

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeVectorMode(
  value: string | undefined,
  hasPath: boolean,
): SQLiteVectorExtensionMode {
  if (!value) {
    return hasPath ? "prefer" : "off";
  }

  if (value === "off" || value === "prefer" || value === "require") {
    return value;
  }

  throw new Error(
    `Unsupported GOODMEMORY_SQLITE_VECTOR_MODE: ${value}. Expected off|prefer|require.`,
  );
}

export function resolveSQLiteRuntimeConfig(
  env: EnvironmentMap = process.env,
): SQLiteRuntimeConfig {
  return {
    ...resolveSQLiteCustomLibraryConfig(env),
    vectorExtension: resolveSQLiteVectorExtensionConfig(env),
  };
}

export function applySQLiteCustomLibrary(
  config: SQLiteCustomLibraryConfig,
  controller: SQLiteLibraryController,
): void {
  if (!config.customLibraryPath) {
    return;
  }

  controller.setCustomSQLite(config.customLibraryPath);
}

export function loadSQLiteVectorExtension(
  config: SQLiteVectorExtensionConfig,
  loader: SQLiteExtensionLoader,
): void {
  if (
    config.mode === "off" ||
    !config.path
  ) {
    return;
  }

  try {
    loader.loadExtension(
      config.path,
      config.entryPoint,
    );
  } catch (error) {
    if (config.mode === "prefer") {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load SQLite vector extension at ${config.path}: ${message}`,
    );
  }
}

export function resolveSQLiteCustomLibraryConfig(
  env: EnvironmentMap = process.env,
): SQLiteCustomLibraryConfig {
  return {
    customLibraryPath: normalizeNonEmpty(
      env.GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH,
    ),
  };
}

export function resolveSQLiteVectorExtensionConfig(
  env: EnvironmentMap = process.env,
): SQLiteVectorExtensionConfig {
  const extensionPath = normalizeNonEmpty(
    env.GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH,
  );
  const extensionEntryPoint = normalizeNonEmpty(
    env.GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT,
  );
  const mode = normalizeVectorMode(
    normalizeNonEmpty(env.GOODMEMORY_SQLITE_VECTOR_MODE),
    Boolean(extensionPath),
  );

  if (mode !== "off" && !extensionPath) {
    throw new Error(
      "GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH is required when GOODMEMORY_SQLITE_VECTOR_MODE is prefer or require.",
    );
  }

  return {
    mode,
    path: extensionPath,
    entryPoint: extensionEntryPoint,
  };
}
