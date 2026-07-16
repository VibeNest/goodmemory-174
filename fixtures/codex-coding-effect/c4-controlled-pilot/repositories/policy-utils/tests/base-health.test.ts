import { describe, expect, it } from "bun:test";
import * as taskModule from "../src/tasks";

const cases = [
  {
    "args": [
      "buffered"
    ],
    "expected": {
      "ok": true,
      "value": "buffered"
    },
    "functionName": "parseModeSetting",
    "taskId": "parse-mode-setting"
  },
  {
    "args": [
      "info"
    ],
    "expected": {
      "ok": true,
      "value": "info"
    },
    "functionName": "parseLogLevelSetting",
    "taskId": "parse-log-level-setting"
  },
  {
    "args": [
      "yaml"
    ],
    "expected": {
      "ok": true,
      "value": "yaml"
    },
    "functionName": "parseOutputFormatSetting",
    "taskId": "parse-output-format-setting"
  },
  {
    "args": [
      {
        "graceMs": 250,
        "timeout": 0
      }
    ],
    "expected": {
      "graceMs": 250,
      "timeoutMs": 0
    },
    "functionName": "resolveTimeoutConfig",
    "taskId": "resolve-timeout-config"
  },
  {
    "args": [
      {
        "capMs": 250,
        "initial": 0
      }
    ],
    "expected": {
      "capMs": 250,
      "initialMs": 0
    },
    "functionName": "resolveRetryConfig",
    "taskId": "resolve-retry-config"
  },
  {
    "args": [
      {
        "skewMs": 25,
        "startMs": 5000,
        "timeout": 0
      }
    ],
    "expected": 5025,
    "functionName": "deadlineFromConfig",
    "taskId": "compute-config-deadline"
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
      "guide name"
    ],
    "expected": "guide%20name",
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
