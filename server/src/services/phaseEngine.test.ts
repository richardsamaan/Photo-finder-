import { test } from "node:test";
import assert from "node:assert/strict";
import { planNextPhase, requiredQueriesForPhase, effectivePhaseCompleted } from "./phaseEngine.js";

test("requiredQueriesForPhase: 1 / 2 / 4", () => {
  assert.equal(requiredQueriesForPhase(1), 1);
  assert.equal(requiredQueriesForPhase(2), 2);
  assert.equal(requiredQueriesForPhase(3), 4);
});

test("a brand-new job targets Phase 1 for every item", () => {
  const items = [
    { id: "a", status: "pending", searchPhase: 0 },
    { id: "b", status: "pending", searchPhase: 0 },
    { id: "c", status: "pending", searchPhase: 0 },
  ];
  const plan = planNextPhase(items);
  assert.equal(plan.done, false);
  assert.equal(plan.targetPhase, 1);
  assert.equal(plan.requiredQueries, 1);
  assert.deepEqual(new Set(plan.eligibleIds), new Set(["a", "b", "c"]));
});

test("does not advance to Phase 2 until every item has completed Phase 1", () => {
  const items = [
    { id: "a", status: "not_found", searchPhase: 1 },
    { id: "b", status: "not_found", searchPhase: 1 },
    { id: "c", status: "pending", searchPhase: 0 }, // still hasn't had its Phase 1 attempt
  ];
  const plan = planNextPhase(items);
  assert.equal(plan.targetPhase, 1);
  assert.deepEqual(plan.eligibleIds, ["c"]);
});

test("advances to Phase 2 once every item has completed Phase 1", () => {
  const items = [
    { id: "a", status: "not_found", searchPhase: 1 },
    { id: "b", status: "not_found", searchPhase: 1 },
  ];
  const plan = planNextPhase(items);
  assert.equal(plan.targetPhase, 2);
  assert.equal(plan.requiredQueries, 2);
  assert.deepEqual(new Set(plan.eligibleIds), new Set(["a", "b"]));
});

test("a resolved item (found in Phase 1) is treated as fully done and never re-queried", () => {
  const items = [
    { id: "a", status: "high_confidence", searchPhase: 1 }, // found on its very first attempt
    { id: "b", status: "not_found", searchPhase: 1 },
  ];
  const plan = planNextPhase(items);
  // "a" is resolved (effective phase 3) so it never blocks advancement and is
  // never included as eligible again.
  assert.equal(plan.targetPhase, 2);
  assert.deepEqual(plan.eligibleIds, ["b"]);
  assert.equal(effectivePhaseCompleted(items[0]), 3);
});

test("cascades straight to Phase 2 in the same run once Phase 1 is fully done (no waiting for a new day)", () => {
  // Every item already finished Phase 1 (some resolved, some still not_found) -
  // planNextPhase should immediately offer Phase 2 work, not report "done".
  const items = [
    { id: "a", status: "approved", searchPhase: 1 },
    { id: "b", status: "not_found", searchPhase: 1 },
    { id: "c", status: "not_found", searchPhase: 1 },
  ];
  const plan = planNextPhase(items);
  assert.equal(plan.done, false);
  assert.equal(plan.targetPhase, 2);
});

test("advances to Phase 3 only once every item has completed Phase 2", () => {
  const items = [
    { id: "a", status: "not_found", searchPhase: 2 },
    { id: "b", status: "not_found", searchPhase: 1 }, // straggler still on Phase 1
  ];
  let plan = planNextPhase(items);
  assert.equal(plan.targetPhase, 2);
  assert.deepEqual(plan.eligibleIds, ["b"]);

  const caughtUp = [
    { id: "a", status: "not_found", searchPhase: 2 },
    { id: "b", status: "not_found", searchPhase: 2 },
  ];
  plan = planNextPhase(caughtUp);
  assert.equal(plan.targetPhase, 3);
  assert.equal(plan.requiredQueries, 4);
});

test("job is done once every item is resolved or has exhausted Phase 3", () => {
  const items = [
    { id: "a", status: "approved", searchPhase: 2 },
    { id: "b", status: "not_found", searchPhase: 3 }, // exhausted every phase, still not found
  ];
  const plan = planNextPhase(items);
  assert.equal(plan.done, true);
  assert.equal(plan.targetPhase, null);
  assert.deepEqual(plan.eligibleIds, []);
});

test("an empty job is immediately done", () => {
  assert.deepEqual(planNextPhase([]), { done: true, targetPhase: null, requiredQueries: 0, eligibleIds: [] });
});
