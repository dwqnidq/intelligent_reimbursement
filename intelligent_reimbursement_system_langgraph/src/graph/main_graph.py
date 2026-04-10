"""LangGraph 主图定义 - 智能报销助手（流式版本）"""
from typing import TypedDict, Annotated, Any, List, Generator
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from config import ARK_API_KEY, ARK_BASE_URL, DOUBAO_MODEL

# 方舟/豆包 Seed 等模型：关闭思考模式（走 extra_body，避免 OpenAI SDK 把 thinking 当成 create() 非法参数）
_ARK_EXTRA_BODY = {"thinking": {"type": "disabled"}}

llm = ChatOpenAI(
    model=DOUBAO_MODEL,
    openai_api_key=ARK_API_KEY,
    openai_api_base=ARK_BASE_URL,
    temperature=0.7,
    max_tokens=8000,
    streaming=True,  # 开启流式
    extra_body={
        "thinking": {
            "type": "disabled" # 强制关闭思考模式
        }
    }
)


class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    input: str
    output: str
    step_count: int
    intent: str
    node: str
    result: Any
    files: List[str]
    is_admin: bool


# ─────────────────────────────────────────────
# 报销类型节点
# ─────────────────────────────────────────────

@tool
def generate_reimbursement_type_config(user_requirement: str) -> str:
    """根据用户需求生成报销类型的完整JSON配置，包含字段定义、计算公式和导出字段。"""
    prompt = f"""你是报销类型设计专家。根据以下用户需求生成报销类型配置。

用户需求：{user_requirement}

严格返回如下JSON格式，不要任何markdown或额外说明：
{{
  "code": "类型标识（英文小写下划线）",
  "label": "类型名称（中文）",
  "fields": [
    {{
      "key": "字段标识",
      "label": "字段名称",
      "type": "text|number|select|date",
      "required": true,
      "options": [],
      "sort": 1,
      "is_calculate": false
    }}
  ],
  "formula": "计算公式字符串，如 unitPrice * quantity，没有则为空字符串",
  "over_limit_threshold": 推荐上限金额数字,
  "export_fields": [
    {{
      "key": "导出字段标识",
      "label": "导出字段名称",
      "sort": 1,
      "formula": "",
      "is_calculate": false,
      "calc_fields": []
    }}
  ]
}}

注意：
1. is_calculate 默认 false，只有参与 formula 计算的字段才设为 true，且 type 必须为 number
2. over_limit_threshold 根据报销类型给出合理推荐值
3. 只返回JSON，不要任何其他内容"""

    response = llm.invoke([HumanMessage(content=prompt)])
    return response.content


def reimbursement_type_node(state: GraphState) -> GraphState:
    # 权限校验：非管理员直接返回，不调用模型
    if not state.get("is_admin", False):
        print(f"[报销类型节点] 非管理员，拒绝访问")
        return {**state, "node": "reimbursement_type", "result": {"error": "permission_denied", "message": "抱歉，您没有权限使用报销类型配置功能，该功能仅限管理员使用。"}, "step_count": state.get("step_count", 0) + 1}

    print(f"[报销类型节点] 启动 Agent...")
    tools = [generate_reimbursement_type_config]
    agent = create_react_agent(llm, tools)

    try:
        response = agent.invoke({"messages": [HumanMessage(content=state["input"])]})
        raw = response["messages"][-1].content

        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        start = raw.find("{")
        if start != -1:
            raw = raw[start:]

        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            # JSON 被截断时尝试用 json_repair 修复，否则让 LLM 重新生成更简短的版本
            try:
                import json_repair  # type: ignore
                result = json_repair.loads(raw)
            except Exception:
                retry_response = llm.invoke([HumanMessage(content=
                    f"上次生成的JSON不完整，请重新生成，内容要更简洁。原始需求：{state['input']}\n"
                    "只返回合法JSON，字段数量控制在5个以内。"
                )])
                result = json.loads(retry_response.content)

        print(f"[报销类型节点] 生成成功: {result.get('label', '')}")
    except Exception as e:
        print(f"[报销类型节点] 错误: {str(e)}")
        result = {"error": f"生成失败: {str(e)}"}

    return {**state, "node": "reimbursement_type", "result": result, "step_count": state.get("step_count", 0) + 1}


# ─────────────────────────────────────────────
# 发票识别节点
# ─────────────────────────────────────────────

import mimetypes as _mimetypes
import logging as _logging
from pydantic import BaseModel, Field

_logger = _logging.getLogger(__name__)


class InvoiceResult(BaseModel):
    is_invoice: bool = Field(description="是否是正规发票")


class InvoiceResultList(BaseModel):
    items: List[InvoiceResult] = Field(description="所有文件的识别结果列表")


# 绑定结构化输出的 LLM（低温度，确保稳定）
llm_vision = ChatOpenAI(
    model=DOUBAO_MODEL,
    openai_api_key=ARK_API_KEY,
    openai_api_base=ARK_BASE_URL,
    temperature=0,
    max_tokens=5000,
    extra_body={
        "thinking": {
            "type": "disabled" # 强制关闭思考模式
        }
    }
)
llm_vision_structured = llm_vision.with_structured_output(InvoiceResultList)


def _recognize_single_file(file_data: str) -> bool:
    """
    识别单个文件是否为发票，返回 bool。
    file_data 格式：'filename::base64content' 或纯文件名（降级）
    """
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
            result: InvoiceResultList = llm_vision_structured.invoke([
                HumanMessage(content=(
                    f"以下是一份PDF文件的文字内容，文件名：{file_name}。\n"
                    f"请判断这份文件是否是正规发票（增值税发票、普通发票、电子发票等均算）。\n"
                    f"items 只需一条结果。\n\n"
                    f"文件内容：\n{text[:3000]}"
                ))
            ])
            return result.items[0].is_invoice if result.items else False
        except Exception as e:
            _logger.warning("[发票识别] PDF %s 处理失败: %s，降级文件名判断", file_name, e)
            return any(kw in file_name.lower() for kw in ["发票", "invoice", "fapiao", "receipt"])

    try:
        result: InvoiceResultList = llm_vision_structured.invoke([
            HumanMessage(content=[
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64_content}"},
                },
                {
                    "type": "text",
                    "text": f"请判断这张图片是否是正规发票（增值税发票、普通发票、电子发票等均算）。文件名：{file_name}。items 只需一条结果。",
                },
            ])
        ])
        return result.items[0].is_invoice if result.items else False
    except Exception as e:
        _logger.warning("[发票识别] %s 识别失败: %s", file_name, e)
        return False


def invoice_recognition_node(state: GraphState) -> GraphState:
    files = state.get("files", [])
    _logger.info("[发票识别节点] 开始识别 %d 个文件", len(files))
    if not files:
        return {**state, "node": "invoice_recognition", "result": [], "step_count": state.get("step_count", 0) + 1}

    # 按文件顺序逐一识别，保证顺序一致
    result = [_recognize_single_file(f) for f in files]
    _logger.info("[发票识别节点] 识别完成: %s", result)
    return {**state, "node": "invoice_recognition", "result": result, "step_count": state.get("step_count", 0) + 1}


# ─────────────────────────────────────────────
# 聊天节点
# ─────────────────────────────────────────────

@tool
def answer_reimbursement_question(question: str) -> str:
    """回答用户的问题，用中文回复。"""
    print(question)
    response = llm.invoke([HumanMessage(content=question)])
    return response.content


def chat_node(state: GraphState) -> GraphState:
    print(f"[聊天节点] 直接调用 LLM...")
    try:
        response = llm.invoke([
            SystemMessage(content="你是小智，一个智能助手。请始终使用中文回复用户。"),
            HumanMessage(content=state["input"])
        ])
        result = response.content
        print(f"[聊天节点] 回复: {result[:50]}...")
    except Exception as e:
        print(f"[聊天节点] 错误: {str(e)}")
        result = "抱歉，我遇到了一些问题，请稍后再试。"

    return {**state, "node": "chat", "result": result, "step_count": state.get("step_count", 0) + 1}


# ─────────────────────────────────────────────
# 路由节点
# ─────────────────────────────────────────────

def route_intent(state: GraphState) -> GraphState:
    print(f"[路由节点] 分析用户意图: {state['input']}")
    try:
        files = state.get("files") or []
        if files:
            print(f"[路由节点] 检测到文件，直接走发票识别")
            return {**state, "intent": "invoice_recognition", "step_count": state.get("step_count", 0) + 1}

        response = llm.invoke([
            SystemMessage(content="""分析用户输入，判断意图，只返回以下之一：
- reimbursement_type：用户想创建/设计/新增报销类型或字段
- chat：其他问题或咨询
只返回意图名称，不要其他内容。"""),
            HumanMessage(content=state["input"])
        ])
        intent = response.content.strip().lower()
        intent = "reimbursement_type" if "reimbursement_type" in intent else "chat"

        # 权限校验：报销类型节点仅管理员可用
        if intent == "reimbursement_type" and not state.get("is_admin", False):
            print(f"[路由节点] 非管理员，拒绝进入报销类型节点")
            intent = "no_permission"

        print(f"[路由节点] 识别意图: {intent}")
    except Exception as e:
        print(f"[路由节点] 错误: {str(e)}")
        intent = "chat"

    return {**state, "intent": intent, "step_count": state.get("step_count", 0) + 1}


def route_by_intent(state: GraphState) -> str:
    intent = state.get("intent", "chat")
    if intent == "reimbursement_type":
        return "reimbursement_type"
    elif intent == "invoice_recognition":
        return "invoice_recognition"
    elif intent == "no_permission":
        return "no_permission"
    return "chat"


# ─────────────────────────────────────────────
# 输出节点
# ─────────────────────────────────────────────

def generate_output(state: GraphState) -> GraphState:
    output = {"node": state.get("node", "unknown"), "result": state.get("result", "")}
    print(f"[输出节点] node={output['node']}")
    return {**state, "output": json.dumps(output, ensure_ascii=False)}


# ─────────────────────────────────────────────
# 流式执行入口
# ─────────────────────────────────────────────

def stream_graph(input_text: str, files: List[str] = None, is_admin: bool = False) -> Generator:
    """
    流式执行图，逐步 yield token。
    对于 chat 节点：流式输出 token
    对于其他节点：先 yield 进度提示，最后 yield 完整 JSON 结果
    """
    initial_state = {
        "input": input_text,
        "messages": [],
        "output": "",
        "step_count": 0,
        "files": files or [],
        "intent": "",
        "node": "",
        "result": None,
        "is_admin": is_admin,
    }

    # 先执行路由，确定意图
    route_state = route_intent(initial_state)
    intent = route_state.get("intent", "chat")

    if intent == "no_permission":
        yield {
            "node": "chat",
            "token": "",
            "output": json.dumps({"node": "chat", "result": "抱歉，您没有权限使用报销类型配置功能，该功能仅限管理员使用。"}, ensure_ascii=False),
            "is_final": True,
            "success": True,
        }
        return

    if intent == "chat":
        yield {"node": "chat", "token": "", "is_final": False}

        full_result = ""
        try:
            for chunk in llm.stream([
                SystemMessage(content="你是小智，一个智能助手。请始终使用中文回复用户。"),
                HumanMessage(content=input_text)
            ]):
                token = chunk.content
                if token:
                    full_result += token
                    yield {"node": "chat", "token": token, "is_final": False}

            yield {
                "node": "chat",
                "token": "",
                "output": json.dumps({"node": "chat", "result": full_result}, ensure_ascii=False),
                "is_final": True,
                "success": True,
            }
        except Exception as e:
            yield {"node": "chat", "token": "", "output": "", "is_final": True, "success": False, "error": str(e)}

    elif intent == "reimbursement_type":
        yield {"node": "reimbursement_type", "token": "正在为您生成报销类型配置...", "is_final": False}
        result_state = reimbursement_type_node(route_state)
        output = json.dumps({"node": "reimbursement_type", "result": result_state.get("result")}, ensure_ascii=False)
        yield {"node": "reimbursement_type", "token": "", "output": output, "is_final": True, "success": True}

    elif intent == "invoice_recognition":
        yield {"node": "invoice_recognition", "token": "正在识别发票文件...", "is_final": False}
        result_state = invoice_recognition_node(route_state)
        output = json.dumps({"node": "invoice_recognition", "result": result_state.get("result")}, ensure_ascii=False)
        yield {"node": "invoice_recognition", "token": "", "output": output, "is_final": True, "success": True}


# ─────────────────────────────────────────────
# 构建图（保留同步版本兼容）
# ─────────────────────────────────────────────

def create_main_graph() -> StateGraph:
    workflow = StateGraph(GraphState)
    workflow.add_node("route_intent", route_intent)
    workflow.add_node("reimbursement_type", reimbursement_type_node)
    workflow.add_node("invoice_recognition", invoice_recognition_node)
    workflow.add_node("chat", chat_node)
    workflow.add_node("generate_output", generate_output)
    workflow.set_entry_point("route_intent")
    workflow.add_conditional_edges("route_intent", route_by_intent, {
        "reimbursement_type": "reimbursement_type",
        "invoice_recognition": "invoice_recognition",
        "chat": "chat"
    })
    workflow.add_edge("reimbursement_type", "generate_output")
    workflow.add_edge("invoice_recognition", "generate_output")
    workflow.add_edge("chat", "generate_output")
    workflow.add_edge("generate_output", END)
    return workflow.compile()


main_graph = create_main_graph()
