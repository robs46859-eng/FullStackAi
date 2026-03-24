import { openai } from "@workspace/integrations-openai-ai-server";
import type { GatewayProvider, StreamResult, OnToken } from "./types";

export class OpenAIProvider implements GatewayProvider {
  readonly name = "openai";
  readonly model: string;
  readonly fallbackModel: string;
  readonly costPerKInputTokens: number;
  readonly costPerKOutputTokens: number;

  constructor(
    model: string,
    fallbackModel: string,
    costPerKInput = 0.002,
    costPerKOutput = 0.008,
  ) {
    this.model = model;
    this.fallbackModel = fallbackModel;
    this.costPerKInputTokens = costPerKInput;
    this.costPerKOutputTokens = costPerKOutput;
  }

  private async streamModel(
    model: string,
    prompt: string,
    systemPrompt: string,
    onToken: OnToken,
  ): Promise<StreamResult> {
    const stream = await openai.chat.completions.create({
      model,
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: true,
      stream_options: { include_usage: true },
    });

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
      }
      const content = chunk.choices[0]?.delta?.content;
      if (content) onToken(content);
    }

    if (promptTokens === 0 && completionTokens === 0) {
      promptTokens = Math.ceil(prompt.length / 4);
    }

    return { promptTokens, completionTokens, modelUsed: model };
  }

  async streamCompletion(
    prompt: string,
    systemPrompt: string,
    onToken: OnToken,
  ): Promise<StreamResult> {
    try {
      return await this.streamModel(this.model, prompt, systemPrompt, onToken);
    } catch (_primaryErr) {
      if (this.fallbackModel === this.model) throw _primaryErr;
      return await this.streamModel(
        this.fallbackModel,
        prompt,
        systemPrompt,
        onToken,
      );
    }
  }
}
