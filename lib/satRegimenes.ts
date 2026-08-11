/**
 * The SAT `c_RegimenFiscal` catalogue, in one place.
 *
 * It used to live in four places with four different contents (#127):
 * registration offered six codes, onboarding four, Ajustes a different four,
 * and the client form six. `OrgProfileCard` was the only one carrying 605 and
 * the only one missing 606.
 *
 * That is not a tidiness problem. A `<select>` whose `value` matches none of
 * its `<option>`s renders **blank** — so a tenant who registered under
 * *606 Arrendamiento* opened Ajustes to find their régimen fiscal simply
 * missing, with no label saying why, and four choices all wrong for them. The
 * value survives a blind save, but the moment they touch the dropdown to "fix"
 * the blank, their real régimen is overwritten with one that is not theirs —
 * on the field that decides how their CFDIs are stamped.
 *
 * Two rules follow, and `tests/unit/satRegimenes.test.ts` enforces both:
 *
 * 1. Every screen offering a régimen imports this list. No local copies.
 * 2. A stored code this list does not carry is rendered as itself, never
 *    dropped. *Absent* and *present but unlisted* are different facts, and
 *    only one of them may look like an empty field.
 */

export interface SatRegimen {
  /** The SAT code as stored on the row and sent to the PAC. */
  code: string;
  /** The régimen's name, without the code. */
  name: string;
  /** What a select renders: `601 — General de Ley Personas Morales`. */
  label: string;
}

function regimen(code: string, name: string): SatRegimen {
  return { code, name, label: `${code} — ${name}` };
}

/**
 * The régimenes the product offers.
 *
 * This is the union of the four diverging lists, deliberately: every code any
 * screen already offered is here, so no tenant who chose one before this
 * landed can find it missing now. Widening it beyond that union is a product
 * decision, not a bug fix — the SAT catalogue has ~20 more.
 */
export const SAT_REGIMENES: SatRegimen[] = [
  regimen('601', 'General de Ley Personas Morales'),
  regimen('603', 'Personas Morales con Fines no Lucrativos'),
  regimen('605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios'),
  regimen('606', 'Arrendamiento'),
  regimen('612', 'Personas Físicas con Actividades Empresariales y Profesionales'),
  regimen('621', 'Incorporación Fiscal (RIF)'),
  regimen('626', 'Régimen Simplificado de Confianza (RESICO)'),
];

const BY_CODE = new Map(SAT_REGIMENES.map((r) => [r.code, r]));

export function findRegimen(code: string | null | undefined): SatRegimen | null {
  return (code && BY_CODE.get(code)) || null;
}

/**
 * The options a select should render for a given stored value.
 *
 * A code the catalogue does not carry — an older SAT régimen, or one a future
 * list drops — comes back as its own option, labelled as stored rather than
 * silently omitted. The tenant keeps seeing their real régimen, and keeps the
 * ability to leave it alone.
 *
 * Pass `''`/`null` for "nothing chosen yet"; that adds nothing, because the
 * placeholder option already covers it.
 */
export function regimenOptions(storedCode: string | null | undefined): SatRegimen[] {
  const code = (storedCode || '').trim();
  if (!code || BY_CODE.has(code)) return SAT_REGIMENES;
  return [...SAT_REGIMENES, regimen(code, '(código guardado)')];
}
