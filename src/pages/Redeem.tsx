import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ErrorNote } from "@/components/States";
import { cloudEnabled } from "@/config/env";
import { campaignLabel, getPendingCode, normaliseCode, redeemCode, setPendingCode, type Redeemed } from "@/data/promo";
import { formatDate } from "@/domain/time";
import { useDb } from "@/hooks/useDb";

/** Claim a promo code, e.g. from a QR card handed out at a track. */
export default function Redeem() {
  const db = useDb();
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => normaliseCode(params.get("code") ?? getPendingCode() ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Redeemed | null>(null);
  const signedIn = cloudEnabled && !db.settings.demoMode;
  // Keep a scanned code while they sign up; it's claimed straight after.
  useEffect(() => { if (!signedIn && code) setPendingCode(code); }, [signedIn, code]);

  if (!cloudEnabled) {
    return <div className="space-y-4"><PageHeader back="/" title="Claim a code" /><p className="text-muted">Codes need a TrackStats account, which isn't available in this version of the app.</p></div>;
  }

  if (done) {
    const from = campaignLabel(done.campaign);
    return (
      <div className="mx-auto max-w-md space-y-5">
        <PageHeader title="You're Pro" />
        <Card className="space-y-3 border-plate bg-plate/10">
          <p className="font-display text-4xl font-black uppercase leading-none text-plate">{done.proMonths} months of Pro</p>
          <p>Unlocked until <strong>{formatDate(done.proUntil, 0)}</strong>{from ? <>, courtesy of <strong>{from}</strong></> : null}.</p>
          <p className="text-sm text-muted">Pro features switch on as they launch. Lap timing stays free either way.</p>
        </Card>
        <LinkButton to="/" variant="primary" size="lg" className="w-full">Back to riding</LinkButton>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <PageHeader title="You've got a code" />
        <Card className="space-y-3">
          {code && <p className="font-mono text-2xl font-bold tracking-wider">{code}</p>}
          <p>Create a free TrackStats account to claim it. It only takes a minute, and the code is claimed as soon as you're in.</p>
        </Card>
        <LinkButton to="/sign-in?new=1" variant="primary" size="lg" className="w-full">Create account and claim</LinkButton>
        <LinkButton to="/sign-in" size="lg" className="w-full">I already have an account</LinkButton>
      </div>
    );
  }

  const claim = async () => {
    setBusy(true); setError(null);
    try { setDone(await redeemCode(code)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md space-y-5">
      <PageHeader back="/settings" title="Claim a code" />
      <Card className="space-y-3">
        <TextField label="Code" value={code} onChange={(e) => setCode(normaliseCode(e.target.value))} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="BACUP-XXXX-XXXX" />
        {error && <ErrorNote title="Couldn't claim it">{error}</ErrorNote>}
        <Button variant="primary" size="lg" className="w-full" disabled={busy || code.length < 6} onClick={() => void claim()}>
          <Icon name="award" className="size-5" /> {busy ? "Claiming…" : "Claim code"}
        </Button>
      </Card>
      <p className="text-sm text-muted">Each code works once. One code per rider per offer.</p>
    </div>
  );
}
