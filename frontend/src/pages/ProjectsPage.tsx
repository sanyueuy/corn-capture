import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { createProject, downloadProjectExport, fetchProjects } from "../api";
import type { ProjectSummary } from "../types";


function isLoopbackHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}


function getMobileCaptureUrl(project: ProjectSummary, currentOrigin: string) {
  const currentUrl = new URL(currentOrigin);
  const backendCaptureUrl = new URL(project.capture_url);

  if (isLoopbackHostname(currentUrl.hostname) && !isLoopbackHostname(backendCaptureUrl.hostname)) {
    const frontendPort = currentUrl.port ? `:${currentUrl.port}` : "";
    return `${currentUrl.protocol}//${backendCaptureUrl.hostname}${frontendPort}${backendCaptureUrl.pathname}`;
  }

  return `${currentOrigin}/capture/${project.id}`;
}


export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const currentOrigin = useMemo(() => window.location.origin, []);

  async function loadProjects() {
    try {
      setLoading(true);
      setError(null);
      const nextProjects = await fetchProjects();
      setProjects(nextProjects);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载项目失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectName.trim()) {
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const project = await createProject(projectName.trim());
      setProjects((current) => [project, ...current]);
      setProjectName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建项目失败。");
    } finally {
      setCreating(false);
    }
  }

  async function handleExport(projectId: string) {
    try {
      setExportingId(projectId);
      setError(null);
      await downloadProjectExport(projectId);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出数据集失败。");
    } finally {
      setExportingId(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Corn Capture Studio</p>
          <h1>玉米植株采集与 YOLO 数据集整理</h1>
          <p className="hero-copy">
            电脑端负责项目和标注，手机端负责拍照上传。每张照片记录拍摄高度，每个框记录植株高度，导出时自动整理成 Ultralytics
            YOLO 数据集。
          </p>
        </div>

        <form className="project-form" onSubmit={handleCreateProject}>
          <label htmlFor="projectName">新建采集项目</label>
          <div className="project-form-row">
            <input
              id="projectName"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="例如：2026-春季-地块A"
              maxLength={255}
            />
            <button type="submit" disabled={creating || !projectName.trim()}>
              {creating ? "创建中..." : "创建项目"}
            </button>
          </div>
        </form>

        {error ? <p className="status-message is-error">{error}</p> : null}
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>项目列表</h2>
          <button type="button" className="ghost-button" onClick={() => void loadProjects()}>
            刷新
          </button>
        </div>

        {loading ? <p className="status-message">正在加载项目...</p> : null}

        {!loading && projects.length === 0 ? (
          <div className="empty-card">
            <h3>还没有项目</h3>
            <p>先创建一个项目，系统会生成手机采集入口和电脑标注入口。</p>
          </div>
        ) : null}

        <div className="project-grid">
          {projects.map((project) => {
            const capturePath = `/capture/${project.id}`;
            const annotatePath = `/annotate/${project.id}`;
            const shareUrl = getMobileCaptureUrl(project, currentOrigin);

            return (
              <article className="project-card" key={project.id}>
                <div className="project-card-header">
                  <div>
                    <h3>{project.name}</h3>
                    <p>{new Date(project.created_at).toLocaleString("zh-CN")}</p>
                  </div>
                  <span className="pill">单类 corn_plant</span>
                </div>

                <div className="stats-grid">
                  <div>
                    <strong>{project.image_count}</strong>
                    <span>图片总数</span>
                  </div>
                  <div>
                    <strong>{project.pending_count}</strong>
                    <span>未标注</span>
                  </div>
                  <div>
                    <strong>{project.draft_count}</strong>
                    <span>草稿</span>
                  </div>
                  <div>
                    <strong>{project.completed_count}</strong>
                    <span>已完成</span>
                  </div>
                </div>

                <div className="project-links">
                  <Link className="primary-link" to={capturePath}>
                    手机采集页
                  </Link>
                  <Link className="secondary-link" to={annotatePath}>
                    电脑标注页
                  </Link>
                </div>

                <div className="qr-block">
                  <QRCodeSVG
                    value={shareUrl}
                    size={132}
                    bgColor="#FCF8EF"
                    fgColor="#263238"
                    level="M"
                    includeMargin
                  />
                  <div>
                    <p>手机扫码直接进入拍照页</p>
                    <code>{shareUrl}</code>
                  </div>
                </div>

                <div className="project-actions">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(shareUrl)}
                  >
                    复制采集链接
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport(project.id)}
                    disabled={exportingId === project.id}
                  >
                    {exportingId === project.id ? "导出中..." : "导出 YOLO ZIP"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
