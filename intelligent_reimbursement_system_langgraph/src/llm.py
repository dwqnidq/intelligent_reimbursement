"""LLM 实例初始化"""
import os

from langchain_openai import ChatOpenAI

# 方舟/豆包等：所有模型调用统一关闭思考模式（extra_body）
_ARK_EXTRA_BODY = {"thinking": {"type": "disabled"}}

llm = ChatOpenAI(
    model=os.environ.get("DOUBAO_MODEL", "doubao-seed-2-0-pro-260215"),
    openai_api_key=os.environ.get("ARK_API_KEY", ""),
    openai_api_base=os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
    temperature=0.7,
    max_tokens=8000,
    streaming=True,
    extra_body=_ARK_EXTRA_BODY,
)

llm_vision = ChatOpenAI(
    model=os.environ.get("DOUBAO_MODEL", "doubao-seed-2-0-pro-260215"),
    openai_api_key=os.environ.get("ARK_API_KEY", ""),
    openai_api_base=os.environ.get("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
    temperature=0,
    max_tokens=10000,
    extra_body=_ARK_EXTRA_BODY,
)
