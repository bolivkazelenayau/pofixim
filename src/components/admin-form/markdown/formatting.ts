export function renderEditorMarkdown(value: string) {
  return value
    .replace(
      /==([\s\S]+?)==/g,
      '<span style="text-decoration-line: underline; text-decoration-style: double; text-decoration-skip-ink: none;">$1</span>',
    )
    .replace(/\+\+([\s\S]+?)\+\+/g, '<u>$1</u>');
}
