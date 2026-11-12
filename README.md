# k6 Performance Testing Showcase

Performance tests for the [AutomationExercise](https://automationexercise.com) e-commerce API, written in
**k6 (JavaScript)**, with SLO thresholds that make performance a **pass/fail gate in CI**.

It tests the same API as my Playwright UI/API framework, so the portfolio covers functional UI, API,
mobile and performance testing of one system.

## What it tests

| Script | Journey | Why it matters |
|---|---|---|
| `tests/browse-and-search.js` | catalogue, brands, then 1-3 searches with think time | read-heavy traffic: most of an e-commerce site's load |
| `tests/account-lifecycle.js` | register, log in, view profile, delete | write path; each user is unique and always deleted, so no data is left behind |

## Workload profiles (`-e PROFILE=...`)

| Profile | Shape | Question it answers |
|---|---|---|
| `smoke` | 1 VU, 30s | Does the script work and is the system up? |
| `load` | ramp to 10 VUs, hold 3m | Does it meet SLOs at normal traffic? |
| `stress` | steps of 20 / 40 / 60 VUs | How does it degrade above normal traffic? |
| `spike` | 2 to 50 VUs in 10s, then recovery window | Does it survive a burst and recover? |
| `soak` | 10 VUs for 30m | Is it stable over time (leaks, slow creep)? |
| `breakpoint` | arrival rate rising to 100 req/s | At what rate does it break? Aborts automatically when the SLO is breached |

## SLOs (thresholds)

| Metric | Threshold |
|---|---|
| Transport errors (`http_req_failed`) | < 1% |
| Latency, all requests | p95 < 2s, p99 < 4s |
| Latency per endpoint | products p95 < 1.5s, brands < 1s, search < 1.5s, create/delete account < 2.5s, login/profile < 1.5s |
| Checks | > 99% pass |
| Business success (`business_success`) | > 99% |

A breached threshold makes k6 exit with code 99, which fails the CI job.

## Design decisions

- **Business-level correctness, not just HTTP 200.** This API returns HTTP 200 even for errors and puts the
  real status in a `responseCode` field. A test that only checks HTTP status would call a broken system healthy,
  so every request checks the business code and feeds custom `business_success` / `business_errors` metrics.
- **Tagged endpoints.** Every request carries an `endpoint` tag, so each endpoint gets its own latency budget
  and its own line in the report.
- **Realistic users.** Random think time, a variable number of searches per visit, and search terms loaded once
  through `SharedArray` (low memory at high VU counts).
- **Self-cleaning data.** The write journey deletes every user it creates, and backs off instead of hammering
  a failing endpoint in a tight loop.
- **Responsible testing.** Anything heavier than `smoke` is blocked against the public demo site unless
  `ALLOW_HEAVY=true` is set. Heavy profiles run against the included **mock API** or a system you own.
- **Local mock API** (`mock/mock_server.py`, Python standard library only) with configurable latency, jitter and
  error rate. It lets the scripts, thresholds and CI pipeline be exercised end to end with no impact on anyone,
  and `--error-rate` proves the thresholds really fail the build.
- **Reports.** Every run writes console summary + HTML report + raw JSON + JUnit XML to `reports/`.
  The HTML and summary libraries are vendored in `lib/vendor/`, so runs work offline.

## Project structure

```
config/profiles.js      workload profiles + public-site guard
config/thresholds.js    SLOs as thresholds, per-endpoint budgets
lib/api.js              API client, checks, custom metrics
lib/env.js              BASE_URL / PROFILE / think time settings
lib/summary.js          HTML, JSON, JUnit and console outputs
lib/vendor/             vendored k6-reporter and k6-summary
data/search-terms.json  test data
tests/                  the two journeys
mock/mock_server.py     local mock of the API
.github/workflows/perf.yml
```

## Running

Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

```bash
# smoke against the real demo site (the only profile allowed there by default)
k6 run tests/browse-and-search.js

# heavier profiles against the local mock
python3 mock/mock_server.py --port 8080 &
k6 run -e BASE_URL=http://127.0.0.1:8080 -e PROFILE=load   tests/browse-and-search.js
k6 run -e BASE_URL=http://127.0.0.1:8080 -e PROFILE=spike  tests/browse-and-search.js
k6 run -e BASE_URL=http://127.0.0.1:8080 -e PROFILE=stress tests/account-lifecycle.js

# prove the gate works: inject 5% errors and watch the run fail with exit code 99
python3 mock/mock_server.py --port 8081 --error-rate 0.05 &
k6 run -e BASE_URL=http://127.0.0.1:8081 tests/browse-and-search.js; echo "exit=$?"

# open the report
open reports/browse-and-search-load.html
```

Useful overrides: `-e THINK_MIN=0.5 -e THINK_MAX=1`, `-e REPORT_DIR=out`.

## Docker

No k6 or Python install needed:

```bash
docker compose run --rm k6                                        # browse-and-search, smoke
SCRIPT=account-lifecycle PROFILE=load docker compose run --rm k6
ERROR_RATE=0.05 docker compose up -d --force-recreate mock && docker compose run --rm k6   # gate fails
docker compose down
```

Reports land in `reports/` on the host.

## CI

`.github/workflows/perf.yml`:
1. On every push and PR: starts the mock API and runs both scripts at `smoke` as a performance gate.
2. Manual dispatch: choose script, profile and target (`mock` or `live`).
3. HTML / JSON / JUnit reports uploaded as artifacts.

## How I report results

For each run I report: profile and target, peak VUs or request rate, p95 / p99 per endpoint against the budget,
error rate, which thresholds passed or failed, and for spike / breakpoint the recovery time or breaking rate.
Then one line on the bottleneck and what to investigate next.

## Author

Mohammed Mudassir Maniyar, SDET
[LinkedIn](https://linkedin.com/in/mohammed-mudassir03)
