/**
 * Accent-insensitive text matching for the in-app directories (#278).
 *
 * Mexican Spanish names carry accents the tenant rarely types — Android and
 * iOS keyboards need a long-press for them — so "ferreteria" must find
 * "Ferretería" and "instalacion" must find "Instalación". Folding strips the
 * combining marks (NFD splits each accented letter into base + diacritic) and
 * lowercases, applied to BOTH haystack and needle so an accented query still
 * matches an unaccented row.
 */
export function foldSearchText(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
