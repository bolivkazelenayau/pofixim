const fs = require('fs'); 
const file = 'src/components/AdminForm.tsx'; 
let content = fs.readFileSync(file, 'utf8'); 
const startIdx = content.indexOf('function parsePunctuationMarks(raw: string) {'); 
const endIdx = content.indexOf('function applyHistoryState(next: Form) {'); 

if (startIdx !== -1 && endIdx !== -1) { 
  const replacement = `function parsePunctuationMarks(raw: string) {
  const regex = /(\\d+)\\s*:\\s*([^\\s]+)/g;
  const matches = Array.from(raw.matchAll(regex));

  return matches
    .map((m) => {
      const idx = m[1];
      let mark = m[2];
      if (mark.length > 1 && mark.endsWith(',')) {
        mark = mark.slice(0, -1);
      }
      return {
        afterTokenIndex: Number(idx),
        mark: mark as PMark,
      };
    })
    .filter(
      (v) =>
        Number.isInteger(v.afterTokenIndex) &&
        v.afterTokenIndex >= 0 &&
        typeof v.mark === 'string' &&
        v.mark.length > 0,
    );
}

  `; 
  content = content.substring(0, startIdx) + replacement + content.substring(endIdx); 
  fs.writeFileSync(file, content); 
  console.log('Successfully replaced'); 
} else { 
  console.log('Not found'); 
}
