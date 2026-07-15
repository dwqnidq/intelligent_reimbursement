import {
  buildPhoneLoginCandidates,
  normalizePhone,
} from './phone.util';

describe('normalizePhone', () => {
  it('returns empty for blank input', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('keeps Chinese local mobile unchanged', () => {
    expect(normalizePhone('13800138000')).toBe('13800138000');
    expect(normalizePhone('138-0013-8000')).toBe('13800138000');
  });

  it('strips +86 from Feishu E.164 format', () => {
    expect(normalizePhone('+8613800138000')).toBe('13800138000');
    expect(normalizePhone('+86 138 0013 8000')).toBe('13800138000');
  });

  it('strips 86 prefix without plus', () => {
    expect(normalizePhone('8613800138000')).toBe('13800138000');
  });

  it('strips other country codes with explicit + prefix', () => {
    expect(normalizePhone('+85291234567')).toBe('91234567');
    expect(normalizePhone('+14155552671')).toBe('4155552671');
    expect(normalizePhone('+886912345678')).toBe('912345678');
  });

  it('supports 00 international prefix', () => {
    expect(normalizePhone('008613800138000')).toBe('13800138000');
  });
});

describe('buildPhoneLoginCandidates', () => {
  it('includes normalized and legacy variants', () => {
    const candidates = buildPhoneLoginCandidates('+8613800138000');
    expect(candidates).toContain('13800138000');
    expect(candidates).toContain('+8613800138000');
    expect(candidates).toContain('8613800138000');
  });
});
