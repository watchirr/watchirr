import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

export type Admin = { id: number; login: string; passwordHash: string };

export type StoreTarget =
  | { kind: "sqlite"; path: string }
  | { kind: "postgres"; url: string };

export type Store = {
  kind: "sqlite" | "postgres";
  getAdmin(): Promise<Admin | null>;
  createAdmin(login: string, passwordHash: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  close(): Promise<void>;
};

export type Access =
  | { status: "setup" }
  | { status: "login" }
  | { status: "app"; admin: Admin };

export class SetupDoneError extends Error {
  constructor() {
    super("setup already completed");
    this.name = "SetupDoneError";
  }
}

const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

type Env = { DATABASE_URL?: string; DATA_DIR?: string };

const processEnv: Env = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATA_DIR: process.env.DATA_DIR,
};

export function resolveTarget(env: Env = processEnv): StoreTarget {
  const url = env.DATABASE_URL?.trim();
  if (url) {
    if (/^postgres(ql)?:\/\//i.test(url)) return { kind: "postgres", url };
    throw new Error("DATABASE_URL must be a postgres:// URL (omit it to use SQLite)");
  }
  const dir = env.DATA_DIR?.trim() || "data";
  return { kind: "sqlite", path: join(dir, "watchirr.db") };
}

function q(kind: Store["kind"], sql: string) {
  if (kind === "sqlite") return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function mapAdmin(row: unknown): Admin | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { id?: unknown; login?: unknown; password_hash?: unknown };
  if (r.id == null || r.login == null || r.password_hash == null) return null;
  return { id: Number(r.id), login: String(r.login), passwordHash: String(r.password_hash) };
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`,
];

function sqliteStore(path: string): Store {
  mkdirSync(join(path, ".."), { recursive: true });
  const db = new DatabaseSync(path);
  for (const sql of TABLES) db.exec(sql);
  const kind = "sqlite" as const;
  return {
    kind,
    async getAdmin() {
      return mapAdmin(db.prepare(q(kind, "SELECT id, login, password_hash FROM admin LIMIT 1")).get());
    },
    async createAdmin(login, passwordHash) {
      if (await this.getAdmin()) throw new SetupDoneError();
      try {
        db.prepare(q(kind, "INSERT INTO admin (id, login, password_hash) VALUES (1, ?, ?)")).run(
          login,
          passwordHash,
        );
      } catch (err) {
        if (await this.getAdmin()) throw new SetupDoneError();
        throw err;
      }
    },
    async getMeta(key) {
      const row = db.prepare(q(kind, "SELECT value FROM meta WHERE key = ?")).get(key) as
        | { value?: string }
        | undefined;
      return row?.value ?? null;
    },
    async setMeta(key, value) {
      db.prepare(
        q(kind, "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
      ).run(key, value);
    },
    async close() {
      db.close();
    },
  };
}

function postgresStore(url: string): Store {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const ready = Promise.all(TABLES.map((sql) => pool.query(sql)));
  const kind = "postgres" as const;
  async function run<T>(sql: string, params: unknown[] = []) {
    await ready;
    return pool.query<T>(q(kind, sql), params);
  }
  return {
    kind,
    async getAdmin() {
      const { rows } = await run<Record<string, unknown>>("SELECT id, login, password_hash FROM admin LIMIT 1");
      return mapAdmin(rows[0]);
    },
    async createAdmin(login, passwordHash) {
      if (await this.getAdmin()) throw new SetupDoneError();
      try {
        await run("INSERT INTO admin (id, login, password_hash) VALUES (1, ?, ?)", [login, passwordHash]);
      } catch (err) {
        if (await this.getAdmin()) throw new SetupDoneError();
        throw err;
      }
    },
    async getMeta(key) {
      const { rows } = await run<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key]);
      return rows[0]?.value ?? null;
    },
    async setMeta(key, value) {
      await run(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
        [key, value],
      );
    },
    async close() {
      await pool.end();
    },
  };
}

export async function openStore(env: Env = processEnv): Promise<Store> {
  const target = resolveTarget(env);
  return target.kind === "postgres" ? postgresStore(target.url) : sqliteStore(target.path);
}

const g = globalThis as { __watchirrStore?: Promise<Store> };

export function getStore(): Promise<Store> {
  // ponytail: process-global store so Next HMR does not open extra sqlite handles; drop if we stop using next dev.
  if (!g.__watchirrStore) g.__watchirrStore = openStore();
  return g.__watchirrStore;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function normalizeLogin(login: string): string {
  return login.trim();
}

export function validateCredentials(login: string, password: string): string | null {
  const name = normalizeLogin(login);
  if (!name || name.length > 64 || /[\r\n]/.test(name)) return "invalid";
  if (password.length < 8 || password.length > 200) return "invalid";
  return null;
}

export async function setupAdmin(store: Store, login: string, password: string): Promise<Admin> {
  const err = validateCredentials(login, password);
  if (err) throw new Error(err);
  await store.createAdmin(normalizeLogin(login), hashPassword(password));
  const admin = await store.getAdmin();
  if (!admin) throw new Error("setup failed");
  return admin;
}

export async function verifyLogin(store: Store, login: string, password: string): Promise<Admin | null> {
  const admin = await store.getAdmin();
  if (!admin) return null;
  if (normalizeLogin(login) !== admin.login) {
    verifyPassword(password, admin.passwordHash);
    return null;
  }
  if (!verifyPassword(password, admin.passwordHash)) return null;
  return admin;
}

async function sessionSecret(store: Store): Promise<string> {
  const existing = await store.getMeta("session_secret");
  if (existing) return existing;
  const secret = randomBytes(32).toString("hex");
  await store.setMeta("session_secret", secret);
  return secret;
}

export async function issueSession(store: Store, admin: Admin): Promise<string> {
  const secret = await sessionSecret(store);
  const body = Buffer.from(
    JSON.stringify({ login: admin.login, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60 }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export async function readSession(store: Store, token: string): Promise<Admin | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const secret = await sessionSecret(store);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { login?: unknown; exp?: unknown };
    if (typeof payload.login !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const admin = await store.getAdmin();
    if (!admin || admin.login !== payload.login) return null;
    return admin;
  } catch {
    return null;
  }
}

export async function resolveAccess(store: Store, token?: string): Promise<Access> {
  const admin = await store.getAdmin();
  if (!admin) return { status: "setup" };
  if (!token) return { status: "login" };
  const session = await readSession(store, token);
  if (!session) return { status: "login" };
  return { status: "app", admin: session };
}

export const SESSION_COOKIE = "watchirr_session";
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
