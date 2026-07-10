"""从 MongoDB 查询 invoice_infos / reimbursements_records，判断发票号码是否已上传。"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)


def _resolve_db(client: MongoClient) -> Optional[Database]:
    db = client.get_default_database()
    if db is not None:
        return db
    mongodb_db_name = os.environ.get("MONGODB_DB_NAME", "")
    if mongodb_db_name:
        return client[mongodb_db_name]
    logger.warning(
        "[invoice_infos] MongoDB URI 未包含数据库名，且未设置 MONGODB_DB_NAME，无法查重"
    )
    return None


def is_invoice_number_uploaded(invoice_number: str) -> bool:
    """
    发票号码是否已占用：优先查 invoice_infos；兼容历史数据再查 reimbursements_records（pending/approved）。
    """
    normalized = (invoice_number or "").strip()
    if not normalized:
        return False

    mongodb_uri = os.environ.get("MONGODB_URI", "")
    if not mongodb_uri:
        logger.warning("[invoice_infos] 未配置 MONGODB_URI，跳过发票查重")
        return False

    try:
        with MongoClient(mongodb_uri, serverSelectionTimeoutMS=8000) as client:
            db = _resolve_db(client)
            if db is None:
                return False

            if db["invoice_infos"].find_one(
                {"invoice_number": normalized},
                projection={"_id": 1},
            ):
                return True

            legacy = db["reimbursements_records"].find_one(
                {
                    "invoice_number": normalized,
                    "status": {"$in": ["pending", "approved"]},
                },
                projection={"_id": 1},
            )
            return legacy is not None
    except PyMongoError as e:
        logger.warning("[invoice_infos] 查重失败 invoice_number=%s: %s", normalized, e)
        return False
