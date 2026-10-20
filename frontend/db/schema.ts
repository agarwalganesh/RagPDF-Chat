import { sql } from "drizzle-orm";
import { customType, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const documents = pgTable("documents", {
  id: text().primaryKey(),
  filename: text().notNull(),
  fileSize: integer("file_size").notNull(),
  pageCount: integer("page_count").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  status: text().notNull().default("ready"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: serial().primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    text: text().notNull(),
    search: tsvector("search").generatedAlwaysAs(sql`to_tsvector('english', "text")`),
  },
  (t) => [
    index("chunks_search_idx").using("gin", t.search),
    index("chunks_document_idx").on(t.documentId, t.chunkIndex),
  ],
);

export const conversations = pgTable("conversations", {
  id: text().primaryKey(),
  title: text().notNull(),
  documentId: text("document_id").notNull().default("all"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: serial().primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text().notNull(),
    content: text().notNull(),
    sources: jsonb(),
    retrievedChunks: jsonb("retrieved_chunks"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.id)],
);
