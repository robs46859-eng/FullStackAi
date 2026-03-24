import { openai } from "@workspace/integrations-openai-ai-server";
import type { GatewayProvider, StreamResult, OnToken } from "./types";

export class OpenAIProvider implements GatewayProvider {
  readonly name: string;
  readonly model: string;
  readonly costPerKInputTokens: number;
  readonly costPerKOutputTokens: number;
  readonly weight: number;

  constructor(
    name: string,
    model: string,
    costPerKInput = 0.002,
    costPerKOutput = 0.008,
    weight = 3,
  ) {
    this.name = name;
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
    const stream = await openai.chat.completions.create({
      model: this.model,
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
    let charsEmitted = 0;

    for await (const chunk of stream) {
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
      }
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        charsEmitted += content.length;
        onToken(content);
      }
    }

    if (promptTokens === 0) promptTokens = Math.ceil(prompt.length / 4);
    if (completionTokens === 0) completionTokens = Math.ceil(charsEmitted / 4);

    return { promptTokens, completionTokens, modelUsed: this.model };
  }
}
