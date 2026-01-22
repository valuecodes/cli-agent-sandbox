import Database from "better-sqlite3";
import type { Logger } from "../../clients/logger";
import type { NameEntry } from "./parse-names";

export interface NameRow {
  id: number;
  decade: string;
  gender: "boy" | "girl";
  rank: number;
  name: string;
  count: number;
}

export interface DecadeData {
  decade: string;
  boys: NameEntry[];
  girls: NameEntry[];
}

export interface ConsolidatedData {
  decades: DecadeData[];
}

export class NameDatabase {
  private db: Database.Database;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.debug("Initializing in-memory SQLite database");
    this.db = new Database(":memory:");
    this.createSchema();
    this.logger.debug("Database schema created");
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decade TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('boy', 'girl')),
        rank INTEGER NOT NULL,
        name TEXT NOT NULL,
        count INTEGER NOT NULL
      );

      CREATE INDEX idx_decade ON names(decade);
      CREATE INDEX idx_gender ON names(gender);
      CREATE INDEX idx_name ON names(name);
    `);
  }

  insertNames(
    decade: string,
    gender: "boy" | "girl",
    entries: NameEntry[]
  ): void {
    const insert = this.db.prepare(`
      INSERT INTO names (decade, gender, rank, name, count)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: NameEntry[]) => {
      for (const entry of items) {
        insert.run(decade, gender, entry.rank, entry.name, entry.count);
      }
    });

    insertMany(entries);
    this.logger.debug(
      `Inserted ${entries.length} ${gender} names for decade ${decade}`
    );
  }

  getByDecade(decade: string): NameRow[] {
    const stmt = this.db.prepare("SELECT * FROM names WHERE decade = ?");
    return stmt.all(decade) as NameRow[];
  }

  getAll(): ConsolidatedData {
    const decades = this.db
      .prepare("SELECT DISTINCT decade FROM names ORDER BY decade DESC")
      .all() as { decade: string }[];

    const boysStmt = this.db.prepare(
      "SELECT rank, name, count FROM names WHERE decade = ? AND gender = 'boy' ORDER BY rank"
    );
    const girlsStmt = this.db.prepare(
      "SELECT rank, name, count FROM names WHERE decade = ? AND gender = 'girl' ORDER BY rank"
    );

    const result: DecadeData[] = decades.map(({ decade }) => ({
      decade,
      boys: boysStmt.all(decade) as NameEntry[],
      girls: girlsStmt.all(decade) as NameEntry[],
    }));

    return { decades: result };
  }

  getTotalCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM names")
      .get() as { count: number };
    return result.count;
  }

  query<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  close(): void {
    this.logger.debug("Closing database connection");
    this.db.close();
  }
}
