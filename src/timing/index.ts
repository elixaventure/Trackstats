import { MockTimingProvider } from "./MockTimingProvider";
import type { TimingProvider } from "./TimingProvider";

// Only the simulator exists today. A BLE/network/OEM provider slots in here
// (chosen from settings) without touching the ride engine or UI.
const mock = new MockTimingProvider();

export function getTimingProvider(): TimingProvider { return mock; }
export function getSimulator(): MockTimingProvider | null { return mock; }
export type { TimingProvider, PassingEvent, TimingStatus } from "./TimingProvider";
