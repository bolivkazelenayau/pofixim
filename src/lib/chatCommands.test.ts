import assert from 'node:assert/strict';
import {
  getCommandAwarePasteValue,
  getVisiblePastedCommandText,
  looksLikeBareSeedKey,
  normalizeNestedSeedCommand,
  normalizeQuickSeedText,
  normalizeSeedCommandText,
  normalizeSeedKeyInput,
  parseQuickSeedCommand,
} from './chatCommands';

export function runChatCommandRegressionTests() {
  assert.equal(normalizeSeedCommandText('/seed/seed live-ege15-48135'), '/seed /seed live-ege15-48135');
  assert.equal(normalizeSeedKeyInput('/seed/seed live-ege15-48135'), 'live-ege15-48135');

  assert.equal(
    normalizeQuickSeedText('/qseed/qseed ege13 ege13-bank-59877 row=1'),
    '/qseed /qseed ege13 ege13-bank-59877 row=1',
  );

  assert.deepEqual(parseQuickSeedCommand('/qseed/qseed blitz ege9-bank-46177 row=1 word=1'), {
    mode: 'blitz',
    seedKey: 'ege9-bank-46177',
    rowIndex: 1,
    positionIndex: undefined,
    wordIndex: 1,
    cardId: undefined,
  });

  assert.deepEqual(parseQuickSeedCommand('/qseed ege13 ege13-bank-59877 5'), {
    mode: 'ege13',
    seedKey: 'ege13-bank-59877',
    rowIndex: 5,
    positionIndex: undefined,
    wordIndex: undefined,
    cardId: undefined,
  });

  assert.deepEqual(parseQuickSeedCommand('/qseed 15 live-ege15-48135 pos=3'), {
    mode: 'ege15',
    seedKey: 'live-ege15-48135',
    rowIndex: undefined,
    positionIndex: 3,
    wordIndex: undefined,
    cardId: undefined,
  });

  assert.equal(normalizeNestedSeedCommand('qseed /qseed blitz ege9-bank-46177 row=1 word=1'), '/qseed blitz ege9-bank-46177 row=1 word=1');
  assert.equal(normalizeNestedSeedCommand('blitz ege9-bank-46177 row=1 word=1'), '/qseed blitz ege9-bank-46177 row=1 word=1');

  assert.equal(looksLikeBareSeedKey('live-ege9-46512'), true);
  assert.equal(looksLikeBareSeedKey('/seed'), false);
  assert.equal(looksLikeBareSeedKey('qseed'), false);

  assert.equal(getVisiblePastedCommandText('/seed live-ege9-46512'), 'live-ege9-46512');
  assert.equal(
    getVisiblePastedCommandText('/qseed blitz ege9-bank-46177 row=1 word=1'),
    'blitz ege9-bank-46177 row=1 word=1',
  );

  assert.equal(getCommandAwarePasteValue('', 'live-ege9-46512', 0, 0), 'live-ege9-46512');
  assert.equal(
    getCommandAwarePasteValue('/seed ', 'live-ege9-46512', '/seed '.length, '/seed '.length),
    '/seed live-ege9-46512',
  );
  assert.equal(getCommandAwarePasteValue('обычный текст', 'live-ege9-46512', 0, 0), null);
}
