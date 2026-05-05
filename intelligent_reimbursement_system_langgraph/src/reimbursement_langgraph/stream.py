"""流式执行入口"""
import json
import logging
from typing import Generator, List

from langchain_core.messages import HumanMessage, SystemMessage

from reimbursement_langgraph.graph import (
    main_graph,
    reimbursement_type_node,
    route_intent,
)
from reimbursement_langgraph.llm import llm

_logger = logging.getLogger(__name__)


def stream_graph(input_text: str, files: List[str] = None, is_admin: bool = False) -> Generator:
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

    route_state = route_intent(initial_state)
    intent = route_state.get("intent", "chat")

    if intent == "no_permission":
        yield {
            "node": "chat",
            "token": "",
            "output": json.dumps(
                {
                    "node": "chat",
                    "result": "抱歉，您没有权限使用报销类型配置功能，该功能仅限管理员使用。",
                },
                ensure_ascii=False,
            ),
            "is_final": True,
            "success": True,
        }
        return

    if intent == "chat":
        yield {"node": "chat", "token": "", "is_final": False}

        full_result = ""
        try:
            for chunk in llm.stream(
                [
                    SystemMessage(content="你是小智，一个智能报销助手。请始终使用中文回复用户。"),
                    HumanMessage(content=input_text),
                ]
            ):
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
        yield {"node": "reimbursement_type", "token": "", "is_final": False}
        result_state = reimbursement_type_node(route_state)
        output = json.dumps(
            {"node": "reimbursement_type", "result": result_state.get("result")},
            ensure_ascii=False,
        )
        yield {"node": "reimbursement_type", "token": "", "output": output, "is_final": True, "success": True}

    elif intent == "reimbursement_form_extract":
        yield {
            "node": "reimbursement_form_extract",
            "token": "正在处理上传文件（发票识别或智能填单）…",
            "is_final": False,
        }
        try:
            final_state = main_graph.invoke(initial_state)
            out_raw = final_state.get("output") or "{}"
            out = json.loads(out_raw) if isinstance(out_raw, str) else out_raw
            out_node = out.get("node", "reimbursement_form_extract")
            output = json.dumps({"node": out_node, "result": out.get("result")}, ensure_ascii=False)
            yield {
                "node": out_node,
                "token": "",
                "output": output,
                "is_final": True,
                "success": True,
            }
        except Exception as e:
            yield {
                "node": "reimbursement_form_extract",
                "token": "",
                "output": "",
                "is_final": True,
                "success": False,
                "error": str(e),
            }
