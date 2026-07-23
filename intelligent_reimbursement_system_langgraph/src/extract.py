"""表单提取逻辑 - 发票识别和智能填单"""
import json
import logging
import mimetypes as _mimetypes
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from json_repair import repair_json
from langchain_core.messages import HumanMessage

from src.db.invoice_infos_repo import is_invoice_number_uploaded
from src.db.reimbursement_types_repo import (
    assignments_list_to_field_map,
    build_form_result_array_from_db_values,
    build_form_result_array_from_suggested_model_output,
    build_suggested_rows_from_assignment_maps,
    build_types_skeleton_for_llm,
)
from src.invoice_fallback import (
    build_unmatched_invoice_only_rows,
    resolve_unmatched_amount,
)
from src.llm import llm, llm_vision
from src.models import InvoiceResultList, ReimbursementFormValuesExtract

_logger = logging.getLogger(__name__)

_INVOICE_NUMBER_PATTERNS = [
    re.compile(r"发票号码[：:\s]*([0-9]{8,20})"),
    re.compile(r"票据号码[：:\s]*([0-9]{8,20})"),
    re.compile(r"Invoice\s*No\.?\s*[：:\s]*([0-9]{8,20})", re.IGNORECASE),
]

_INVOICE_TITLE_PATTERNS = [
    re.compile(r"购买方[^\n]*?名\s*称[：:\s]*([^\n]{2,80})"),
    re.compile(r"发票抬头[：:\s]*([^\n]{2,80})"),
    re.compile(r"名\s*称[：:\s]*([^\n]{2,80})"),
]

_INVOICE_DATE_PATTERNS = [
    re.compile(r"开票日期[：:\s]*(\d{4}[-年/]\d{1,2}[-月/]\d{1,2}日?)"),
    re.compile(r"开票日期[：:\s]*(\d{4}\.\d{1,2}\.\d{1,2})"),
]

_INVOICE_ISSUER_PATTERNS = [
    re.compile(r"开票人[：:\s]*([^\n\s]{1,20})"),
]

_INVOICE_NUMBER_VALID_RE = re.compile(r"^[0-9]{8,20}$")


def is_valid_invoice_number(invoice_number: Optional[str]) -> bool:
    """发票号码须为 8–20 位纯数字（与 OCR 提取规则一致）。"""
    normalized = (invoice_number or "").strip()
    return bool(_INVOICE_NUMBER_VALID_RE.fullmatch(normalized))


def extract_invoice_number_from_ocr(ocr_text: Optional[str]) -> str:
    """从 OCR 正文用正则提取发票号码；LLM 未返回时的可靠兜底。"""
    if not ocr_text or not ocr_text.strip():
        return ""
    for pattern in _INVOICE_NUMBER_PATTERNS:
        match = pattern.search(ocr_text)
        if match:
            return match.group(1).strip()
    return ""


def _normalize_invoice_date(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    text = text.replace("年", "-").replace("月", "-").replace("日", "").replace("/", "-").replace(".", "-")
    parts = [p for p in text.split("-") if p]
    if len(parts) < 3:
        return raw.strip()
    try:
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        return f"{y:04d}-{m:02d}-{d:02d}"
    except ValueError:
        return raw.strip()


def extract_invoice_title_from_ocr(ocr_text: Optional[str]) -> str:
    if not ocr_text or not ocr_text.strip():
        return ""
    for pattern in _INVOICE_TITLE_PATTERNS:
        match = pattern.search(ocr_text)
        if match:
            return match.group(1).strip()
    return ""


def extract_invoice_date_from_ocr(ocr_text: Optional[str]) -> str:
    if not ocr_text or not ocr_text.strip():
        return ""
    for pattern in _INVOICE_DATE_PATTERNS:
        match = pattern.search(ocr_text)
        if match:
            return _normalize_invoice_date(match.group(1))
    return ""


def extract_invoice_issuer_from_ocr(ocr_text: Optional[str]) -> str:
    if not ocr_text or not ocr_text.strip():
        return ""
    for pattern in _INVOICE_ISSUER_PATTERNS:
        match = pattern.search(ocr_text)
        if match:
            return match.group(1).strip()
    return ""


def _resolve_invoice_meta(
    dumped: Dict[str, Any],
    ocr_text: Optional[str],
) -> Dict[str, str]:
    inv = str(dumped.get("invoice_number") or "").strip()
    if not inv:
        inv = extract_invoice_number_from_ocr(ocr_text)

    title = str(dumped.get("invoice_title") or "").strip()
    if not title:
        title = extract_invoice_title_from_ocr(ocr_text)

    date_raw = str(dumped.get("invoice_date") or "").strip()
    if date_raw:
        date_val = _normalize_invoice_date(date_raw)
    else:
        date_val = extract_invoice_date_from_ocr(ocr_text)

    issuer = str(dumped.get("issuer") or "").strip()
    if not issuer:
        issuer = extract_invoice_issuer_from_ocr(ocr_text)

    return {
        "invoice_number": inv,
        "invoice_title": title,
        "invoice_date": date_val,
        "issuer": issuer,
    }


def _attach_invoice_meta_to_rows(
    batch_for_file: List[Dict[str, Any]],
    invoice_meta: Dict[str, str],
) -> None:
    for row in batch_for_file:
        if isinstance(row, dict):
            row.update(invoice_meta)


def _duplicate_invoice_row(
    invoice_meta: Dict[str, str],
    *,
    batch_duplicate: bool = False,
) -> List[Dict[str, Any]]:
    inv = invoice_meta.get("invoice_number", "")
    if batch_duplicate:
        fill_error = f"与本批其他文件发票号码重复：{inv}" if inv else "与本批其他文件重复"
    else:
        fill_error = f"该发票已上传，发票号码：{inv}" if inv else "该发票已上传"
    row: Dict[str, Any] = {
        "label": "",
        "fields": [],
        "over_limit_threshold": 0,
        "invoice_duplicate": True,
        "fill_error": fill_error,
        **invoice_meta,
    }
    if batch_duplicate:
        row["invoice_batch_duplicate"] = True
    return [row]


def _first_invoice_number_from_batch(batch: List[Dict[str, Any]]) -> str:
    for row in batch:
        if not isinstance(row, dict):
            continue
        inv = str(row.get("invoice_number") or "").strip()
        if inv:
            return inv
    return ""


def apply_batch_invoice_dedup(
    accumulated: List[List[Dict[str, Any]]],
) -> List[List[Dict[str, Any]]]:
    """同批多文件：相同发票号码仅保留首条识别结果，其余标记为 batch 重复。"""
    seen: Dict[str, int] = {}
    out: List[List[Dict[str, Any]]] = []
    for idx, batch in enumerate(accumulated):
        if not batch:
            out.append(batch)
            continue
        head = batch[0] if isinstance(batch[0], dict) else {}
        if head.get("invoice_duplicate"):
            out.append(batch)
            continue
        inv = _first_invoice_number_from_batch(batch)
        if not inv:
            out.append(batch)
            continue
        if inv in seen:
            meta = {
                "invoice_number": inv,
                "invoice_title": str(head.get("invoice_title") or ""),
                "invoice_date": str(head.get("invoice_date") or ""),
                "issuer": str(head.get("issuer") or ""),
            }
            out.append(_duplicate_invoice_row(meta, batch_duplicate=True))
            _logger.info(
                "[报销表单提取] 文件 %d 与本批文件 %d 发票号重复: %s",
                idx + 1,
                seen[inv] + 1,
                inv,
            )
        else:
            seen[inv] = idx
            out.append(batch)
    return out


def _parse_llm_json(raw: str, model_cls):
    """从 LLM 原始文本中提取并解析 JSON 为 Pydantic 模型。"""
    repaired = repair_json(raw, return_objects=True)
    if not isinstance(repaired, (dict, list)):
        raise ValueError(f"LLM 输出无法解析为 JSON: {raw[:200]}")
    return model_cls.model_validate(repaired)


def _build_form_extract_message_parts_for_one_file(
    file_data: str, *, ocr_text: Optional[str] = None,
) -> List[dict]:
    """单份文件 → 多模态片段：有 OCR 文字时直接用文字；否则 PDF 抽文字、图片发 image_url。"""
    parts: List[dict] = []
    if "::" in file_data:
        file_name, b64_content = file_data.split("::", 1)
    else:
        file_name, b64_content = file_data, None

    if not b64_content:
        parts.append(
            {
                "type": "text",
                "text": f"[文件] 仅文件名：{file_name}（无图像数据，请根据文件名推断可能类型）",
            }
        )
        return parts

    # 如果已有 OCR 提取的文字，直接使用，跳过图片发送
    if ocr_text and ocr_text.strip():
        parts.append(
            {
                "type": "text",
                "text": f"文件「{file_name}」OCR 提取文字：\n{ocr_text[:8000]}",
            }
        )
        return parts

    mime, _ = _mimetypes.guess_type(file_name)
    if not mime:
        mime = "image/jpeg"

    if mime == "application/pdf":
        try:
            import fitz  # pymupdf
            import base64 as _b64

            pdf_bytes = _b64.b64decode(b64_content)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            parts.append(
                {
                    "type": "text",
                    "text": f"PDF「{file_name}」提取文字：\n{text[:8000]}",
                }
            )
        except Exception as e:
            _logger.warning("[报销表单提取] PDF %s 处理失败: %s", file_name, e)
            parts.append(
                {
                    "type": "text",
                    "text": f"PDF「{file_name}」解析失败：{e}",
                }
            )
    else:
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64_content}"},
            }
        )
    return parts


def _form_extract_prompt_with_db(
    types_payload: List[Dict[str, Any]],
    *,
    file_index: int,
    file_total: int,
) -> str:
    skeleton = build_types_skeleton_for_llm(types_payload)
    types_json = json.dumps(skeleton, ensure_ascii=False)
    n_types = len(types_payload) if types_payload else 0
    multi_type_rule = ""
    if n_types >= 2:
        multi_type_rule = f"""
**【多类型严格规则】** 当前启用类型共 **{n_types}** 种。你必须：
- 同时填写 **code** 与 **name**，且二者必须来自**同一条**类型摘要记录（逐字与 JSON 一致）；
- **禁止**因「上一文件」或「同批其它文件」已选某类型，就把本文件也归为该类——**每个文件单独判断**，互不影响。
"""

    return f"""你是企业报销助手。用户上传了票据（发票、收据、订单截图等）。

**【当前为第 {file_index}/{file_total} 个文件】** 本消息**只含这一份**材料（PDF 为抽取正文，图片为单图）。你只能依据**本份**内容输出结果；**禁止**臆造同批其它文件中的信息。

**【类型判定铁律 · 必须遵守】**
1. **先读 description**：类型摘要中每条若有 **description**，须结合其「适用范围、典型票据、排除项」判断本份材料归属；description 与 name 不一致时以 description 的业务边界为准。
2. **多符合时选最贴切的一类（专类优先）**：若本份材料同时符合 2 种及以上类型的 description，**禁止**随便选第一个或选范围更宽的泛类；须在所有候选中择优，只输出**最贴切、最具体**的一条：
   - **专类 > 泛类**：有更窄、业务含义更精确的类型时，必须选专类。
   - **典型择优**（内心比对，不必输出过程）：
     - 话费 / 流量 / 宽带 / 电信账单 → **通讯费**（非办公费）
     - 酒店 / 宾馆 / 住宿房费 → **住宿费**（非差旅费）
     - 打车 / 地铁 / 火车 / 机票 / 过路费 → **交通费**（非差旅费；除非票据为出差打包汇总单且无法拆分）
     - 顺丰 / 快递 / 物流运费 → **快递费**（非办公费）
     - 宴请外部客户 → **招待费**（非团建费、福利费）
     - 内部部门团建聚餐 → **团建费**（非招待费、福利费）
   - 若某类型的 description **排除项**明确写了本业务，则该类型直接淘汰。
   - 仍无法区分时，选 description 中「典型票据/识别关键词」与本份材料字面证据**重合最多**的一类；仍平局再走「无法归入」模式。
3. **业务实质优先**：先判断本份材料本身是什么业务，再按上条择优。若摘要中无完全对应类型，应走「无法归入」模式而非硬套。
4. **禁止惯性归类**：即使用户一次上传多份文件，**每一份**都要重新看内容选型；**禁止**默认与上一份相同。
5. **证据来自本份**：选型理由只能来自当前 PDF/图片/文件名中的文字，不得套用其它文件的结论。
{multi_type_rule}
下方「类型摘要」JSON 含每种类型的 **code**（若有）、**name**（报销类型业务名称）、**description**（业务描述，用于精准区分相近类型，若有）以及各字段的 **key**、**label**（中文名）。不含字段类型、选项等；服务端会按 name 从数据库匹配类型，并按 key 补全字段后返回展示用 label。

类型摘要：
{types_json}

**两种互斥模式（二选一）：**

**A. 能明确归入某一已有类型**（本份材料与摘要中**某一条**的业务含义、字段语义一致）：
- 设置 no_existing_type_match = false。
- **code**、**name** 必须与所选摘要条目**完全一致**（{f"二者必填且同属一条；" if n_types >= 2 else "有 code 时建议填写以便精确匹配；仅一种类型时 code 可空。"}）
- **items**：每条报销明细一项；每项 {{ "assignments": [ {{ "key": "...", "value": 识别值 }}, ... ] }}。
  - **key** 必须且只能来自**你所选那一条**摘要里的 **fields[].key**，禁止用其它类型的 key。
  - **value** 仅来自本份票据；无把握则不填该 key。
- 多物品/多行拆多条 items；单条明细时 items 长度为 1；完全无法识别时 items 可为 []。
- **invoice_number**：从本份票据识别发票号码（增值税/电子发票的发票号码）；无则留空字符串。
- **invoice_title**：发票抬头（购买方名称/公司名称）；无则留空字符串。
- **invoice_date**：开票日期，格式 YYYY-MM-DD；无则留空字符串。
- **issuer**：开票人；无则留空字符串。

**B. 无法合理归入任一已有类型**：
- 设置 no_existing_type_match = true。
- 填写 suggested_* 与 suggested_line_items；items / assignments 留空。

number 类用纯数字，不要单位。"""


def _dumped_extract_to_lines_fv(dumped: Dict[str, Any]) -> List[Dict[str, Any]]:
    items_raw = dumped.get("items")
    lines_fv: List[Dict[str, Any]] = []
    if isinstance(items_raw, list) and len(items_raw) > 0:
        for it in items_raw:
            if isinstance(it, dict):
                lines_fv.append(assignments_list_to_field_map(it.get("assignments")))
            else:
                lines_fv.append({})
    else:
        legacy = assignments_list_to_field_map(dumped.get("assignments"))
        if legacy:
            lines_fv = [legacy]
        elif isinstance(dumped.get("field_values"), dict) and dumped.get("field_values"):
            lines_fv = [dict(dumped["field_values"])]
        else:
            lines_fv = []
    return lines_fv


def _lines_fv_has_any_value(lines_fv: List[Dict[str, Any]]) -> bool:
    for m in lines_fv:
        if m:
            return True
    return False


def _form_extract_one_file(
    idx: int,
    file_data: str,
    types_payload: List[Dict[str, Any]],
    total_files: int,
    *,
    ocr_text: Optional[str] = None,
) -> Tuple[int, List[Dict[str, Any]], Optional[str]]:
    """
    单文件智能填单。返回 (下标, 该文件明细批次, 失败摘要或 None)。
    供线程池并发调用；各自独立 invoke LLM，无共享可变状态。
    """
    short_name = file_data.split("::", 1)[0] if "::" in file_data else file_data
    batch_for_file: List[Dict[str, Any]] = []
    try:
        file_parts = _build_form_extract_message_parts_for_one_file(file_data, ocr_text=ocr_text)
        if not file_parts:
            return idx, [], None
        prompt_text = _form_extract_prompt_with_db(
            types_payload,
            file_index=idx + 1,
            file_total=total_files,
        )
        prompt_text += "\n\n请严格返回 JSON，不要包含 markdown 代码块或其他文本。"
        text_intro = {"type": "text", "text": prompt_text}
        msg = HumanMessage(content=[text_intro, *file_parts])
        resp = llm_vision.invoke([msg])
        parsed = _parse_llm_json(resp.content, ReimbursementFormValuesExtract)
        dumped = parsed.model_dump()
        invoice_meta = _resolve_invoice_meta(dumped, ocr_text)
        inv = invoice_meta["invoice_number"]

        if not is_valid_invoice_number(inv):
            _logger.info(
                "[报销表单提取] 第 %d/%d 个文件「%s」未识别到有效发票号码",
                idx + 1,
                total_files,
                short_name,
            )
            return idx, [], f"{short_name}: 未识别到有效发票号码"

        if is_invoice_number_uploaded(inv):
            _logger.info(
                "[报销表单提取] 第 %d/%d 个文件「%s」发票已上传: %s",
                idx + 1,
                total_files,
                short_name,
                invoice_meta["invoice_number"],
            )
            return idx, _duplicate_invoice_row(invoice_meta), None

        n_tp = len(types_payload)
        if (
            n_tp >= 2
            and not dumped.get("no_existing_type_match")
            and not str(dumped.get("code") or "").strip()
        ):
            _logger.warning(
                "[报销表单提取] 启用类型≥2 但本文件未返回 code，易与上一文件类型混淆: %s",
                short_name,
            )
        if (
            n_tp >= 2
            and not dumped.get("no_existing_type_match")
            and not str(dumped.get("name") or "").strip()
        ):
            _logger.warning(
                "[报销表单提取] 启用类型≥2 但本文件未返回 name，易选型错误: %s",
                short_name,
            )

        if dumped.get("no_existing_type_match"):
            batch_for_file = build_form_result_array_from_suggested_model_output(dumped)
            has_fields = batch_for_file and any(
                len((r.get("fields") or [])) > 0 for r in batch_for_file
            )
            if not has_fields:
                lines_fb = _dumped_extract_to_lines_fv(dumped)
                if _lines_fv_has_any_value(lines_fb):
                    stc = (dumped.get("suggested_type_code") or "").strip()
                    cdc = (dumped.get("code") or "").strip()
                    batch_for_file = build_suggested_rows_from_assignment_maps(
                        dumped.get("suggested_type_label") or dumped.get("label") or "",
                        lines_fb,
                        type_code=stc or cdc or None,
                        over_limit_threshold=dumped.get("suggested_over_limit_threshold"),
                    )
            has_fields = batch_for_file and any(
                len((r.get("fields") or [])) > 0 for r in batch_for_file
            )
            if not has_fields:
                _logger.info(
                    "[报销表单提取] 第 %d/%d 个文件「%s」建议类型路径无有效字段，"
                    "保留发票号供手动选类型",
                    idx + 1,
                    total_files,
                    short_name,
                )
                amount = resolve_unmatched_amount(dumped, ocr_text)
                batch_for_file = build_unmatched_invoice_only_rows(
                    invoice_meta,
                    suggested_label=str(
                        dumped.get("suggested_type_label")
                        or dumped.get("label")
                        or ""
                    ),
                    amount=amount,
                    ocr_text=ocr_text,
                )
        else:
            lines_fv = _dumped_extract_to_lines_fv(dumped)
            if not _lines_fv_has_any_value(lines_fv):
                _logger.info(
                    "[报销表单提取] 第 %d/%d 个文件「%s」无有效 assignments，"
                    "保留发票号供手动选类型",
                    idx + 1,
                    total_files,
                    short_name,
                )
                amount = resolve_unmatched_amount(dumped, ocr_text)
                batch_for_file = build_unmatched_invoice_only_rows(
                    invoice_meta,
                    suggested_label=str(
                        dumped.get("name") or dumped.get("label") or ""
                    ),
                    amount=amount,
                    ocr_text=ocr_text,
                )
            else:
                batch_for_file = list(
                    build_form_result_array_from_db_values(
                        types_payload,
                        dumped.get("name") or dumped.get("label") or "",
                        lines_fv,
                        code=(dumped.get("code") or "") or None,
                    )
                )

        # 所有成功批次挂上 OCR，供未匹配二次填单
        ocr_snip = (ocr_text or "").strip()[:8000]
        if ocr_snip:
            for row in batch_for_file:
                if isinstance(row, dict) and not row.get("ocr_text"):
                    row["ocr_text"] = ocr_snip

        _logger.info(
            "[报销表单提取] 第 %d/%d 个文件「%s」内层条数=%d",
            idx + 1,
            total_files,
            short_name,
            len(batch_for_file),
        )
        if invoice_meta["invoice_number"]:
            _logger.info(
                "[报销表单提取] 第 %d/%d 个文件「%s」发票号码=%s 抬头=%s 日期=%s 开票人=%s",
                idx + 1,
                total_files,
                short_name,
                invoice_meta["invoice_number"],
                invoice_meta["invoice_title"] or "—",
                invoice_meta["invoice_date"] or "—",
                invoice_meta["issuer"] or "—",
            )
        _attach_invoice_meta_to_rows(batch_for_file, invoice_meta)
        return idx, batch_for_file, None
    except Exception as e:
        _logger.exception(
            "[报销表单提取] 第 %d/%d 个文件「%s」失败: %s",
            idx + 1,
            total_files,
            short_name,
            e,
        )
        return idx, [], f"{short_name}: {str(e)[:120]}"


def _recognize_single_file(file_data: str, *, ocr_text: Optional[str] = None) -> bool:
    """识别单个文件是否为发票，返回 bool。有 OCR 文字时用文字判断，否则调 vision LLM。"""
    if "::" in file_data:
        file_name, b64_content = file_data.split("::", 1)
    else:
        file_name, b64_content = file_data, None

    if not b64_content:
        return any(kw in file_name.lower() for kw in ["发票", "invoice", "fapiao", "receipt"])

    # 有 OCR 文字时，用文字判断是否为发票
    if ocr_text and ocr_text.strip():
        try:
            resp = llm.invoke(
                [
                    HumanMessage(
                        content=(
                            f"以下是一份文件的 OCR 文字内容，文件名：{file_name}。\n"
                            f"请判断这份文件是否是正规发票（增值税发票、普通发票、电子发票等均算）。\n"
                            f"items 只需一条结果。\n"
                            f"请严格返回 JSON，不要包含 markdown 代码块或其他文本。\n\n"
                            f"文件内容：\n{ocr_text[:3000]}"
                        )
                    )
                ]
            )
            result = _parse_llm_json(resp.content, InvoiceResultList)
            return result.items[0].is_invoice if result.items else False
        except Exception as e:
            _logger.warning("[发票识别] OCR 文字判断失败 %s: %s，降级文件名判断", file_name, e)
            return any(kw in file_name.lower() for kw in ["发票", "invoice", "fapiao", "receipt"])

    mime, _ = _mimetypes.guess_type(file_name)
    if not mime:
        mime = "image/jpeg"

    if mime == "application/pdf":
        try:
            import fitz  # pymupdf
            import base64 as _b64

            pdf_bytes = _b64.b64decode(b64_content)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            if not text.strip():
                raise ValueError("PDF 文字提取为空")
            resp = llm_vision.invoke(
                [
                    HumanMessage(
                        content=(
                            f"以下是一份PDF文件的文字内容，文件名：{file_name}。\n"
                            f"请判断这份文件是否是正规发票（增值税发票、普通发票、电子发票等均算）。\n"
                            f"items 只需一条结果。\n"
                            f"请严格返回 JSON，不要包含 markdown 代码块或其他文本。\n\n"
                            f"文件内容：\n{text[:3000]}"
                        )
                    )
                ]
            )
            result = _parse_llm_json(resp.content, InvoiceResultList)
            return result.items[0].is_invoice if result.items else False
        except Exception as e:
            _logger.warning("[发票识别] PDF %s 处理失败: %s，降级文件名判断", file_name, e)
            return any(kw in file_name.lower() for kw in ["发票", "invoice", "fapiao", "receipt"])

    try:
        resp = llm_vision.invoke(
            [
                HumanMessage(
                    content=[
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64_content}"},
                        },
                        {
                            "type": "text",
                            "text": (
                                f"请判断这张图片是否是正规发票（增值税发票、普通发票、电子发票等均算）。"
                                f"文件名：{file_name}。items 只需一条结果。\n"
                                f"请严格返回 JSON，不要包含 markdown 代码块或其他文本。"
                            ),
                        },
                    ]
                )
            ]
        )
        result = _parse_llm_json(resp.content, InvoiceResultList)
        return result.items[0].is_invoice if result.items else False
    except Exception as e:
        _logger.warning("[发票识别] %s 识别失败: %s", file_name, e)
        return False
