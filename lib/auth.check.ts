import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  issueSession,
  openStore,
  resolveAccess,
  resolveTarget,
  setupAdmin,
  SetupDoneError,
  verifyLogin,
} from "./auth.ts";

const dir = mkdtempSync(join(tmpdir(), "watchirr-"));
const store = await openStore({ DATA_DIR: dir });

after(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("DATABASE_URL selects Postgres; otherwise SQLite", () => {
  const sqlite = resolveTarget({ DATA_DIR: "/data" });
  assert.equal(sqlite.kind, "sqlite");
  if (sqlite.kind === "sqlite") assert.equal(sqlite.path, join("/data", "watchirr.db"));

  const pg = resolveTarget({ DATABASE_URL: "postgres://watchirr:watchirr@db/watchirr" });
  assert.equal(pg.kind, "postgres");

  assert.throws(() => resolveTarget({ DATABASE_URL: "mysql://x" }), /postgres:\/\//);
});

test("setup → login → authenticated page", async () => {
  assert.equal((await resolveAccess(store)).status, "setup");

  const admin = await setupAdmin(store, "  house  ", "correct-horse");
  assert.equal(admin.login, "house");

  await assert.rejects(() => setupAdmin(store, "other", "correct-horse"), SetupDoneError);
  assert.equal((await resolveAccess(store)).status, "login");

  assert.equal(await verifyLogin(store, "house", "wrong-password"), null);
  assert.equal(await verifyLogin(store, "someone-else", "correct-horse"), null);
  const signedIn = await verifyLogin(store, "house", "correct-horse");
  assert.ok(signedIn);

  const token = await issueSession(store, signedIn);
  const access = await resolveAccess(store, token);
  assert.equal(access.status, "app");
  if (access.status === "app") assert.equal(access.admin.login, "house");

  assert.equal((await resolveAccess(store, "garbage")).status, "login");
});
