import { describe, expect, it } from "bun:test";
import * as taskModule from "../src/tasks";

const cases = [
  {
    "args": [
      "true"
    ],
    "expected": {
      "ok": true,
      "value": true
    },
    "functionName": "parseBooleanSetting",
    "taskId": "parse-boolean-result"
  },
  {
    "args": [
      "-7"
    ],
    "expected": {
      "ok": true,
      "value": -7
    },
    "functionName": "parseIntegerSetting",
    "taskId": "parse-integer-result"
  },
  {
    "args": [
      "relay"
    ],
    "expected": {
      "ok": true,
      "value": "relay"
    },
    "functionName": "parseModeSetting",
    "taskId": "parse-mode-result"
  },
  {
    "args": [
      0
    ],
    "expected": 0,
    "functionName": "timeoutToMs",
    "taskId": "convert-timeout-seconds"
  },
  {
    "args": [
      {
        "initialSeconds": 0,
        "maxSeconds": 0
      }
    ],
    "expected": {
      "initialMs": 0,
      "maxMs": 0
    },
    "functionName": "scheduleToMs",
    "taskId": "convert-schedule-seconds"
  },
  {
    "args": [
      5000,
      0
    ],
    "expected": 5000,
    "functionName": "deadlineFromConfig",
    "taskId": "compute-deadline-seconds"
  },
  {
    "args": [
      "Hello World"
    ],
    "expected": "hello-world",
    "functionName": "slugify",
    "taskId": "normalize-slug"
  },
  {
    "args": [
      "a,b"
    ],
    "expected": [
      "a",
      "b"
    ],
    "functionName": "parseCsvUnique",
    "taskId": "dedupe-csv-values"
  },
  {
    "args": [
      "read me"
    ],
    "expected": "read%20me",
    "functionName": "encodePathSegment",
    "taskId": "encode-path-segment"
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
