import assert from 'node:assert/strict';
import { shouldScoreQuickGameFinish } from './quickGameSemantics';

export function runQuickGameSemanticsRegressionTests() {
  assert.equal(shouldScoreQuickGameFinish('explicit'), true);
  assert.equal(shouldScoreQuickGameFinish('timer'), true);
}
