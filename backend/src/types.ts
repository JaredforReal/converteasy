export type Category = "document" | "audio";

export type TaskState = "queued" | "processing" | "finished" | "error";

export interface ConvertTask {
  id: string;
  state: TaskState;
  createdAt: number;
  updatedAt: number;
  category: Category;
  target: string;
  source?: string;
  inputPath: string;
  outputPath?: string;
  url?: string;
  downloadUrl?: string;
  previewUrl?: string;
  error?: string;
  originalFileName?: string;
}