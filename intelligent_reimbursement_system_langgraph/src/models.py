"""数据模型定义 - GraphState 和 Pydantic 模型"""
from typing import TypedDict, Annotated, Any, List, Optional, Dict

from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

# 与前端 api/ai.ts 中 REIMBURSEMENT_FORM_EXTRACT_MESSAGE 保持一致
REIMBURSEMENT_FORM_EXTRACT_TRIGGER = "[[reimbursement_form_extract]]"

# 多文件智能填单时并发请求数；过大可能触发方舟 API 限流，可按环境调大/调小
_FORM_EXTRACT_MAX_PARALLEL = 4


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
    ocr_texts: List[str]


class InvoiceResult(BaseModel):
    is_invoice: bool = Field(description="是否是正规发票")


class InvoiceResultList(BaseModel):
    items: List[InvoiceResult] = Field(description="所有文件的识别结果列表")


class FieldValueAssignment(BaseModel):
    key: str = Field(
        description="必须与提示词「类型摘要」里所选类型的 fields[].key 完全一致，禁止编造",
    )
    value: Any = Field(description="从票据识别出的值，对应上述 key")


class LineItemAssignments(BaseModel):
    assignments: List[FieldValueAssignment] = Field(
        default_factory=list,
        description="该条明细的字段赋值；key 必须来自所选类型 fields[].key",
    )


class SuggestedFieldEntry(BaseModel):
    key: str = Field(description="字段标识，英文小写下划线")
    label: str = Field(description="字段中文名")
    type: str = Field(
        default="text",
        description="text | number | date | select | textarea",
    )
    value: Any = Field(default=None, description="从票据识别的值，不确定可省略")
    required: bool = Field(default=False)
    sort: int = Field(default=0, description="展示顺序，数字小的在前")
    options: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="type 为 select 时的选项，每项含 label、value",
    )
    is_calculate: bool = Field(default=False)


class LineItemSuggested(BaseModel):
    fields: List[SuggestedFieldEntry] = Field(
        default_factory=list,
        description="该条建议明细的全部字段",
    )


class ReimbursementFormValuesExtract(BaseModel):
    code: str = Field(
        default="",
        description=(
            "必须与「类型摘要」中选定条目的 code 字段完全一致（逐字）；"
            "摘要中有 2 种及以上类型时必填，用于严格锁定类型、禁止与上一文件串台"
        ),
    )
    name: str = Field(
        default="",
        description=(
            "必须与所选摘要条目的 name 完全一致（报销类型业务名称）；"
            "且与 code 必须属于同一条记录，不可张冠李戴"
        ),
    )
    label: str = Field(
        default="",
        description="保留兼容字段，智能填单请填写 name，勿用 label 选型",
    )
    items: List[LineItemAssignments] = Field(
        default_factory=list,
        description="每条需单独报销的明细一项；仅一条时也必须为长度 1 的数组。",
    )
    assignments: List[FieldValueAssignment] = Field(
        default_factory=list,
        description="兼容：整票单条时可只填此项；若 items 非空则忽略",
    )
    no_existing_type_match: bool = Field(
        default=False,
        description="为 true 表示票据无法合理归入任一已有类型；填 suggested_*",
    )
    suggested_type_label: str = Field(default="", description="建议的新报销类型中文名称")
    suggested_type_code: str = Field(default="", description="建议的类型 code，可空")
    suggested_over_limit_threshold: Optional[float] = Field(
        default=None,
        description="建议的单笔报销上限金额；无法判断可省略",
    )
    suggested_line_items: List[LineItemSuggested] = Field(
        default_factory=list,
        description="与 no_existing_type_match 配套：每条明细一组 fields",
    )
    invoice_number: str = Field(
        default="",
        description="发票号码/票据号码；增值税发票填发票号码，其他票据填唯一编号；无法识别则留空",
    )
    invoice_title: str = Field(
        default="",
        description="发票抬头（购买方名称/公司名称）；无法识别则留空",
    )
    invoice_date: str = Field(
        default="",
        description="开票日期，格式 YYYY-MM-DD；无法识别则留空",
    )
    issuer: str = Field(
        default="",
        description="开票人姓名；无法识别则留空",
    )
