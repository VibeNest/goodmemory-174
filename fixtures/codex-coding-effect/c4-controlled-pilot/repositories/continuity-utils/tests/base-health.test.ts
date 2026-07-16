import { describe, expect, it } from "bun:test";
import * as taskModule from "../src/tasks";

const cases = [
  {
    "args": [
      "api.internal"
    ],
    "expected": "api.internal",
    "functionName": "normalizeHost",
    "taskId": "normalize-host-boundary"
  },
  {
    "args": [
      "8080"
    ],
    "expected": 8080,
    "functionName": "parsePort",
    "taskId": "parse-strict-port"
  },
  {
    "args": [
      "localhost",
      3000
    ],
    "expected": "localhost:3000",
    "functionName": "formatEndpoint",
    "taskId": "format-ipv6-endpoint"
  },
  {
    "args": [
      "key=value"
    ],
    "expected": [
      "key",
      "value"
    ],
    "functionName": "splitAssignment",
    "taskId": "split-assignment-tail"
  },
  {
    "args": [
      "key:value"
    ],
    "expected": [
      "key",
      "value"
    ],
    "functionName": "splitHeader",
    "taskId": "split-header-tail"
  },
  {
    "args": [
      "key->value"
    ],
    "expected": [
      "key",
      "value"
    ],
    "functionName": "splitRoute",
    "taskId": "split-route-tail"
  },
  {
    "args": [
      "mode=fast # local"
    ],
    "expected": "mode=fast",
    "functionName": "stripConfigComment",
    "taskId": "strip-quoted-comment"
  },
  {
    "args": [
      "build --clean"
    ],
    "expected": [
      "build",
      "--clean"
    ],
    "functionName": "tokenizeCommand",
    "taskId": "tokenize-quoted-command"
  },
  {
    "args": [
      "a, b"
    ],
    "expected": [
      "a",
      "b"
    ],
    "functionName": "parseCsvFields",
    "taskId": "parse-quoted-csv"
  }
] as const;

describe("visible base health", () => {
  for (const testCase of cases) {
    it(testCase.taskId, () => {
      const candidate = taskModule[testCase.functionName as keyof typeof taskModule];
      if (typeof candidate !== "function") {
        throw new Error(`missing function ${testCase.functionName}`);
      }
      const actual = Reflect.apply(candidate, undefined, [...testCase.args]);
      expect(actual).toEqual(testCase.expected);
    });
  }
});
