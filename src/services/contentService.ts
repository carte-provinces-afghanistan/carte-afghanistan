import { provinceCatalogByCode } from "../data/provinceCatalog";
import type { ProvinceContentRecord } from "../types";
import { markdownToHtml, parseMarkdownDocument } from "../utils/markdown";

const markdownModules = import.meta.glob("../../content/provinces/*.md", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function toContentRecord(sourcePath: string, rawMarkdown: string): ProvinceContentRecord | null {
  const { frontmatter, body } = parseMarkdownDocument(rawMarkdown);
  const code = normalizeCode(frontmatter.code ?? "");

  if (!code) {
    console.warn(`Fiche ignorée sans code de province: ${sourcePath}`);
    return null;
  }

  const catalogEntry = provinceCatalogByCode.get(code);

  return {
    code,
    frenchName: frontmatter.frenchName || catalogEntry?.frenchName || code,
    title: frontmatter.title || catalogEntry?.frenchName || code,
    intro: frontmatter.intro || "",
    updatedAt: frontmatter.updatedAt || "",
    bodyHtml: markdownToHtml(body),
    sourcePath
  };
}

export const provinceContent: ProvinceContentRecord[] = Object.entries(markdownModules)
  .map(([sourcePath, rawMarkdown]) => toContentRecord(sourcePath, rawMarkdown))
  .filter((record): record is ProvinceContentRecord => record !== null);
