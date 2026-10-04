import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { App } from "./App";
import { adoptExistingSession, bootstrap } from "./data/bootstrap";
import { store } from "./data/store";
import { rideEngine } from "./session/engine";
import { sync } from "./sync/engine";

// GitHub Pages deep-link fallback: 404.html sends /app/some/page here as ?p=/app/some/page.
const redirected = new URLSearchParams(location.search).get("p");
if (redirected) history.replaceState(null, "", redirected);

const root = createRoot(document.getElementById("root")!);

async function start() {
  try {
    await bootstrap();
  } catch (e) {
    root.render(<p style={{ padding: 24, color: "#fff", fontFamily: "system-ui" }}>Couldn't open on-device storage ({String(e)}). Private browsing can block it — try a normal window.</p>);
    return;
  }
  await adoptExistingSession().catch(() => undefined); // back from the email confirmation link
  await rideEngine.restore(); // pick up a ride interrupted by a reload or crash
  sync.start();
  // Saves are batched; write immediately when the app is backgrounded or closed.
  const flush = () => void store.flush();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
  root.render(<StrictMode><App /></StrictMode>);
}

// Check for a new version whenever the app comes back to the foreground (phones
// keep PWAs open for days), not only on a cold start.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update(); });
  },
});
void start();
