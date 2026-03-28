import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProject, fetchProjectImages, uploadCapture } from "../api";
import type { ImageListItem, ProjectSummary } from "../types";


export function CapturePage() {
  const { projectId = "" } = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [captureHeightCm, setCaptureHeightCm] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      setLoading(true);
      setError(null);
      const [projectResponse, imagesResponse] = await Promise.all([
        fetchProject(projectId),
        fetchProjectImages(projectId),
      ]);
      setProject(projectResponse);
      setImages(imagesResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载采集页面失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) {
      void loadPage();
    }
  }, [projectId]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    const heightValue = Number(captureHeightCm);
    if (!Number.isFinite(heightValue) || heightValue <= 0) {
      setError("拍摄高度必须大于 0 cm。");
      event.target.value = "";
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setMessage(null);
      const uploaded = await uploadCapture({
        projectId,
        captureHeightCm: heightValue,
        file: selectedFile,
      });
      setImages((current) => [uploaded, ...current]);
      setMessage(`已上传 ${uploaded.file_name}，可继续拍摄下一张。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传图片失败。");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <main className="page-shell page-capture">
      <section className="page-topbar">
        <div>
          <p className="eyebrow">Mobile Capture</p>
          <h1>{project?.name ?? "玉米植株采集"}</h1>
        </div>
        <Link className="ghost-button as-link" to="/projects">
          返回项目页
        </Link>
      </section>

      {loading ? <p className="status-message">正在加载采集信息...</p> : null}
      {error ? <p className="status-message is-error">{error}</p> : null}
      {message ? <p className="status-message is-success">{message}</p> : null}

      {!loading && project ? (
        <>
          <section className="capture-card">
            <div className="capture-stats">
              <div>
                <strong>{images.length}</strong>
                <span>当前项目照片</span>
              </div>
              <div>
                <strong>{project.completed_count}</strong>
                <span>已完成标注</span>
              </div>
              <div>
                <strong>{project.draft_count + project.pending_count}</strong>
                <span>待处理图片</span>
              </div>
            </div>

            <label className="field-group" htmlFor="captureHeightCm">
              <span>本张拍摄高度 (cm)</span>
              <input
                id="captureHeightCm"
                inputMode="decimal"
                type="number"
                min="0"
                step="0.1"
                value={captureHeightCm}
                onChange={(event) => setCaptureHeightCm(event.target.value)}
                placeholder="例如 160"
              />
            </label>

            <button
              type="button"
              className="camera-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "上传中..." : "打开手机相机拍照"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
            />

            <p className="helper-text">
              每拍一张都先填写拍摄高度，然后点击按钮调用手机浏览器相机。上传成功后页面会保留在这里，方便连续采集。
            </p>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>最近上传</h2>
              <button type="button" className="ghost-button" onClick={() => void loadPage()}>
                刷新列表
              </button>
            </div>

            <div className="recent-grid">
              {images.slice(0, 8).map((image) => (
                <article className="recent-card" key={image.id}>
                  <img src={image.thumbnail_url ?? image.image_url} alt={image.file_name} />
                  <div>
                    <h3>{image.file_name}</h3>
                    <p>拍摄高度 {image.capture_height_cm} cm</p>
                    <p>状态：{statusText(image.status)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
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
