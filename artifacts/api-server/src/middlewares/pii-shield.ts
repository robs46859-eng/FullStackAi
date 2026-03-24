import type { Request, Response, NextFunction } from "express";

const PII_PATTERNS: Array<{ pattern: RegExp; placeholder: string }> = [
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    placeholder: "[EMAIL]",
  },
  {
    pattern: /\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    placeholder: "[PHONE]",
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    placeholder: "[SSN]",
  },
  {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    placeholder: "[CC_NUM]",
  },
];

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions/i,
    label: "instruction override",
  },
  {
    pattern: /disregard\s+(your\s+)?(training|instructions|guidelines|rules)/i,
    label: "instruction override",
  },
  {
    pattern: /forget\s+everything\s+(i\s+told\s+you|above|before)/i,
    label: "instruction override",
  },
  {
    pattern: /you\s+are\s+now\s+(?:a\s+)?(?:dan|jailbreak|evil|unrestricted|uncensored)/i,
    label: "persona override",
  },
  { pattern: /\bdan\s+mode\b/i, label: "jailbreak pattern" },
  { pattern: /\bjailbreak\b/i, label: "jailbreak pattern" },
  {
    pattern: /act\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:a\s+)?(?:different|unrestricted|evil|malicious)\s+(?:ai|model|system|assistant)/i,
    label: "persona override",
  },
  {
    pattern: /bypass\s+(?:your\s+)?(?:safety|filter|restriction|guardrail)/i,
    label: "safety bypass",
  },
  {
    pattern: /\bpretend\s+(?:you\s+have\s+no\s+|there\s+are\s+no\s+)(?:rules|limits|restrictions)/i,
    label: "restriction bypass",
  },
];

export function piiShield(req: Request, res: Response, next: NextFunction): void {
  const rawPrompt: string = req.body?.prompt ?? "";

  if (!rawPrompt) {
    next();
    return;
  }

  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(rawPrompt)) {
      res.status(400).json({
        error: `Prompt rejected: ${label} detected.`,
        code: "INJECTION_DETECTED",
      });
      return;
    }
  }

  let sanitized = rawPrompt;
  let redactionCount = 0;

  for (const { pattern, placeholder } of PII_PATTERNS) {
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    const replaced = sanitized.replace(patternCopy, placeholder);
    if (replaced !== sanitized) {
      redactionCount++;
      sanitized = replaced;
    }
  }

  req.sanitizedPrompt = sanitized;
  req.piiFlags = { redacted: redactionCount > 0, count: redactionCount };

  next();
}
