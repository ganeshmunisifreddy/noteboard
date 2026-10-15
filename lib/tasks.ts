// Tick-box lines in a text note's Markdown ("- [ ] milk"), so a card can tick
// one without opening the editor. Matches what marked treats as a task item:
// a bullet or number (inside any quotes), then [ ], [x] or [X], then a space.
// Notes saved before tick boxes existed have the brackets escaped ("\[ \]").
const TASK = /^((?:\s*>)*\s*(?:[-+*]|\d+[.)])\s+)\\?\[([ xX])\\?\](?=\s|$)/;
const FENCE = /^\s*(```|~~~)/;

export const taskLines = (markdown: string): number[] => {
  const lines: number[] = [];
  let fence: string | null = null;
  markdown.split('\n').forEach((line, index) => {
    const opener = FENCE.exec(line)?.[1];
    if (opener) {
      if (fence === null) fence = opener;
      else if (opener === fence) fence = null;
      return;
    }
    if (fence === null && TASK.test(line)) lines.push(index);
  });
  return lines;
};

export const toggleTask = (markdown: string, index: number): string => {
  const line = taskLines(markdown)[index];
  if (line === undefined) return markdown;
  const lines = markdown.split('\n');
  lines[line] = lines[line].replace(TASK, (_all, prefix: string, mark: string) => `${prefix}[${mark === ' ' ? 'x' : ' '}]`);
  return lines.join('\n');
};
