import { SCHEDULE_IMAGE_DETAIL_REGIONS, SCHEDULE_IMAGE_LIMITS } from "@contracts/schedule-image-import";

export type ScheduleImageFocus = "all" | "left" | "right" | "top" | "bottom";
export function getScheduleImageDetailRegions(width: number, height: number, focus: ScheduleImageFocus = "all") {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error("이미지 크기를 확인해주세요.");
  const fw = focus === "left" || focus === "right" ? Math.ceil(width * 0.6) : width;
  const fh = focus === "top" || focus === "bottom" ? Math.ceil(height * 0.6) : height;
  const x = focus === "right" ? width - fw : 0, y = focus === "bottom" ? height - fh : 0;
  const w = Math.ceil(fw * 0.6), h = Math.ceil(fh * 0.6);
  return SCHEDULE_IMAGE_DETAIL_REGIONS.map(region => ({ region, x: x + (region.endsWith("right") ? fw - w : 0),
    y: y + (region.startsWith("bottom") ? fh - h : 0), width: w, height: h }));
}

export async function createScheduleImageDetails(file: File, signal?: AbortSignal, focus: ScheduleImageFocus = "all"): Promise<File[]> {
  signal?.throwIfAborted();
  if (file.size === 0 || file.size > SCHEDULE_IMAGE_LIMITS.bytes || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("PNG·JPG·WEBP 이미지 1장, 10MB 이하를 선택해주세요.");
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url; await image.decode(); signal?.throwIfAborted();
    const details: File[] = [];
    for (const region of getScheduleImageDetailRegions(image.naturalWidth, image.naturalHeight, focus)) {
      let scale = Math.min(2, 2048 / Math.max(region.width, region.height));
      const canvas = document.createElement("canvas");
      try {
        while (true) {
          signal?.throwIfAborted();
          canvas.width = Math.max(1, Math.round(region.width * scale)); canvas.height = Math.max(1, Math.round(region.height * scale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("확대 영역을 준비하지 못했습니다.");
          context.imageSmoothingEnabled = scale < 1;
          context.imageSmoothingQuality = "high";
          context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("확대 영역을 준비하지 못했습니다.")), "image/png"));
          signal?.throwIfAborted();
          if (blob.size <= SCHEDULE_IMAGE_LIMITS.detailBytes) { details.push(new File([blob], `${region.region}.png`, { type: "image/png" })); break; }
          if (canvas.width === 1 && canvas.height === 1) throw new Error("확대 영역의 크기 제한을 확인해주세요.");
          scale *= 0.75;
        }
      } finally { canvas.width = 0; canvas.height = 0; }
    }
    return details;
  } finally { image.src = ""; URL.revokeObjectURL(url); }
}
