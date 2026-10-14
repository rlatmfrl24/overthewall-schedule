export type DDayType = "debut" | "birthday" | "event" | string;

export interface DDayDto {
  content_access?: "normal" | "admin_archive";
  id: number;
  title: string;
  date: string;
  description: string | null;
  color: string | null;
  type: DDayType;
  created_at: string | number | null;
}

export interface DDayPayload {
  id?: number;
  title: string;
  date: string;
  description?: string | null;
  color?: string | null;
  type: DDayType;
}
