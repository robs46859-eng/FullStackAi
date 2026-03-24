import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { GatewayProvider, StreamResult, OnToken } from "./types";

export class AnthropicProvider implements GatewayProvider {
  readonly name = "anthropic";
  readonly model: string;
  readonly costPerKInputTokens: number;
  readonly costPerKOutputTokens: number;

  constructor(
    model = "claude-sonnet-4-5",
    costPerKInput = 0.003,
    costPerKOutput = 0.015,
  ) {
    this.model = model;
    this.costPerKInputTokens = costPerKInput;
    this.costPerKOutputTokens = costPerKOutput;
  }

  async streamCompletion(
    prompt: string,
    systemPrompt: string,
    onToken: OnToken,
  ): Promise<StreamResult> {
    let promptTokens = 0;
    let completionTokens = 0;

    const stream = anthropic.messages.stream({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (
        event.type === "message_start" &&
        event.message?.usage?.input_tokens
      ) {
        promptTokens = event.message.usage.input_tokens;
      }
      if (event.type === "message_delta" && event.usage?.output_tokens) {
        completionTokens = event.usage.output_tokens;
      }
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onToken(event.delta.text);
      }
    }

    if (promptTokens === 0) promptTokens = Math.ceil(prompt.length / 4);

    return { promptTokens, completionTokens, modelUsed: this.model };
  }
}
