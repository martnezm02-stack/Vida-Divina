import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { signS3Request } from '../src/r2SigV4.js';

describe('r2SigV4 — firma SigV4 real (sin red)', () => {
  const fixedNow = new Date('2026-08-20T10:00:00.000Z');

  test('produce authorization/x-amz-date/x-amz-content-sha256 con la forma esperada', () => {
    const headers = signS3Request({
      method: 'PUT', host: 'acct123.r2.cloudflarestorage.com', path: '/bucket/final/asset-1',
      accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', now: fixedNow,
    });
    assert.equal(headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
    assert.equal(headers['x-amz-date'], '20260820T100000Z');
    assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260820\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  });

  test('es determinística: mismos inputs -> misma firma', () => {
    const args = { method: 'PUT', host: 'h', path: '/b/k', accessKeyId: 'A', secretAccessKey: 'S', now: fixedNow };
    const a = signS3Request(args);
    const b = signS3Request(args);
    assert.deepEqual(a, b);
  });

  test('cambia la firma si cambia el método (PUT vs DELETE)', () => {
    const base = { host: 'h', path: '/b/k', accessKeyId: 'A', secretAccessKey: 'S', now: fixedNow };
    const put = signS3Request({ ...base, method: 'PUT' });
    const del = signS3Request({ ...base, method: 'DELETE' });
    assert.notEqual(put.authorization, del.authorization);
  });

  test('exige accessKeyId/secretAccessKey', () => {
    assert.throws(() => signS3Request({ method: 'GET', host: 'h', path: '/p' }));
  });
});
