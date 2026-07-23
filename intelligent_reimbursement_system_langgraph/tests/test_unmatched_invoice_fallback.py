"""有有效发票号但无字段时，应返回可进「未匹配」的行，而非空组。"""

from src.invoice_fallback import build_unmatched_invoice_only_rows


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
