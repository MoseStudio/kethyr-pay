import { FLOW_CODE } from "./code";

export const FPS = 30;

// Payflow scene tuning. Typing speed + the hold before the state machine runs.
export const FLOW = {
  charsPerSec: 55,
  typeDelay: 14,
  dwell: 20,
  exit: 18,
  stateStep: 34,
  stateHold: 26,
} as const;

const typeFramesFor = (code: string): number =>
  Math.ceil((code.length / FLOW.charsPerSec) * FPS);

const FLOW_TYPE_FRAMES = typeFramesFor(FLOW_CODE);
const FLOW_TYPE_START = FLOW.typeDelay;

// The state machine animates after typing finishes + a dwell. Each of the
// four states gets a step window; the last one holds before the exit.
const STATE_FROM = FLOW_TYPE_START + FLOW_TYPE_FRAMES + FLOW.dwell;
const STATE_LAST_END = STATE_FROM + FLOW.stateStep * 3 + FLOW.stateHold;
const FLOW_DURATION = STATE_LAST_END + FLOW.exit;

// Local-frame markers inside the payflow scene (frame 0 = scene enters).
export const FLOW_SCHEDULE = {
  duration: FLOW_DURATION,
  flowTypeFrames: FLOW_TYPE_FRAMES,
  flowTypeStart: FLOW_TYPE_START,
  stateFrom: STATE_FROM,
} as const;

// Panel scenes — one headline beat each, shared rhythm.
const INTRO_DURATION = 105;
const PANEL_DURATION = 234;
const OUTRO_DURATION = 75;

const INTRO_FROM = 0;
const PAYFLOW_FROM = INTRO_FROM + INTRO_DURATION;
const PRIVACY_FROM = PAYFLOW_FROM + FLOW_DURATION;
const COMPLIANCE_FROM = PRIVACY_FROM + PANEL_DURATION;
const SUBSCRIPTION_FROM = COMPLIANCE_FROM + PANEL_DURATION;
const OUTRO_FROM = SUBSCRIPTION_FROM + PANEL_DURATION;

export const TIMING = {
  compliance: { duration: PANEL_DURATION, from: COMPLIANCE_FROM },
  intro: { duration: INTRO_DURATION, from: INTRO_FROM },
  outro: { duration: OUTRO_DURATION, from: OUTRO_FROM },
  payflow: { duration: FLOW_DURATION, from: PAYFLOW_FROM },
  privacy: { duration: PANEL_DURATION, from: PRIVACY_FROM },
  subscription: { duration: PANEL_DURATION, from: SUBSCRIPTION_FROM },
} as const;

export const TOTAL_DURATION = OUTRO_FROM + OUTRO_DURATION;
