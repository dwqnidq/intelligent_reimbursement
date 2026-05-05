"""LangGraph 图定义 - 节点、路由和图编译"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from reimbursement_langgraph.db.reimbursement_types_repo import fetch_active_reimbursement_types
from reimbursement_langgraph.extract import (
    _form_extract_one_file,
    _recognize_single_file,
)
from reimbursement_langgraph.llm import llm
from reimbursement_langgraph.models import (
    REIMBURSEMENT_FORM_EXTRACT_TRIGGER,
    _FORM_EXTRACT_MAX_PARALLEL,
    GraphState,
)

_logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# 报销类型节点（系统提示词）
# ─────────────────────────────────────────────

_REIMBURSEMENT_TYPE_PROMPT_FILE = (
    Path(__file__).resolve().parent / "prompt" / "reimbursement_type_generator_prompt.md"
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
        if "code" in result and "label" in result:
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
        labels = [str(x.get("label", "")) for x in result if isinstance(x, dict)]
        _logger.info("[报销类型节点] 生成成功: %s", ", ".join([x for x in labels if x]))
    except Exception as e:
        _logger.error("[报销类型节点] 错误: %s", e)
        result = [{"error": f"生成失败: {str(e)}"}]

    return {
        **state,
        "node": "reimbursement_type",
        "result": result,
        "step_count": state.get("step_count", 0) + 1,
    }


# ─────────────────────────────────────────────
# 票据多模态 / 发票判定 + 智能填单
# ─────────────────────────────────────────────


def reimbursement_form_extract_node(state: GraphState) -> GraphState:
    files = state.get("files", [])
    input_text = state.get("input") or ""
    want_form_extract = REIMBURSEMENT_FORM_EXTRACT_TRIGGER in input_text
    _logger.info(
        "[节点 reimbursement_form_extract] files=%d 填单模式=%s",
        len(files),
        want_form_extract,
    )
    if not files:
        return {
            **state,
            "node": "reimbursement_form_extract",
            "result": [],
            "step_count": state.get("step_count", 0) + 1,
        }

    if not want_form_extract:
        invoice_bools = [_recognize_single_file(f) for f in files]
        _logger.info("[票据识别] 发票判定结果: %s", invoice_bools)
        return {
            **state,
            "node": "invoice_recognition",
            "result": invoice_bools,
            "step_count": state.get("step_count", 0) + 1,
        }

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
    else:
        _logger.info("[报销表单提取] 已从数据库加载 %d 条报销类型", len(types_payload))
        total_files = len(files)
        file_failures: List[str] = []

        if total_files <= 1:
            _, batch, fail = _form_extract_one_file(0, files[0], types_payload, total_files)
            accumulated = [batch]
            if fail:
                file_failures.append(fail)
        else:
            workers = min(_FORM_EXTRACT_MAX_PARALLEL, total_files)
            results_by_idx: Dict[int, Tuple[List[Dict[str, Any]], Optional[str]]] = {}
            with ThreadPoolExecutor(max_workers=workers) as ex:
                future_to_idx = {
                    ex.submit(
                        _form_extract_one_file,
                        idx,
                        file_data,
                        types_payload,
                        total_files,
                    ): idx
                    for idx, file_data in enumerate(files)
                }
                for fut in as_completed(future_to_idx):
                    idx, batch, fail = fut.result()
                    results_by_idx[idx] = (batch, fail)
            accumulated = [results_by_idx[i][0] for i in range(total_files)]
            for i in range(total_files):
                err = results_by_idx[i][1]
                if err:
                    file_failures.append(err)

        total_rows = sum(len(g) for g in accumulated)
        if total_rows == 0:
            hint = "；".join(file_failures) if file_failures else "未识别到有效明细"
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
            _logger.info(
                "[报销表单提取] 完毕 文件数=%d 总明细=%d 首条有值字段数=%d 并发=%s",
                len(accumulated),
                total_rows,
                sum(1 for f in ff if "value" in f),
                min(_FORM_EXTRACT_MAX_PARALLEL, total_files) if total_files > 1 else 1,
            )

    return {
        **state,
        "node": "reimbursement_form_extract",
        "result": result,
        "step_count": state.get("step_count", 0) + 1,
    }


# ─────────────────────────────────────────────
# 聊天节点
# ─────────────────────────────────────────────


def chat_node(state: GraphState) -> GraphState:
    _logger.info("[聊天节点] 直接调用 LLM...")
    try:
        response = llm.invoke(
            [
                SystemMessage(content="你是小智，一个智能报销助手。请始终使用中文回复用户。"),
                HumanMessage(content=state["input"]),
            ]
        )
        result = response.content
        _logger.info("[聊天节点] 回复: %s...", result[:50])
    except Exception as e:
        _logger.error("[聊天节点] 错误: %s", e)
        result = "抱歉，我遇到了一些问题，请稍后再试。"

    return {**state, "node": "chat", "result": result, "step_count": state.get("step_count", 0) + 1}


# ─────────────────────────────────────────────
# 路由节点
# ─────────────────────────────────────────────


def route_intent(state: GraphState) -> GraphState:
    _logger.info("[路由节点] 分析用户意图: %s", state['input'])
    try:
        files = state.get("files") or []
        if files:
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

        _logger.info("[路由节点] 识别意图: %s", intent)
    except Exception as e:
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


# ─────────────────────────────────────────────
# 输出节点
# ─────────────────────────────────────────────


def generate_output(state: GraphState) -> GraphState:
    output = {"node": state.get("node", "unknown"), "result": state.get("result", "")}
    _logger.info("[输出节点] node=%s", output['node'])
    return {**state, "output": json.dumps(output, ensure_ascii=False)}


# ─────────────────────────────────────────────
# 图编译
# ─────────────────────────────────────────────


def create_main_graph() -> StateGraph:
    workflow = StateGraph(GraphState)
    workflow.add_node("route_intent", route_intent)
    workflow.add_node("reimbursement_type", reimbursement_type_node)
    workflow.add_node("reimbursement_form_extract", reimbursement_form_extract_node)
    workflow.add_node("chat", chat_node)
    workflow.add_node("generate_output", generate_output)
    workflow.set_entry_point("route_intent")
    workflow.add_conditional_edges(
        "route_intent",
        route_by_intent,
        {
            "reimbursement_type": "reimbursement_type",
            "reimbursement_form_extract": "reimbursement_form_extract",
            "chat": "chat",
        },
    )
    workflow.add_edge("reimbursement_type", "generate_output")
    workflow.add_edge("reimbursement_form_extract", "generate_output")
    workflow.add_edge("chat", "generate_output")
    workflow.add_edge("generate_output", END)
    return workflow.compile()


main_graph = create_main_graph()
