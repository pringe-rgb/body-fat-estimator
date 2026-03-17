from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE_PACKAGES = ROOT / ".venv" / "Lib" / "site-packages"

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(SITE_PACKAGES))

import uvicorn
from app.main import app


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
