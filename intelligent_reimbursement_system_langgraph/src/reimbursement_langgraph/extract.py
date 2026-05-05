"""表单提取逻辑 - 发票识别和智能填单"""
import json
import logging
import mimetypes as _mimetypes
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from json_repair import repair_json
from langchain_core.messages import HumanMessage

from reimbursement_langgraph.db.reimbursement_types_repo import (
    assignments_list_to_field_map,
    build_form_result_array_from_db_values,
    build_form_result_array_from_suggested_model_output,
    build_suggested_rows_from_assignment_maps,
    build_types_skeleton_for_llm,
)
from reimbursement_langgraph.llm import llm, llm_vision
from reimbursement_langgraph.models import InvoiceResultList, ReimbursementFormValuesExtract

_logger = logging.getLogger(__name__)


def _parse_llm_json(raw: str, model_cls):
    """从 LLM 原始文本中提取并解析 JSON 为 Pydantic 模型。"""
    repaired = repair_json(raw, return_objects=True)
    if not isinstance(repaired, (dict, list)):
        raise ValueError(f"LLM 输出无法解析为 JSON: {raw[:200]}")
    return model_cls.model_validate(repaired)


def _build_form_extract_message_parts_for_one_file(file_data: str) -> List[dict]:
    """单份文件 → 多模态片段：PDF 先抽文字再作为文本；图片为 image_url。"""
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
- 同时填写 **code** 与 **label**，且二者必须来自**同一条**类型摘要记录（逐字与 JSON 一致）；
- **禁止**因「上一文件」或「同批其它文件」已选某类型，就把本文件也归为该类——**每个文件单独判断**，互不影响。
"""

    return f"""你是企业报销助手。用户上传了票据（发票、收据、订单截图等）。

**【当前为第 {file_index}/{file_total} 个文件】** 本消息**只含这一份**材料（PDF 为抽取正文，图片为单图）。你只能依据**本份**内容输出结果；**禁止**臆造同批其它文件中的信息。

**【类型判定铁律 · 必须遵守】**
1. **业务实质优先**：先判断本份材料本身是什么业务——例如：餐饮小票/外卖/餐厅发票 → 应对应**餐饮、餐费**等类型，**绝不能**选采购、物资、对公采购等；采购合同、订货单、货款/物资发票 → 应对应**采购**类，**绝不能**选餐费、差旅餐饮等。若摘要中无完全对应类型，应走「无法归入」模式而非硬套。
2. **禁止惯性归类**：即使用户一次上传多份文件，**每一份**都要重新看内容选型；**禁止**默认与上一份相同。
3. **证据来自本份**：选型理由只能来自当前 PDF/图片/文件名中的文字，不得套用其它文件的结论。
{multi_type_rule}
下方「类型摘要」JSON 含每种类型的 **code**（若有）、**label** 以及各字段的 **key**、**label**（中文名）。不含字段类型、选项等；服务端会按 key 从数据库补全并写入 value。

类型摘要：
{types_json}

**两种互斥模式（二选一）：**

**A. 能明确归入某一已有类型**（本份材料与摘要中**某一条**的业务含义、字段语义一致）：
- 设置 no_existing_type_match = false。
- **code**、**label** 必须与所选摘要条目**完全一致**（{f"二者必填且同属一条；" if n_types >= 2 else "有 code 时建议填写以便精确匹配；仅一种类型时 code 可空。"}）
- **items**：每条报销明细一项；每项 {{ "assignments": [ {{ "key": "...", "value": 识别值 }}, ... ] }}。
  - **key** 必须且只能来自**你所选那一条**摘要里的 **fields[].key**，禁止用其它类型的 key。
  - **value** 仅来自本份票据；无把握则不填该 key。
- 多物品/多行拆多条 items；单条明细时 items 长度为 1；完全无法识别时 items 可为 []。

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
) -> Tuple[int, List[Dict[str, Any]], Optional[str]]:
    """
    单文件智能填单。返回 (下标, 该文件明细批次, 失败摘要或 None)。
    供线程池并发调用；各自独立 invoke LLM，无共享可变状态。
    """
    short_name = file_data.split("::", 1)[0] if "::" in file_data else file_data
    batch_for_file: List[Dict[str, Any]] = []
    try:
        file_parts = _build_form_extract_message_parts_for_one_file(file_data)
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
                    "[报销表单提取] 第 %d/%d 个文件「%s」建议类型路径无有效字段",
                    idx + 1,
                    total_files,
                    short_name,
                )
                return idx, [], None
        else:
            lines_fv = _dumped_extract_to_lines_fv(dumped)
            if not _lines_fv_has_any_value(lines_fv):
                _logger.info(
                    "[报销表单提取] 第 %d/%d 个文件「%s」无有效 assignments",
                    idx + 1,
                    total_files,
                    short_name,
                )
                return idx, [], None
            batch_for_file = list(
                build_form_result_array_from_db_values(
                    types_payload,
                    dumped.get("label") or "",
                    lines_fv,
                    code=(dumped.get("code") or "") or None,
                )
            )

        _logger.info(
            "[报销表单提取] 第 %d/%d 个文件「%s」内层条数=%d",
            idx + 1,
            total_files,
            short_name,
            len(batch_for_file),
        )
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


def _recognize_single_file(file_data: str) -> bool:
    """识别单个文件是否为发票，返回 bool。"""
    if "::" in file_data:
        file_name, b64_content = file_data.split("::", 1)
    else:
        file_name, b64_content = file_data, None

    if not b64_content:
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
