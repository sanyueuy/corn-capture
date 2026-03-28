from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
import random
import shutil
import tempfile
import zipfile

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .config import EXPORTS_DIR
from .models import ImageRecord, Project
from .storage import project_relative_to_absolute, slugify_filename


EXPORT_RANDOM_SEED = 32526


def _normalized_label(image: ImageRecord, box) -> str:
    x_center = (box.x_px + (box.w_px / 2.0)) / image.width
    y_center = (box.y_px + (box.h_px / 2.0)) / image.height
    width = box.w_px / image.width
    height = box.h_px / image.height

    x_center = min(max(x_center, 0.0), 1.0)
    y_center = min(max(y_center, 0.0), 1.0)
    width = min(max(width, 0.0), 1.0)
    height = min(max(height, 0.0), 1.0)

    return f"0 {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}"


def create_export_zip(session: Session, project_id: str) -> Path:
    project = session.scalar(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.images).selectinload(ImageRecord.annotations))
    )
    if project is None:
        raise ValueError("Project not found.")

    completed_images = [image for image in project.images if image.status == "completed" and image.annotations]
    if not completed_images:
        raise ValueError("No completed images available for export.")

    ordered_images = sorted(completed_images, key=lambda item: item.id)
    random.Random(EXPORT_RANDOM_SEED).shuffle(ordered_images)

    if len(ordered_images) > 1:
        val_count = max(1, int(round(len(ordered_images) * 0.2)))
        val_count = min(val_count, len(ordered_images) - 1)
    else:
        val_count = 0

    val_ids = {image.id for image in ordered_images[:val_count]}

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    export_stem = slugify_filename(project.name.strip().replace(" ", "_") or "corn_dataset")
    export_name = f"{export_stem}-{timestamp}.zip"
    export_path = EXPORTS_DIR / export_name

    with tempfile.TemporaryDirectory(dir=EXPORTS_DIR) as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        images_train_dir = temp_dir / "images" / "train"
        images_val_dir = temp_dir / "images" / "val"
        labels_train_dir = temp_dir / "labels" / "train"
        labels_val_dir = temp_dir / "labels" / "val"
        for path in (images_train_dir, images_val_dir, labels_train_dir, labels_val_dir):
            path.mkdir(parents=True, exist_ok=True)

        csv_path = temp_dir / "annotations_extra.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(
                csv_file,
                fieldnames=[
                    "image_name",
                    "split",
                    "bbox_index",
                    "class_name",
                    "class_id",
                    "capture_height_cm",
                    "plant_height_cm",
                    "x_px",
                    "y_px",
                    "w_px",
                    "h_px",
                    "image_width_px",
                    "image_height_px",
                ],
            )
            writer.writeheader()

            for image in ordered_images:
                split = "val" if image.id in val_ids else "train"
                image_target_dir = images_val_dir if split == "val" else images_train_dir
                label_target_dir = labels_val_dir if split == "val" else labels_train_dir

                absolute_image_path = project_relative_to_absolute(image.stored_relpath)
                if absolute_image_path is None or not absolute_image_path.exists():
                    continue

                shutil.copy2(absolute_image_path, image_target_dir / image.file_name)
                label_path = label_target_dir / f"{Path(image.file_name).stem}.txt"
                label_path.write_text(
                    "\n".join(_normalized_label(image, box) for box in image.annotations),
                    encoding="utf-8",
                )

                for index, box in enumerate(image.annotations):
                    writer.writerow(
                        {
                            "image_name": image.file_name,
                            "split": split,
                            "bbox_index": index,
                            "class_name": "corn_plant",
                            "class_id": 0,
                            "capture_height_cm": image.capture_height_cm,
                            "plant_height_cm": box.plant_height_cm if box.plant_height_cm is not None else "",
                            "x_px": round(box.x_px, 4),
                            "y_px": round(box.y_px, 4),
                            "w_px": round(box.w_px, 4),
                            "h_px": round(box.h_px, 4),
                            "image_width_px": image.width,
                            "image_height_px": image.height,
                        }
                    )

        yaml_path = temp_dir / "data.yaml"
        yaml_path.write_text(
            yaml.safe_dump(
                {
                    "path": ".",
                    "train": "images/train",
                    "val": "images/val",
                    "names": ["corn_plant"],
                },
                allow_unicode=True,
                sort_keys=False,
            ),
            encoding="utf-8",
        )

        with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
            for file_path in temp_dir.rglob("*"):
                if file_path.is_file():
                    zip_file.write(file_path, arcname=file_path.relative_to(temp_dir))

    return export_path
