export function normalizeSearchBlob(input: string) {
  return input
    .toLowerCase()
    .replace(/\u00ad/g, '');
}

export function normalizeSearchBlobForMarkdown(input: string) {
  return normalizeSearchBlob(input)
    .replace(/[*_~[\]()<>{}|\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildAdminSearchBlob(input: {
  seedKey: string | null | undefined;
  prompt: string;
  explanation: string;
  payload: unknown;
  answer: unknown;
}) {
  const parts = [
    input.seedKey ?? '',
    input.prompt,
    input.explanation,
    JSON.stringify(input.payload ?? {}),
    JSON.stringify(input.answer ?? {}),
  ];
  return normalizeSearchBlob(parts.join(' '));
}

export function buildAdminSearchBlobNormalized(input: {
  seedKey: string | null | undefined;
  prompt: string;
  explanation: string;
  payload: unknown;
  answer: unknown;
}) {
  return normalizeSearchBlobForMarkdown(
    [
      input.seedKey ?? '',
      input.prompt,
      input.explanation,
      JSON.stringify(input.payload ?? {}),
      JSON.stringify(input.answer ?? {}),
    ].join(' '),
  );
}
