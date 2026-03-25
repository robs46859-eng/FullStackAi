declare global {
  namespace Express {
    interface Request {
      sanitizedPrompt?: string;
      piiFlags?: { redacted: boolean; count: number };
      apiKey?: import("@workspace/db").ApiKey;
      apiKeyUser?: import("@workspace/db").User;
    }
  }
}

export {};
