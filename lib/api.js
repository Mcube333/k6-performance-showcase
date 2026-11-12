// Thin client for the AutomationExercise API.
// Note: this API returns HTTP 200 even for errors and puts the real status in a "responseCode" field.
// A load test that only checks HTTP status would report a broken system as healthy, so every call
// verifies the business code too and records it in the business_success / business_errors metrics.

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL } from './env.js';

export const businessSuccess = new Rate('business_success');
export const businessErrors = new Counter('business_errors');
export const searchResultCount = new Trend('search_result_count');

function params(endpoint, name) {
  return { tags: { endpoint, name } };
}

function parse(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

function verify(res, endpoint, expectedCode) {
  const body = parse(res);
  const ok = check(
    res,
    {
      [`${endpoint}: HTTP 200`]: (r) => r.status === 200,
      [`${endpoint}: responseCode ${expectedCode}`]: () => body !== null && body.responseCode === expectedCode,
    },
    { endpoint }
  );
  businessSuccess.add(ok, { endpoint });
  if (!ok) {
    businessErrors.add(1, { endpoint });
  }
  return body;
}

export function getProducts() {
  const res = http.get(`${BASE_URL}/api/productsList`, params('products', 'GET /api/productsList'));
  const body = verify(res, 'products', 200);
  return body && Array.isArray(body.products) ? body.products : [];
}

export function getBrands() {
  const res = http.get(`${BASE_URL}/api/brandsList`, params('brands', 'GET /api/brandsList'));
  const body = verify(res, 'brands', 200);
  return body && Array.isArray(body.brands) ? body.brands : [];
}

export function searchProducts(term) {
  const res = http.post(
    `${BASE_URL}/api/searchProduct`,
    { search_product: term }, // object body -> application/x-www-form-urlencoded
    params('search', 'POST /api/searchProduct')
  );
  const body = verify(res, 'search', 200);
  const products = body && Array.isArray(body.products) ? body.products : [];
  searchResultCount.add(products.length, { term });
  return products;
}

export function createAccount(user) {
  const res = http.post(`${BASE_URL}/api/createAccount`, user, params('create_account', 'POST /api/createAccount'));
  return verify(res, 'create_account', 201);
}

export function verifyLogin(email, password) {
  const res = http.post(
    `${BASE_URL}/api/verifyLogin`,
    { email, password },
    params('verify_login', 'POST /api/verifyLogin')
  );
  return verify(res, 'verify_login', 200);
}

export function getUserDetail(email) {
  const res = http.get(
    `${BASE_URL}/api/getUserDetailByEmail?email=${encodeURIComponent(email)}`,
    params('user_detail', 'GET /api/getUserDetailByEmail')
  );
  return verify(res, 'user_detail', 200);
}

export function deleteAccount(email, password) {
  const res = http.del(
    `${BASE_URL}/api/deleteAccount`,
    { email, password },
    params('delete_account', 'DELETE /api/deleteAccount')
  );
  return verify(res, 'delete_account', 200);
}
