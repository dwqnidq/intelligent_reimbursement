import json
from typing import Any, Optional


def encode_progress_token(
    done: int,
    total: int,
    stage: Optional[str] = None,
    message: Optional[str] = None,
    file_index: Optional[int] = None,
) -> str:
    d = max(0, int(done))
    t = max(0, int(total))
    progress: dict[str, Any] = {"done": d, "total": t}
    if stage:
        progress["stage"] = str(stage)
    if message:
        progress["message"] = str(message)
    if file_index is not None:
        try:
            fi = int(file_index)
        except (TypeError, ValueError):
            fi = 0
        if fi > 0:
            progress["file_index"] = fi
    return json.dumps(
        {"type": "progress", "progress": progress},
        ensure_ascii=False,
    )


def try_parse_progress_token(token: str) -> Optional[dict[str, Any]]:
    if not token or not token.strip().startswith("{"):
        return None
    try:
        obj: Any = json.loads(token)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict) or obj.get("type") != "progress":
        return None
    prog = obj.get("progress")
    if not isinstance(prog, dict):
        return None
    try:
        done = max(0, int(prog.get("done", 0)))
        total = max(0, int(prog.get("total", 0)))
    except (TypeError, ValueError):
        return None
    out: dict[str, Any] = {"done": done, "total": total}
    stage = prog.get("stage")
    message = prog.get("message")
    if isinstance(stage, str) and stage.strip():
        out["stage"] = stage.strip()
    if isinstance(message, str) and message.strip():
        out["message"] = message.strip()
    raw_fi = prog.get("file_index")
    if raw_fi is not None:
        try:
            fi = int(raw_fi)
        except (TypeError, ValueError):
            fi = 0
        if fi > 0:
            out["file_index"] = fi
    return out
