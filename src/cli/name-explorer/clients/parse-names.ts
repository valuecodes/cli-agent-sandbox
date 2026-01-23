import { JSDOM } from "jsdom";

export interface NameEntry {
  rank: number;
  name: string;
  count: number;
}

export interface ParsedNames {
  decade: string;
  boys: NameEntry[];
  girls: NameEntry[];
}

export function parseNamesHtml(html: string, decade: string): ParsedNames {
  const dom = new JSDOM(html);
  const tables = dom.window.document.querySelectorAll("table");

  // First table is boys (Miehet), second is girls (Naiset)
  const boys = parseTable(tables[0]);
  const girls = parseTable(tables[1]);

  return { decade, boys, girls };
}

function parseTable(table: Element | undefined): NameEntry[] {
  if (!table) return [];

  const rows = table.querySelectorAll("tbody tr");
  return Array.from(rows).map((row) => {
    const cells = row.querySelectorAll("td");
    const rank = parseInt(cells[0]?.textContent.replace(".", "") ?? "0", 10);
    const name = cells[1]?.querySelector("a")?.textContent ?? "";
    const count = parseInt(cells[2]?.textContent.replace(/\s/g, "") ?? "0", 10);
    return { rank, name, count };
  });
}
