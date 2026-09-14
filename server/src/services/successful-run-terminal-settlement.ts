export async function settleSuccessfulRunIssueLifecycle(input: {
  conversationSettled: boolean;
  establishRunLivenessContinuation: () => Promise<void>;
  establishReviewPathDisposition: () => Promise<void>;
  establishSuccessfulRunHandoff: () => Promise<void>;
  releaseIssueExecution: () => Promise<void>;
}) {
  if (!input.conversationSettled) {
    await input.establishRunLivenessContinuation();
    await input.establishReviewPathDisposition();
    await input.establishSuccessfulRunHandoff();
  }
  await input.releaseIssueExecution();
}
