import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { Logger } from "~clients/logger";

import type { GrantRow } from "../types/schemas";

/**
 * In-memory SQLite for the `grants` table populated from paatokset.xlsx.
 *
 * Column names anglicized for easier LLM use; the SQL tool description
 * documents the original Finnish header mapping for the agent.
 */
export class GrantsDatabase {
  private db: DatabaseSync;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.db = new DatabaseSync(":memory:");
    this.createSchema();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE grants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_date TEXT,
        recipient TEXT,
        recipient_business_id TEXT,
        granting_authority TEXT,
        case_number TEXT,
        amount_applied INTEGER,
        amount_granted INTEGER,
        has_eu_funding INTEGER NOT NULL CHECK (has_eu_funding IN (0, 1)),
        purpose TEXT,
        programme TEXT,
        region TEXT,
        sektoriluokitus_code TEXT NOT NULL,
        sektoriluokitus_label TEXT NOT NULL
      );

      CREATE INDEX idx_grants_granting_authority ON grants(granting_authority);
      CREATE INDEX idx_grants_recipient_business_id ON grants(recipient_business_id);
      CREATE INDEX idx_grants_region ON grants(region);
      CREATE INDEX idx_grants_decision_date ON grants(decision_date);
      CREATE INDEX idx_grants_has_eu_funding ON grants(has_eu_funding);
      CREATE INDEX idx_grants_sektoriluokitus_code ON grants(sektoriluokitus_code);
    `);
    this.logger.debug("Grants schema created");
  }

  insertRows(rows: GrantRow[]): void {
    const insert = this.db.prepare(`
      INSERT INTO grants (
        decision_date, recipient, recipient_business_id, granting_authority,
        case_number, amount_applied, amount_granted, has_eu_funding,
        purpose, programme, region,
        sektoriluokitus_code, sektoriluokitus_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN");
    try {
      for (const row of rows) {
        insert.run(
          row.decision_date,
          row.recipient,
          row.recipient_business_id,
          row.granting_authority,
          row.case_number,
          row.amount_applied,
          row.amount_granted,
          row.has_eu_funding,
          row.purpose,
          row.programme,
          row.region,
          row.sektoriluokitus_code,
          row.sektoriluokitus_label
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.logger.debug("Inserted grants", { count: rows.length });
  }

  query<T>(
    sql: string,
    params: SQLInputValue[] = [],
    mapRow?: (row: unknown) => T
  ): T[] {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];
    return mapRow ? rows.map(mapRow) : (rows as T[]);
  }

  queryOne<T>(
    sql: string,
    params: SQLInputValue[] = [],
    mapRow?: (row: unknown) => T
  ): T | undefined {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as unknown;
    if (row === undefined) {
      return undefined;
    }
    return mapRow ? mapRow(row) : (row as T);
  }

  getTotalCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM grants")
      .get() as { count: number };
    return result.count;
  }

  close(): void {
    this.logger.debug("Closing grants database");
    this.db.close();
  }
}
