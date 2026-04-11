import type {
  DeleteAllMemoryInput,
  ExportMemoryInput,
  GoodMemory,
  RecallInput,
} from "../../src";

declare const memory: GoodMemory;

const exportInput: ExportMemoryInput = {
  scope: { userId: "user-1" },
};

const deleteInput: DeleteAllMemoryInput = {
  scope: { userId: "user-1" },
};

const recallInput: RecallInput = {
  scope: { userId: "user-1" },
  query: "answer the user",
  ignoreMemory: true,
  strategy: "hybrid",
};

void memory.exportMemory(exportInput);
void memory.deleteAllMemory(deleteInput);
void memory.recall(recallInput);

async function assertGovernanceShapes() {
  const exported = await memory.exportMemory(exportInput);
  const deleted = await memory.deleteAllMemory(deleteInput);

  void exported.durable.archives;
  void exported.durable.evidence;
  void exported.durable.experiences;
  void exported.artifacts.rootPath;
  void exported.artifacts.files[0]?.relativePath;
  void deleted.deleted.archives;
  void deleted.deleted.evidence;
  void deleted.deleted.experiences;
}

void assertGovernanceShapes();
