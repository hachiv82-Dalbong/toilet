import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCollapsed, startsDrag } from "../web/js/sheet.js";

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

const target = (inControl) => ({ closest: () => (inControl ? {} : null) });
const handle = { contains: (t) => t === onHandle };
const onHandle = target(true);

test("drag starts on the handle even though it is a button", () => {
  assert.equal(startsDrag(onHandle, handle, false), true);
});

test("drag starts on empty parts of the card", () => {
  assert.equal(startsDrag(target(false), handle, false), true);
});

test("links and buttons on the card stay tappable", () => {
  assert.equal(startsDrag(target(true), handle, false), false);
});

test("a scrollable card scrolls instead of dragging, except from the handle", () => {
  assert.equal(startsDrag(target(false), handle, true), false);
  assert.equal(startsDrag(onHandle, handle, true), true);
});
