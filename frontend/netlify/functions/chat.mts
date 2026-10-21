import type { Config, Context } from "@netlify/functions";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { chunks, conversations, documents, messages } from "../../db/schema.js";
import { errorResponse, formatTime, shortId } from "../lib/shared.js";

const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
const TOP_K = 5;
const NOT_FOUND = "I could not find this information in the uploaded document.";

const SYSTEM_PROMPT = `You are DocuRAG — an enterprise-grade AI Document Intelligence Assistant.

CRITICAL INSTRUCTIONS:
1. Answer the user's question STRICTLY and ONLY using the provided document context below.
2. Do NOT use outside or general world knowledge. Do NOT invent facts or hallucinate.
3. If the answer cannot be found in the provided document context, you MUST clearly and explicitly say:
   "${NOT_FOUND}"
4. Do not speculate, extrapolate, or assume facts not explicitly written in the text.
5. Format your answers clearly using clean Markdown (bullet points, bold highlights, concise paragraphs).
6. When referencing specific facts from the text, state the facts accurately without altering numerical data or dates.`;

type Row = { id: number; documentId: string; documentName: string; pageNumber: number; text: string; score: number };

// Full-text search (OR over query terms), falling back to the opening chunks for broad questions
// like "what is this document about?" that share no keywords with the text.
async function retrieve(query: string, documentId: string): Promise<Row[]> {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const docFilter = documentId !== "all" ? eq(chunks.documentId, documentId) : undefined;
  const select = {
    id: chunks.id,
    documentId: chunks.documentId,
    documentName: documents.filename,
    pageNumber: chunks.pageNumber,
    text: chunks.text,
  };

  if (terms.length > 0) {
    const tsq = sql`to_tsquery('english', ${terms.join(" | ")})`;
    const rank = sql<number>`ts_rank(${chunks.search}, ${tsq})`;
    const rows = await db
      .select({ ...select, score: rank })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .where(and(sql`${chunks.search} @@ ${tsq}`, docFilter))
      .orderBy(desc(rank))
      .limit(TOP_K);
    if (rows.length > 0) return rows.map((r) => ({ ...r, score: Number(r.score) }));
  }

  const rows = await db
    .select(select)
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(docFilter)
    .orderBy(asc(chunks.chunkIndex))
    .limit(TOP_K);
  return rows.map((r) => ({ ...r, score: 0 }));
}

async function callGroq(msgs: { role: string; content: string }[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set in Netlify environment variables.");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: msgs, temperature: 0 }),
  });
  if (!res.ok) throw new Error(`Groq API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim() as string;
}

async function chat(req: Request) {
  let body: { message?: string; conversation_id?: string | null; document_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }
  const message = (body.message ?? "").trim();
  if (!message) return errorResponse(400, "Message is required.");
  const documentId = body.document_id || "all";
  const convId = body.conversation_id || shortId();

  const [existing] = await db.select().from(conversations).where(eq(conversations.id, convId));
  if (!existing) {
    const title = message.slice(0, 40) + (message.length > 40 ? "..." : "");
    await db.insert(conversations).values({ id: convId, title, documentId });
  }
  const history = existing
    ? await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(desc(messages.id))
        .limit(4)
    : [];
  history.reverse();

  const rows = await retrieve(message, documentId);
  const retrieved_chunks = rows.map((r) => ({
    chunk_id: `chk_${r.id}`,
    document_id: r.documentId,
    document_name: r.documentName,
    page_number: r.pageNumber,
    text: r.text,
    score: Math.round(r.score * 10000) / 10000,
  }));

  let answer = NOT_FOUND;
  let sources: { document_id: string; document_name: string; page_number: number; snippet: string }[] = [];

  if (rows.length > 0) {
    const context = rows
      .map((r) => `[Document: ${r.documentName} | Page: ${r.pageNumber}]\n${r.text}\n`)
      .join("\n---\n");
    answer = await callGroq([
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      {
        role: "user",
        content: `DOCUMENT CONTEXT:\n---\n${context}\n---\n\nUSER QUESTION:\n${message}\n\nRemember: Answer STRICTLY from the DOCUMENT CONTEXT above. If the information is not present, reply that it was not found in the document.`,
      },
    ]);

    if (!/could not find this information|not found in the provided/i.test(answer)) {
      const seen = new Set<string>();
      for (const r of rows) {
        const key = `${r.documentId}:${r.pageNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push({
          document_id: r.documentId,
          document_name: r.documentName,
          page_number: r.pageNumber,
          snippet: r.text.slice(0, 140) + (r.text.length > 140 ? "..." : ""),
        });
      }
    }
  }

  await db.insert(messages).values([
    { conversationId: convId, role: "user", content: message },
    { conversationId: convId, role: "assistant", content: answer, sources, retrievedChunks: retrieved_chunks },
  ]);
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));

  return Response.json({ conversation_id: convId, answer, sources, retrieved_chunks });
}

async function listConversations() {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      documentId: conversations.documentId,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      messageCount: count(messages.id),
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .groupBy(conversations.id)
    .orderBy(desc(conversations.updatedAt));
  return Response.json(
    rows.map((c) => ({
      id: c.id,
      title: c.title,
      created_at: formatTime(c.createdAt),
      updated_at: formatTime(c.updatedAt),
      document_id: c.documentId,
      message_count: Number(c.messageCount),
    })),
  );
}

async function getConversation(id: string) {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) return errorResponse(404, "Conversation not found");
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.id));
  return Response.json({
    id: conv.id,
    title: conv.title,
    created_at: formatTime(conv.createdAt),
    updated_at: formatTime(conv.updatedAt),
    document_id: conv.documentId,
    messages: msgs.map((m) => ({
      role: m.role,
      content: m.content,
      sources: m.sources ?? null,
      retrieved_chunks: m.retrievedChunks ?? null,
      timestamp: formatTime(m.createdAt),
    })),
  });
}

async function deleteConversation(id: string) {
  await db.delete(conversations).where(eq(conversations.id, id));
  return Response.json({ message: "Conversation deleted successfully", id });
}

export default async (req: Request, context: Context) => {
  const { id } = context.params;
  const isConversations = new URL(req.url).pathname.startsWith("/api/chat/conversations");
  try {
    if (!isConversations && req.method === "POST") return await chat(req);
    if (isConversations && !id && req.method === "GET") return await listConversations();
    if (isConversations && id && req.method === "GET") return await getConversation(id);
    if (isConversations && id && req.method === "DELETE") return await deleteConversation(id);
    return errorResponse(405, "Method not allowed");
  } catch (e) {
    console.error("chat API error", e);
    return errorResponse(500, `Chat failed: ${(e as Error).message}`);
  }
};

export const config: Config = {
  path: ["/api/chat", "/api/chat/conversations", "/api/chat/conversations/:id"],
};
