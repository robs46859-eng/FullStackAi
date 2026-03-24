import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIMS = 768;
export const COSINE_THRESHOLD = 0.15;

export async function embed(text: string): Promise<number[] | null> {
  if (!text || text.trim().length === 0) return null;
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text.slice(0, 2048),
    });
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMS) {
      logger.warn({ model: EMBEDDING_MODEL, got: values?.length }, "Unexpected embedding dimensions");
      return null;
    }
    return values;
  } catch (err) {
    logger.warn({ err }, "Embedding generation failed — falling back to Jaccard");
    return null;
  }
}

export function vectorToSql(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
