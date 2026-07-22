"""流式执行入口"""
import json
import logging
from typing import Generator, List

from langchain_core.messages import HumanMessage, SystemMessage

from src.llm import llm
from src.nodes.nodes import (
    iter_form_extract_with_progress,
    reimbursement_type_node,
    route_intent,
)
from src.progress_token import encode_progress_token

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
        try:
            final_state = None
            for item in iter_form_extract_with_progress(route_state):
                kind = item[0]
                if kind == "progress":
                    # 新格式: ("progress", {done,total,stage,message,file_index?})
                    # 旧格式: ("progress", done, total)
                    if len(item) >= 3 and not isinstance(item[1], dict):
                        done, total = int(item[1]), int(item[2])
                        yield {
                            "node": "reimbursement_form_extract",
                            "token": encode_progress_token(done, total),
                            "is_final": False,
                        }
                    else:
                        prog = item[1] if isinstance(item[1], dict) else {}
                        yield {
                            "node": "reimbursement_form_extract",
                            "token": encode_progress_token(
                                prog.get("done", 0),
                                prog.get("total", 0),
                                stage=prog.get("stage"),
                                message=prog.get("message"),
                                file_index=prog.get("file_index"),
                            ),
                            "is_final": False,
                        }
                elif kind == "result":
                    final_state = item[1]
            out_node = (final_state or {}).get("node", "reimbursement_form_extract")
            output = json.dumps(
                {"node": out_node, "result": (final_state or {}).get("result")},
                ensure_ascii=False,
            )
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
