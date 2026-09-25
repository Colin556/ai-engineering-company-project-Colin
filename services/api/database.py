from __future__ import annotations

import os
from pathlib import Path
from threading import RLock

from tinydb import TinyDB


DEFAULT_DB_PATH = Path(__file__).parent / "data" / "suppliers.json"
DB_PATH = Path(os.getenv("SUPPLIERS_DB_PATH", DEFAULT_DB_PATH))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

db = TinyDB(DB_PATH)
suppliers_table = db.table("suppliers")
db_lock = RLock()