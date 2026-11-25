/**
 * Crawlers that collect training data for AI models. Fibble blocks them all
 * (Andy's decision, 2026-11-25): the puzzles are the product, and a scraped
 * archive makes the game easier to cheat. Search engines are unaffected.
 * robots.txt is voluntary; rate limiting at the edge backs it up once deployed.
 */
export const AI_TRAINING_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'meta-externalagent',
  'Amazonbot',
  'cohere-training-data-crawler',
  'Diffbot',
] as const;
