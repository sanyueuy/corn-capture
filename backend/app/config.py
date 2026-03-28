from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

DATA_DIR = BACKEND_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"
EXPORTS_DIR = DATA_DIR / "exports"
DATABASE_PATH = DATA_DIR / "corn_capture.sqlite3"
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "dist"


def ensure_directories() -> None:
    for path in (DATA_DIR, PROJECTS_DIR, EXPORTS_DIR):
        path.mkdir(parents=True, exist_ok=True)
