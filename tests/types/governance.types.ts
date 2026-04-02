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
};

void memory.exportMemory(exportInput);
void memory.deleteAllMemory(deleteInput);
void memory.recall(recallInput);
