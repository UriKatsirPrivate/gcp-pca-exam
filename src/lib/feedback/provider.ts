import "server-only";

// Provider-agnostic LLM interface. Default impl is Claude on Vertex AI (GCP ADC,
// no API key). Falls back to direct Anthropic API, or null (rule-based only).

export interface LLMCompleteOptions {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export interface LLMProvider {
  name: string;
  complete(opts: LLMCompleteOptions): Promise<string>;
}

const HEAVY = process.env.LLM_MODEL_HEAVY ?? "claude-opus-4-8";

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

class VertexProvider implements LLMProvider {
  name = "vertex";
  // Lazily constructed so the SDK only loads when used.
  private clientPromise?: Promise<{
    messages: {
      create(args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
    };
  }>;

  private getClient() {
    if (!this.clientPromise) {
      this.clientPromise = import("@anthropic-ai/vertex-sdk").then(
        ({ AnthropicVertex }) =>
          new AnthropicVertex({
            projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
            region: process.env.CLOUD_ML_REGION ?? "global",
          }) as unknown as {
            messages: {
              create(args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
            };
          },
      );
    }
    return this.clientPromise;
  }

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const client = await this.getClient();
    const msg = await client.messages.create({
      model: opts.model ?? HEAVY,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });
    return extractText(msg.content);
  }
}

class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private clientPromise?: Promise<{
    messages: {
      create(args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
    };
  }>;

  private getClient() {
    if (!this.clientPromise) {
      this.clientPromise = import("@anthropic-ai/sdk").then(
        ({ default: Anthropic }) =>
          new Anthropic() as unknown as {
            messages: {
              create(args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
            };
          },
      );
    }
    return this.clientPromise;
  }

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const client = await this.getClient();
    const msg = await client.messages.create({
      model: opts.model ?? HEAVY,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });
    return extractText(msg.content);
  }
}

let cached: LLMProvider | null | undefined;

export function getLLMProvider(): LLMProvider | null {
  if (cached !== undefined) return cached;
  const provider = (process.env.LLM_PROVIDER ?? "vertex").toLowerCase();
  if (provider === "none") cached = null;
  else if (provider === "anthropic") cached = new AnthropicProvider();
  else cached = new VertexProvider();
  return cached;
}
