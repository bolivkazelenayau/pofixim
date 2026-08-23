import assert from 'node:assert/strict';
import { buildDatabaseIndicator } from './utils';

export function runDatabaseIndicatorRegressionTests() {
  const saved = buildDatabaseIndicator('saved', null);
  const local = buildDatabaseIndicator('local', null);
  const draft = buildDatabaseIndicator('draft', null);

  assert.equal(saved.label, 'Сохранено');
  assert.match(saved.detail, /актуальная запись/);
  assert.match(local.label, /локальные изменения/);
  assert.match(local.detail, /не записаны/);
  assert.notEqual(local.label, saved.label);
  assert.match(draft.detail, /не записан/);
}
