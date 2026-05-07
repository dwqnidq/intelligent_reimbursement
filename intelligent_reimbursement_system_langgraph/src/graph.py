"""LangGraph 图定义 - 图编译"""
from langgraph.graph import StateGraph, END

from src.models import GraphState
from src.nodes.nodes import (
    chat_node,
    generate_output,
    reimbursement_form_extract_node,
    reimbursement_type_node,
    route_by_intent,
    route_intent,
)


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
