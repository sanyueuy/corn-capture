from __future__ import annotations

import socket
from typing import Any

import qrcode
import qrcode.image.svg
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .config import FRONTEND_DIST_DIR, PROJECT_ROOT, ensure_directories
from .database import Base, engine, get_db
from .exporter import create_export_zip
from .models import AnnotationBox, ImageRecord, Project
from .schemas import (
    HealthResponse,
    ImageDetail,
    ImageListItem,
    ProjectCreate,
    ProjectSummary,
    SaveAnnotationsRequest,
)
from .storage import project_relative_to_absolute, save_upload_file


ensure_directories()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Corn Capture", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
def guess_lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def build_lan_base_url(request: Request) -> str:
    port = request.url.port or 8000
    scheme = request.url.scheme
    lan_ip = guess_lan_ip()
    return f"{scheme}://{lan_ip}:{port}"


def project_urls(project_id: str, request: Request) -> dict[str, str]:
    base_url = build_lan_base_url(request)
    return {
        "capture_url": f"{base_url}/capture/{project_id}",
        "annotate_url": f"{base_url}/annotate/{project_id}",
        "capture_qr_url": f"/api/projects/{project_id}/capture-qr",
    }


def serialize_project(project: Project, request: Request) -> ProjectSummary:
    pending_count = sum(1 for item in project.images if item.status == "pending")
    draft_count = sum(1 for item in project.images if item.status == "draft")
    completed_count = sum(1 for item in project.images if item.status == "completed")

    return ProjectSummary(
        id=project.id,
        name=project.name,
        created_at=project.created_at,
        class_names=project.class_names,
        image_count=len(project.images),
        pending_count=pending_count,
        draft_count=draft_count,
        completed_count=completed_count,
        **project_urls(project.id, request),
    )


def image_file_url(image_id: str) -> str:
    return f"/api/images/{image_id}/file"


def image_thumbnail_url(image_id: str) -> str:
    return f"/api/images/{image_id}/thumbnail"


def serialize_image(image: ImageRecord) -> ImageListItem:
    return ImageListItem(
        id=image.id,
        file_name=image.file_name,
        width=image.width,
        height=image.height,
        capture_height_cm=image.capture_height_cm,
        status=image.status,
        captured_at=image.captured_at,
        image_url=image_file_url(image.id),
        thumbnail_url=image_thumbnail_url(image.id) if image.thumbnail_relpath else None,
        annotation_count=len(image.annotations),
    )


def serialize_image_detail(image: ImageRecord) -> ImageDetail:
    payload = serialize_image(image).model_dump()
    payload["annotations"] = [
        {
            "id": box.id,
            "class_id": box.class_id,
            "x_px": box.x_px,
            "y_px": box.y_px,
            "w_px": box.w_px,
            "h_px": box.h_px,
            "plant_height_cm": box.plant_height_cm,
        }
        for box in image.annotations
    ]
    return ImageDetail(**payload)


@app.get("/api/health", response_model=HealthResponse)
def healthcheck() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/api/projects", response_model=list[ProjectSummary])
def list_projects(request: Request, db: Session = Depends(get_db)) -> list[ProjectSummary]:
    projects = db.scalars(
        select(Project).options(selectinload(Project.images)).order_by(Project.created_at.desc())
    ).all()
    return [serialize_project(project, request) for project in projects]


@app.post("/api/projects", response_model=ProjectSummary)
def create_project(payload: ProjectCreate, request: Request, db: Session = Depends(get_db)) -> ProjectSummary:
    project = Project(name=payload.name.strip())
    db.add(project)
    db.commit()
    db.refresh(project)
    db.refresh(project, attribute_names=["images"])
    return serialize_project(project, request)


@app.get("/api/projects/{project_id}", response_model=ProjectSummary)
def get_project(project_id: str, request: Request, db: Session = Depends(get_db)) -> ProjectSummary:
    project = db.scalar(select(Project).where(Project.id == project_id).options(selectinload(Project.images)))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return serialize_project(project, request)


@app.get("/api/projects/{project_id}/images", response_model=list[ImageListItem])
def get_project_images(project_id: str, db: Session = Depends(get_db)) -> list[ImageListItem]:
    project = db.scalar(
        select(Project).where(Project.id == project_id).options(selectinload(Project.images).selectinload(ImageRecord.annotations))
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return [serialize_image(image) for image in project.images]


@app.post("/api/uploads", response_model=ImageDetail)
async def upload_image(
    project_id: str = Form(...),
    capture_height_cm: float = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ImageDetail:
    if capture_height_cm <= 0:
        raise HTTPException(status_code=400, detail="Capture height must be greater than zero.")

    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    try:
        stored = await save_upload_file(project_id=project_id, upload=file)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Failed to process upload: {exc}") from exc

    image = ImageRecord(
        project_id=project_id,
        file_name=stored["file_name"],
        stored_relpath=stored["stored_relpath"],
        thumbnail_relpath=stored["thumbnail_relpath"],
        width=stored["width"],
        height=stored["height"],
        capture_height_cm=capture_height_cm,
        status="pending",
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    db.refresh(image, attribute_names=["annotations"])
    return serialize_image_detail(image)


@app.get("/api/images/{image_id}", response_model=ImageDetail)
def get_image(image_id: str, db: Session = Depends(get_db)) -> ImageDetail:
    image = db.scalar(
        select(ImageRecord)
        .where(ImageRecord.id == image_id)
        .options(selectinload(ImageRecord.annotations))
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    return serialize_image_detail(image)


@app.get("/api/images/{image_id}/file")
def get_image_file(image_id: str, db: Session = Depends(get_db)) -> FileResponse:
    image = db.get(ImageRecord, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    file_path = project_relative_to_absolute(image.stored_relpath)
    if file_path is None or not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found.")
    return FileResponse(file_path)


@app.get("/api/images/{image_id}/thumbnail")
def get_image_thumbnail(image_id: str, db: Session = Depends(get_db)) -> FileResponse:
    image = db.get(ImageRecord, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    file_path = project_relative_to_absolute(image.thumbnail_relpath)
    if file_path is None or not file_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found.")
    return FileResponse(file_path)


@app.put("/api/images/{image_id}/annotations", response_model=ImageDetail)
def save_annotations(
    image_id: str,
    payload: SaveAnnotationsRequest,
    db: Session = Depends(get_db),
) -> ImageDetail:
    image = db.scalar(
        select(ImageRecord)
        .where(ImageRecord.id == image_id)
        .options(selectinload(ImageRecord.annotations))
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")

    sanitized_annotations: list[dict[str, Any]] = []
    for annotation in payload.annotations:
        if annotation.w_px <= 0 or annotation.h_px <= 0:
            raise HTTPException(status_code=400, detail="Bounding boxes must have positive width and height.")

        x_px = min(max(annotation.x_px, 0.0), float(image.width))
        y_px = min(max(annotation.y_px, 0.0), float(image.height))
        w_px = min(annotation.w_px, float(image.width) - x_px)
        h_px = min(annotation.h_px, float(image.height) - y_px)
        plant_height_cm = annotation.plant_height_cm
        if plant_height_cm is not None and plant_height_cm <= 0:
            raise HTTPException(status_code=400, detail="Plant height must be greater than zero.")

        sanitized_annotations.append(
            {
                "class_id": 0,
                "x_px": x_px,
                "y_px": y_px,
                "w_px": w_px,
                "h_px": h_px,
                "plant_height_cm": plant_height_cm,
            }
        )

    complete_ready = bool(sanitized_annotations) and all(
        annotation["plant_height_cm"] is not None for annotation in sanitized_annotations
    )
    if payload.mark_completed and not complete_ready:
        raise HTTPException(status_code=400, detail="All boxes need plant heights before completion.")

    for box in list(image.annotations):
        db.delete(box)
    db.flush()
    image.annotations = []

    for index, annotation in enumerate(sanitized_annotations):
        image.annotations.append(
            AnnotationBox(
                image_id=image.id,
                sort_index=index,
                **annotation,
            )
        )

    if not sanitized_annotations:
        image.status = "pending"
    elif payload.mark_completed:
        image.status = "completed"
    else:
        image.status = "draft"

    db.commit()
    db.expire_all()

    refreshed = db.scalar(
        select(ImageRecord)
        .where(ImageRecord.id == image.id)
        .options(selectinload(ImageRecord.annotations))
    )
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Image not found after save.")
    return serialize_image_detail(refreshed)


@app.post("/api/projects/{project_id}/export")
def export_project(project_id: str, db: Session = Depends(get_db)) -> FileResponse:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    try:
        export_path = create_export_zip(db, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return FileResponse(
        export_path,
        media_type="application/zip",
        filename=export_path.name,
    )


@app.get("/api/projects/{project_id}/capture-qr")
def project_capture_qr(project_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    capture_url = project_urls(project_id, request)["capture_url"]
    svg_image = qrcode.make(capture_url, image_factory=qrcode.image.svg.SvgPathImage)
    svg_markup = svg_image.to_string()
    return Response(content=svg_markup, media_type="image/svg+xml")


if PROJECT_ROOT.exists():
    media_root = PROJECT_ROOT / "backend" / "data" / "projects"
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=media_root), name="media")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if not FRONTEND_DIST_DIR.exists():
        return HTMLResponse(
            """
            <html>
              <body style="font-family: sans-serif; padding: 32px;">
                <h1>Corn Capture backend is running.</h1>
                <p>Build the frontend in <code>frontend/</code> or run the Vite dev server.</p>
              </body>
            </html>
            """,
            status_code=200,
        )

    requested = FRONTEND_DIST_DIR / full_path
    if full_path and requested.exists() and requested.is_file():
        return FileResponse(requested)
    index_path = FRONTEND_DIST_DIR / "index.html"
    return FileResponse(index_path)
