"""测试豆包大模型集成 - LangChain 标准写法"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from config import ARK_API_KEY, ARK_BASE_URL, DOUBAO_MODEL

# LLM 实例在模块顶层初始化一次
_llm = ChatOpenAI(
    model=DOUBAO_MODEL,
    openai_api_key=ARK_API_KEY,
    openai_api_base=ARK_BASE_URL,
    temperature=0.7,
    max_tokens=2000,
)

_llm_stream = ChatOpenAI(
    model=DOUBAO_MODEL,
    openai_api_key=ARK_API_KEY,
    openai_api_base=ARK_BASE_URL,
    temperature=0.7,
    max_tokens=2000,
    streaming=True,
)


def _check_api_key() -> bool:
    if not ARK_API_KEY or ARK_API_KEY == "your_ark_api_key_here":
        print("❌ 请在 .env 文件中配置 ARK_API_KEY")
        return False
    return True


def test_doubao_connection() -> bool:
    """测试豆包模型同步调用"""
    print("=" * 50)
    print("【测试1】同步调用")
    print(f"  模型: {DOUBAO_MODEL} | API Base: {ARK_BASE_URL}")
    print("=" * 50)

    if not _check_api_key():
        return False

    try:
        response = _llm.invoke([
            SystemMessage(content="你是一个友好的助手"),
            HumanMessage(content="你好，请用一句话介绍你自己"),
        ])
        print(f"\n✅ 模型响应:\n{response.content}")
        return True
    except Exception as e:
        print(f"\n❌ 调用失败: {e}")
        return False


def test_stream_chat() -> bool:
    """测试流式对话"""
    print("\n" + "=" * 50)
    print("【测试2】流式调用")
    print("=" * 50)

    if not _check_api_key():
        return False

    print("\n流式响应:")
    try:
        for chunk in _llm_stream.stream([HumanMessage(content="数到5，每个数字用逗号分隔")]):
            if chunk.content:
                print(chunk.content, end="", flush=True)
        print("\n\n✅ 流式调用成功")
        return True
    except Exception as e:
        print(f"\n❌ 流式调用失败: {e}")
        return False


def test_with_prompt_template() -> bool:
    """测试 Prompt Template + Chain"""
    print("\n" + "=" * 50)
    print("【测试3】Prompt Template")
    print("=" * 50)

    if not _check_api_key():
        return False

    try:
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser

        chain = ChatPromptTemplate.from_messages([
            ("system", "你是一个{role}"),
            ("human", "{input}"),
        ]) | _llm | StrOutputParser()

        result = chain.invoke({"role": "数学老师", "input": "1+1等于几？"})
        print(f"\n✅ 响应: {result}")
        return True
    except Exception as e:
        print(f"\n❌ 调用失败: {e}")
        return False


if __name__ == '__main__':
    print("\n🚀 开始测试豆包大模型集成\n")

    if test_doubao_connection():
        test_stream_chat()
        test_with_prompt_template()

    print("\n" + "=" * 50)
    print("测试完成")
    print("=" * 50)
