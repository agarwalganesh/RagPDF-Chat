CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY,
	"document_id" text NOT NULL,
	"page_number" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"search" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"document_id" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY,
	"filename" text NOT NULL,
	"file_size" integer NOT NULL,
	"page_count" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"retrieved_chunks" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chunks_search_idx" ON "chunks" USING gin ("search");--> statement-breakpoint
CREATE INDEX "chunks_document_idx" ON "chunks" ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" ("conversation_id","id");--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;