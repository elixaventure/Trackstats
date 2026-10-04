import { useNavigate } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { APP_NAME } from "@/config/env";
import { updateSettings } from "@/data/actions";

/**
 * First screen on a new phone when accounts are on: sign up or sign in, so rides
 * are saved to an account from the start. The demo is still one tap away.
 */
export default function Welcome() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-10 safe-top safe-bottom">
      <div className="space-y-4">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-16" />
        <h1 className="font-display text-5xl font-black uppercase leading-[0.9] tracking-wide sm:text-6xl">{APP_NAME}</h1>
        <p className="text-xl leading-snug">See exactly how much faster you're getting.</p>
        <ul className="space-y-1 text-muted">
          <li>Lap times from your phone's GPS, no hardware needed</li>
          <li>Green and red on the track: where you gained and lost time</li>
          <li>Garage, servicing and a service history for selling</li>
        </ul>
      </div>
      <div className="space-y-3">
        <LinkButton to="/sign-in?new=1" variant="primary" size="xl" className="w-full">Create account</LinkButton>
        <LinkButton to="/sign-in" size="lg" className="w-full">I already have an account</LinkButton>
        <Button variant="ghost" className="w-full text-muted" onClick={() => { updateSettings({ exploringDemo: true }); navigate("/", { replace: true }); }}>
          Look around with demo data first
        </Button>
        <p className="text-center text-xs text-muted">Demo data stays on this phone and isn't saved to an account.</p>
      </div>
    </div>
  );
}
