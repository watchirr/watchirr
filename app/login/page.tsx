import { redirect } from "next/navigation";
import { issueSession, verifyLogin } from "@/lib/auth";
import { access, setSessionCookie } from "@/lib/http";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const { store, access: gate } = await access();
  if (gate.status === "setup") redirect("/setup");
  if (gate.status === "app") redirect("/");
  const admin = await verifyLogin(
    store,
    String(formData.get("login") ?? ""),
    String(formData.get("password") ?? ""),
  );
  if (!admin) redirect("/login?error=invalid");
  await setSessionCookie(store, await issueSession(store, admin));
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { access: gate } = await access();
  if (gate.status === "setup") redirect("/setup");
  if (gate.status === "app") redirect("/");
  const error = (await searchParams).error === "invalid" ? "Login or password is wrong." : null;

  return (
    <main className="panel glass">
      <a href="/login" className="wordmark auth-brand">
        Watch<em>irr</em>
      </a>
      <h1>Log in</h1>
      <p className="lede">Admin access for this Household.</p>
      {error ? <p className="error">{error}</p> : null}
      <form action={login}>
        <label htmlFor="login">Login</label>
        <input id="login" name="login" autoComplete="username" required maxLength={64} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <button className="btn" type="submit">
          Log in
        </button>
      </form>
    </main>
  );
}
