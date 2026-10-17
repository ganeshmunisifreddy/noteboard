import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAttachment } from '../../lib/testUtils';
import CardImages from './CardImages';

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumb');
});

const images = (count: number) => Array.from({ length: count }, (_, position) => makeAttachment({ position }));

describe('CardImages', () => {
  it('shows up to three thumbnails, hidden from screen readers', () => {
    const { container } = render(<CardImages images={images(2)} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box).toHaveAttribute('data-count', '2');
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('says how many more there are', () => {
    const { container } = render(<CardImages images={images(5)} />);
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(container.textContent).toBe('+2');
  });

  it('counts images beyond the ones it was given', () => {
    const { container } = render(<CardImages images={images(3)} total={7} />);
    expect(container.textContent).toBe('+4');
  });
});
