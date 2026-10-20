import { getStore } from "@netlify/blobs";
import type { documents } from "../../db/schema.js";

export const pdfStore = () => getStore({ name: "pdfs", consistency: "strong" });

export const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

// Matches the "YYYY-MM-DD HH:MM" format the frontend already displays
export const formatTime = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export const errorResponse = (status: number, detail: string) => Response.json({ detail }, { status });

export const toDocumentInfo = (d: typeof documents.$inferSelect) => ({
  id: d.id,
  filename: d.filename,
  file_size: d.fileSize,
  page_count: d.pageCount,
  upload_time: formatTime(d.createdAt),
  status: d.status,
  chunk_count: d.chunkCount,
});

// ~120 words per chunk with ~20 words of overlap, mirroring the original Python chunker
const WORDS_PER_CHUNK = 120;
const OVERLAP_WORDS = 20;

export function chunkPages(pages: string[]) {
  const result: { pageNumber: number; chunkIndex: number; text: string }[] = [];
  let chunkIndex = 0;
  pages.forEach((pageText, i) => {
    const words = pageText.split(/\s+/).filter(Boolean);
    for (let start = 0; start < words.length; start += WORDS_PER_CHUNK - OVERLAP_WORDS) {
      const text = words.slice(start, start + WORDS_PER_CHUNK).join(" ");
      if (text.length > 20) result.push({ pageNumber: i + 1, chunkIndex: chunkIndex++, text });
      if (start + WORDS_PER_CHUNK >= words.length) break;
    }
  });
  return result;
}
