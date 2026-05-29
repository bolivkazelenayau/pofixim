const fs = require('fs');

let content = fs.readFileSync('src/components/AdminForm.tsx', 'utf8');

if (!content.includes('@/components/ui/select')) {
  content = content.replace(
    /import \{ useTheme \} from '@\/components\/theme-provider';/,
    `import { useTheme } from '@/components/theme-provider';\nimport { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";`
  );
}

const replacements = [
  {
    target: `<select
              className={inputClass}
              value={batchStatus}
              onChange={(e) => setBatchStatus(e.target.value as typeof batchStatus)}
            >
              {qualityStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>`,
    replacement: `<Select
              value={batchStatus}
              onValueChange={(value) => setBatchStatus(value as typeof batchStatus)}
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {qualityStatuses.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>`
  },
  {
    target: `<select
              className={inputClass}
              value={batchIsActive}
              onChange={(e) => setBatchIsActive(e.target.value as typeof batchIsActive)}
            >
              <option value="active">Активно</option>
              <option value="inactive">Неактивно</option>
            </select>`,
    replacement: `<Select
              value={batchIsActive}
              onValueChange={(value) => setBatchIsActive(value as typeof batchIsActive)}
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активно</SelectItem>
                <SelectItem value="inactive">Неактивно</SelectItem>
              </SelectContent>
            </Select>`
  },
  {
    target: `<select
            className={inputClass}
            value={listTypeFilter}
            onChange={(e) => setListTypeFilter(e.target.value)}
          >
            {listTypes.map((type) => (
              <option key={type} value={type}>
                {type === 'all' ? 'Все типы' : type}
              </option>
            ))}
          </select>`,
    replacement: `<Select
            value={listTypeFilter}
            onValueChange={(value) => setListTypeFilter(value)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type === 'all' ? 'Все типы' : type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>`
  },
  {
    target: `<select
            className={inputClass}
            value={listExamTypeFilter}
            onChange={(e) => setListExamTypeFilter(e.target.value)}
          >
            {listExamTypes.map((n) => (
              <option key={n} value={n}>
                {n === 'all' ? 'ЕГЭ: все' : \`ЕГЭ: \${n}\`}
              </option>
            ))}
          </select>`,
    replacement: `<Select
            value={listExamTypeFilter}
            onValueChange={(value) => setListExamTypeFilter(value)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listExamTypes.map((n) => (
                <SelectItem key={n} value={n}>
                  {n === 'all' ? 'ЕГЭ: все' : \`ЕГЭ: \${n}\`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>`
  },
  {
    target: `<select
            className={inputClass}
            value={listStatusFilter}
            onChange={(e) => setListStatusFilter(e.target.value)}
          >
            <option value="all">Все статусы</option>
            {qualityStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>`,
    replacement: `<Select
            value={listStatusFilter}
            onValueChange={(value) => setListStatusFilter(value)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {qualityStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>`
  },
  {
    target: `<select
                  className={inputClass}
                  value={listSortBy}
                  onChange={(e) => setListSortBy(e.target.value as typeof listSortBy)}
                >
                  <option value="id">Сорт: номер</option>
                  <option value="updatedAt">Сорт: дата изменения</option>
                  <option value="type">Сорт: тип</option>
                  <option value="status">Сорт: статус</option>
                </select>`,
    replacement: `<Select
                  value={listSortBy}
                  onValueChange={(value) => setListSortBy(value as typeof listSortBy)}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="id">Сорт: номер</SelectItem>
                    <SelectItem value="updatedAt">Сорт: дата изменения</SelectItem>
                    <SelectItem value="type">Сорт: тип</SelectItem>
                    <SelectItem value="status">Сорт: статус</SelectItem>
                  </SelectContent>
                </Select>`
  },
  {
    target: `<select
                  className={inputClass}
                  value={listSortDir}
                  onChange={(e) => setListSortDir(e.target.value as typeof listSortDir)}
                >
                  <option value="asc">Порядок: ↑</option>
                  <option value="desc">Порядок: ↓</option>
                </select>`,
    replacement: `<Select
                  value={listSortDir}
                  onValueChange={(value) => setListSortDir(value as typeof listSortDir)}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Порядок: ↑</SelectItem>
                    <SelectItem value="desc">Порядок: ↓</SelectItem>
                  </SelectContent>
                </Select>`
  },
  {
    target: `<select
                      className={inputClass}
                      value={form.type}
                      onChange={(e) => {
                        const nextType = e.target.value as Form['type'];
                        setForm((f) => {
                          const nextForm = convertFormForTypeChange(f, nextType);
                          const transferMessage = buildTypeChangeMessage(f, nextForm);
                          if (transferMessage) {
                            setIsError(false);
                            setMessage(transferMessage);
                          }
                          return nextForm;
                        });
                      }}
                    >
                      {typeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>`,
    replacement: `<Select
                      value={form.type}
                      onValueChange={(value) => {
                        const nextType = value as Form['type'];
                        setForm((f) => {
                          const nextForm = convertFormForTypeChange(f, nextType);
                          const transferMessage = buildTypeChangeMessage(f, nextForm);
                          if (transferMessage) {
                            setIsError(false);
                            setMessage(transferMessage);
                          }
                          return nextForm;
                        });
                      }}
                    >
                      <SelectTrigger className={inputClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>`
  },
  {
    target: `<select
              className={inputClass}
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as ExerciseCategory,
                }))
              }
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>`,
    replacement: `<Select
              value={form.category}
              onValueChange={(value) =>
                setForm((f) => ({
                  ...f,
                  category: value as ExerciseCategory,
                }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>`
  },
  {
    target: `<select
              className={inputClass}
              value={String(form.difficulty)}
              onChange={(e) =>
                setForm((f) => ({ ...f, difficulty: Number(e.target.value) as 1 | 2 }))
              }
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>`,
    replacement: `<Select
              value={String(form.difficulty)}
              onValueChange={(value) =>
                setForm((f) => ({ ...f, difficulty: Number(value) as 1 | 2 }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
              </SelectContent>
            </Select>`
  },
  {
    target: `<select
              className={inputClass}
              value={form.ege21TargetPunctuation}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ege21TargetPunctuation: e.target.value as Form['ege21TargetPunctuation'],
                }))
              }
            >
              <option value="comma">comma</option>
              <option value="dash">dash</option>
              <option value="colon">colon</option>
              <option value="semicolon">semicolon</option>
            </select>`,
    replacement: `<Select
              value={form.ege21TargetPunctuation}
              onValueChange={(value) =>
                setForm((f) => ({
                  ...f,
                  ege21TargetPunctuation: value as Form['ege21TargetPunctuation'],
                }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comma">comma</SelectItem>
                <SelectItem value="dash">dash</SelectItem>
                <SelectItem value="colon">colon</SelectItem>
                <SelectItem value="semicolon">semicolon</SelectItem>
              </SelectContent>
            </Select>`
  },
  {
    target: `<select
              className={inputClass}
              value={form.qualityStatus}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  qualityStatus: e.target.value as Form['qualityStatus'],
                }))
              }
            >
              {qualityStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>`,
    replacement: `<Select
              value={form.qualityStatus}
              onValueChange={(value) =>
                setForm((f) => ({
                  ...f,
                  qualityStatus: value as Form['qualityStatus'],
                }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {qualityStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>`
  },
  {
    target: `<select
              className={inputClass}
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(e) =>
                setForm((f) => ({ ...f, isActive: e.target.value === 'active' }))
              }
            >
              <option value="active">Активно</option>
              <option value="inactive">Неактивно</option>
            </select>`,
    replacement: `<Select
              value={form.isActive ? 'active' : 'inactive'}
              onValueChange={(value) =>
                setForm((f) => ({ ...f, isActive: value === 'active' }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активно</SelectItem>
                <SelectItem value="inactive">Неактивно</SelectItem>
              </SelectContent>
            </Select>`
  }
];

// Helper to remove whitespace from strings to match exactly
function removeWhitespace(str) {
  return str.replace(/\s+/g, '');
}

let numReplaced = 0;
for (const { target, replacement } of replacements) {
  const targetNoSpace = removeWhitespace(target);
  // Find in content ignoring whitespace
  let matched = false;
  let currentStart = 0;
  
  while (currentStart < content.length) {
    const idx = content.indexOf('<select', currentStart);
    if (idx === -1) break;
    
    // Find matching </select>
    const endIdx = content.indexOf('</select>', idx);
    if (endIdx === -1) break;
    
    const block = content.slice(idx, endIdx + '</select>'.length);
    if (removeWhitespace(block) === targetNoSpace) {
      content = content.slice(0, idx) + replacement + content.slice(endIdx + '</select>'.length);
      numReplaced++;
      matched = true;
      currentStart = idx + replacement.length;
    } else {
      currentStart = endIdx + '</select>'.length;
    }
  }
}

fs.writeFileSync('src/components/AdminForm.tsx', content);
console.log('Replaced', numReplaced, 'instances.');
