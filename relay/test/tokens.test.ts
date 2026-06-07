import { describe, expect, it } from 'vitest';
import { generateToken, isValidToken } from '../src/tokens';

describe('tokens', () => {
  it('generates valid, unique, high-entropy tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{36}$/);
    expect(isValidToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('rejects malformed or path-traversal tokens', () => {
    expect(isValidToken('')).toBe(false);
    expect(isValidToken('short')).toBe(false);
    expect(isValidToken('UPPERCASE')).toBe(false);
    expect(isValidToken('../etc/passwd')).toBe(false);
    expect(isValidToken('a'.repeat(80))).toBe(false);
  });
});
