import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { normalizeProject, htmlEscape, _resetManifestCache } from './worker.js';

describe('Helper functions', () => {
  it('normalizeProject should normalize names according to PEP 503', () => {
    expect(normalizeProject('FooBar')).toBe('foobar');
    expect(normalizeProject('Foo.Bar')).toBe('foo-bar');
    expect(normalizeProject('Foo_Bar')).toBe('foo-bar');
    expect(normalizeProject('Foo-Bar')).toBe('foo-bar');
    expect(normalizeProject('Foo--Bar')).toBe('foo-bar');
    expect(normalizeProject('Foo-.Bar')).toBe('foo-bar');
  });

  it('htmlEscape should escape special characters', () => {
    expect(htmlEscape('<script>')).toBe('&lt;script&gt;');
    expect(htmlEscape('a & b')).toBe('a &amp; b');
    expect(htmlEscape('"quoted"')).toBe('&quot;quoted&quot;');
    expect(htmlEscape("'single'")).toBe('&#39;single&#39;');
  });
});

describe('Worker fetch handler', () => {
  let env;
  let bucketMap;

  beforeEach(() => {
    // restart global cache if needed, but for now we interact with a fresh env mock
    _resetManifestCache();
    
    bucketMap = new Map();
    env = {
      PYPI_BUCKET: {
        get: vi.fn(async (key, options) => {
           const val = bucketMap.get(key);
           if (!val) return null;
           
           // Simulate the R2 object
           return {
             body: val.body,
             httpEtag: val.etag || 'etag-' + key,
             text: async () => val.body, // simple mock for text()
             writeHttpMetadata: vi.fn(),
           };
        })
      }
    };
  });

  it('should redirect / and /simple', async () => {
    const req1 = new Request('http://example.com/');
    const res1 = await worker.fetch(req1, env);
    expect(res1.status).toBe(302);
    expect(res1.headers.get('Location')).toBe('http://example.com/simple/');

    const req2 = new Request('http://example.com/simple');
    const res2 = await worker.fetch(req2, env);
    expect(res2.status).toBe(301);
    expect(res2.headers.get('Location')).toBe('http://example.com/simple/');
  });

  it('should return 405 for non-GET/HEAD methods', async () => {
    const req = new Request('http://example.com/', { method: 'POST' });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(405);
  });

  it('should list projects at /simple/', async () => {
    const manifest = {
      projects: {
        'foo-bar': ['foo-bar-1.0.whl'],
        'baz': ['baz-0.1.tar.gz']
      }
    };
    bucketMap.set('simple/manifest-v1.json', { body: JSON.stringify(manifest) });

    const req = new Request('http://example.com/simple/');
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Simple Index');
    expect(text).toContain('href="/simple/foo-bar/"');
    expect(text).toContain('href="/simple/baz/"');
  });

  it('should list files for a project at /simple/<project>/', async () => {
    const manifest = {
      projects: {
        'foo-bar': ['foo-bar-1.0.whl', 'foo-bar-2.0.whl']
      }
    };
    bucketMap.set('simple/manifest-v1.json', { body: JSON.stringify(manifest) });

    const req = new Request('http://example.com/simple/foo-bar/');
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Links for foo-bar');
    expect(text).toContain('href="/packages/foo-bar-1.0.whl"');
    expect(text).toContain('href="/packages/foo-bar-2.0.whl"');
  });

  it('should normalize project name in URL', async () => {
    const manifest = {
      projects: {
        'foo-bar': ['foo-bar-1.0.whl']
      }
    };
    bucketMap.set('simple/manifest-v1.json', { body: JSON.stringify(manifest) });

    // Request non-normalized name "Foo.Bar"
    const req = new Request('http://example.com/simple/Foo.Bar/');
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Links for foo-bar');
  });

  it('should redirect if trailing slash is missing for project', async () => {
    const req = new Request('http://example.com/simple/foo-bar');
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('http://example.com/simple/foo-bar/');
  });

  it('should serve packages', async () => {
    const fileContent = 'some-binary-content';
    bucketMap.set('packages/foo-bar-1.0.whl', { body: fileContent, etag: '"abc"' });

    const req = new Request('http://example.com/packages/foo-bar-1.0.whl');
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(await res.text()).toBe(fileContent);
  });
  
  it('should return 404 for unknown paths', async () => {
    const req = new Request('http://example.com/unknown');
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(404);
  });
});
