import { Fragment } from "react";

interface markdown_content_props {
  content: string;
}

type block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export function MarkdownContent({ content }: markdown_content_props) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-4 text-[1.06rem] leading-9 text-[#24304a]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const headingClass =
            block.level <= 2
              ? "text-[1.18rem] font-semibold text-[#12244d]"
              : "text-[1.08rem] font-semibold text-[#12244d]";
          const HeadingTag = block.level <= 2 ? "h3" : "h4";
          return (
            <HeadingTag key={`heading-${index}`} className={`m-0 ${headingClass}`}>
              {renderInline(block.text)}
            </HeadingTag>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul key={`ul-${index}`} className="m-0 space-y-2 pl-6">
              {block.items.map((item, itemIndex) => (
                <li key={`ul-${index}-${itemIndex}`} className="pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol key={`ol-${index}`} className="m-0 space-y-2 pl-6">
              {block.items.map((item, itemIndex) => (
                <li key={`ol-${index}-${itemIndex}`} className="pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={`table-${index}`}
              className="-mx-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/70"
            >
              <table className="min-w-full border-collapse text-left text-[0.98rem] leading-7">
                <thead>
                  <tr className="border-b border-slate-200/90 bg-white/80">
                    {block.headers.map((header, cellIndex) => (
                      <th
                        key={`table-${index}-header-${cellIndex}`}
                        className="px-4 py-3 font-semibold text-[#12244d]"
                      >
                        {renderInline(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr
                      key={`table-${index}-row-${rowIndex}`}
                      className="border-b border-slate-200/70 last:border-b-0"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`table-${index}-row-${rowIndex}-cell-${cellIndex}`}
                          className="px-4 py-3 align-top text-[#24304a]"
                        >
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={`paragraph-${index}`} className="m-0 whitespace-pre-wrap">
            {renderInline(block.lines.join(" "))}
          </p>
        );
      })}
    </div>
  );
}

function parseBlocks(content: string): block[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [{ type: "paragraph", lines: ["..."] }];
  }

  const lines = normalized.split("\n");
  const blocks: block[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (isEmphasizedHeading(line)) {
      blocks.push({
        type: "heading",
        level: 2,
        text: stripOuterDoubleAsterisks(line),
      });
      index += 1;
      continue;
    }

    if (isTableHeaderLine(line) && index+1 < lines.length && isTableDividerLine(lines[index + 1].trim())) {
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length) {
        const current = lines[index].trim();
        if (!current || !isTableHeaderLine(current)) {
          break;
        }
        rows.push(normalizeRowLength(parseTableRow(current), headers.length));
        index += 1;
      }

      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (isUnorderedListLine(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        if (!current || !isUnorderedListLine(current)) {
          break;
        }
        items.push(current.replace(/^[-*]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    if (isOrderedListLine(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        if (!current || !isOrderedListLine(current)) {
          break;
        }
        items.push(current.replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current) {
        break;
      }
      if (
        current.match(/^(#{1,6})\s+/) ||
        isEmphasizedHeading(current) ||
        (isTableHeaderLine(current) &&
          index+1 < lines.length &&
          isTableDividerLine(lines[index + 1].trim())) ||
        isUnorderedListLine(current) ||
        isOrderedListLine(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function isUnorderedListLine(line: string) {
  return /^[-*]\s+/.test(line);
}

function isOrderedListLine(line: string) {
  return /^\d+\.\s+/.test(line);
}

function isTableHeaderLine(line: string) {
  return line.includes("|");
}

function isTableDividerLine(line: string) {
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isEmphasizedHeading(line: string) {
  return /^\*\*[^*].*[^*]\*\*:?\s*$/.test(line);
}

function stripOuterDoubleAsterisks(line: string) {
  return line.replace(/^\*\*/, "").replace(/\*\*:?\s*$/, "").trim();
}

function parseTableRow(line: string) {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutOuterPipes.split("|").map((cell) => cell.trim());
}

function normalizeRowLength(row: string[], length: number) {
  if (row.length === length) {
    return row;
  }
  if (row.length > length) {
    return row.slice(0, length);
  }
  return [...row, ...Array.from({ length: length - row.length }, () => "")];
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`strong-${index}`} className="font-semibold text-[#12244d]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={`em-${index}`} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`code-${index}`}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.96em] text-[#17305f]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <Fragment key={`text-${index}`}>{part}</Fragment>;
  });
}
