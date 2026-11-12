// Write-heavy journey: register, log in, read profile, delete.
// Every iteration creates its own unique user and always deletes it, so the test leaves no data behind.

import { group, sleep } from 'k6';
import exec from 'k6/execution';
import { createAccount, deleteAccount, getUserDetail, verifyLogin } from '../lib/api.js';
import { thinkTime } from '../lib/env.js';
import { buildOptions } from '../config/profiles.js';
import { baseThresholds, endpointThresholds } from '../config/thresholds.js';
import { buildSummary } from '../lib/summary.js';

export const options = buildOptions(
  {
    ...baseThresholds,
    ...endpointThresholds({ create_account: 2500, verify_login: 1500, user_detail: 1500, delete_account: 2500 }),
  },
  { journey: 'account-lifecycle' }
);

function newUser() {
  const id = `${exec.vu.idInTest}-${exec.vu.iterationInScenario}-${Date.now()}`;
  return {
    name: `Perf User ${id}`,
    email: `perf.${id}@example.com`,
    password: `Pass@${id}`,
    title: 'Mr',
    birth_date: '10',
    birth_month: '5',
    birth_year: '1993',
    firstname: 'Perf',
    lastname: 'User',
    company: 'Demo Corp',
    address1: '12 Test Street',
    address2: 'Suite 1',
    country: 'India',
    zipcode: '560001',
    state: 'Karnataka',
    city: 'Bengaluru',
    mobile_number: '0000000000',
  };
}

export default function () {
  const user = newUser();
  let created = false;

  try {
    group('01 Register', () => {
      const body = createAccount(user);
      created = body !== null && body.responseCode === 201;
    });
    if (!created) {
      sleep(thinkTime()); // back off instead of hammering a failing endpoint in a tight loop
      return;
    }
    sleep(thinkTime());

    group('02 Login', () => {
      verifyLogin(user.email, user.password);
    });
    sleep(thinkTime());

    group('03 View profile', () => {
      getUserDetail(user.email);
    });
    sleep(thinkTime());
  } finally {
    if (created) {
      group('04 Delete account', () => {
        deleteAccount(user.email, user.password);
      });
    }
  }
}

export function handleSummary(data) {
  return buildSummary(data, 'account-lifecycle');
}
