import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../../src";
import type {
  RuntimeArchiveStore,
  RuntimeContextServiceConfig,
} from "../../src";

const documentStore = createInMemoryDocumentStore();
const sessionStore = createInMemorySessionStore();
const archiveStore: RuntimeArchiveStore = createRuntimeArchiveStore({
  documentStore,
});

const publicRuntimeConfig: RuntimeContextServiceConfig = {
  sessionStore,
  archiveStore,
};

void publicRuntimeConfig;
void createRuntimeContextService(publicRuntimeConfig);

const invalidPublicRuntimeConfig: RuntimeContextServiceConfig = {
  sessionStore,
  // @ts-expect-error Root runtime config must not expose internal salvage hooks.
  salvageHooks: {},
};

void invalidPublicRuntimeConfig;

// @ts-expect-error Root barrel must not export internal runtime salvage hook types.
type RootRuntimeSalvageHooks = import("../../src").RuntimeSalvageHooks;

void (0 as unknown as RootRuntimeSalvageHooks);
