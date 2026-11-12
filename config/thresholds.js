// Service level objectives expressed as k6 thresholds. A breached threshold fails the run (exit code 99),
// which is what makes performance a pass/fail gate in CI instead of just a report.

export const baseThresholds = {
  http_req_failed: ['rate<0.01'],             // < 1% transport-level errors
  http_req_duration: ['p(95)<2000', 'p(99)<4000'],
  checks: ['rate>0.99'],                      // functional correctness under load
  business_success: ['rate>0.99'],            // API's own responseCode, not just HTTP 200
};

/** Per-endpoint p95 latency budgets, using the "endpoint" tag set on every request. */
export function endpointThresholds(budgetsMs) {
  const result = {};
  for (const [endpoint, p95] of Object.entries(budgetsMs)) {
    result[`http_req_duration{endpoint:${endpoint}}`] = [`p(95)<${p95}`];
  }
  return result;
}
