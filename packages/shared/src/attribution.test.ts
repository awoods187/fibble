import { describe, expect, it } from 'vitest';
import { articleHistoryUrl, revisionUrl } from './attribution';

const source = {
  title: "Ada Lovelace's notes & more",
  url: 'https://en.wikipedia.org/wiki/Ada',
  revisionId: 123,
};

describe('attribution links', () => {
  it('links to the article history and the pinned revision, escaping the title', () => {
    expect(articleHistoryUrl(source)).toBe(
      "https://en.wikipedia.org/w/index.php?title=Ada_Lovelace's_notes_%26_more&action=history",
    );
    expect(revisionUrl(source)).toBe(
      "https://en.wikipedia.org/w/index.php?title=Ada_Lovelace's_notes_%26_more&oldid=123",
    );
  });

  it("stays on the article's own Wikipedia host", () => {
    expect(articleHistoryUrl({ ...source, url: 'https://fr.wikipedia.org/wiki/X' })).toMatch(
      /^https:\/\/fr\.wikipedia\.org\//,
    );
  });
});
