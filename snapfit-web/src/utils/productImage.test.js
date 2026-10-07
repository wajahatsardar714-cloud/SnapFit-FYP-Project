import { describe, expect, it } from 'vitest';
import { validateProductImageFile } from './productImage';

const fileOf = (type, size) => ({ type, size });

describe('validateProductImageFile', () => {
  it('accepts JPEG, PNG and WebP up to 5MB', () => {
    ['image/jpeg', 'image/png', 'image/webp'].forEach((type) => {
      expect(validateProductImageFile(fileOf(type, 5 * 1024 * 1024))).toBeNull();
    });
  });

  it('rejects other types and oversized files', () => {
    expect(validateProductImageFile(fileOf('image/gif', 1000))).toMatch(/JPEG, PNG or WebP/);
    expect(validateProductImageFile(fileOf('image/png', 5 * 1024 * 1024 + 1))).toMatch(/5MB/);
  });
});
