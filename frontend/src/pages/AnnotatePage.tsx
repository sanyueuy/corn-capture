import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAnnotationColor } from "../annotationDisplay";
import { AnnotationCanvas } from "../components/AnnotationCanvas";
import {
  downloadProjectExport,
  fetchImage,
  fetchProject,
  fetchProjectImages,
  saveImageAnnotations,
} from "../api";
import type { AnnotationBox, ImageDetail, ImageListItem, ProjectSummary } from "../types";


function ensureClientIds(boxes: AnnotationBox[]): AnnotationBox[] {
  return boxes.map((box) => ({
    ...box,
    id: box.id ?? crypto.randomUUID(),
  }));
}


function hasCompleteHeights(boxes: AnnotationBox[]) {
  return boxes.length > 0 && boxes.every((box) => box.plant_height_cm !== null && box.plant_height_cm > 0);
}


export function AnnotatePage() {
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imageDetail, setImageDetail] = useState<ImageDetail | null>(null);
  const [draftBoxes, setDraftBoxes] = useState<AnnotationBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function loadProjectState() {
    try {
      setLoading(true);
      setError(null);
      const [projectResponse, imagesResponse] = await Promise.all([
        fetchProject(projectId),
        fetchProjectImages(projectId),
      ]);
      setProject(projectResponse);
      setImages(imagesResponse);

      const fallbackImageId =
        selectedImageId && imagesResponse.some((item) => item.id === selectedImageId)
          ? selectedImageId
          : imagesResponse.find((item) => item.status !== "completed")?.id ?? imagesResponse[0]?.id ?? null;
      setSelectedImageId(fallbackImageId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载项目失败。");
    } finally {
      setLoading(false);
    }
  }

  async function loadImage(imageId: string) {
    try {
      setError(null);
      setMessage(null);
      const detail = await fetchImage(imageId);
      setImageDetail(detail);
      setDraftBoxes(ensureClientIds(detail.annotations));
      setSelectedBoxId(detail.annotations[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载图片失败。");
    }
  }

  useEffect(() => {
    if (projectId) {
      void loadProjectState();
    }
  }, [projectId]);

  useEffect(() => {
    if (selectedImageId) {
      void loadImage(selectedImageId);
    } else {
      setImageDetail(null);
      setDraftBoxes([]);
      setSelectedBoxId(null);
    }
  }, [selectedImageId]);

  const selectedBox = useMemo(
    () => draftBoxes.find((box) => box.id === selectedBoxId) ?? null,
    [draftBoxes, selectedBoxId],
  );

  async function persistAnnotations(markCompleted: boolean) {
    if (!imageDetail) {
      return;
    }
    if (markCompleted && !hasCompleteHeights(draftBoxes)) {
      setError("至少需要一个框，并且所有框都填写植株高度后才能完成。");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const saved = await saveImageAnnotations(imageDetail.id, draftBoxes, markCompleted);
      const nextDetail = {
        ...saved,
        annotations: ensureClientIds(saved.annotations),
      };
      setImageDetail(nextDetail);
      setDraftBoxes(nextDetail.annotations);
      setSelectedBoxId(nextDetail.annotations[0]?.id ?? null);
      setMessage(markCompleted ? "该图片已标记为完成。" : "草稿已保存。");
      await loadProjectState();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存标注失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectImage(imageId: string) {
    setSelectedImageId(imageId);
  }

  async function handleExportProject() {
    try {
      setExporting(true);
      setError(null);
      setMessage(null);
      await downloadProjectExport(projectId);
      setMessage("YOLO 数据集 ZIP 已开始下载。");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败。");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="annotate-layout">
      <aside className="annotate-sidebar">
        <div className="annotate-sidebar-header">
          <div>
            <p className="eyebrow">Desktop Annotation</p>
            <h1>{project?.name ?? "玉米植株标注"}</h1>
          </div>
          <Link className="ghost-button as-link" to="/projects">
            项目首页
          </Link>
        </div>

        {project ? (
          <div className="annotate-project-meta">
            <p>图片总数：{project.image_count}</p>
            <p>完成：{project.completed_count}</p>
            <p>草稿：{project.draft_count}</p>
            <p>未标注：{project.pending_count}</p>
          </div>
        ) : null}

        <div className="queue-list">
          {loading ? <p className="status-message">正在加载图片列表...</p> : null}
          {!loading && images.length === 0 ? (
            <div className="empty-card compact">
              <h3>还没有图片</h3>
              <p>先用手机采集页上传照片，这里会自动出现待标注图片。</p>
            </div>
          ) : null}

          {images.map((image) => (
            <button
              type="button"
              key={image.id}
              className={`queue-item ${selectedImageId === image.id ? "is-selected" : ""}`}
              onClick={() => void handleSelectImage(image.id)}
            >
              <img src={image.thumbnail_url ?? image.image_url} alt={image.file_name} />
              <div>
                <h3>{image.file_name}</h3>
                <p>拍摄高度 {image.capture_height_cm} cm</p>
                <span className={`status-pill status-${image.status}`}>{statusText(image.status)}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="annotate-main">
        {error ? <p className="status-message is-error">{error}</p> : null}
        {message ? <p className="status-message is-success">{message}</p> : null}

        <div className="annotate-main-content">
          {!imageDetail ? (
            <div className="empty-canvas">
              <h2>请选择一张图片开始标注</h2>
              <p>支持多框标注、拖拽调整、缩放和平移，每个框都可以填写对应的植株高度。</p>
            </div>
          ) : (
            <>
              <header className="annotate-toolbar">
                <div>
                  <h2>{imageDetail.file_name}</h2>
                  <p>
                    分辨率 {imageDetail.width} x {imageDetail.height}，拍摄高度 {imageDetail.capture_height_cm} cm
                  </p>
                </div>

                <div className="toolbar-actions">
                  <button type="button" onClick={() => void persistAnnotations(false)} disabled={saving}>
                    {saving ? "保存中..." : "保存草稿"}
                  </button>
                  <button
                    type="button"
                    className="strong-button"
                    onClick={() => void persistAnnotations(true)}
                    disabled={saving || !hasCompleteHeights(draftBoxes)}
                  >
                    标记完成
                  </button>
                  <button type="button" onClick={() => void handleExportProject()} disabled={exporting}>
                    {exporting ? "导出中..." : "导出项目"}
                  </button>
                </div>
              </header>

              <div className="annotate-workspace">
                <div className="canvas-panel">
                  <AnnotationCanvas
                    imageUrl={imageDetail.image_url}
                    imageWidth={imageDetail.width}
                    imageHeight={imageDetail.height}
                    boxes={draftBoxes}
                    selectedBoxId={selectedBoxId}
                    onChange={setDraftBoxes}
                    onSelect={setSelectedBoxId}
                  />
                </div>

                <aside className="annotation-inspector">
                  <div className="inspector-card">
                    <h3>标注框列表</h3>
                    <p>类别固定为 corn_plant。每个框都填写植株高度后才能完成。</p>
                  </div>

                  <div className="inspector-list">
                    {draftBoxes.length === 0 ? (
                      <div className="empty-card compact">
                        <h3>还没有框</h3>
                        <p>在图片上拖拽即可绘制新框。</p>
                      </div>
                    ) : null}

                    {draftBoxes.map((box, index) => (
                      <section
                        key={box.id}
                        className={`inspector-box ${box.id === selectedBoxId ? "is-selected" : ""}`}
                        style={{
                          "--box-color": getAnnotationColor(index).stroke,
                          "--box-soft": getAnnotationColor(index).accent,
                          "--box-shadow": getAnnotationColor(index).shadow,
                        } as CSSProperties}
                      >
                        <button
                          type="button"
                          className="inspector-select"
                          onClick={() => setSelectedBoxId(box.id ?? null)}
                        >
                          <span className="inspector-badge">{index + 1}</span>
                          <span>框 #{index + 1}</span>
                        </button>
                        <div className="inspector-meta">
                          <span>
                            {Math.round(box.x_px)}, {Math.round(box.y_px)}
                          </span>
                          <span>
                            {Math.round(box.w_px)} x {Math.round(box.h_px)}
                          </span>
                        </div>
                        <label className="field-group compact" htmlFor={`height-${box.id}`}>
                          <span>植株高度 (cm)</span>
                          <input
                            id={`height-${box.id}`}
                            type="number"
                            min="0"
                            step="0.1"
                            value={box.plant_height_cm ?? ""}
                            onChange={(event) => {
                              const rawValue = event.target.value;
                              setDraftBoxes((current) =>
                                current.map((item) => {
                                  if (item.id !== box.id) {
                                    return item;
                                  }
                                  return {
                                    ...item,
                                    plant_height_cm: rawValue === "" ? null : Number(rawValue),
                                  };
                                }),
                              );
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => {
                            setDraftBoxes((current) => current.filter((item) => item.id !== box.id));
                            if (selectedBox?.id === box.id) {
                              setSelectedBoxId(null);
                            }
                          }}
                        >
                          删除此框
                        </button>
                      </section>
                    ))}
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}


function statusText(status: ImageListItem["status"]) {
  switch (status) {
    case "completed":
      return "已完成";
    case "draft":
      return "草稿";
    default:
      return "未标注";
  }
}
