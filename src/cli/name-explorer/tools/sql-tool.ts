import { tool } from "@openai/agents";
import { z } from "zod";

import type { AggregatedNameDatabase, NameDatabase } from "../clients/database";

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
];

const validateReadOnlyQuery = (
  sql: string
): {
  valid: boolean;
  error?: string;
} => {
  const trimmedSql = sql.trim();

  // Must start with SELECT
  if (!trimmedSql.toUpperCase().startsWith("SELECT")) {
    return { valid: false, error: "Only SELECT queries are allowed" };
  }

  // No semicolons (prevents multiple statements)
  if (sql.includes(";")) {
    return { valid: false, error: "Multiple statements are not allowed" };
  }

  // Check for dangerous keywords using word boundaries
  for (const keyword of DANGEROUS_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return { valid: false, error: `Forbidden keyword: ${keyword}` };
    }
  }

  return { valid: true };
};

export const createSqlQueryTool = (db: NameDatabase) => {
  return tool({
    name: "query_names_database",
    description: `Execute a read-only SQL query against the Finnish names database (decade-based data).

Tables:
- names: id, decade, gender ('boy'|'girl'), rank, name, count

Example queries:
- Top 10 names in 2020: SELECT name, count FROM names WHERE decade='2020' ORDER BY count DESC LIMIT 10
- Name popularity over time: SELECT decade, count FROM names WHERE name='Emma' ORDER BY decade`,
    parameters: z.object({
      sql: z.string().describe("The SQL SELECT query to execute"),
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
};

export const createAggregatedSqlQueryTool = (db: AggregatedNameDatabase) => {
  return tool({
    name: "query_aggregated_names",
    description: `Execute a read-only SQL query against the aggregated Finnish names database (total counts across all time).

Tables:
- names: id, name, count (total count as integer), gender ('male'|'female')

Example queries:
- Top 10 male names: SELECT name, count FROM names WHERE gender='male' ORDER BY count DESC LIMIT 10
- Compare name counts: SELECT name, count, gender FROM names WHERE name IN ('Juha', 'Anne') ORDER BY count DESC
- Total names by gender: SELECT gender, COUNT(*) as total FROM names GROUP BY gender`,
    parameters: z.object({
      sql: z.string().describe("The SQL SELECT query to execute"),
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
};
