import { readFile } from 'node:fs/promises';

function normalizeSpaces(value) {
  return value.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripTagsKeepNewlines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractInnerHtml(section, openTagRe) {
  const openMatch = section.match(openTagRe);
  if (!openMatch) return '';
  let pos = (openMatch.index ?? 0) + openMatch[0].length;
  let depth = 1;
  const divOpenRe = /<div[\s>]/gi;
  const divCloseRe = /<\/div>/gi;
  while (depth > 0 && pos < section.length) {
    divOpenRe.lastIndex = pos;
    divCloseRe.lastIndex = pos;
    const nextOpen = divOpenRe.exec(section);
    const nextClose = divCloseRe.exec(section);
    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return section.slice((openMatch.index ?? 0) + openMatch[0].length, nextClose.index);
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return '';
}

function extractProblems(html) {
  const markerRe = /<div[^>]+class="prob_maindiv"[^>]*id="maindiv\d+"[^>]*>/gim;
  const markers = [...html.matchAll(markerRe)];
  const sections = markers.map((m, idx) => {
    const start = m.index ?? 0;
    const end = markers[idx + 1]?.index ?? html.length;
    return html.slice(start, end);
  });

  let type10Count = 0;
  for (const section of sections) {
    const typeMatch = section.match(/(?:Тип|Ð¢Ð¸Ð¿)\s*(\d{1,2})/i);
    const type = typeMatch ? Number(typeMatch[1]) : null;
    if (type !== 10) continue;
    type10Count++;
    if (type10Count > 3) continue; // Show first 3

    const problemId = section.match(/problem\?id=(\d+)/i)?.[1] ?? null;
    const explanationHtml = extractInnerHtml(section, /id="sol\d+"[\s\S]*?class="solution"[^>]*>/i);
    const explanation = stripTagsKeepNewlines(explanationHtml);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Problem ${problemId} (Type ${type})`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\nEXPLANATION (${explanation.length} chars):`);
    console.log(explanation);
    
    // Now simulate splitFeedbackFromExplanation
    const markerRegex = /Привед[её]м верное написание[:.]?\s*/u;
    const markerMatch = explanation.match(markerRegex);
    const tail = markerMatch
      ? explanation.slice((markerMatch.index ?? 0) + markerMatch[0].length)
      : explanation;
    
    const lines = tail.split('\n').map(l => l.trim()).filter(Boolean);
    const numberedRows = [];
    let currentRow = null;
    for (const line of lines) {
      const numMatch = line.match(/^(\d+)[).]\s*/);
      if (numMatch) {
        if (currentRow !== null) numberedRows.push(currentRow);
        currentRow = line;
      } else if (currentRow !== null) {
        currentRow += ' ' + line;
      } else {
        const inlineChunks = line.split(/(?=\s\d+[).]\s)/).map(c => c.trim()).filter(Boolean);
        for (const chunk of inlineChunks) {
          const inlineNum = chunk.match(/^(\d+)[).]\s*/);
          if (inlineNum) {
            if (currentRow !== null) numberedRows.push(currentRow);
            currentRow = chunk;
          } else if (currentRow !== null) {
            currentRow += ' ' + chunk;
          }
        }
      }
    }
    if (currentRow !== null) numberedRows.push(currentRow);

    // Strip trailing Ответ
    if (numberedRows.length > 0) {
      numberedRows[numberedRows.length - 1] = numberedRows[numberedRows.length - 1]
        .replace(/\s*Ответ:\s*[\d,.\s]+.*$/iu, '')
        .trim();
    }

    console.log(`\nPARSED ROWS (${numberedRows.length}):`);
    numberedRows.forEach((r, i) => console.log(`  [${i}] ${r.substring(0, 120)}`));
    console.log(`\n✅ All 5 rows found: ${numberedRows.length === 5 ? 'YES' : 'NO (' + numberedRows.length + ')'}`);
  }

  console.log(`\nTotal type 10 problems found: ${type10Count}`);
}

const htmlFile = 'test_sources/raw_live/2026-05-22T09-14-12-796Z/variant-56151015.html';
const html = await readFile(htmlFile, 'utf8');
extractProblems(html);
