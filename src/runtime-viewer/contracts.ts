import type { GoodMemory } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type { InstalledHostKind } from "../install/hostInstall";

export type RuntimeViewerBindHost = "127.0.0.1";

export interface RuntimeViewerApp {
  fetch(request: Request): Promise<Response>;
  token: string;
}

export interface CreateRuntimeViewerAppInput {
  bindHost?: string;
  memory: Pick<GoodMemory, "exportMemory" | "recall">;
  now?: () => Date;
  scope: MemoryScope;
  token?: string;
  webRoot?: string;
}

export interface CreateInstalledHostRuntimeViewerAppInput {
  bindHost?: string;
  cwd?: string;
  homeRoot?: string;
  host: InstalledHostKind;
  port?: number;
  queueFile?: string;
  token?: string;
}

export interface RuntimeViewerServerHandle {
  bindHost: RuntimeViewerBindHost;
  port: number;
  stop(): void;
  token: string;
  url: string;
}
