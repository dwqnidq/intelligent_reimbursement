"""从 MongoDB 读取 reimbursement_types 集合（与 Nest 报销类型配置一致）"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from reimbursement_langgraph.config import settings

logger = logging.getLogger(__name__)


def _normalize_options_for_prompt(raw: Any) -> List[Dict[str, str]]:
    if not raw:
        return []
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, str]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(
                {
                    "label": str(item.get("label", "")),
                    "value": str(item.get("value", item.get("label", ""))),
                }
            )
        else:
            s = str(item)
            out.append({"label": s, "value": s})
    return out


def _serialize_type_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    fields_out: List[Dict[str, Any]] = []
    for f in doc.get("fields") or []:
        if not isinstance(f, dict):
            continue
        fields_out.append(
            {
                "key": f.get("key"),
                "label": f.get("label"),
                "type": f.get("type") or "text",
                "required": bool(f.get("required", False)),
                "options": _normalize_options_for_prompt(f.get("options")),
                "sort": int(f.get("sort", 0)),
                "is_calculate": bool(f.get("is_calculate", False)),
            }
        )
    fields_out.sort(key=lambda x: x.get("sort", 0))
    return {
        "code": doc.get("code"),
        "label": doc.get("label"),
        "over_limit_threshold": doc.get("over_limit_threshold"),
        "fields": fields_out,
    }


def build_types_skeleton_for_llm(types_payload: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    供智能填单提示词使用：类型级保留 code（若有）+ label；字段级仅 key、label。
    完整类型定义仍在 types_payload 中，由服务端按 label/code 匹配后按 key 合并 value。
    """
    out: List[Dict[str, Any]] = []
    for t in types_payload or []:
        if not isinstance(t, dict):
            continue
        type_label = str(t.get("label") or "").strip()
        if not type_label:
            type_label = str(t.get("code") or "").strip()
        code_str = str(t.get("code") or "").strip()
        fields_sl: List[Dict[str, str]] = []

        def _sort_key(fd: Any) -> int:
            if not isinstance(fd, dict):
                return 0
            try:
                return int(fd.get("sort", 0))
            except (TypeError, ValueError):
                return 0

        for f in sorted((t.get("fields") or []), key=_sort_key):
            if not isinstance(f, dict):
                continue
            k = f.get("key")
            if not k:
                continue
            sk = str(k).strip()
            fl = str(f.get("label") or sk).strip() or sk
            fields_sl.append({"key": sk, "label": fl})
        if not type_label and not fields_sl:
            continue
        row: Dict[str, Any] = {"label": type_label, "fields": fields_sl}
        if code_str:
            row["code"] = code_str
        out.append(row)
    return out


# 与 Nest 非管理员列表接近：启用 = status 为 1；旧数据可能未写 status（Mongoose 读时有默认，原始文档可能没有字段）
_ACTIVE_TYPE_FILTER: Dict[str, Any] = {
    "$or": [
        {"status": 1},
        {"status": {"$exists": False}},
    ]
}


def fetch_active_reimbursement_types() -> List[Dict[str, Any]]:
    """
    查询「启用」报销类型。未配置 settings.MONGODB_URI、无法解析库名、或查询失败时返回 []。
    """
    if not settings.MONGODB_URI:
        logger.warning("[reimbursement_types] 未配置 settings.MONGODB_URI，跳过数据库查询")
        return []

    try:
        with MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=8000) as client:
            db = client.get_default_database()
            if db is None:
                if settings.MONGODB_DB_NAME:
                    db = client[settings.MONGODB_DB_NAME]
                    logger.info(
                        "[reimbursement_types] URI 无库名段，已使用 settings.MONGODB_DB_NAME=%s",
                        settings.MONGODB_DB_NAME,
                    )
                else:
                    logger.warning(
                        "[reimbursement_types] MongoDB URI 未包含数据库名（例如 .../Reimbursement），"
                        "且未设置环境变量 settings.MONGODB_DB_NAME，无法选择集合。"
                    )
                    return []

            coll = db["reimbursement_types"]
            cursor = coll.find(
                _ACTIVE_TYPE_FILTER,
                projection={
                    "code": 1,
                    "label": 1,
                    "fields": 1,
                    "over_limit_threshold": 1,
                    "status": 1,
                },
            ).sort("createdAt", 1)
            rows = [_serialize_type_doc(d) for d in cursor]

            if not rows:
                try:
                    total = coll.count_documents({})
                    n_match = coll.count_documents(_ACTIVE_TYPE_FILTER)
                    n_s1 = coll.count_documents({"status": 1})
                    n_s0 = coll.count_documents({"status": 0})
                    n_no_status = coll.count_documents({"status": {"$exists": False}})
                    logger.warning(
                        "[reimbursement_types] 启用条件查询结果为 0 条。"
                        "当前 MongoDB 数据库名=%s，集合 reimbursement_types 总文档=%d；"
                        "符合启用条件=%d；其中 status=1=%d、无 status 字段=%d、status=0=%d。"
                        "总文档为 0 表示该库里此集合为空：请把 LangGraph 的 settings.MONGODB_URI 改成与 Nest 后端完全一致（含 /库名），"
                        "或在后台「报销类型管理」先创建类型后再试。",
                        db.name,
                        total,
                        n_match,
                        n_s1,
                        n_no_status,
                        n_s0,
                    )
                except Exception as diag_e:
                    logger.warning("[reimbursement_types] 诊断计数失败: %s", diag_e)

            return rows
    except PyMongoError as e:
        logger.exception("[reimbursement_types] MongoDB 查询失败: %s", e)
        return []
    except Exception as e:
        logger.exception("[reimbursement_types] 未预期错误: %s", e)
        return []


def _is_meaningful_value(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, str) and not v.strip():
        return False
    if isinstance(v, (list, dict)) and len(v) == 0:
        return False
    return True


def assignments_list_to_field_map(assignments: Any) -> Dict[str, Any]:
    """将模型输出的 [{key, value}, ...] 转为字段映射；忽略空值。"""
    out: Dict[str, Any] = {}
    if not isinstance(assignments, list):
        return out
    for item in assignments:
        if not isinstance(item, dict):
            continue
        k = item.get("key")
        v = item.get("value")
        if not k:
            continue
        if _is_meaningful_value(v):
            out[str(k).strip()] = v
    return out


def _normalize_label(s: Any) -> str:
    t = (s or "") if isinstance(s, str) else str(s or "")
    t = t.strip()
    t = re.sub(r"\s+", " ", t)
    return t


def find_matched_reimbursement_type(
    types_payload: List[Dict[str, Any]],
    *,
    label: str,
    code: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """先按 code，再按 label 精确匹配；不做模糊归类、不因仅一条类型而自动套用。"""
    if not types_payload:
        return None

    c = (code or "").strip()
    if c:
        for t in types_payload:
            if (t.get("code") or "").strip() == c:
                ln_m = _normalize_label(label)
                if ln_m and _normalize_label(t.get("label")) != ln_m:
                    logger.warning(
                        "[reimbursement_types] 模型 code=%s 与输出 label=%s 和库中该类型 label=%s 不一致，以 code 为准",
                        c,
                        label,
                        t.get("label"),
                    )
                return t
    ln = _normalize_label(label)
    if ln:
        for t in types_payload:
            if _normalize_label(t.get("label")) == ln:
                return t
    return None


def _guess_field_type_for_suggested(v: Any) -> str:
    if isinstance(v, bool):
        return "text"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return "number"
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return "text"
        try:
            float(s.replace(",", ""))
            return "number"
        except ValueError:
            return "text"
    return "text"


def build_suggested_rows_from_assignment_maps(
    type_label: str,
    items_field_values: List[Dict[str, Any]],
    *,
    type_code: Optional[str] = None,
    over_limit_threshold: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    无法匹配已有类型时，根据模型输出的 key→value 构造「建议类型」明细行（字段名暂用 key 作 label）。
    """
    label_stripped = (type_label or "").strip() or "识别建议类型"
    thr = float(over_limit_threshold) if over_limit_threshold is not None else 30000.0
    lines: List[Dict[str, Any]] = [
        x if isinstance(x, dict) else {} for x in (items_field_values or [])
    ]
    if not lines:
        lines = [{}]

    code_out = (type_code or "").strip() or None
    rows_out: List[Dict[str, Any]] = []
    for fv in lines:
        row_fields: List[Dict[str, Any]] = []
        for i, (k, v) in enumerate(sorted(fv.items(), key=lambda kv: str(kv[0]))):
            if not _is_meaningful_value(v):
                continue
            sk = str(k).strip()
            if not sk:
                continue
            row_fields.append(
                {
                    "key": sk,
                    "label": sk,
                    "type": _guess_field_type_for_suggested(v),
                    "required": False,
                    "options": [],
                    "sort": i,
                    "is_calculate": False,
                    "value": v,
                }
            )
        if row_fields:
            rows_out.append(
                {
                    "label": label_stripped,
                    "fields": row_fields,
                    "over_limit_threshold": thr,
                    "is_suggested_type": True,
                    "suggested_type_code": code_out,
                }
            )

    if not rows_out:
        return [
            {
                "label": label_stripped,
                "fields": [],
                "over_limit_threshold": thr,
                "is_suggested_type": True,
                "suggested_type_code": code_out,
                "fill_error": "未从赋值中提取到有效字段，请重试或更换材料",
            }
        ]
    return rows_out


def _normalize_suggested_field_type(raw: Any) -> str:
    t = str(raw or "text").strip().lower()
    if t in ("text", "number", "date", "select", "textarea"):
        return t
    return "text"


def build_form_result_array_from_suggested_model_output(
    dumped: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """解析模型 structured 中的 suggested_line_items → result 行（含 is_suggested_type）。"""
    type_label = (
        dumped.get("suggested_type_label") or dumped.get("label") or ""
    ).strip() or "识别建议类型"
    type_code = (dumped.get("suggested_type_code") or "").strip() or None
    raw_thr = dumped.get("suggested_over_limit_threshold")
    thr = 30000.0
    if raw_thr is not None and isinstance(raw_thr, (int, float)):
        thr = float(raw_thr)

    items = dumped.get("suggested_line_items") or []
    if not isinstance(items, list) or not items:
        return []

    rows_out: List[Dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        raw_fields = it.get("fields") or []
        if not isinstance(raw_fields, list):
            continue
        row_fields: List[Dict[str, Any]] = []
        for fi, ent in enumerate(raw_fields):
            if not isinstance(ent, dict):
                continue
            sk = str(ent.get("key") or "").strip()
            if not sk:
                continue
            lbl = str(ent.get("label") or sk).strip() or sk
            typ = _normalize_suggested_field_type(ent.get("type"))
            sort_v = ent.get("sort")
            sort_i = int(sort_v) if isinstance(sort_v, int) else fi
            opts_raw = ent.get("options")
            opts: List[Dict[str, str]] = []
            if isinstance(opts_raw, list):
                for o in opts_raw:
                    if isinstance(o, dict):
                        opts.append(
                            {
                                "label": str(o.get("label", "")),
                                "value": str(o.get("value", o.get("label", ""))),
                            }
                        )
                    else:
                        s = str(o)
                        opts.append({"label": s, "value": s})
            entry: Dict[str, Any] = {
                "key": sk,
                "label": lbl,
                "type": typ,
                "required": bool(ent.get("required", False)),
                "options": opts,
                "sort": sort_i,
                "is_calculate": bool(ent.get("is_calculate", False)),
            }
            v = ent.get("value")
            if _is_meaningful_value(v):
                entry["value"] = v
            row_fields.append(entry)
        row_fields.sort(key=lambda x: x.get("sort", 0))
        if row_fields:
            rows_out.append(
                {
                    "label": type_label,
                    "fields": row_fields,
                    "over_limit_threshold": thr,
                    "is_suggested_type": True,
                    "suggested_type_code": type_code,
                }
            )

    return rows_out


def _value_for_db_key(fv: Dict[str, Any], sk: str) -> Any:
    """从模型输出的 field_values 中取 sk 对应的值（支持 key 首尾空格不一致）。"""
    if sk in fv:
        return fv.get(sk)
    for raw_k, raw_v in fv.items():
        if str(raw_k).strip() == sk:
            return raw_v
    return None


def _build_fields_row_from_matched(
    matched: Dict[str, Any],
    field_values: Dict[str, Any],
) -> List[Dict[str, Any]]:
    fv = field_values if isinstance(field_values, dict) else {}
    new_fields: List[Dict[str, Any]] = []
    for dbf in sorted(matched.get("fields") or [], key=lambda x: x.get("sort", 0)):
        key = dbf.get("key")
        if not key:
            continue
        sk = str(key)
        entry: Dict[str, Any] = {
            "key": sk,
            "label": dbf.get("label"),
            "type": dbf.get("type", "text"),
            "required": bool(dbf.get("required", False)),
            "options": dbf.get("options") or [],
            "sort": int(dbf.get("sort", 0)),
            "is_calculate": bool(dbf.get("is_calculate", False)),
        }
        raw_v = _value_for_db_key(fv, sk)
        if _is_meaningful_value(raw_v):
            entry["value"] = raw_v
        new_fields.append(entry)
    return new_fields


def build_form_result_array_from_db_values(
    types_payload: List[Dict[str, Any]],
    label: str,
    items_field_values: List[Dict[str, Any]],
    *,
    code: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    填单节点 result：**顶层数组**，每项一条明细：
    {{ "label", "fields": [...], "over_limit_threshold" }}；错误时为单元素且含 fill_error。
    """
    label_stripped = (label or "").strip()
    lines: List[Dict[str, Any]] = [
        x if isinstance(x, dict) else {} for x in (items_field_values or [])
    ]
    if not lines:
        lines = [{}]

    matched = find_matched_reimbursement_type(
        types_payload, label=label_stripped, code=code
    )

    if not matched:
        return build_suggested_rows_from_assignment_maps(
            label_stripped or "识别建议类型",
            lines,
            type_code=code,
            over_limit_threshold=None,
        )

    threshold = matched.get("over_limit_threshold")
    if threshold is None:
        threshold = 30000

    resolved_label = matched.get("label") or label_stripped
    rows_out: List[Dict[str, Any]] = []
    for fv in lines:
        row_fields = _build_fields_row_from_matched(matched, fv)
        rows_out.append(
            {
                "label": resolved_label,
                "fields": row_fields,
                "over_limit_threshold": threshold,
            }
        )

    if not rows_out or not rows_out[0].get("fields"):
        return [
            {
                "label": resolved_label,
                "fields": [],
                "over_limit_threshold": threshold,
                "fill_error": "该报销类型在数据库中未配置任何字段（fields 为空）。",
            }
        ]

    return rows_out


def build_form_result_from_db_values(
    types_payload: List[Dict[str, Any]],
    label: str,
    field_values: Dict[str, Any] | None,
    *,
    code: Optional[str] = None,
) -> Dict[str, Any]:
    """单条映射 → 旧版扁平 {{ label, fields, ... }}（脚本/兼容）。"""
    fv = field_values if isinstance(field_values, dict) else {}
    arr = build_form_result_array_from_db_values(
        types_payload, label, [fv], code=code
    )
    if not arr:
        return {"label": "", "fields": [], "over_limit_threshold": 0}
    return dict(arr[0])
