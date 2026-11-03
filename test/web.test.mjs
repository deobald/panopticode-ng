import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, filterTree } from '../src/web/tree.js';
import { regionColor, legendEntries } from '../src/web/metrics.js';
import { findingLocations } from '../src/web/evidence-view.js';

function fixtureFile(path, complexity, coverage, findings) {
  return { path, coverage, findings, units: [{ id: path + ':fn', name: 'work', file: path,
    statements: 3, complexity, coverage }] };
}

test('group aggregation preserves zero coverage, unknown files, maximum complexity and lint scope', () => {
  const measured = fixtureFile('src/one.ts', 8, { covered: 0, total: 3 }, []);
  const missing = fixtureFile('src/two.ts', 2, null, null);
  const { root, byId } = buildTree({ name: 'test', files: [measured, missing] });
  assert.equal(root.complexity, 8);
  assert.deepEqual(root.coverage, { covered: 0, total: 3 });
  assert.equal(root.coverageKnown, 1);
  assert.equal(root.coverageExpected, 2);
  assert.equal(root.lintKnown, 1);
  assert.equal(regionColor(root, 'coverage', [6, 10, 25]), '#783f51');
  assert.equal(regionColor(byId.get('src/two.ts:fn'), 'coverage', [6, 10, 25]), '#c6cec9');
  const filtered = filterTree(root, 'one.ts');
  assert.equal(filtered.weight, 3);
  assert.equal(filtered.children[0].children.length, 1);
  assert.equal(filtered.complexity, root.complexity);
  assert.equal(filterTree(root, 'missing'), null);
});

test('coverage boundaries and lint colors agree with legends', () => {
  for (const [covered, expected] of [[0, '#783f51'], [1, '#ce795e'], [2, '#e1bd68'], [3, '#82b5a1'], [4, '#82b5a1']]) {
    assert.equal(regionColor({ coverage: { covered, total: 4 } }, 'coverage', [6, 10, 25]), expected);
  }
  assert.equal(regionColor({ lintKnown: 1, findings: [{ severity: 2 }] }, 'lint', [6, 10, 25]), '#ce795e');
  assert.equal(regionColor({ lintKnown: 1, findings: [{ severity: 1 }] }, 'lint', [6, 10, 25]), '#e1bd68');
  assert.equal(regionColor({ lintKnown: 0 }, 'lint', [6, 10, 25]), '#c6cec9');
  assert.equal(legendEntries('complexity', [6, 10, 25])[2][1], 'CCN 10–24');
});

test('lint messages at one location remain inspectable without creating independent quality penalties', () => {
  const groups = findingLocations({ files: [{ path: 'file.ts', findings: [
    { rule: 'one', severity: 1, line: 3, column: 2 },
    { rule: 'two', severity: 2, line: 3, column: 2 },
  ] }] });
  assert.equal(groups.size, 1);
  assert.equal([...groups.values()][0].messages.length, 2);
});
