type LeaderboardRow = {
  name: string;
  score: number;
  streak: number;
};

const FAKE_NAMES = [
  'Алиса М.',
  '23 года, дизайнер из Петербурга',
  'подписаться',
  'nasralbek.',
  '67|8|9',
  'Егор.',
  'Жанна Р.',
  'Захар В.',
  'Ирина Т.',
  'скебоб',
  'смешные картинки на сименс',
  'Максим Д.',
  'пакет naik.',
  'Олег Ассистент',
  'москвич олег дудка',
  'л@з@нья-голубец',
  'света нета.',
  'в отрубе ща',
  'Александр Дугин Z',
  'я клубника ты клубника почему банан',
  'аНгЕл_в_к_ЕД_аХ_',
  'charlieкирка',
  'сберкактус',
];

function renderLeaderboardRows(rows: LeaderboardRow[]) {
  return rows.map((row, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    const isYou = row.name === '🫵 Ты';
    const trClass = isYou ? 'bg-primary/15 font-bold' : 'hover:bg-[var(--surface)] transition-colors';
    return `<tr class="${trClass} border-b border-[var(--stroke)] last:border-0">
        <td class="py-1.5 pr-3 text-center w-10">${medal}</td>
        <td class="py-1.5 px-3">${row.name}</td>
        <td class="py-1.5 px-3 text-right tabular-nums">${row.score}</td>
        <td class="py-1.5 pl-3 text-right tabular-nums text-foreground/60">${row.streak}</td>
      </tr>`;
  });
}

export function buildStatsMessageContent(score: number, streak: number) {
  const fakeRows = FAKE_NAMES.map((name) => ({
    name,
    score: score + Math.floor(Math.random() * 2000 + 100),
    streak: Math.floor(Math.random() * 18 + 1),
  }));
  fakeRows.push({ name: '🫵 Ты', score, streak });
  fakeRows.sort((a, b) => b.score - a.score);

  const tableHtml = `<div class="w-full max-h-[280px] overflow-y-auto overflow-x-auto mt-3 rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)]">
      <table class="w-full text-sm text-left relative">
        <thead class="bg-[var(--surface)] sticky top-0 z-sticky shadow-sm">
          <tr class="border-b border-[var(--stroke)] text-foreground/60 text-[11px] uppercase">
            <th class="py-1.5 px-3 font-semibold text-center w-10 bg-[var(--surface)]">#</th>
            <th class="py-1.5 px-3 font-semibold bg-[var(--surface)]">Имя</th>
            <th class="py-1.5 px-3 font-semibold text-right bg-[var(--surface)]">Очки</th>
            <th class="py-1.5 px-3 font-semibold text-right bg-[var(--surface)]">Серия</th>
          </tr>
        </thead>
        <tbody>
          ${renderLeaderboardRows(fakeRows).join('')}
        </tbody>
      </table>
    </div>`;

  return `📊 **Таблица лидеров**\n\n${tableHtml}`;
}
