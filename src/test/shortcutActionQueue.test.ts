import assert from "node:assert/strict";
import test from "node:test";
import { ShortcutActionQueue } from "../panel/shortcutActionQueue";

test("ShortcutActionQueue flushes commands issued before a reopened webview is ready", () => {
  const sent: string[] = [];
  const queue = new ShortcutActionQueue((action) => sent.push(action));

  queue.dispatch("openSearch");
  assert.deepEqual(sent, []);

  queue.markReady();
  assert.deepEqual(sent, ["openSearch"]);

  queue.dispatch("copy");
  assert.deepEqual(sent, ["openSearch", "copy"]);
});

test("ShortcutActionQueue only flushes pending commands once", () => {
  const sent: string[] = [];
  const queue = new ShortcutActionQueue((action) => sent.push(action));

  queue.dispatch("openSearch");
  queue.markReady();
  queue.markReady();

  assert.deepEqual(sent, ["openSearch"]);
});
