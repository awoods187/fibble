import { z } from 'zod';

/**
 * Living-person detection from Wikidata claims (PRD section 5, content filters).
 * Conservative on purpose: a human with no date of death counts as living
 * unless they were born more than 115 years ago, matching Wikipedia's
 * biographies-of-living-persons rule of thumb.
 */

export const ASSUME_DEAD_AFTER_YEARS = 115;

const Q_HUMAN = 'Q5';
const P_INSTANCE_OF = 'P31';
const P_DATE_OF_BIRTH = 'P569';
const P_DATE_OF_DEATH = 'P570';

const SnakSchema = z.object({
  snaktype: z.string(),
  datavalue: z.object({ value: z.unknown() }).optional(),
});

export const WikidataEntitySchema = z.object({
  id: z.string(),
  claims: z.record(z.string(), z.array(z.object({ mainsnak: SnakSchema }))).optional(),
});

export type WikidataEntity = z.infer<typeof WikidataEntitySchema>;

function snaks(entity: WikidataEntity, property: string) {
  return (entity.claims?.[property] ?? []).map((c) => c.mainsnak);
}

export function isHuman(entity: WikidataEntity): boolean {
  return snaks(entity, P_INSTANCE_OF).some((s) => {
    const value = s.datavalue?.value;
    return typeof value === 'object' && value !== null && 'id' in value && value.id === Q_HUMAN;
  });
}

/** Earliest birth year on record, or undefined. Wikidata times look like "+1564-02-15T00:00:00Z". */
export function birthYear(entity: WikidataEntity): number | undefined {
  const years = snaks(entity, P_DATE_OF_BIRTH).flatMap((s) => {
    const value = s.datavalue?.value;
    if (typeof value !== 'object' || value === null || !('time' in value)) return [];
    const m = /^([+-]\d+)-/.exec(String(value.time));
    return m ? [Number(m[1])] : [];
  });
  return years.length ? Math.min(...years) : undefined;
}

/** Any date-of-death claim counts, including "unknown value". */
export function hasDeathDate(entity: WikidataEntity): boolean {
  return snaks(entity, P_DATE_OF_DEATH).some((s) => s.snaktype !== 'novalue');
}

export function isLivingPerson(entity: WikidataEntity, now: Date): boolean {
  if (!isHuman(entity) || hasDeathDate(entity)) return false;
  const born = birthYear(entity);
  return born === undefined || now.getUTCFullYear() - born <= ASSUME_DEAD_AFTER_YEARS;
}
