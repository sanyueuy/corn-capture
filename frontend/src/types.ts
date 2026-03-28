export type ProjectSummary = {
  id: string;
  name: string;
  created_at: string;
  class_names: string[];
  image_count: number;
  pending_count: number;
  draft_count: number;
  completed_count: number;
  capture_url: string;
  annotate_url: string;
  capture_qr_url: string;
};

export type AnnotationBox = {
  id?: string;
  class_id: number;
  x_px: number;
  y_px: number;
  w_px: number;
  h_px: number;
  plant_height_cm: number | null;
};

export type ImageListItem = {
  id: string;
  file_name: string;
  width: number;
  height: number;
  capture_height_cm: number;
  status: "pending" | "draft" | "completed";
  captured_at: string;
  image_url: string;
  thumbnail_url?: string | null;
  annotation_count: number;
};

export type ImageDetail = ImageListItem & {
  annotations: AnnotationBox[];
};
