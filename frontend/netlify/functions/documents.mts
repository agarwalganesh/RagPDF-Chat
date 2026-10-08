import type { Config, Context } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { db } from "../../db/index.js";
import { chunks, documents } from "../../db/schema.js";
import { chunkPages, errorResponse, pdfStore, shortId, toDocumentInfo } from "../lib/shared.js";

async function upload(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, "Invalid upload. Please send PDF files as multipart form data.");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return errorResponse(400, "No files were uploaded.");

  const processed = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return errorResponse(400, `File '${file.name}' is not a PDF.`);
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (buffer.length === 0) return errorResponse(400, `File '${file.name}' is empty.`);

    let pages: string[];
    try {
      const pdf = await getDocumentProxy(buffer.slice());
      pages = (await extractText(pdf, { mergePages: false })).text.map((t) =>
        t.replace(/[ \t]+/g, " ").trim(),
      );
    } catch (e) {
      return errorResponse(400, `Failed to parse PDF '${file.name}': ${(e as Error).message}`);
    }
    if (pages.length === 0) return errorResponse(400, `PDF '${file.name}' contains no readable pages.`);

    const docChunks = chunkPages(pages);
    if (docChunks.length === 0) {
      return errorResponse(
        400,
        `No text could be extracted from '${file.name}'. Scanned/image-only PDFs are not supported.`,
      );
    }

    const id = shortId();
    await pdfStore().set(id, buffer, { metadata: { filename: file.name } });

    const [doc] = await db
      .insert(documents)
      .values({ id, filename: file.name, fileSize: buffer.length, pageCount: pages.length, chunkCount: docChunks.length })
      .returning();
    for (let i = 0; i < docChunks.length; i += 500) {
      await db.insert(chunks).values(docChunks.slice(i, i + 500).map((c) => ({ ...c, documentId: id })));
    }
    processed.push(toDocumentInfo(doc));
  }
  return Response.json(processed);
}

async function serveFile(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return errorResponse(404, "Document not found");
  const file = await pdfStore().get(id, { type: "arrayBuffer" });
  if (!file) return errorResponse(404, "PDF file missing on server");
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    },
  });
}

async function remove(id: string) {
  const deleted = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  if (deleted.length === 0) return errorResponse(404, "Document not found");
  await pdfStore().delete(id);
  return Response.json({ message: "Document deleted successfully", document_id: id });
}

export default async (req: Request, context: Context) => {
  const { id, action } = context.params;
  try {
    if (!id && req.method === "GET") {
      const docs = await db.select().from(documents).orderBy(desc(documents.createdAt));
      return Response.json(docs.map(toDocumentInfo));
    }
    if (id === "upload" && !action && req.method === "POST") return await upload(req);
    if (id && action === "file" && req.method === "GET") return await serveFile(id);
    if (id && !action && req.method === "DELETE") return await remove(id);
    return errorResponse(405, "Method not allowed");
  } catch (e) {
    console.error("documents API error", e);
    return errorResponse(500, "Something went wrong while handling the document request.");
  }
};

export const config: Config = {
  path: ["/api/documents", "/api/documents/:id", "/api/documents/:id/:action"],
};
