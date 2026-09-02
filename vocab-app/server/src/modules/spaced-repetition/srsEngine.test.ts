import { test } from "node:test";
import assert from "node:assert/strict";
import { modifiedSm2Engine, isDue, overdueDays, nextReviewDate } from "./srsEngine.js";

test("a new word gets an initial state with no interval yet", () => {
  const state = modifiedSm2Engine.initialState();
  assert.equal(state.intervalDays, 0);
  assert.equal(state.repetitions, 0);
});

test("AGAIN produces a short interval and resets repetitions", () => {
  const learned = modifiedSm2Engine.scheduleNext(
    modifiedSm2Engine.scheduleNext(modifiedSm2Engine.initialState(), "good"),
    "good"
  );
  const afterAgain = modifiedSm2Engine.scheduleNext(learned, "again");
  assert.equal(afterAgain.intervalDays, 1);
  assert.equal(afterAgain.repetitions, 0);
  assert.ok(afterAgain.easeFactor < learned.easeFactor, "ease factor should drop after AGAIN");
});

test("HARD produces a shorter interval than GOOD from the same state", () => {
  const state = modifiedSm2Engine.scheduleNext(modifiedSm2Engine.initialState(), "good"); // rep 1 done, interval=1
  const afterHard = modifiedSm2Engine.scheduleNext(state, "hard");
  const afterGood = modifiedSm2Engine.scheduleNext(state, "good");
  assert.ok(afterHard.intervalDays < afterGood.intervalDays, `hard (${afterHard.intervalDays}) should be < good (${afterGood.intervalDays})`);
});

test("GOOD increases the interval across repetitions", () => {
  let state = modifiedSm2Engine.initialState();
  const intervals: number[] = [];
  for (let i = 0; i < 4; i++) {
    state = modifiedSm2Engine.scheduleNext(state, "good");
    intervals.push(state.intervalDays);
  }
  for (let i = 1; i < intervals.length; i++) {
    assert.ok(intervals[i] >= intervals[i - 1], `interval should not shrink on repeated GOOD: ${intervals}`);
  }
  assert.ok(intervals[intervals.length - 1] > intervals[0], "later intervals should be meaningfully longer");
});

test("EASY increases the interval substantially more than GOOD from the same state", () => {
  const state = modifiedSm2Engine.scheduleNext(modifiedSm2Engine.scheduleNext(modifiedSm2Engine.initialState(), "good"), "good");
  const afterGood = modifiedSm2Engine.scheduleNext(state, "good");
  const afterEasy = modifiedSm2Engine.scheduleNext(state, "easy");
  assert.ok(afterEasy.intervalDays > afterGood.intervalDays, `easy (${afterEasy.intervalDays}) should be > good (${afterGood.intervalDays})`);
});

test("repeated successful reviews increase spacing (ease factor compounds over time)", () => {
  let state = modifiedSm2Engine.initialState();
  for (let i = 0; i < 3; i++) state = modifiedSm2Engine.scheduleNext(state, "easy");
  assert.ok(state.easeFactor > 2.5, "ease factor should climb above the initial value with repeated EASY");

  let intervalAtHighEase = state.intervalDays;
  let lowEaseState = { ...state, easeFactor: 1.3 };
  const nextHighEase = modifiedSm2Engine.scheduleNext(state, "good").intervalDays;
  const nextLowEase = modifiedSm2Engine.scheduleNext(lowEaseState, "good").intervalDays;
  assert.ok(nextHighEase >= nextLowEase, "a higher ease factor should produce equal or longer spacing");
  void intervalAtHighEase;
});

test("isDue treats a word with no scheduled review as due (a brand-new word)", () => {
  assert.equal(isDue(null, new Date()), true);
});

test("isDue and overdueDays correctly detect an overdue word", () => {
  const now = new Date("2026-03-10T00:00:00Z");
  assert.equal(isDue("2026-03-01T00:00:00Z", now), true);
  assert.equal(overdueDays("2026-03-01T00:00:00Z", now), 9);
});

test("a word not yet due is not due, and has zero overdue days", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  assert.equal(isDue("2026-03-10T00:00:00Z", now), false);
  assert.equal(overdueDays("2026-03-10T00:00:00Z", now), 0);
});

test("nextReviewDate adds the interval in whole days", () => {
  const from = new Date("2026-01-01T12:00:00Z");
  const next = nextReviewDate(5, from);
  assert.equal(next.toISOString().slice(0, 10), "2026-01-06");
});
