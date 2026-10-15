import { describe, expect, it } from 'vitest';
import { taskLines, toggleTask } from './tasks';

describe('taskLines', () => {
  it('finds tick boxes with any bullet, number or quote prefix', () => {
    const md = ['- [ ] a', '* [x] b', '+ [X] c', '1. [ ] d', '> - [ ] e', '- plain', '- [ ]x not a box'].join('\n');
    expect(taskLines(md)).toEqual([0, 1, 2, 3, 4]);
  });

  it('ignores fenced code and finds nested items', () => {
    const md = ['```', '- [ ] in code', '```', '- [ ] top', '  - [x] nested', '~~~', '- [ ] tilde code', '~~~'].join('\n');
    expect(taskLines(md)).toEqual([3, 4]);
  });
});

describe('toggleTask', () => {
  it('flips only the n-th box and leaves the rest byte for byte', () => {
    const md = 'Intro  \n- [ ] milk\n- [x] eggs\n\n```\n- [ ] code\n```';
    expect(toggleTask(md, 0)).toBe('Intro  \n- [x] milk\n- [x] eggs\n\n```\n- [ ] code\n```');
    expect(toggleTask(md, 1)).toBe('Intro  \n- [ ] milk\n- [ ] eggs\n\n```\n- [ ] code\n```');
    expect(toggleTask(md, 2)).toBe(md);
  });

  it('unticks a capital X too', () => {
    expect(toggleTask('- [X] done', 0)).toBe('- [ ] done');
  });
});
