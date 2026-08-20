import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { openStore, type Store } from "./auth.ts";
import { checkHealth, healthHttpStatus } from "./health.ts";

const dir = mkdtempSync(join(tmpdir(), "watchirr-health-"));
const store = await openStore({ DATA_DIR: dir });

after(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("checkHealth ok when DB readable (incl. empty admin)", async () => {
  const body = await checkHealth(store);
  assert.deepEqual(body, { status: "ok", db: "ok" });
  assert.equal(healthHttpStatus(body), 200);
});

test("checkHealth unhealthy when DB ping throws", async () => {
  const bad: Store = {
    kind: "sqlite",
    getAdmin: async () => {
      throw new Error("db down");
    },
    createAdmin: async () => {},
    getMeta: async () => null,
    setMeta: async () => {},
    close: async () => {},
  };
  const body = await checkHealth(bad);
  assert.deepEqual(body, { status: "unhealthy", db: "fail" });
  assert.equal(healthHttpStatus(body), 503);
});
