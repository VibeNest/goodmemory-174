import { SQL } from "bun";
import { describe, it } from "bun:test";
import {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "../../src/storage/postgres";
import {
  runDocumentStoreContract,
  runSessionStoreContract,
  runVectorStoreContract,
} from "./storage.contract";

const POSTGRES_URL = process.env.GOODMEMORY_TEST_POSTGRES_URL;

function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

function createSchemaName(prefix: string): string {
  return `gm_test_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function dropSchema(url: string, schema: string): Promise<void> {
  const sql = new SQL(url);

  try {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
  } finally {
    await sql.close();
  }
}

if (POSTGRES_URL) {
  runDocumentStoreContract("postgres document store contract", async () => {
    const schema = createSchemaName("document");

    return {
      store: createPostgresDocumentStore({
        url: POSTGRES_URL,
        schema,
      }),
      cleanup: () => dropSchema(POSTGRES_URL, schema),
    };
  });

  runSessionStoreContract("postgres session store contract", async () => {
    const schema = createSchemaName("session");

    return {
      store: createPostgresSessionStore({
        url: POSTGRES_URL,
        schema,
      }),
      cleanup: () => dropSchema(POSTGRES_URL, schema),
    };
  });

  runVectorStoreContract("postgres vector store contract", async () => {
    const schema = createSchemaName("vector");

    return {
      store: createPostgresVectorStore({
        url: POSTGRES_URL,
        schema,
      }),
      cleanup: () => dropSchema(POSTGRES_URL, schema),
    };
  }, 15_000);
} else {
  describe.skip("postgres storage contracts", () => {
    it("requires GOODMEMORY_TEST_POSTGRES_URL", () => {});
  });
}
