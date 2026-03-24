declare global {
  namespace Express {
    interface Request {
      sanitizedPrompt?: string;
      piiFlags?: { redacted: boolean; count: number };
    }
  }
}

export {};
