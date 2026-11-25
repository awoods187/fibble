import { describe, expect, it } from 'vitest';
import { EXAMPLE_PROMPTS_DIR, loadPrompt, parsePrompt, render } from './prompts';
import { CATEGORY_LIST } from './reword/run';

describe('parsePrompt', () => {
  it('splits frontmatter, system and user sections', () => {
    const p = parsePrompt(
      'x',
      'v1',
      '---\nstage: x\n---\n\n# System\n\nBe brief.\n\n# User\n\nHi {{name}}\n',
    );
    expect(p).toEqual({ name: 'x', version: 'v1', system: 'Be brief.', user: 'Hi {{name}}' });
  });

  it('rejects a prompt without both sections', () => {
    expect(() => parsePrompt('x', 'v1', '# System\nonly')).toThrow(/# User/);
  });
});

describe('render', () => {
  it('fills placeholders, with or without inner spaces', () => {
    expect(render('{{a}} and {{ b }}', { a: '1', b: '2' })).toBe('1 and 2');
  });

  it('throws on a missing variable instead of leaving a blank', () => {
    expect(() => render('{{a}} {{b}}', { a: '1' })).toThrow(/"b"/);
  });

  it('does not re-expand placeholders inside values', () => {
    expect(render('{{a}}', { a: '{{b}}' })).toBe('{{b}}');
  });
});

describe('example-v1 prompts', () => {
  it('reword renders with every variable it uses', async () => {
    const p = await loadPrompt(EXAMPLE_PROMPTS_DIR, 'reword');
    expect(p.version).toBe('example-v1');
    const system = render(p.system, { categories: CATEGORY_LIST });
    const user = render(p.user, { hook: 'h', article_title: 't', evidence: 'e' });
    expect(`${system}${user}`).not.toMatch(/\{\{/);
    expect(system).toContain('"Science & Nature"');
  });

  it('entailment renders with every variable it uses', async () => {
    const p = await loadPrompt(EXAMPLE_PROMPTS_DIR, 'entailment');
    const user = render(p.user, {
      article_title: 't',
      evidence: 'e',
      statement: 's',
      expansion: 'x',
    });
    expect(`${p.system}${user}`).not.toMatch(/\{\{/);
  });

  it.each(['verify-queries', 'verify-judge', 'plausibility'])(
    '%s renders with every variable it uses',
    async (name) => {
      const p = await loadPrompt(EXAMPLE_PROMPTS_DIR, name);
      const user = render(p.user, { statement: 's', evidence: 'e' });
      expect(`${p.system}${user}`).not.toMatch(/\{\{/);
    },
  );
});
