type Frontmatter = Record<string, string>;

const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

function parseScalar(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseMarkdownDocument(rawMarkdown: string) {
  const normalized = rawMarkdown.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: normalized.trim()
    };
  }

  const endIndex = normalized.indexOf("\n---", 4);

  if (endIndex === -1) {
    return {
      frontmatter: {},
      body: normalized.trim()
    };
  }

  const frontmatterLines = normalized.slice(4, endIndex).split("\n");
  const frontmatter = frontmatterLines.reduce<Frontmatter>((fields, line) => {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      return fields;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);

    if (key) {
      fields[key] = parseScalar(value);
    }

    return fields;
  }, {});

  return {
    frontmatter,
    body: normalized.slice(endIndex + 4).trim()
  };
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines: string[]) {
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);

  return [
    "<table>",
    "<thead><tr>",
    ...header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`),
    "</tr></thead>",
    "<tbody>",
    ...rows.flatMap((row) => [
      "<tr>",
      ...row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`),
      "</tr>"
    ]),
    "</tbody>",
    "</table>"
  ].join("");
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }

      blocks.push(`<blockquote><p>${renderInlineMarkdown(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }

      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (line.includes("|") && lines[index + 1] && isTableDivider(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;

      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }

      blocks.push(renderTable(tableLines));
      continue;
    }

    const paragraphLines: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{2,4})\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !lines[index].trim().startsWith(">") &&
      !(lines[index].includes("|") && lines[index + 1] && isTableDivider(lines[index + 1]))
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("\n");
}
