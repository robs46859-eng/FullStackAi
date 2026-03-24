CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"filename" text NOT NULL,
	"token_count_prompt" integer,
	"token_count_completion" integer,
	"cost_usd" real,
	"ttft_ms" integer,
	"model_used" text,
	"cache_hit" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semantic_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_normalized" text NOT NULL,
	"filename" text NOT NULL,
	"cached_code_gz_path" text NOT NULL,
	"similarity_tokens" text NOT NULL,
	"prompt_tsv" "tsvector",
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "semantic_cache_prompt_tsv_gin_idx" ON "semantic_cache" USING gin ("prompt_tsv");