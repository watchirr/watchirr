import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLocale } from "./locale.ts";

test("saved Settings pick wins over browser language", () => {
  assert.equal(resolveLocale("en-US", "pt-BR"), "en-US");
  assert.equal(resolveLocale("pt-BR", "en-US,en;q=0.9"), "pt-BR");
});

test("unsupported saved pick falls through to browser, then en-US", () => {
  assert.equal(resolveLocale("fr-FR", "pt-BR"), "pt-BR");
  assert.equal(resolveLocale("nope", "de,fr;q=0.8"), "en-US");
  assert.equal(resolveLocale(null, null), "en-US");
  assert.equal(resolveLocale("", ""), "en-US");
});

test("supported browser language selects Locale", () => {
  assert.equal(resolveLocale(null, "pt-BR"), "pt-BR");
  assert.equal(resolveLocale(null, "pt"), "pt-BR");
  assert.equal(resolveLocale(null, "pt-PT,pt;q=0.9"), "pt-BR");
  assert.equal(resolveLocale(null, "en-GB,en;q=0.8"), "en-US");
  assert.equal(resolveLocale(null, "en-US,en;q=0.9"), "en-US");
});

test("Accept-Language q-values pick the best supported tag", () => {
  assert.equal(resolveLocale(null, "fr;q=1, pt-BR;q=0.8"), "pt-BR");
  assert.equal(resolveLocale(null, "en;q=0.9, pt-BR;q=1"), "pt-BR");
  assert.equal(resolveLocale(null, "pt-BR;q=0, en;q=0.5"), "en-US");
  assert.equal(resolveLocale(null, "*"), "en-US");
});
