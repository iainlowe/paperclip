import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  decideAccess: vi.fn(),
  canReadDecisionSource: vi.fn(),
}));

vi.mock("../services/decisions.js", () => ({ decisionService: () => ({ list: mocks.list }) }));
vi.mock("../services/authorization.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/authorization.js")>();
  return { ...actual, authorizationService: () => ({ decide: mocks.decideAccess }) };
});
vi.mock("../services/decision-queues.js", () => ({ canReadDecisionSource: mocks.canReadDecisionSource }));

import { decisionRoutes } from "../routes/decisions.js";

describe("decision routes", () => {
  const companyId = randomUUID();
  const agentId = randomUUID();
  const runId = randomUUID();

  function app(actor: Record<string, unknown>) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use((req, _res, next) => {
      (req as typeof req & { actor: Record<string, unknown> }).actor = actor;
      next();
    });
    testApp.use("/api", decisionRoutes({} as never, { wakeOriginAgent: async () => {} }));
    testApp.use(errorHandler);
    return testApp;
  }

  beforeEach(() => {
    mocks.list.mockReset();
    mocks.decideAccess.mockReset();
    mocks.canReadDecisionSource.mockReset();
    mocks.decideAccess.mockResolvedValue({
      allowed: true,
      action: "decision_queue:read",
      reason: "allow_company_agent",
      explanation: "Allowed by standard same-company agent visibility.",
    });
  });

  it("returns an authorized, source-scoped open-decision snapshot to an agent", async () => {
    const visible = { id: randomUUID(), companyId, title: "Visible", status: "open" };
    const hidden = { id: randomUUID(), companyId, title: "Hidden", status: "open" };
    mocks.list.mockResolvedValue([visible, hidden]);
    mocks.canReadDecisionSource.mockImplementation(async (
      _db: unknown,
      _actor: unknown,
      _companyId: string,
      _sourceKind: string,
      sourceId: string,
    ) => sourceId === visible.id);

    const response = await request(app({
      type: "agent",
      source: "agent_jwt",
      companyId,
      agentId,
      runId,
      keyScope: { kind: "standard" },
    })).get(`/api/companies/${companyId}/decisions?status=open&limit=100`).expect(200);

    expect(response.body).toEqual([visible]);
    expect(mocks.decideAccess).toHaveBeenCalledWith({
      actor: expect.objectContaining({ type: "agent", agentId }),
      action: "decision_queue:read",
      resource: { type: "company", companyId },
    });
    expect(mocks.canReadDecisionSource).toHaveBeenCalledTimes(2);
  });

  it("keeps authorization denial explicit instead of returning an unscoped snapshot", async () => {
    mocks.decideAccess.mockResolvedValue({
      allowed: false,
      action: "decision_queue:read",
      reason: "deny_low_trust_boundary",
      explanation: "Decision snapshot access is not allowed.",
    });

    const response = await request(app({
      type: "agent",
      source: "agent_jwt",
      companyId,
      agentId,
      runId,
      keyScope: { kind: "review", issueId: randomUUID() },
    })).get(`/api/companies/${companyId}/decisions?status=open`).expect(403);

    expect(response.body.error).toBe("Decision snapshot access is not allowed.");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
