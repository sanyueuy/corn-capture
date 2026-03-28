from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Optional
import uuid

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    class_names_json: Mapped[str] = mapped_column(Text, default='["corn_plant"]')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    images: Mapped[list["ImageRecord"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="desc(ImageRecord.captured_at)",
    )

    @property
    def class_names(self) -> list[str]:
        return json.loads(self.class_names_json or "[]")


class ImageRecord(Base):
    __tablename__ = "images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_relpath: Mapped[str] = mapped_column(String(1024), nullable=False)
    thumbnail_relpath: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    capture_height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="images")
    annotations: Mapped[list["AnnotationBox"]] = relationship(
        back_populates="image",
        cascade="all, delete-orphan",
        order_by="AnnotationBox.sort_index",
    )


class AnnotationBox(Base):
    __tablename__ = "annotation_boxes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    image_id: Mapped[str] = mapped_column(ForeignKey("images.id"), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sort_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    x_px: Mapped[float] = mapped_column(Float, nullable=False)
    y_px: Mapped[float] = mapped_column(Float, nullable=False)
    w_px: Mapped[float] = mapped_column(Float, nullable=False)
    h_px: Mapped[float] = mapped_column(Float, nullable=False)
    plant_height_cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    image: Mapped[ImageRecord] = relationship(back_populates="annotations")
