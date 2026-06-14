function escapeAngleBrackets(value: string) {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function protectShortRussianWords(value: string) {
  return value.replace(
    /(^|[\s([{"«—-])((?:а|без|бы|в|во|да|для|до|же|за|и|из|к|ко|ли|на|над|не|ни|но|о|об|от|по|под|при|про|с|со|у))\s+(?=[А-ЯЁа-яёA-Za-z0-9])/giu,
    (_, prefix: string, word: string) => `${prefix}${word}&nbsp;`,
  );
}

export function renderEditorMarkdown(value: string) {
  const escaped = escapeAngleBrackets(value);
  return protectShortRussianWords(escaped)
    .replace(
      /==([\s\S]+?)==/g,
      '<span style="text-decoration-line: underline; text-decoration-style: double; text-decoration-skip-ink: none;">$1</span>',
    )
    .replace(/\+\+([\s\S]+?)\+\+/g, '<u>$1</u>');
}
