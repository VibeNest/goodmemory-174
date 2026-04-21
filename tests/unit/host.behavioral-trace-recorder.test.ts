import { describe, expect, it } from "bun:test";
import { createHostBehavioralTraceRecorder } from "../../src/host/behavioralTraceRecorder";

describe("host behavioral trace recorder", () => {
  it("auto-orders runtime events and memoizes close results", async () => {
    const recorder = createHostBehavioralTraceRecorder({
      cue: "detailed analysis",
      hostKind: "codex",
      traceId: "trace-runtime-1",
      onClose: async () => ({
        recorded: true,
      }),
    });

    const first = recorder.appendEvent({
      actionKind: "tool_call",
      actionName: "DeepAnalyzer",
      raw: "DeepAnalyzer --detailed",
      outcome: "timeout",
    });
    const second = recorder.appendEvent({
      actionKind: "tool_call",
      actionName: "QuickCheck",
      raw: "QuickCheck --network",
      correctionOfStepIndex: 0,
      outcome: "success",
    });

    expect(first.stepIndex).toBe(0);
    expect(second.stepIndex).toBe(1);
    expect(recorder.snapshot()?.events.map((event) => event.stepIndex)).toEqual([0, 1]);

    const closed = await recorder.close();
    const closedAgain = await recorder.close();

    expect(closed.recorded).toBe(true);
    expect(closed.trace?.traceId).toBe("trace-runtime-1");
    expect(closedAgain).toEqual(closed);
  });

  it("degrades to not-recorded when no events were captured", async () => {
    const emptyRecorder = createHostBehavioralTraceRecorder({
      cue: "empty",
      hostKind: "codex",
      traceId: "trace-empty",
    });

    await expect(emptyRecorder.close()).resolves.toEqual({
      recorded: false,
      trace: null,
    });
  });

  it("degrades to not-recorded when the telemetry sink fails and still seals the recorder", async () => {
    let closeAttempts = 0;

    const recorder = createHostBehavioralTraceRecorder({
      cue: "safe cleanup",
      hostKind: "codex",
      traceId: "trace-runtime-2",
      onClose: async () => {
        closeAttempts += 1;
        throw new Error("telemetry backend unavailable");
      },
    });
    recorder.appendEvent({
      actionKind: "command",
      actionName: "rm",
      raw: "rm -rf /tmp/build",
      outcome: "user_corrected",
    });

    const closed = await recorder.close();
    const closedAgain = await recorder.close();

    expect(closeAttempts).toBe(1);
    expect(closed.recorded).toBe(false);
    expect(closed.trace?.traceId).toBe("trace-runtime-2");
    expect(closed.error?.message).toBe("telemetry backend unavailable");
    expect(closedAgain).toEqual(closed);

    expect(() =>
      recorder.appendEvent({
        actionKind: "command",
        actionName: "safe_delete",
        raw: "safe_delete('/tmp/build')",
        correctionOfStepIndex: 0,
        outcome: "success",
      }),
    ).toThrow("behavioral trace recorder is already closed");
  });
});
