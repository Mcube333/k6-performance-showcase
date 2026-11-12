// End-of-test outputs: console summary, HTML report, raw JSON and JUnit XML (for CI test reporting).
import { htmlReport } from './vendor/k6-reporter.js';
import { textSummary, jUnit } from './vendor/k6-summary.js';
import { PROFILE, BASE_URL } from './env.js';

export function buildSummary(data, testName) {
  const dir = __ENV.REPORT_DIR || 'reports';
  const prefix = `${dir}/${testName}-${PROFILE}`;
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`${prefix}.html`]: htmlReport(data, { title: `${testName} | ${PROFILE} | ${BASE_URL}` }),
    [`${prefix}.json`]: JSON.stringify(data, null, 2),
    [`${prefix}-junit.xml`]: jUnit(data, { name: `${testName} (${PROFILE}) thresholds` }),
  };
}
