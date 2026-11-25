import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Prompt files: optional YAML-ish frontmatter, then a `# System` section and a
 * `# User` section. Template variables are `{{name}}`. Example prompts live in
 * prompts/example-v1/; the private repo passes its own folder for production.
 */

export interface Prompt {
  name: string;
  /** The folder's name, recorded in each record's trace (e.g. "example-v1"). */
  version: string;
  system: string;
  user: string;
}

export const EXAMPLE_PROMPTS_DIR = resolve(import.meta.dirname, '../prompts/example-v1');

export function parsePrompt(name: string, version: string, text: string): Prompt {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const system = /^# System\s*$([\s\S]*?)^# User\s*$/m.exec(body)?.[1];
  const user = /^# User\s*$([\s\S]*)$/m.exec(body)?.[1];
  if (system === undefined || user === undefined) {
    throw new Error(`Prompt "${name}" needs a "# System" section followed by a "# User" section`);
  }
  return { name, version, system: system.trim(), user: user.trim() };
}

export async function loadPrompt(dir: string, name: string): Promise<Prompt> {
  const version = resolve(dir).split(/[\\/]/).pop() ?? 'unknown';
  return parsePrompt(name, version, await readFile(join(dir, `${name}.md`), 'utf8'));
}

/** Fill `{{name}}` placeholders; a placeholder with no value is an error, not a blank. */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`Missing prompt variable "${key}"`);
    return value;
  });
}
