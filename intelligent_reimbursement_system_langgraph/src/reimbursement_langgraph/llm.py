"""LLM 实例初始化"""
from langchain_openai import ChatOpenAI

from reimbursement_langgraph.config import settings

# 方舟/豆包等：所有模型调用统一关闭思考模式（extra_body）
_ARK_EXTRA_BODY = {"thinking": {"type": "disabled"}}

llm = ChatOpenAI(
    model=settings.DOUBAO_MODEL,
    openai_api_key=settings.ARK_API_KEY,
    openai_api_base=settings.ARK_BASE_URL,
    temperature=0.7,
    max_tokens=8000,
    streaming=True,
    extra_body=_ARK_EXTRA_BODY,
)

llm_vision = ChatOpenAI(
    model=settings.DOUBAO_MODEL,
    openai_api_key=settings.ARK_API_KEY,
    openai_api_base=settings.ARK_BASE_URL,
    temperature=0,
    max_tokens=10000,
    extra_body=_ARK_EXTRA_BODY,
)
