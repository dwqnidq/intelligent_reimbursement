export type SystemReimbursementType = {
  _id: string;
  label?: string;
  name?: string;
  code?: string;
};

export type RecognitionRowInput = {
  label?: string;
  is_suggested_type?: boolean;
  suggested_type_code?: string;
};

export type TypeMatchResult =
  | { matched: true; category_id: string; category_label: string }
  | { matched: false };

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function matchReimbursementType(
  row: RecognitionRowInput,
  types: SystemReimbursementType[],
): TypeMatchResult {
  if (row.is_suggested_type) {
    return { matched: false };
  }

  const candidates = [
    normalize(row.label),
    normalize(row.suggested_type_code),
  ].filter(Boolean);

  if (candidates.length === 0) {
    return { matched: false };
  }

  for (const type of types) {
    const typeCandidates = [
      normalize(type.label),
      normalize(type.name),
      normalize(type.code),
    ].filter(Boolean);

    if (candidates.some((c) => typeCandidates.includes(c))) {
      return {
        matched: true,
        category_id: String(type._id),
        category_label: String(type.label ?? type.name ?? type.code ?? ''),
      };
    }
  }

  return { matched: false };
}
