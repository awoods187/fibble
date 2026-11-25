import { describe, expect, it } from 'vitest';
import { dykArchiveTitle, normalizeTitle, parseDykArchive, wikitextToPlain } from './dyk-parse';

// Made-up hooks in the real archive format. No real Wikipedia content.
const ARCHIVE = `<noinclude>{{pp-semi-indef}}</noinclude>
{{DYK archive header}}
==Did you know...==
<!-- editor note -->
===31 May 2024===
*'''''00:00, 31 May 2024 (UTC)'''''
{{main page image/DYK|image=Example.jpg|caption=An example}}
* ... that '''[[Glass Lighthouse of Vell]]''' ''(pictured)'' was lit by candles until 1931?
* ... that the poet [[Ada Quill]] wrote "[[Ten Spoons|a book about spoons]]" before '''''[[Spoon Monthly]]'''''{{-?}}
* ... that '''[[Brindle Fox (racehorse)|Brindle Fox]]''' won&nbsp;three races at [[Ascot Racecourse#History|Ascot]]?
* ... that this [[File:Map.png|thumb|map]]hook has no bold subject[[Category:Things]] and mentions [[Ali: The Musical]]?
* ... that '''[[Glass Lighthouse of Vell]]''' ''(pictured)'' was lit by candles until 1931?
* Not a hook line
`;

describe('dykArchiveTitle', () => {
  it('maps YYYY-MM to the archive page title', () => {
    expect(dykArchiveTitle('2024-05')).toBe('Wikipedia:Did you know archive/2024/May');
    expect(dykArchiveTitle('2019-12')).toBe('Wikipedia:Did you know archive/2019/December');
  });

  it('rejects a malformed month', () => {
    expect(() => dykArchiveTitle('2024-13')).toThrow(/Invalid month/);
    expect(() => dykArchiveTitle('May 2024')).toThrow(/Invalid month/);
  });
});

describe('normalizeTitle', () => {
  it('drops fragments, swaps underscores and capitalises the first letter', () => {
    expect(normalizeTitle('ascot_Racecourse#History')).toBe('Ascot Racecourse');
    expect(normalizeTitle(':  spoon  Monthly ')).toBe('Spoon Monthly');
  });
});

describe('wikitextToPlain', () => {
  it('strips links, bold, italics, image notes and entities', () => {
    expect(
      wikitextToPlain(
        "* ... that '''[[Brindle Fox (racehorse)|Brindle Fox]]''' ''(pictured, left)'' won&nbsp;three races?",
      ),
    ).toBe('... that Brindle Fox won three races?');
  });

  it('turns {{-?}} into a question mark and removes other templates, refs and comments', () => {
    expect(
      wikitextToPlain(
        "* ... that '''''[[Spoon Monthly]]'''''<ref>x</ref><!-- c -->{{nowrap|{{small|x}}}}{{-?}}",
      ),
    ).toBe('... that Spoon Monthly?');
  });
});

describe('parseDykArchive', () => {
  const hooks = parseDykArchive(ARCHIVE);

  it('finds each distinct hook line and skips headers, timestamps and images', () => {
    expect(hooks.map((h) => h.text)).toEqual([
      '... that Glass Lighthouse of Vell was lit by candles until 1931?',
      '... that the poet Ada Quill wrote "a book about spoons" before Spoon Monthly?',
      '... that Brindle Fox won three races at Ascot?',
      '... that this hook has no bold subject and mentions Ali: The Musical?',
    ]);
  });

  it('treats bold links as subjects and keeps every article link', () => {
    expect(hooks[1]).toMatchObject({
      subjects: ['Spoon Monthly'],
      links: ['Ada Quill', 'Ten Spoons', 'Spoon Monthly'],
    });
    expect(hooks[2]).toMatchObject({
      subjects: ['Brindle Fox (racehorse)'],
      links: ['Brindle Fox (racehorse)', 'Ascot Racecourse'],
    });
  });

  it('ignores file and category links and reports hooks with no bold subject', () => {
    expect(hooks[3]).toMatchObject({ subjects: [], links: ['Ali: The Musical'] });
  });
});
