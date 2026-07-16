import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const FIRST_PROBE_PORT = 20_000;
const LAST_PROBE_PORT = 59_999;

export async function withLoopbackNetworkProbe<T>(
  run: (url: string) => Promise<T>,
): Promise<T> {
  const server = await startLoopbackServer();
  try {
    const address = server.address() as AddressInfo | null;
    if (address === null) {
      throw new Error("loopback network probe server has no address");
    }
    return await run(`http://127.0.0.1:${address.port}/`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve();
          return;
        }
        reject(error);
      });
    });
  }
}

async function startLoopbackServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        "Connection": "close",
        "Content-Type": "text/plain",
      });
      response.end("reachable");
    });
    try {
      await listen(server, allocateProbePort());
      return server;
    } catch (error) {
      if (!hasErrorCode(error, "EADDRINUSE")) {
        throw error;
      }
    }
  }
  throw new Error("unable to allocate a loopback network probe port");
}

async function listen(
  server: ReturnType<typeof createServer>,
  port: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      server.off("listening", ready);
      reject(error);
    };
    const ready = () => {
      server.off("error", fail);
      resolve();
    };
    server.once("error", fail);
    server.once("listening", ready);
    server.listen(port, "127.0.0.1");
  });
}

function allocateProbePort(): number {
  return randomInt(FIRST_PROBE_PORT, LAST_PROBE_PORT + 1);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
