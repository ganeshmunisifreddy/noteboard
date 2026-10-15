import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

// A colour declared in the rule whose selector is exactly `selector`.
const value = (selector: string, name: string) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No rule for ${selector}`);
  const rule = css.slice(start, css.indexOf('}', start));
  const found = rule.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  if (!found) throw new Error(`No ${name} in ${selector}`);
  return found;
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hsl = (hex: string) => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
};

const COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'grey'];

describe('note colours', () => {
  it('keep body and title text at AA contrast in both themes', () => {
    const lightText = value(":root,\n[data-theme='light']", '--text');
    const darkText = value("[data-theme='dark']", '--text');
    for (const color of COLORS) {
      const light = `[data-color='${color}']`;
      const dark = `[data-theme='dark'] [data-color='${color}']`;
      expect(contrast(value(light, '--note-ink'), value(light, '--note-bg')), light).toBeGreaterThanOrEqual(4.5);
      expect(contrast(value(dark, '--note-ink'), value(dark, '--note-bg')), dark).toBeGreaterThanOrEqual(4.5);
      expect(contrast(lightText, value(light, '--note-bg')), light).toBeGreaterThanOrEqual(4.5);
      expect(contrast(darkText, value(dark, '--note-bg')), dark).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('makes dark yellow read as amber, not olive', () => {
    const { h, s } = hsl(value("[data-theme='dark'] [data-color='yellow']", '--note-bg'));
    expect(h).toBeGreaterThanOrEqual(30);
    expect(h).toBeLessThanOrEqual(45);
    expect(s).toBeGreaterThanOrEqual(0.5);
  });
});
