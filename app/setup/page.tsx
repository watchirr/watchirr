import { redirect } from "next/navigation";
import { issueSession, setupAdmin, SetupDoneError, validateCredentials } from "@/lib/auth";
import { access, setSessionCookie } from "@/lib/http";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  invalid: "Enter a login and a password of at least 8 characters.",
  mismatch: "Passwords do not match.",
  exists: "Admin already created. Log in.",
};

async function setup(formData: FormData) {
  "use server";
  const login = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) redirect("/setup?error=mismatch");
  if (validateCredentials(login, password)) redirect("/setup?error=invalid");
  const { store, access: gate } = await access();
  if (gate.status === "app") redirect("/");
  try {
    const admin = await setupAdmin(store, login, password);
    await setSessionCookie(store, await issueSession(store, admin));
  } catch (err) {
    if (err instanceof SetupDoneError) redirect("/setup?error=exists");
    throw err;
  }
  redirect("/");
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { access: gate } = await access();
  if (gate.status === "app") redirect("/");
  if (gate.status === "login") redirect("/login");
  const error = errors[(await searchParams).error ?? ""];

  return (
    <main className="panel glass">
      <a href="/setup" className="wordmark auth-brand">
        Watch<em>irr</em>
      </a>
      <h1>First-run setup</h1>
      <p className="lede">Create the Admin login. This completes once.</p>
      {error ? <p className="error">{error}</p> : null}
      <form action={setup}>
        <label htmlFor="login">Login</label>
        <input id="login" name="login" autoComplete="username" required maxLength={64} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <label htmlFor="confirm">Confirm password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <button className="btn" type="submit">
          Create Admin
        </button>
      </form>
    </main>
  );
}
