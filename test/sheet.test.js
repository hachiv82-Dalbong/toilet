import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCollapsed } from "../web/js/sheet.js";

test("dragging down collapses the sheet", () => {
  assert.equal(nextCollapsed(false, 60), true);
});

test("dragging up expands the sheet", () => {
  assert.equal(nextCollapsed(true, -60), false);
});

test("a short drag keeps the current state", () => {
  assert.equal(nextCollapsed(false, 10), false);
  assert.equal(nextCollapsed(true, -10), true);
});

test("dragging further in the same direction keeps the state", () => {
  assert.equal(nextCollapsed(true, 80), true);
  assert.equal(nextCollapsed(false, -80), false);
});
