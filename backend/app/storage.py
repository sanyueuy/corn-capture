from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
from typing import Any
from typing import Optional
import unicodedata
import uuid

from PIL import Image
from fastapi import UploadFile

from .config import PROJECTS_DIR


def slugify_filename(raw_name: str) -> str:
    normalized = unicodedata.normalize("NFKD", raw_name).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", normalized).strip("-._")
    return cleaned or "capture"


def project_media_paths(project_id: str) -> tuple[Path, Path]:
    project_dir = PROJECTS_DIR / project_id
    images_dir = project_dir / "images"
    thumbnails_dir = project_dir / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)
    return images_dir, thumbnails_dir


async def save_upload_file(project_id: str, upload: UploadFile) -> dict[str, Any]:
    images_dir, thumbnails_dir = project_media_paths(project_id)

    original_name = upload.filename or "capture.jpg"
    source_stem = slugify_filename(Path(original_name).stem)
    unique_name = f"{source_stem}-{uuid.uuid4().hex[:8]}.jpg"

    file_bytes = await upload.read()
    with Image.open(BytesIO(file_bytes)) as image:
        image = image.convert("RGB")
        width, height = image.size
        image_path = images_dir / unique_name
        image.save(image_path, format="JPEG", quality=95)

        thumbnail = image.copy()
        thumbnail.thumbnail((720, 720))
        thumbnail_name = f"{Path(unique_name).stem}.jpg"
        thumbnail_path = thumbnails_dir / thumbnail_name
        thumbnail.save(thumbnail_path, format="JPEG", quality=85)

    return {
        "file_name": unique_name,
        "stored_relpath": str(image_path.relative_to(PROJECTS_DIR)),
        "thumbnail_relpath": str(thumbnail_path.relative_to(PROJECTS_DIR)),
        "width": width,
        "height": height,
    }


def project_relative_to_absolute(relative_path: Optional[str]) -> Optional[Path]:
    if not relative_path:
        return None
    return PROJECTS_DIR / relative_path
