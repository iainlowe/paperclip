import { describe, expect, it, vi } from "vitest";
import { settleSuccessfulRunIssueLifecycle } from "./successful-run-terminal-settlement.js";

describe("settleSuccessfulRunIssueLifecycle", () => {
  it("persists recovery before releasing a successful issue execution", async () => {
    const order: string[] = [];

    await settleSuccessfulRunIssueLifecycle({
      conversationSettled: false,
      establishRunLivenessContinuation: async () => { order.push("liveness"); },
      establishReviewPathDisposition: async () => { order.push("review"); },
      establishSuccessfulRunHandoff: async () => { order.push("handoff"); },
      releaseIssueExecution: async () => { order.push("release"); },
    });

    expect(order).toEqual(["liveness", "review", "handoff", "release"]);
  });

  it("does not release the issue when recovery persistence fails", async () => {
    const releaseIssueExecution = vi.fn(async () => undefined);

    await expect(settleSuccessfulRunIssueLifecycle({
      conversationSettled: false,
      establishRunLivenessContinuation: async () => undefined,
      establishReviewPathDisposition: async () => undefined,
      establishSuccessfulRunHandoff: async () => {
        throw new Error("persistence unavailable");
      },
      releaseIssueExecution,
    })).rejects.toThrow("persistence unavailable");

    expect(releaseIssueExecution).not.toHaveBeenCalled();
  });

  it("releases settled conversation runs without issue recovery", async () => {
    const establishSuccessfulRunHandoff = vi.fn(async () => undefined);
    const releaseIssueExecution = vi.fn(async () => undefined);

    await settleSuccessfulRunIssueLifecycle({
      conversationSettled: true,
      establishRunLivenessContinuation: async () => undefined,
      establishReviewPathDisposition: async () => undefined,
      establishSuccessfulRunHandoff,
      releaseIssueExecution,
    });

    expect(establishSuccessfulRunHandoff).not.toHaveBeenCalled();
    expect(releaseIssueExecution).toHaveBeenCalledOnce();
  });
});
