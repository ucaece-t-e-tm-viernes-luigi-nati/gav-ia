/** Nombre de archivo ASCII seguro ("La Gaviota" → "la-gaviota"). */
export function fileSlug(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "balneario";
}