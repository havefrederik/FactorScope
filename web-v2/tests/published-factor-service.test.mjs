import test from 'node:test';
import assert from 'node:assert/strict';
import { combineFrench } from '../lib/academic-factors.ts';

const csv = Array.from({length: 253}, (_, i) => {
  const date = new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10).replaceAll('-', '');
  return date + ',1,2,3,4,5,6';
}).join('\n');
const data = combineFrench(csv, csv);
const service = 'https://factorscope-v2.frede2200.chatgpt.site/api/academic-factors';

test('uses the validated original series when the publisher is unreachable and preserves its cutoff', async t => {
  const { GET } = await import('../app/api/academic-factors/route.ts?service');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    if (url === service) return Response.json(data);
    throw Error('Connection reset.');
  });
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), data);
  assert.equal(requests.filter(url => url === service).length, 1);
  const count = requests.length;
  await GET();
  assert.equal(requests.length, count);
});

test('does not accept missing, reordered, or malformed factor data', async t => {
  const { GET } = await import('../app/api/academic-factors/route.ts?invalid');
  for (const payload of [null, {...data, names: [...data.names].reverse()}, {...data, through: '2099-01-01'}]) {
    const fetch = t.mock.method(globalThis, 'fetch', async url =>
      url === service ? Response.json(payload) : new Response(null, {status: 503})
    );
    assert.equal((await GET()).status, 502);
    fetch.mock.restore();
  }
});

test('the production app can retrieve the same dated feed directly during a server outage', async t => {
  const { GET } = await import('../app/api/academic-factors/route.ts?outage');
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Service unreachable.'); });
  const response = await GET(new Request('https://factor-scope.vercel.app/api/academic-factors'));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), service);
  const mirror = await GET(new Request(service));
  assert.equal(mirror.status, 502);
});
