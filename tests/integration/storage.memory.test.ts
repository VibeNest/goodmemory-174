import { describe, expect, it } from "bun:test";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import {
  runDocumentStoreContract,
  runSessionStoreContract,
  runVectorStoreContract,
} from "./storage.contract";

runDocumentStoreContract("in-memory document store contract", () => ({
  store: createInMemoryDocumentStore(),
}));

runSessionStoreContract("in-memory session store contract", () => ({
  store: createInMemorySessionStore(),
}));

runVectorStoreContract("in-memory vector store contract", () => ({
  store: createInMemoryVectorStore(),
}));
