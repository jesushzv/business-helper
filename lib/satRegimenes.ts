/**
 * The SAT `c_RegimenFiscal` codes this product offers — one list, used by every
 * screen that asks for a régimen.
 *
 * Four screens each carried their own copy and no two agreed: Ajustes was the
 * only one offering 605 and the only one *missing* 606, so a tenant who
 * registered as "606 — Arrendamiento" opened their own profile to a blank
 * select with no option matching their value and no way to re-choose it. Their
 * régimen is what a CFDI is stamped under, so the divergence was one dropdown
 * touch away from overwriting a fiscal fact with a wrong one (#127) — the same
 * shape as the four hardcoded origin builders in #73.
 *
 * `tests/unit/satRegimenCatalogue.test.ts` fails the build on a new copy.
 */
export interface SatRegimen {
  /** The three-digit SAT code, which is what gets stored and stamped. */
  code: string;
  /** Presentation only. The column holds the code, never this string. */
  label: string;
}

/**
 * The union of every code the four screens used to offer, ordered by code.
 *
 * Adding one is a product decision (it must be a real `c_RegimenFiscal` entry
 * Facturapi will accept); removing one is a migration, because tenants already
 * hold the value.
 */
export const SAT_REGIMENES: readonly SatRegimen[] = [
  { code: '601', label: '601 — General de Ley Personas Morales' },
  { code: '603', label: '603 — Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 — Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '606', label: '606 — Arrendamiento' },
  { code: '612', label: '612 — Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '616', label: '616 — Sin obligaciones fiscales' },
  { code: '621', label: '621 — Incorporación Fiscal (RIF)' },
  { code: '626', label: '626 — Régimen Simplificado de Confianza (RESICO)' },
];

/** Reduces a stored value ('612' or the old '612 — …' display string) to its code. */
export function toRegimenCode(value: unknown): string {
  const match = /^\s*(\d{3})/.exec(typeof value === 'string' ? value : '');
  return match ? match[1] : '';
}

/** The catalogue entry for a code, or null when the catalogue does not list it. */
export function findSatRegimen(value: unknown): SatRegimen | null {
  const code = toRegimenCode(value);
  return SAT_REGIMENES.find((r) => r.code === code) ?? null;
}

/**
 * The options a `<select>` should render given what the tenant currently has
 * stored.
 *
 * A stored code the catalogue does not list gets an option of its own rather
 * than disappearing. Absent is absent — but *present and unlisted* is not
 * absent, and rendering it as a blank select told the tenant they had no
 * régimen while the database held one.
 */
export function satRegimenOptions(storedValue: unknown): SatRegimen[] {
  const code = toRegimenCode(storedValue);
  if (!code || SAT_REGIMENES.some((r) => r.code === code)) {
    return [...SAT_REGIMENES];
  }
  return [...SAT_REGIMENES, { code, label: `${code} — (código guardado)` }].sort((a, b) =>
    a.code.localeCompare(b.code)
  );
}
