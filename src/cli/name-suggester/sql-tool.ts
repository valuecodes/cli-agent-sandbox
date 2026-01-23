import { tool } from "@openai/agents";
import { z } from "zod";
import type { NameDatabase } from "./database";

export function createSqlQueryTool(db: NameDatabase) {
  return tool({
    name: "query_names_database",
    description: `Execute a read-only SQL query against the Finnish names database.

Tables:
- names: id, decade, gender ('boy'|'girl'), rank, name, count

Example queries:
- Top 10 names in 2020: SELECT name, count FROM names WHERE decade='2020' ORDER BY count DESC LIMIT 10
- Name popularity over time: SELECT decade, count FROM names WHERE name='Emma' ORDER BY decade`,
    parameters: z.object({
      sql: z.string().describe("The SQL SELECT query to execute"),
    }),
    execute: ({ sql }: { sql: string }) => {
      if (!sql.trim().toUpperCase().startsWith("SELECT")) {
        return { error: "Only SELECT queries are allowed" };
      }
      try {
        const results = db.query(sql);
        return { results };
      } catch (error) {
        return { error: String(error) };
      }
    },
  });
}
