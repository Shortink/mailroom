import { EventEmitter } from "node:events";

// In-process, so an event reaches the tabs held by this process and no others.
const emitter = new EventEmitter();

// One long-lived stream per open tab, plus headroom.
emitter.setMaxListeners(32);

const ARRIVED = "arrived";

export function mailArrived() {
  emitter.emit(ARRIVED);
}

export function onMailArrived(listener: () => void) {
  emitter.on(ARRIVED, listener);
  return () => emitter.off(ARRIVED, listener);
}
