from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime
    class_names: list[str]
    image_count: int
    pending_count: int
    draft_count: int
    completed_count: int
    capture_url: str
    annotate_url: str
    capture_qr_url: str


class AnnotationBoxPayload(BaseModel):
    id: Optional[str] = None
    class_id: int = 0
    x_px: float
    y_px: float
    w_px: float
    h_px: float
    plant_height_cm: Optional[float] = None


class AnnotationBoxResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    class_id: int
    x_px: float
    y_px: float
    w_px: float
    h_px: float
    plant_height_cm: Optional[float] = None


class ImageListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_name: str
    width: int
    height: int
    capture_height_cm: float
    status: str
    captured_at: datetime
    image_url: str
    thumbnail_url: Optional[str] = None
    annotation_count: int


class ImageDetail(ImageListItem):
    annotations: list[AnnotationBoxResponse]


class SaveAnnotationsRequest(BaseModel):
    annotations: list[AnnotationBoxPayload]
    mark_completed: bool = False


class HealthResponse(BaseModel):
    status: str
