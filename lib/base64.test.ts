import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64 } from './base64';
import { bytesOf } from './testUtils';

describe('base64', () => {
  it('round-trips bytes, including long ones', () => {
    const long = new Uint8Array(100_000).map((_, i) => i % 256).buffer;
    expect(Array.from(new Uint8Array(fromBase64(toBase64(long))!))).toEqual(Array.from(new Uint8Array(long)));
    expect(toBase64(bytesOf('hi'))).toBe('aGk=');
  });

  it('rejects text that is not base64', () => {
    expect(fromBase64('not base64!')).toBeNull();
    expect(fromBase64('abc')).toBeNull();
  });
});
