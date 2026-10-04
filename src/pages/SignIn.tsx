import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/Field";
import { PageHeader } from "@/components/PageHeader";
import { Segmented } from "@/components/Segmented";
import { ErrorNote } from "@/components/States";
import { cloudEnabled } from "@/config/env";
import { switchToAccount } from "@/data/bootstrap";
import { sync } from "@/sync/engine";
import { getSupabase } from "@/sync/supabase";

export default function SignIn() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!cloudEnabled) {
    return <div><PageHeader back="/settings" title="Sign in" /><p className="text-muted">Accounts aren't configured in this build. The app runs entirely on this device.</p></div>;
  }

  const submit = async () => {
    const sb = getSupabase()!;
    setBusy(true); setError(null); setInfo(null);
    try {
      const res = mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } });
      if (res.error) throw res.error;
      if (!res.data.session) { setInfo("Check your email to confirm your account, then sign in."); return; }
      await switchToAccount(res.data.session.user.id, res.data.session.user.email ?? null);
      await sync.pullAll().catch(() => undefined); // first load; offline is fine, it retries later
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader back="/settings" title={mode === "in" ? "Sign in" : "Create account"} />
      <Segmented label="I want to" value={mode} onChange={setMode} options={[{ value: "in", label: "Sign in" }, { value: "up", label: "Create account" }]} />
      <Card className="space-y-3">
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} hint={mode === "up" ? "At least 8 characters." : undefined} />
        {error && <ErrorNote title="Couldn't sign in">{error}</ErrorNote>}
        {info && <p className="text-faster">{info}</p>}
        <Button variant="primary" size="lg" className="w-full" disabled={busy || !email || password.length < (mode === "up" ? 8 : 1)} onClick={() => void submit()}>
          {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
      </Card>
      <p className="text-sm text-muted">Signing in replaces the demo data on this device with your own account.</p>
    </div>
  );
}
