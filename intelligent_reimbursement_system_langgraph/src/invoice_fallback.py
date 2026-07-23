"""有有效发票号但无字段时的未匹配兜底行（供飞书进「未匹配」+ 类型下拉）。"""

from typing import Any, Dict, List, Optional


def build_unmatched_invoice_only_rows(
    invoice_meta: Dict[str, str],
    *,
    suggested_label: Optional[str] = None,
) -> List[Dict[str, Any]]:
    label = (suggested_label or "").strip() or "未识别到报销类型"
    return [
        {
            "label": label,
            "fields": [],
            "over_limit_threshold": 0,
            "is_suggested_type": True,
            "no_existing_type_match": True,
            **invoice_meta,
        }
    ]
