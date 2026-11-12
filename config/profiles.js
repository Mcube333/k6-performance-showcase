// Workload profiles. Pick one with -e PROFILE=<name>.
// Each answers a different question:
//   smoke      - does the script work and is the system up?            (1 VU, 30s)
//   load       - does it meet SLOs at expected normal traffic?          (ramp to 10 VUs, hold)
//   stress     - how does it degrade above normal traffic?              (step up to 60 VUs)
//   spike      - does it survive and recover from a sudden burst?       (0 -> 50 VUs in 10s)
//   soak       - does it stay stable over time (leaks, slow creep)?     (10 VUs, 30m)
//   breakpoint - at what request rate does it break?                    (rising arrival rate, aborts on SLO breach)

import { PROFILE, ALLOW_HEAVY, isPublicDemo } from '../lib/env.js';

const PROFILES = {
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '30s',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 10 },
      { duration: '3m', target: 10 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '2m', target: 20 },
      { duration: '1m', target: 40 },
      { duration: '2m', target: 40 },
      { duration: '1m', target: 60 },
      { duration: '2m', target: 60 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 2 },
      { duration: '10s', target: 50 },
      { duration: '30s', target: 50 },
      { duration: '10s', target: 2 },
      { duration: '1m', target: 2 }, // recovery window: latency should return to baseline
      { duration: '10s', target: 0 },
    ],
  },
  soak: {
    executor: 'constant-vus',
    vus: 10,
    duration: '30m',
  },
  breakpoint: {
    executor: 'ramping-arrival-rate',
    startRate: 1,
    timeUnit: '1s',
    preAllocatedVUs: 20,
    maxVUs: 200,
    stages: [{ duration: '10m', target: 100 }],
  },
};

function guard() {
  if (!PROFILES[PROFILE]) {
    throw new Error(`Unknown PROFILE '${PROFILE}'. Use one of: ${Object.keys(PROFILES).join(', ')}`);
  }
  // Responsible testing: never load-test a site we don't own beyond a smoke check by accident.
  if (isPublicDemo() && PROFILE !== 'smoke' && !ALLOW_HEAVY) {
    throw new Error(
      `PROFILE '${PROFILE}' against a public demo site is blocked. ` +
      'Run it against the local mock (-e BASE_URL=http://127.0.0.1:8080) or a system you own, ' +
      'or pass -e ALLOW_HEAVY=true if you have permission.'
    );
  }
}

/** Builds k6 options for the selected profile with the given thresholds. */
export function buildOptions(thresholds, tags = {}) {
  guard();
  const scenario = { ...PROFILES[PROFILE], tags: { profile: PROFILE } };

  const finalThresholds = { ...thresholds };
  if (PROFILE === 'breakpoint') {
    // Stop the ramp as soon as the system stops meeting its SLO; the rate at abort is the breaking point.
    finalThresholds.http_req_duration = [
      { threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '30s' },
    ];
    finalThresholds.http_req_failed = [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
    ];
  }

  return {
    scenarios: { [PROFILE]: scenario },
    thresholds: finalThresholds,
    tags,
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    userAgent: 'k6-performance-showcase/1.0 (+portfolio project)',
  };
}
