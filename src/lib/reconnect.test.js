import assert from "node:assert/strict";
import test from "node:test";
import {
  READY_WAIT_MS,
  RECONNECT_MAX_MS,
  RECONNECT_MIN_MS,
  createReconnectController,
  nextReconnectDelay,
} from "./reconnect.js";

function fakeClock() {
  const timers = [];
  let nextId = 1;
  return {
    timers,
    setTimeoutFn(fn, ms) {
      const id = nextId++;
      timers.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearTimeoutFn(id) {
      const timer = timers.find((item) => item.id === id);
      if (timer) timer.cleared = true;
    },
    pending() {
      return timers.filter((timer) => !timer.cleared);
    },
    async fire(id) {
      const timer = timers.find((item) => item.id === id && !item.cleared);
      assert.ok(timer, `timer ${id} is not pending`);
      timer.cleared = true;
      await timer.fn();
    },
  };
}

test("backoff doubles from 1s and caps at 30s", () => {
  assert.equal(nextReconnectDelay(0), 1_000);
  assert.equal(nextReconnectDelay(1), 2_000);
  assert.equal(nextReconnectDelay(2), 4_000);
  assert.equal(nextReconnectDelay(5), 30_000);
  assert.equal(nextReconnectDelay(20), RECONNECT_MAX_MS);
  assert.equal(RECONNECT_MIN_MS, 1_000);
  assert.equal(READY_WAIT_MS, 12_000);
});

test("schedule waits, connect() runs, markReady resets the attempt", async () => {
  const clock = fakeClock();
  let connects = 0;
  const statuses = [];
  const ctrl = createReconnectController({
    connect: async () => {
      connects += 1;
      return true;
    },
    onStatus: (status) => statuses.push(status),
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  assert.equal(ctrl.schedule("not_ready"), true);
  assert.equal(ctrl.phase, "waiting");
  assert.equal(clock.pending()[0].ms, RECONNECT_MIN_MS);
  assert.equal(ctrl.schedule("not_ready"), false);

  await clock.fire(clock.pending()[0].id);
  assert.equal(connects, 1);
  assert.equal(ctrl.phase, "connecting");
  assert.equal(ctrl.inFlight, true);

  ctrl.markReady();
  assert.equal(ctrl.phase, "idle");
  assert.equal(ctrl.attempt, 0);
  assert.equal(ctrl.inFlight, false);
  assert.ok(statuses.some((status) => status.reason === "not_ready"));
});

test("failed connect increases delay; stop cancels a pending retry", async () => {
  const clock = fakeClock();
  const ctrl = createReconnectController({
    connect: async () => false,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  ctrl.schedule("offline");
  await clock.fire(clock.pending()[0].id);
  assert.equal(ctrl.attempt, 1);
  assert.equal(ctrl.phase, "waiting");
  assert.equal(clock.pending()[0].ms, 2_000);

  ctrl.stop();
  assert.equal(ctrl.stopped, true);
  assert.equal(ctrl.schedule("offline"), false);
  assert.ok(clock.pending().every((timer) => timer.cleared));
});

test("flush skips the wait; markFatal refuses later schedules", async () => {
  const clock = fakeClock();
  let connects = 0;
  const ctrl = createReconnectController({
    connect: async () => {
      connects += 1;
      return true;
    },
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    readyWaitMs: 0,
  });

  assert.equal(ctrl.flush(), false);
  ctrl.schedule("not_ready");
  assert.equal(ctrl.flush(), true);
  await Promise.resolve();
  assert.equal(connects, 1);

  ctrl.markFatal();
  assert.equal(ctrl.stopped, true);
  assert.equal(ctrl.schedule("not_ready"), false);
});

test("ready timeout counts as a failed attempt and reschedules", async () => {
  const clock = fakeClock();
  const ctrl = createReconnectController({
    connect: async () => true,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    readyWaitMs: 50,
  });

  ctrl.schedule("not_ready");
  await clock.fire(clock.pending()[0].id);
  const readyWait = clock.pending().find((timer) => timer.ms === 50);
  assert.ok(readyWait);
  await clock.fire(readyWait.id);
  assert.equal(ctrl.attempt, 1);
  assert.equal(ctrl.phase, "waiting");
});
