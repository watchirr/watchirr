import assert from "node:assert/strict";
import { test } from "node:test";
import { dismissToast, pushToast, TOAST_STACK_MAX, type ToastEntry } from "./toast.ts";

function toast(id: string): ToastEntry {
  return { id, type: "success", message: id };
}

test("push keeps at most two toasts", () => {
  const a = toast("a");
  const b = toast("b");
  const c = toast("c");
  const one = pushToast([], a);
  assert.deepEqual(one, [a]);
  const two = pushToast(one, b);
  assert.deepEqual(two, [a, b]);
  assert.equal(two.length, TOAST_STACK_MAX);
  const three = pushToast(two, c);
  assert.deepEqual(three, [b, c]);
  assert.equal(three.length, TOAST_STACK_MAX);
});

test("push onto a full stack drops the oldest", () => {
  const stack = [toast("oldest"), toast("newer")];
  const next = pushToast(stack, toast("newest"));
  assert.deepEqual(
    next.map((t) => t.id),
    ["newer", "newest"],
  );
});

test("dismiss by id removes one entry and leaves the rest", () => {
  const a = toast("a");
  const b = toast("b");
  assert.deepEqual(dismissToast([a, b], "a"), [b]);
  assert.deepEqual(dismissToast([a, b], "b"), [a]);
  assert.deepEqual(dismissToast([a, b], "missing"), [a, b]);
  assert.deepEqual(dismissToast([], "a"), []);
});
