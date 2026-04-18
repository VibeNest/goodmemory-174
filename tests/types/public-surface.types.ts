// @ts-expect-error Root barrel no longer exports raw repository assembly types.
type RootMemoryRepositories = import("../../src").MemoryRepositories;

// @ts-expect-error Root barrel no longer exports raw repository assembly config.
type RootMemoryRepositoriesConfig = import("../../src").MemoryRepositoriesConfig;

// @ts-expect-error Root barrel no longer exports raw repository assembly.
type RootCreateMemoryRepositories = typeof import("../../src").createMemoryRepositories;

// @ts-expect-error Root barrel no longer exports direct recall-engine assembly.
type RootCreateRecallEngine = typeof import("../../src").createRecallEngine;

// @ts-expect-error Root barrel no longer exports direct remember-engine assembly.
type RootCreateRememberEngine = typeof import("../../src").createRememberEngine;

// @ts-expect-error Root barrel no longer exports direct recall-engine config.
type RootRecallEngineConfig = import("../../src").RecallEngineConfig;

// @ts-expect-error Root barrel no longer exports internal recall-engine results.
type RootInternalRecallResult = import("../../src").InternalRecallResult;

void (0 as unknown as RootMemoryRepositories);
void (0 as unknown as RootMemoryRepositoriesConfig);
void (0 as unknown as RootCreateMemoryRepositories);
void (0 as unknown as RootCreateRecallEngine);
void (0 as unknown as RootCreateRememberEngine);
void (0 as unknown as RootRecallEngineConfig);
void (0 as unknown as RootInternalRecallResult);
