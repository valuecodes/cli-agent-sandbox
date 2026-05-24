import { tool } from "@openai/agents";
import { z } from "zod";

import type { GrantsDatabase } from "../clients/database";

const DANGEROUS_KEYWORDS = [
  "DROP",
  "DELETE",
  "INSERT",
  "UPDATE",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "EXEC",
  "EXECUTE",
  "ATTACH",
  "DETACH",
];

// Defense-in-depth: the database is in-memory, but rejecting non-SELECT
// statements keeps a misbehaving model from corrupting the working dataset
// mid-conversation.
const validateReadOnlyQuery = (
  sql: string
): { valid: true } | { valid: false; error: string } => {
  const trimmed = sql.trim();
  if (!trimmed.toUpperCase().startsWith("SELECT")) {
    return { valid: false, error: "Only SELECT queries are allowed" };
  }
  if (sql.includes(";")) {
    return { valid: false, error: "Multiple statements are not allowed" };
  }
  for (const keyword of DANGEROUS_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return { valid: false, error: `Forbidden keyword: ${keyword}` };
    }
  }
  return { valid: true };
};

export const createSqlQueryTool = (db: GrantsDatabase) =>
  tool({
    name: "query_grants",
    description: `Execute a read-only SQL SELECT against the in-memory Finnish grant-decisions database.

Table: grants
Columns (English name | source Finnish header | type):
- id                  | (auto)                       | INTEGER PRIMARY KEY
- decision_date       | Päätös pvm                   | TEXT, ISO date 'YYYY-MM-DD', may be NULL
- recipient           | Saajan nimi                  | TEXT, includes y-tunnus in parentheses (e.g. "Lapin Martat ry (0210606-0)")
- granting_authority  | Myöntäjä                     | TEXT, e.g. "Lapin ELY-keskus"
- case_number         | Asianumero                   | TEXT
- amount_applied      | Haettu                       | INTEGER, EUR, may be NULL
- amount_granted      | Myönnetty                    | INTEGER, EUR, may be NULL
- has_eu_funding      | EU-varat                     | INTEGER (0 or 1), 1 = EU funding present
- purpose             | Hyväksytty käyttötarkoitus   | TEXT, approved purpose
- programme           | Haun nimi (asianumero)       | TEXT, funding programme incl. programme key
- region              | Alueet                       | TEXT, region / municipality

Rules:
- Only one SELECT statement; no semicolons, no DDL/DML keywords.
- Amounts and dates can be NULL; use IS NULL / IS NOT NULL where it matters.
- Use LIKE for partial text matches (e.g. y-tunnus inside recipient).

Example queries:
- Total granted per authority:
    SELECT granting_authority, SUM(amount_granted) AS total FROM grants GROUP BY granting_authority ORDER BY total DESC LIMIT 10
- Top 5 single grants:
    SELECT decision_date, recipient, amount_granted FROM grants ORDER BY amount_granted DESC LIMIT 5
- EU-funded vs. not:
    SELECT has_eu_funding, COUNT(*) AS n, SUM(amount_granted) AS sum_eur FROM grants GROUP BY has_eu_funding`,
    parameters: z.object({
      sql: z.string().describe("A single SQL SELECT query"),
    }),
    execute: ({ sql }: { sql: string }) => {
      const validation = validateReadOnlyQuery(sql);
      if (!validation.valid) {
        return { error: validation.error };
      }
      try {
        const results = db.query(sql);
        return { results };
      } catch (error) {
        return { error: String(error) };
      }
    },
  });
