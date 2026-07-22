"""LangGraph 节点函数"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.messages import HumanMessage, SystemMessage

from src.db.reimbursement_types_repo import fetch_active_reimbursement_types
from src.extract import (
    _form_extract_one_file,
    _recognize_single_file,
    apply_batch_invoice_dedup,
)
from src.llm import llm
from src.models import (
    REIMBURSEMENT_FORM_EXTRACT_TRIGGER,
    _FORM_EXTRACT_MAX_PARALLEL,
    GraphState,
)
from src.ocr_pool import ocr_files, prewarm_ocr_pool, resolve_ocr_max_parallel

_logger = logging.getLogger(__name__)


def warmup_ocr() -> None:
    """兼容入口：预热 OCR（并行时预热进程池）。"""
    prewarm_ocr_pool()


# ─────────────────────────────────────────────
# 报销类型节点（系统提示词）
# ─────────────────────────────────────────────

_REIMBURSEMENT_TYPE_PROMPT_FILE = (
    Path(__file__).resolve().parents[1] / "prompt" / "reimbursement_type_generator_prompt.md"
)


def _load_reimbursement_type_system_prompt() -> str:
    return _REIMBURSEMENT_TYPE_PROMPT_FILE.read_text(encoding="utf-8").strip()


_REIMBURSEMENT_TYPE_SYSTEM_PROMPT = _load_reimbursement_type_system_prompt()


def _normalize_reimbursement_type_result(result: Any) -> List[Dict[str, Any]]:
    """统一将模型结果转为数组结构：支持单对象、对象 map、顶层数组、以及对象内嵌数组。"""
    if isinstance(result, list):
        out: List[Dict[str, Any]] = []
        for x in result:
            if isinstance(x, dict):
                out.append(x)
            elif isinstance(x, list):
                out.extend(i for i in x if isinstance(i, dict))
        seen: set[str] = set()
        deduped: List[Dict[str, Any]] = []
        for item in out:
            code = str(item.get("code", ""))
            if code and code in seen:
                continue
            if code:
                seen.add(code)
            deduped.append(item)
        return deduped
    if isinstance(result, dict):
        if "code" in result and ("name" in result or "label" in result):
            return [result]
        vals: List[Dict[str, Any]] = []
        for v in result.values():
            if isinstance(v, dict):
                vals.append(v)
            elif isinstance(v, list):
                vals.extend(i for i in v if isinstance(i, dict))
        return vals
    return []


def reimbursement_type_node(state: GraphState) -> GraphState:
    if not state.get("is_admin", False):
        _logger.info("[报销类型节点] 非管理员，拒绝访问")
        return {
            **state,
            "node": "reimbursement_type",
            "result": {
                "error": "permission_denied",
                "message": "抱歉，您没有权限使用报销类型配置功能，该功能仅限管理员使用。",
            },
            "step_count": state.get("step_count", 0) + 1,
        }

    print("[报销类型节点] 开始生成报销类型...")
    _logger.info("[报销类型节点] 直接调用 LLM（System + Human）...")

    try:
        response = llm.invoke(
            [
                SystemMessage(content=_REIMBURSEMENT_TYPE_SYSTEM_PROMPT),
                HumanMessage(content=f"用户需求：\n{state['input']}"),
            ]
        )
        raw = response.content
        if isinstance(raw, list):
            raw = "".join(str(x) for x in raw)

        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        obj_start = raw.find("{")
        arr_start = raw.find("[")
        starts = [x for x in [obj_start, arr_start] if x != -1]
        if starts:
            raw = raw[min(starts):]

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            try:
                import json_repair  # type: ignore
                parsed = json_repair.loads(raw)
            except Exception:
                retry_response = llm.invoke(
                    [
                        SystemMessage(content=_REIMBURSEMENT_TYPE_SYSTEM_PROMPT),
                        HumanMessage(
                            content=(
                                f"上次生成的JSON不完整，请重新生成，内容要更简洁。\n"
                                f"原始需求：{state['input']}\n"
                                "只返回合法JSON数组，字段数量控制在5个以内。"
                            )
                        ),
                    ]
                )
                r2 = retry_response.content
                if isinstance(r2, list):
                    r2 = "".join(str(x) for x in r2)
                parsed = json.loads(r2)

        result = _normalize_reimbursement_type_result(parsed)
        labels = [
            str(x.get("name") or x.get("label") or "")
            for x in result
            if isinstance(x, dict)
        ]
        print(f"[报销类型节点] 生成成功，共 {len(result)} 个类型: {', '.join([x for x in labels if x])}")
        _logger.info("[报销类型节点] 生成成功: %s", ", ".join([x for x in labels if x]))
    except Exception as e:
        print(f"[报销类型节点] 生成失败: {e}")
        _logger.error("[报销类型节点] 错误: %s", e)
        result = [{"error": f"生成失败: {str(e)}"}]

    return {
        **state,
        "node": "reimbursement_type",
        "result": result,
        "step_count": state.get("step_count", 0) + 1,
    }


# ─────────────────────────────────────────────
# OCR 文字提取节点
# ─────────────────────────────────────────────


def ocr_extract_node(state: GraphState) -> GraphState:
    """对文件执行 OCR；多文件时按 OCR_MAX_PARALLEL 多进程并行（每进程独立实例）。"""
    files = state.get("files", [])
    workers = resolve_ocr_max_parallel()
    print(
        f"[OCR 节点] 开始处理，待处理文件数: {len(files)}，并行进程: "
        f"{workers if len(files) > 1 else 1}"
    )
    _logger.info(
        "[OCR 节点] 待处理文件数: %d，OCR_MAX_PARALLEL=%d",
        len(files),
        workers,
    )

    if not files:
        return {
            **state,
            "ocr_texts": [],
            "node": "ocr_extract",
            "step_count": state.get("step_count", 0) + 1,
        }

    try:
        ocr_texts = ocr_files(files)
    except Exception as e:
        _logger.error("[OCR 节点] 批量识别失败: %s", e, exc_info=True)
        ocr_texts = [""] * len(files)

    for idx, file_data in enumerate(files):
        short_name = file_data.split("::", 1)[0] if "::" in file_data else file_data
        text = ocr_texts[idx] if idx < len(ocr_texts) else ""
        print(f"[OCR 节点] 文件「{short_name}」提取完成，文字长度: {len(text)}")
        _logger.info(
            "[OCR 节点] 第 %d/%d 个文件「%s」提取文字长度: %d",
            idx + 1,
            len(files),
            short_name,
            len(text),
        )

    print(f"[OCR 节点] 全部处理完成，共 {len(files)} 个文件")
    return {
        **state,
        "ocr_texts": ocr_texts,
        "node": "ocr_extract",
        "step_count": state.get("step_count", 0) + 1,
    }


# ─────────────────────────────────────────────
# 票据多模态 / 发票判定 + 智能填单
# ─────────────────────────────────────────────


def _file_display_name(file_data: str) -> str:
    name = file_data.split("::", 1)[0] if "::" in file_data else file_data
    return (name or "").strip() or "未命名文件"


def _progress_event(
    done: int,
    total: int,
    stage: str,
    message: str,
    file_index: Optional[int] = None,
) -> Tuple[str, Dict[str, Any]]:
    payload: Dict[str, Any] = {
        "done": max(0, int(done)),
        "total": max(0, int(total)),
        "stage": stage,
        "message": message,
    }
    if file_index is not None and int(file_index) > 0:
        payload["file_index"] = int(file_index)
    return ("progress", payload)


def _iter_form_extract_steps(state: GraphState):
    """发票识别 / 智能填单的核心逐文件执行流程（假定 state 已含 ocr_texts）。

    每完成一个文件（成功或失败）yield ("progress", {done,total,stage,message,file_index?})；
    结束时 yield ("result", final_state)，其中 final_state 含 node + result。
    """
    files = state.get("files", [])
    ocr_texts = state.get("ocr_texts", [])
    input_text = state.get("input") or ""
    want_form_extract = REIMBURSEMENT_FORM_EXTRACT_TRIGGER in input_text
    total_files = len(files)
    print(f"[票据识别/填单节点] 开始处理，文件数: {total_files}，填单模式: {want_form_extract}")
    _logger.info(
        "[节点 reimbursement_form_extract] files=%d 填单模式=%s",
        total_files,
        want_form_extract,
    )
    if not files:
        yield (
            "result",
            {
                **state,
                "node": "reimbursement_form_extract",
                "result": [],
                "step_count": state.get("step_count", 0) + 1,
            },
        )
        return

    if not want_form_extract:
        invoice_bools: List[bool] = []
        for i, f in enumerate(files):
            name = _file_display_name(f)
            yield _progress_event(
                i,
                total_files,
                "extract",
                f"发票判定中 · 第 {i + 1}/{total_files} 张 · {name}",
            )
            invoice_bools.append(
                _recognize_single_file(f, ocr_text=ocr_texts[i] if i < len(ocr_texts) else None)
            )
            yield _progress_event(
                i + 1,
                total_files,
                "match",
                f"发票判定完成 · 第 {i + 1}/{total_files} 张 · {name}",
                file_index=i + 1,
            )
        print(f"[票据识别] 发票判定结果: {invoice_bools}")
        _logger.info("[票据识别] 发票判定结果: %s", invoice_bools)
        yield _progress_event(
            total_files,
            total_files,
            "done",
            "识别完成，正在整理结果…",
        )
        yield (
            "result",
            {
                **state,
                "node": "invoice_recognition",
                "result": invoice_bools,
                "step_count": state.get("step_count", 0) + 1,
            },
        )
        return

    types_payload = fetch_active_reimbursement_types()
    if not types_payload:
        _logger.warning("[报销表单提取] 数据库无可用类型")
        result: Any = [
            [
                {
                    "label": "",
                    "fields": [],
                    "over_limit_threshold": 0,
                    "fill_error": (
                        "未从数据库读取到启用的报销类型：请检查 LangGraph 的 MONGODB_URI，"
                        "并确认 reimbursement_types 中存在 status=1 的记录。"
                    ),
                }
            ]
        ]
        yield _progress_event(
            total_files,
            total_files,
            "done",
            "未读取到启用的报销类型，正在整理结果…",
        )
    else:
        print(f"[报销表单提取] 已从数据库加载 {len(types_payload)} 条报销类型")
        _logger.info("[报销表单提取] 已从数据库加载 %d 条报销类型", len(types_payload))
        file_failures: List[str] = []
        done = 0

        if total_files <= 1:
            print(f"[报销表单提取] 单文件模式，开始处理...")
            name = _file_display_name(files[0])
            yield _progress_event(
                0,
                total_files,
                "extract",
                f"字段提取中 · 第 1/{total_files} 张 · {name}",
            )
            ocr_text = ocr_texts[0] if ocr_texts else None
            _, batch, fail = _form_extract_one_file(0, files[0], types_payload, total_files, ocr_text=ocr_text)
            accumulated = [batch]
            if fail:
                file_failures.append(fail)
                done += 1
                yield _progress_event(
                    done,
                    total_files,
                    "match",
                    f"提取失败 · 第 1/{total_files} 张 · {name}",
                    file_index=1,
                )
            else:
                done += 1
                yield _progress_event(
                    done,
                    total_files,
                    "match",
                    f"类型匹配中 · 第 1/{total_files} 张 · {name}",
                    file_index=1,
                )
        else:
            workers = min(_FORM_EXTRACT_MAX_PARALLEL, total_files)
            print(f"[报销表单提取] 多文件并行模式，{total_files} 个文件，{workers} 个并发")
            yield _progress_event(
                0,
                total_files,
                "extract",
                f"字段提取中 · 共 {total_files} 张",
            )
            results_by_idx: Dict[int, Tuple[List[Dict[str, Any]], Optional[str]]] = {}
            with ThreadPoolExecutor(max_workers=workers) as ex:
                future_to_idx = {
                    ex.submit(
                        _form_extract_one_file,
                        idx,
                        file_data,
                        types_payload,
                        total_files,
                        ocr_text=ocr_texts[idx] if idx < len(ocr_texts) else None,
                    ): idx
                    for idx, file_data in enumerate(files)
                }
                for fut in as_completed(future_to_idx):
                    fail_msg: Optional[str] = None
                    try:
                        idx, batch, fail = fut.result()
                        results_by_idx[idx] = (batch, fail)
                        fail_msg = fail
                        print(f"[报销表单提取] 文件 {idx+1} 处理完成，明细数: {len(batch)}")
                    except Exception as e:
                        idx = future_to_idx[fut]
                        short_name = _file_display_name(files[idx])
                        print(f"[报销表单提取] 文件 {idx+1}「{short_name}」处理异常: {e}")
                        _logger.exception("[报销表单提取] 文件 %d 并行处理异常", idx + 1)
                        fail_msg = f"{short_name}: {str(e)[:120]}"
                        results_by_idx[idx] = ([], fail_msg)
                    name = _file_display_name(files[idx])
                    done += 1
                    if fail_msg:
                        yield _progress_event(
                            done,
                            total_files,
                            "match",
                            f"提取失败 · 第 {idx + 1}/{total_files} 张 · {name}",
                            file_index=idx + 1,
                        )
                    else:
                        yield _progress_event(
                            done,
                            total_files,
                            "match",
                            f"类型匹配中 · 第 {idx + 1}/{total_files} 张 · {name}",
                            file_index=idx + 1,
                        )
            accumulated = [results_by_idx[i][0] for i in range(total_files)]
            for i in range(total_files):
                err = results_by_idx[i][1]
                if err:
                    file_failures.append(err)
            if total_files > 1:
                accumulated = apply_batch_invoice_dedup(accumulated)

        total_rows = sum(len(g) for g in accumulated)
        if total_rows == 0:
            hint = "；".join(file_failures) if file_failures else "未识别到有效明细"
            print(f"[票据识别/填单节点] 处理完成但无有效明细: {hint}")
            result = [
                [
                    {
                        "label": "",
                        "fields": [],
                        "over_limit_threshold": 0,
                        "fill_error": f"全部文件处理完毕仍无可用填单结果：{hint}",
                    }
                ]
            ]
        else:
            result = accumulated
            first_row: Dict[str, Any] = {}
            for g in accumulated:
                if g:
                    first_row = g[0]
                    break
            ff = first_row.get("fields") or []
            print(f"[票据识别/填单节点] 处理完成，文件数: {len(accumulated)}，总明细: {total_rows}")
            _logger.info(
                "[报销表单提取] 完毕 文件数=%d 总明细=%d 首条有值字段数=%d 并发=%s",
                len(accumulated),
                total_rows,
                sum(1 for f in ff if "value" in f),
                min(_FORM_EXTRACT_MAX_PARALLEL, total_files) if total_files > 1 else 1,
            )
        yield _progress_event(
            total_files,
            total_files,
            "done",
            "识别完成，正在整理结果…",
        )

    yield (
        "result",
        {
            **state,
            "node": "reimbursement_form_extract",
            "result": result,
            "step_count": state.get("step_count", 0) + 1,
        },
    )


def iter_form_extract_with_progress(state: GraphState):
    """供 stream 边执行边推送进度：prepare → OCR → 逐文件阶段 → result。

    若 state 未包含 ocr_texts（如直接从路由状态调用）则内部先跑 OCR；
    图节点已通过 ocr_extract 预填 ocr_texts 时不会重复识别。
    """
    files = state.get("files", [])
    total_files = len(files)
    yield _progress_event(
        0,
        total_files,
        "prepare",
        f"准备识别… 共 {total_files} 个文件",
    )
    if "ocr_texts" not in state:
        if total_files > 0:
            yield _progress_event(
                0,
                total_files,
                "ocr",
                f"OCR 识别中 · 共 {total_files} 张",
            )
        state = ocr_extract_node(state)
        if total_files > 0:
            yield _progress_event(
                0,
                total_files,
                "ocr",
                f"OCR 完成 · 共 {total_files} 张",
            )
    yield from _iter_form_extract_steps(state)


def reimbursement_form_extract_node(state: GraphState) -> GraphState:
    """消费进度 generator，仅取最终 result state，保证同步 invoke / ExecuteGraph 行为不变。"""
    final_state: Optional[GraphState] = None
    for item in iter_form_extract_with_progress(state):
        if item[0] == "result":
            final_state = item[1]
    return final_state if final_state is not None else state


# ─────────────────────────────────────────────
# 聊天节点
# ─────────────────────────────────────────────


def chat_node(state: GraphState) -> GraphState:
    print("[聊天节点] 开始处理用户消息...")
    _logger.info("[聊天节点] 直接调用 LLM...")
    try:
        response = llm.invoke(
            [
                SystemMessage(content="你是小智，一个智能报销助手。请始终使用中文回复用户。"),
                HumanMessage(content=state["input"]),
            ]
        )
        result = response.content
        print(f"[聊天节点] 回复完成，长度: {len(result)} 字符")
        _logger.info("[聊天节点] 回复: %s...", result[:50])
    except Exception as e:
        print(f"[聊天节点] 处理失败: {e}")
        _logger.error("[聊天节点] 错误: %s", e)
        result = "抱歉，我遇到了一些问题，请稍后再试。"

    return {**state, "node": "chat", "result": result, "step_count": state.get("step_count", 0) + 1}


# ─────────────────────────────────────────────
# 输出节点
# ─────────────────────────────────────────────


def generate_output(state: GraphState) -> GraphState:
    output = {"node": state.get("node", "unknown"), "result": state.get("result", "")}
    print(f"[输出节点] 生成最终输出，来源节点: {output['node']}")
    print("=" * 60)
    _logger.info("[输出节点] node=%s", output['node'])
    return {**state, "output": json.dumps(output, ensure_ascii=False)}


# ─────────────────────────────────────────────
# 路由节点
# ─────────────────────────────────────────────


def route_intent(state: GraphState) -> GraphState:
    print("=" * 60)
    print("[路由节点] 开始分析用户意图...")
    _logger.info("[路由节点] 分析用户意图: %s", state['input'])
    try:
        files = state.get("files") or []
        if files:
            print("[路由节点] 检测到文件，路由 -> reimbursement_form_extract (OCR提取)")
            _logger.info("[路由节点] 检测到文件，走 reimbursement_form_extract")
            return {
                **state,
                "intent": "reimbursement_form_extract",
                "step_count": state.get("step_count", 0) + 1,
            }

        response = llm.invoke(
            [
                SystemMessage(
                    content="""分析用户输入，判断意图，只返回以下之一：
- reimbursement_type：用户想创建/设计/新增报销类型或字段
- chat：其他问题或咨询
只返回意图名称，不要其他内容。"""
                ),
                HumanMessage(content=state["input"]),
            ]
        )
        intent = response.content.strip().lower()
        intent = "reimbursement_type" if "reimbursement_type" in intent else "chat"

        if intent == "reimbursement_type" and not state.get("is_admin", False):
            _logger.info("[路由节点] 非管理员，拒绝进入报销类型节点")
            intent = "no_permission"

        print(f"[路由节点] 识别意图: {intent}")
        _logger.info("[路由节点] 识别意图: %s", intent)
    except Exception as e:
        print(f"[路由节点] 意图识别失败: {e}，回退到聊天模式")
        _logger.error("[路由节点] 错误: %s", e)
        intent = "chat"

    return {**state, "intent": intent, "step_count": state.get("step_count", 0) + 1}


def route_by_intent(state: GraphState) -> str:
    intent = state.get("intent", "chat")
    if intent == "reimbursement_type":
        return "reimbursement_type"
    elif intent == "reimbursement_form_extract":
        return "reimbursement_form_extract"
    elif intent == "no_permission":
        return "no_permission"
    return "chat"
