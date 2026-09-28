"""Runtime configuration loaded from the environment (see .env.example)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
ALGORITHM = os.getenv("ALGORITHM", "HS256").strip()
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not configured. Copy services/api/.env.example to "
        "services/api/.env and set a strong random value."
    )
