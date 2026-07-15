/** 常见国家/地区码，按长度降序匹配，避免短码误匹配 */
const COUNTRY_CODES = [
  '886',
  '853',
  '852',
  '82',
  '81',
  '86',
  '65',
  '61',
  '49',
  '44',
  '1',
] as const;

const CHINESE_MOBILE_PATTERN = /^1[3-9]\d{9}$/;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidNationalNumber(countryCode: string, national: string): boolean {
  if (!national || national.length < 7 || national.length > 15) {
    return false;
  }
  switch (countryCode) {
    case '86':
      return CHINESE_MOBILE_PATTERN.test(national);
    case '1':
      return /^\d{10}$/.test(national);
    case '852':
    case '853':
      return /^\d{8}$/.test(national);
    case '886':
      return /^9\d{8}$/.test(national);
    default:
      return true;
  }
}

function stripCountryCode(digits: string): string | null {
  for (const code of COUNTRY_CODES) {
    if (!digits.startsWith(code) || digits.length <= code.length) {
      continue;
    }
    const national = digits.slice(code.length);
    if (isValidNationalNumber(code, national)) {
      return national;
    }
  }
  return null;
}

/**
 * 将手机号归一化为纯号码（不含 + 与国家/地区码）。
 * 支持飞书 E.164（如 +86138...）、带 86 前缀、以及已是本地号码的格式。
 */
export function normalizePhone(input?: string | null): string {
  if (!input?.trim()) {
    return '';
  }

  const trimmed = input.trim();
  const hadExplicitIntlPrefix =
    trimmed.startsWith('+') || trimmed.startsWith('00');

  let normalized = trimmed.replace(/[\s\-().]/g, '');
  if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  } else if (normalized.startsWith('00')) {
    normalized = normalized.slice(2);
  }

  const digits = digitsOnly(normalized);
  if (!digits) {
    return '';
  }

  if (!hadExplicitIntlPrefix && CHINESE_MOBILE_PATTERN.test(digits)) {
    return digits;
  }

  if (
    !hadExplicitIntlPrefix &&
    digits.startsWith('86') &&
    digits.length === 13 &&
    CHINESE_MOBILE_PATTERN.test(digits.slice(2))
  ) {
    return digits.slice(2);
  }

  if (hadExplicitIntlPrefix) {
    const stripped = stripCountryCode(digits);
    if (stripped) {
      return stripped;
    }
  }

  return digits;
}

export function isPhoneLike(identifier: string): boolean {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return false;
  }
  const digits = digitsOnly(trimmed.replace(/^\+|^00/, ''));
  return /^\+?\d{6,20}$/.test(trimmed.replace(/[\s\-]/g, '')) || /^\d{11}$/.test(digits);
}

/** 登录时兼容历史带前缀数据，迁移完成后仍可用归一化号码匹配 */
export function buildPhoneLoginCandidates(identifier: string): string[] {
  const trimmed = identifier.trim();
  const normalized = normalizePhone(trimmed);
  const digits = digitsOnly(trimmed.replace(/^\+|^00/, ''));

  const candidates = new Set<string>(
    [trimmed, digits, normalized].filter(Boolean),
  );

  if (normalized) {
    candidates.add(`+86${normalized}`);
    candidates.add(`86${normalized}`);
    if (CHINESE_MOBILE_PATTERN.test(normalized)) {
      candidates.add(`+${normalized}`);
    }
  }

  return Array.from(candidates);
}
