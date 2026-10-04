import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { App } from "./App";
import { bootstrap } from "./data/bootstrap";
import { store } from "./data/store";
import { rideEngine } from "./session/engine";
import { sync } from "./sync/engine";

const root = createRoot(document.getElementById("root")!);

async function start() {
  try {
    await bootstrap();
  } catch (e) {
    root.render(<p style={{ padding: 24, color: "#fff", fontFamily: "system-ui" }}>Couldn't open on-device storage ({String(e)}). Private browsing can block it — try a normal window.</p>);
    return;
  }
  await rideEngine.restore(); // pick up a ride interrupted by a reload or crash
  sync.start();
  // Saves are batched; write immediately when the app is backgrounded or closed.
  const flush = () => void store.flush();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
  root.render(<StrictMode><App /></StrictMode>);
}

registerSW({ immediate: true });
void start();
