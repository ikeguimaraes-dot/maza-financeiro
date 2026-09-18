import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('logout uses native navigation and cannot be prefetched by Next Link', () => {
  const source = readFileSync('lib/maza/ui/Sidebar.tsx', 'utf8');
  const tag = source.match(/<([A-Za-z]+)\s+[^>]*href=\{`\$\{shellUrl\}\/auth\/sign-out`\}[^>]*>/);
  assert.ok(tag, 'logout link must be present');
  assert.equal(tag[1], 'a', 'session-changing routes must not use Next Link prefetch');
});
