import type { AnnotationBox, ImageDetail, ImageListItem, ProjectSummary } from "./types";


const API_BASE = import.meta.env.VITE_API_BASE ?? "";


async function handleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        message = payload.detail;
      }
    } catch {
      // Ignore JSON parse errors and use the default message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}


export async function fetchProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_BASE}/api/projects`);
  return handleJson<ProjectSummary[]>(response);
}


export async function createProject(name: string): Promise<ProjectSummary> {
  const response = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  return handleJson<ProjectSummary>(response);
}


export async function fetchProject(projectId: string): Promise<ProjectSummary> {
  const response = await fetch(`${API_BASE}/api/projects/${projectId}`);
  return handleJson<ProjectSummary>(response);
}


export async function fetchProjectImages(projectId: string): Promise<ImageListItem[]> {
  const response = await fetch(`${API_BASE}/api/projects/${projectId}/images`);
  return handleJson<ImageListItem[]>(response);
}


export async function uploadCapture(params: {
  projectId: string;
  captureHeightCm: number;
  file: File;
}): Promise<ImageDetail> {
  const formData = new FormData();
  formData.append("project_id", params.projectId);
  formData.append("capture_height_cm", String(params.captureHeightCm));
  formData.append("file", params.file);

  const response = await fetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    body: formData,
  });
  return handleJson<ImageDetail>(response);
}


export async function fetchImage(imageId: string): Promise<ImageDetail> {
  const response = await fetch(`${API_BASE}/api/images/${imageId}`);
  return handleJson<ImageDetail>(response);
}


export async function saveImageAnnotations(
  imageId: string,
  annotations: AnnotationBox[],
  markCompleted: boolean,
): Promise<ImageDetail> {
  const response = await fetch(`${API_BASE}/api/images/${imageId}/annotations`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      annotations,
      mark_completed: markCompleted,
    }),
  });
  return handleJson<ImageDetail>(response);
}


export async function downloadProjectExport(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/projects/${projectId}/export`, {
    method: "POST",
  });
  if (!response.ok) {
    let message = `Export failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        message = payload.detail;
      }
    } catch {
      // Ignore JSON parse errors and keep the default message.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const contentDisposition = response.headers.get("Content-Disposition");
  const fallbackName = `corn-dataset-${projectId}.zip`;
  const fileNameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
  const fileName = fileNameMatch?.[1] ?? fallbackName;

  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}
