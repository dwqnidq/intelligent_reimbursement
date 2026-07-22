from src.progress_token import encode_progress_token, try_parse_progress_token


def test_roundtrip():
    raw = encode_progress_token(2, 5)
    assert try_parse_progress_token(raw) == {"done": 2, "total": 5}


def test_roundtrip_with_stage_message():
    raw = encode_progress_token(
        1,
        5,
        stage="extract",
        message="字段提取中 · 第 2/5 张 · 酒店发票.png",
    )
    assert try_parse_progress_token(raw) == {
        "done": 1,
        "total": 5,
        "stage": "extract",
        "message": "字段提取中 · 第 2/5 张 · 酒店发票.png",
    }


def test_roundtrip_with_file_index():
    raw = encode_progress_token(
        2,
        4,
        stage="match",
        message="类型匹配中 · 第 3/4 张 · a.pdf",
        file_index=3,
    )
    assert try_parse_progress_token(raw) == {
        "done": 2,
        "total": 4,
        "stage": "match",
        "message": "类型匹配中 · 第 3/4 张 · a.pdf",
        "file_index": 3,
    }


def test_rejects_non_positive_file_index():
    raw = encode_progress_token(1, 2, file_index=0)
    assert try_parse_progress_token(raw) == {"done": 1, "total": 2}


def test_rejects_plain_text():
    assert try_parse_progress_token("正在处理…") is None


def test_clamps_negative():
    assert try_parse_progress_token(encode_progress_token(-1, 0)) == {"done": 0, "total": 0}


def test_legacy_token_without_stage_still_parses():
    raw = json_dumps_legacy()
    assert try_parse_progress_token(raw) == {"done": 0, "total": 3}


def json_dumps_legacy():
    import json

    return json.dumps(
        {"type": "progress", "progress": {"done": 0, "total": 3}},
        ensure_ascii=False,
    )
