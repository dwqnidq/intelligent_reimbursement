from src.type_field_fill import fill_type_fields_from_ocr


def test_fill_type_fields_amount_fallback_without_llm(monkeypatch):
    """LLM 失败时，已知金额仍写入 amount 字段。"""
    import src.type_field_fill as mod

    def _boom(_prompt: str):
        raise RuntimeError("llm down")

    monkeypatch.setattr(mod, "_invoke_fill_llm", _boom)

    result = fill_type_fields_from_ocr(
        type_payload={
            "label": "餐费",
            "fields": [
                {"key": "amount", "label": "金额", "type": "number"},
                {"key": "reason", "label": "事由", "type": "text"},
            ],
        },
        ocr_text="价税合计 50 元",
        known_amount=50,
    )
    assert result["label"] == "餐费"
    amount_field = next(f for f in result["fields"] if f["key"] == "amount")
    assert amount_field["value"] == 50
    assert not any(f["key"] == "reason" for f in result["fields"])
