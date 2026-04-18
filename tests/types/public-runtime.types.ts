import {
  createInMemorySessionStore,
  createRuntimeContextService,
} from "../../src";
import type {
  RuntimeContextServiceConfig,
} from "../../src";

const sessionStore = createInMemorySessionStore();

const publicRuntimeConfig: RuntimeContextServiceConfig = {
  sessionStore,
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
