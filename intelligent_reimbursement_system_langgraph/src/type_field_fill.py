"""用户手动选择报销类型后的二次字段填充（金额 + 原票 OCR → 类型 fields）。"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from json_repair import repair_json
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from src.models import FieldValueAssignment

_logger = logging.getLogger(__name__)

TYPE_FIELD_FILL_TRIGGER = "[[type_field_fill]]"


class TypeFieldFillResult(BaseModel):
    assignments: List[FieldValueAssignment] = Field(
        default_factory=list,
        description="仅填写有依据的字段；key 必须来自类型 fields 定义",
    )


def _parse_llm_json(raw: str, model_cls):
    repaired = repair_json(raw, return_objects=True)
    if not isinstance(repaired, (dict, list)):
        raise ValueError(f"LLM 输出无法解析为 JSON: {str(raw)[:200]}")
    return model_cls.model_validate(repaired)


def _parse_known_amount(raw: Any) -> Optional[float]:
    if raw is None or raw == "":
        return None
    try:
        value = float(str(raw).strip().replace(",", ""))
    except ValueError:
        return None
    return value if value > 0 else None


def _invoke_fill_llm(prompt: str) -> List[Dict[str, Any]]:
    from src.llm import llm

    resp = llm.invoke([HumanMessage(content=prompt + "\n请严格返回 JSON。")])
    parsed = _parse_llm_json(resp.content, TypeFieldFillResult)
    return list(parsed.model_dump().get("assignments") or [])


def fill_type_fields_from_ocr(
    *,
    type_payload: Dict[str, Any],
    ocr_text: str,
    known_amount: Optional[float] = None,
) -> Dict[str, Any]:
    """根据已选类型字段定义 + OCR + 已知金额，返回 {label, fields:[{key,value,...}]}。"""
    type_label = str(
        type_payload.get("label")
        or type_payload.get("name")
        or type_payload.get("code")
        or "报销类型"
    ).strip()
    fields_def = type_payload.get("fields") or []
    if not isinstance(fields_def, list):
        fields_def = []

    field_keys = [
        str(f.get("key") or "").strip()
        for f in fields_def
        if isinstance(f, dict) and str(f.get("key") or "").strip()
    ]
    skeleton = [
        {
            "key": str(f.get("key") or "").strip(),
            "label": str(f.get("label") or f.get("key") or "").strip(),
            "type": str(f.get("type") or "text"),
            "required": bool(f.get("required")),
        }
        for f in fields_def
        if isinstance(f, dict) and str(f.get("key") or "").strip()
    ]

    amount_hint = (
        f"已知发票金额为 {known_amount}，请优先赋给最合适的金额类字段（如 amount/金额）。"
        if known_amount is not None
        else "若 OCR 中有明确金额，请赋给最合适的金额类字段。"
    )
    prompt = f"""你是报销填单助手。用户已手动选定报销类型，请根据原票 OCR 为该类型字段赋值。

【报销类型】{type_label}
【字段定义 JSON】
{json.dumps(skeleton, ensure_ascii=False)}

【已知金额提示】
{amount_hint}

【规则】
1. assignments[].key 必须完全来自字段定义中的 key，禁止编造。
2. 金额必须赋到最合适的金额字段；不要把金额乱填到无关字段。
3. 其它字段：OCR 中有明确依据才填写；不合适、不确定则不要写该 key（不要硬补、不要臆造）。
4. 只返回 JSON，符合 schema。

【原票 OCR】
{(ocr_text or "")[:8000]}
"""

    try:
        assignments = _invoke_fill_llm(prompt)
    except Exception as exc:
        _logger.exception("[type_field_fill] LLM 填充失败: %s", exc)
        assignments = []

    key_set = set(field_keys)
    value_by_key: Dict[str, Any] = {}
    for row in assignments:
        if not isinstance(row, dict):
            continue
        key = str(row.get("key") or "").strip()
        if not key or key not in key_set:
            continue
        value = row.get("value")
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        value_by_key[key] = value

    # 已知金额兜底：若模型未写入任何金额类字段，写入第一个 amount/金额 key
    if known_amount is not None and known_amount > 0:
        has_amount = any(
            ("amount" in k.lower() or "金额" in k) for k in value_by_key
        )
        if not has_amount:
            for key in field_keys:
                if "amount" in key.lower() or "金额" in key:
                    value_by_key[key] = known_amount
                    break
            else:
                # 类型无金额字段时仍保留通用 amount，供飞书 extractAmount 使用
                value_by_key.setdefault("amount", known_amount)

    out_fields: List[Dict[str, Any]] = []
    for index, field in enumerate(fields_def):
        if not isinstance(field, dict):
            continue
        key = str(field.get("key") or "").strip()
        if not key or key not in value_by_key:
            continue
        out_fields.append(
            {
                **{k: v for k, v in field.items() if k != "value"},
                "key": key,
                "value": value_by_key[key],
                "sort": field.get("sort", index),
                "is_calculate": bool(field.get("is_calculate"))
                or ("amount" in key.lower() or "金额" in key),
            }
        )
    if "amount" in value_by_key and not any(
        str(f.get("key")) == "amount" for f in out_fields
    ):
        out_fields.append(
            {
                "key": "amount",
                "label": "金额",
                "type": "number",
                "required": False,
                "options": [],
                "sort": 999,
                "is_calculate": True,
                "value": value_by_key["amount"],
            }
        )

    return {
        "label": type_label,
        "fields": out_fields,
        "is_suggested_type": False,
    }


def run_type_field_fill_from_config(config: Dict[str, str]) -> Dict[str, Any]:
    type_raw = config.get("type_json") or "{}"
    try:
        type_payload = json.loads(type_raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"type_json 无效: {exc}") from exc
    if not isinstance(type_payload, dict):
        raise ValueError("type_json 必须是对象")

    ocr_text = str(config.get("ocr_text") or "")
    known_amount = _parse_known_amount(config.get("known_amount"))
    return fill_type_fields_from_ocr(
        type_payload=type_payload,
        ocr_text=ocr_text,
        known_amount=known_amount,
    )
