const fs = require('fs');
let content = fs.readFileSync('src/components/AdminForm.tsx', 'utf-8');

const regex = /<SelectContent>\s*<SelectItem value="all">.*?<\/SelectItem>\s*\{qualityStatuses\.map\(\(status\) => \(\s*<SelectItem key=\{status\} value=\{status\}>\s*\{status\}\s*<\/SelectItem>\s*\)\)\}\s*<\/SelectContent>\s*<\/Select>\s*<\/div>\s*<button[\s\S]*?className="h-full w-full rounded-lg border border-stroke bg-surface animate-pulse" \/>\s*\}\)\s*<\/div>/g;

const replacement = `<SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {qualityStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
 </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-foreground/50">
              <span className="uppercase tracking-wider">Сортировка</span>
              {sortPrefsReady && (listSortBy !== 'id' || listSortDir !== 'asc') && (
                <button
                  type="button"
                  onClick={() => {
                    setListSortBy('id');
                    setListSortDir('asc');
                  }}
                  className="flex items-center gap-1 hover:text-foreground"
                  title="Сбросить сортировку"
                >
                  <X className="h-3 w-3" />
                  Сбросить
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              {sortPrefsReady ? (
                <>
                  <Select
                    value={listSortBy}
                    onValueChange={(value) => setListSortBy(value as typeof listSortBy)}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="id">По номеру</SelectItem>
                      <SelectItem value="updatedAt">По дате изменения</SelectItem>
                      <SelectItem value="type">По типу</SelectItem>
                      <SelectItem value="status">По статусу</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setListSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-stroke bg-surface-strong text-foreground/70 transition hover:bg-stroke hover:text-foreground"
                    title={listSortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
                  >
                    {listSortDir === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
                  </button>
                </>
              ) : (
                <>
                  <div className="h-10 w-full rounded-lg border border-stroke bg-surface animate-pulse" />
                  <div className="h-10 w-10 rounded-lg border border-stroke bg-surface animate-pulse" />
                </>
              )}
            </div>
          </div>`;

if (!regex.test(content)) {
  console.log("Could not match the block.");
  process.exit(1);
}

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/AdminForm.tsx', content);
console.log("Success");
