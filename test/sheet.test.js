import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCollapsed, startsDrag, clickAction, sheetOffset } from "../web/js/sheet.js";

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

test("drag can start on links and buttons too, the whole card is the drag area", () => {
  assert.equal(startsDrag(target(true), handle, false), true);
});

test("tapping never opens or closes the card, it has to be dragged", () => {
  for (const onHandle of [true, false]) {
    assert.equal(clickAction({ dragged: false, onHandle, keyboard: false }), null);
  }
});

test("the keyboard can still toggle from the handle", () => {
  assert.equal(clickAction({ dragged: false, onHandle: true, keyboard: true }), "toggle");
  assert.equal(clickAction({ dragged: false, onHandle: false, keyboard: true }), null);
});

test("the click that ends a drag does nothing", () => {
  assert.equal(clickAction({ dragged: true, onHandle: true, keyboard: false }), null);
});

test("a scrollable card scrolls instead of dragging, except from the handle", () => {
  assert.equal(startsDrag(target(false), handle, true), false);
  assert.equal(startsDrag(onHandle, handle, true), true);
});

const H = { height: 336, peek: 120 }; // 접으면 216px 내려가서 120px만 보인다

test("expanded card sits at the top, collapsed card leaves only the peek visible", () => {
  assert.equal(sheetOffset({ ...H, collapsed: false, dragY: 0 }), 0);
  assert.equal(sheetOffset({ ...H, collapsed: true, dragY: 0 }), 216);
});

test("card follows the finger while dragging, in both directions", () => {
  assert.equal(sheetOffset({ ...H, collapsed: false, dragY: 50 }), 50);
  assert.equal(sheetOffset({ ...H, collapsed: true, dragY: -50 }), 166);
});

test("card cannot be dragged past fully open or fully collapsed", () => {
  assert.equal(sheetOffset({ ...H, collapsed: false, dragY: -50 }), 0);
  assert.equal(sheetOffset({ ...H, collapsed: true, dragY: 50 }), 216);
});

test("a card shorter than the peek does not move", () => {
  assert.equal(sheetOffset({ height: 80, peek: 120, collapsed: true, dragY: 0 }), 0);
});
