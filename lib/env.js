// Runtime settings. Everything is overridable with -e KEY=value on the k6 command line.

export const BASE_URL = (__ENV.BASE_URL || 'https://automationexercise.com').replace(/\/$/, '');
export const PROFILE = __ENV.PROFILE || 'smoke';
export const ALLOW_HEAVY = __ENV.ALLOW_HEAVY === 'true';

const THINK_MIN = Number(__ENV.THINK_MIN || 1);
const THINK_MAX = Number(__ENV.THINK_MAX || 3);

/** Random think time between requests so virtual users behave like people, not a tight loop. */
export function thinkTime() {
  return THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN);
}

/** True when pointing at someone else's public site rather than a system we own or a local mock. */
export function isPublicDemo() {
  return BASE_URL.includes('automationexercise.com');
}
