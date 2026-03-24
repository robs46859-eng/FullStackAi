import { ai } from "@workspace/integrations-gemini-ai";
import type { GatewayProvider, StreamResult, OnToken } from "./types";

export class GeminiProvider implements GatewayProvider {
  readonly name = "gemini";
  readonly model: string;
  readonly costPerKInputTokens: number;
  readonly costPerKOutputTokens: number;
  readonly weight: number;

  constructor(
    model = "gemini-2.5-pro",
    costPerKInput = 0.00125,
    costPerKOutput = 0.01,
    weight = 5,
  ) {
    this.model = model;
    this.costPerKInputTokens = costPerKInput;
    this.costPerKOutputTokens = costPerKOutput;
    this.weight = weight;
  }

  async streamCompletion(
    prompt: string,
    systemPrompt: string,
    onToken: OnToken,
  ): Promise<StreamResult> {
    let promptTokens = 0;
    let completionTokens = 0;
    let charsEmitted = 0;

    const stream = await ai.models.generateContentStream({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 8192,
      },
    });

    for await (const chunk of stream) {
      if (chunk.usageMetadata) {
        promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
        completionTokens =
          chunk.usageMetadata.candidatesTokenCount ?? completionTokens;
      }
      const text = chunk.text;
      if (text) {
        charsEmitted += text.length;
        onToken(text);
      }
    }

    if (promptTokens === 0) promptTokens = Math.ceil(prompt.length / 4);
    if (completionTokens === 0) completionTokens = Math.ceil(charsEmitted / 4);

    return { promptTokens, completionTokens, modelUsed: this.model };
  }
}
