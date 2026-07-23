"""有有效发票号但无字段时，应返回可进「未匹配」的行，并尽量带上金额。"""

from src.invoice_fallback import (
    build_unmatched_invoice_only_rows,
    extract_amount_from_ocr,
    resolve_amount_from_dumped,
    resolve_unmatched_amount,
)


def test_fallback_row_carries_invoice_meta_and_suggested_flag():
    rows = build_unmatched_invoice_only_rows(
        {
            "invoice_number": "12345678901234",
            "invoice_title": "测试公司",
            "invoice_date": "2026-01-01",
            "issuer": "开票人",
        },
        suggested_label="差旅费",
    )
    assert len(rows) == 1
    row = rows[0]
    assert row["invoice_number"] == "12345678901234"
    assert row["invoice_title"] == "测试公司"
    assert row["fields"] == []
    assert row["is_suggested_type"] is True
    assert row["label"] == "差旅费"


def test_fallback_default_label_when_suggestion_empty():
    rows = build_unmatched_invoice_only_rows(
        {"invoice_number": "87654321", "invoice_title": "", "invoice_date": "", "issuer": ""},
    )
    assert rows[0]["label"] == "未识别到报销类型"
    assert rows[0]["is_suggested_type"] is True


def test_fallback_includes_amount_field_and_ocr():
    rows = build_unmatched_invoice_only_rows(
        {"invoice_number": "12345678", "invoice_title": "", "invoice_date": "", "issuer": ""},
        amount=128.5,
        ocr_text="价税合计（小写）¥128.50",
    )
    assert rows[0]["fields"][0]["key"] == "amount"
    assert rows[0]["fields"][0]["value"] == 128.5
    assert rows[0]["fields"][0]["is_calculate"] is True
    assert "128.50" in rows[0]["ocr_text"]


def test_extract_amount_from_ocr_价税合计():
    assert extract_amount_from_ocr("价税合计（小写）¥1,234.50") == 1234.5


def test_resolve_amount_from_dumped_assignments():
    assert (
        resolve_amount_from_dumped(
            {"assignments": [{"key": "amount", "value": "88.00"}]}
        )
        == 88.0
    )


def test_resolve_unmatched_amount_prefers_dumped_then_ocr():
    assert (
        resolve_unmatched_amount(
            {"assignments": [{"key": "amount", "value": 10}]},
            "价税合计¥99",
        )
        == 10.0
    )
    assert resolve_unmatched_amount({}, "价税合计¥99.5") == 99.5
