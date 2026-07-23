"""有有效发票号但无类型字段时的未匹配兜底，以及金额解析。"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_AMOUNT_OCR_PATTERNS = [
    re.compile(
        r"价税合计[（(]?小写[）)]?[：:\s]*[￥¥]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)"
    ),
    re.compile(
        r"价税合计[：:\s]*[￥¥]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)"
    ),
    re.compile(
        r"(?:合计金额|金额合计|总计|合计)[：:\s]*[￥¥]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)"
    ),
]

_AMOUNT_KEY_RE = re.compile(r"amount|金额|total|价税合计", re.IGNORECASE)


def _parse_amount_number(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        value = float(raw)
        return value if value > 0 else None
    text = str(raw).strip().replace(",", "").replace("￥", "").replace("¥", "")
    if not text:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return value if value > 0 else None


def extract_amount_from_ocr(ocr_text: Optional[str]) -> Optional[float]:
    if not ocr_text or not str(ocr_text).strip():
        return None
    for pattern in _AMOUNT_OCR_PATTERNS:
        match = pattern.search(ocr_text)
        if match:
            amount = _parse_amount_number(match.group(1))
            if amount is not None:
                return amount
    return None


def resolve_amount_from_dumped(dumped: Optional[Dict[str, Any]]) -> Optional[float]:
    if not isinstance(dumped, dict):
        return None

    for item in dumped.get("suggested_line_items") or []:
        if not isinstance(item, dict):
            continue
        for field in item.get("fields") or []:
            if not isinstance(field, dict):
                continue
            key = str(field.get("key") or "")
            if _AMOUNT_KEY_RE.search(key):
                amount = _parse_amount_number(field.get("value"))
                if amount is not None:
                    return amount

    for assignment in dumped.get("assignments") or []:
        if not isinstance(assignment, dict):
            continue
        key = str(assignment.get("key") or "")
        if _AMOUNT_KEY_RE.search(key):
            amount = _parse_amount_number(assignment.get("value"))
            if amount is not None:
                return amount

    for item in dumped.get("items") or []:
        if not isinstance(item, dict):
            continue
        for assignment in item.get("assignments") or []:
            if not isinstance(assignment, dict):
                continue
            key = str(assignment.get("key") or "")
            if _AMOUNT_KEY_RE.search(key):
                amount = _parse_amount_number(assignment.get("value"))
                if amount is not None:
                    return amount

    return None


def resolve_unmatched_amount(
    dumped: Optional[Dict[str, Any]],
    ocr_text: Optional[str] = None,
) -> Optional[float]:
    return resolve_amount_from_dumped(dumped) or extract_amount_from_ocr(ocr_text)


def build_unmatched_invoice_only_rows(
    invoice_meta: Dict[str, str],
    *,
    suggested_label: Optional[str] = None,
    amount: Optional[float] = None,
    ocr_text: Optional[str] = None,
) -> List[Dict[str, Any]]:
    label = (suggested_label or "").strip() or "未识别到报销类型"
    fields: List[Dict[str, Any]] = []
    if amount is not None and amount > 0:
        fields.append(
            {
                "key": "amount",
                "label": "金额",
                "type": "number",
                "required": False,
                "options": [],
                "sort": 0,
                "is_calculate": True,
                "value": amount,
            }
        )
    row: Dict[str, Any] = {
        "label": label,
        "fields": fields,
        "over_limit_threshold": 0,
        "is_suggested_type": True,
        "no_existing_type_match": True,
        **invoice_meta,
    }
    if ocr_text and str(ocr_text).strip():
        row["ocr_text"] = str(ocr_text).strip()[:8000]
    return [row]
