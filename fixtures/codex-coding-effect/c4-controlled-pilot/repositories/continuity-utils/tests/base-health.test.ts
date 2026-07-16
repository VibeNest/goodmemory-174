import { describe, expect, it } from "bun:test";
import * as taskModule from "../src/tasks";

const cases = [
  {
    "args": [
      "localhost"
    ],
    "expected": "localhost",
    "functionName": "renderHostDisplay",
    "taskId": "render-host-display"
  },
  {
    "args": [
      "localhost",
      3000
    ],
    "expected": "localhost:3000",
    "functionName": "renderEndpointDisplay",
    "taskId": "render-endpoint-display"
  },
  {
    "args": [
      "local",
      "localhost",
      3000
    ],
    "expected": "local localhost:3000",
    "functionName": "renderTargetDisplay",
    "taskId": "render-target-display"
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
    "taskId": "split-assignment"
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
    "taskId": "split-header"
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
    "taskId": "split-route"
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
    "taskId": "parse-csv-fields"
  },
  {
    "args": [
      "west|east"
    ],
    "expected": [
      "west",
      "east"
    ],
    "functionName": "parsePipeFields",
    "taskId": "parse-pipe-fields"
  },
  {
    "args": [
      "west;east"
    ],
    "expected": [
      "west",
      "east"
    ],
    "functionName": "parseSemicolonFields",
    "taskId": "parse-semicolon-fields"
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
