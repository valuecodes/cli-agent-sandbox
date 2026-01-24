import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { Logger } from "~clients/logger";

import type { NameEntry } from "./parse-names";

export type NameRow = {
  id: number;
  decade: string;
  gender: "boy" | "girl";
  rank: number;
  name: string;
  count: number;
};

export type DecadeData = {
  decade: string;
  boys: NameEntry[];
  girls: NameEntry[];
};

export type ConsolidatedData = {
  decades: DecadeData[];
};

/**
 * Manages an in-memory SQLite database for Finnish names data.
 * Provides methods to create the schema, insert data, and query the database.
 * The database schema includes a 'names' table with columns for decade,
 * gender, rank, name, and count.
 */
export class NameDatabase {
  private db: DatabaseSync;
  private logger: Logger;

  /**
   * Creates a new NameDatabase instance with an in-memory SQLite database.
   * @param logger - Logger instance for debug output
   */
  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.debug("Initializing in-memory SQLite database");
    this.db = new DatabaseSync(":memory:");
    this.createSchema();
    this.logger.debug("Database schema created");
  }

  /**
   * Creates the database schema with the names table and indexes.
   */
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

  /**
   * Inserts name entries for a specific decade and gender.
   * @param decade - The decade identifier (e.g., "1980")
   * @param gender - The gender category
   * @param entries - Array of name entries to insert
   */
  insertNames(
    decade: string,
    gender: "boy" | "girl",
    entries: NameEntry[]
  ): void {
    const insert = this.db.prepare(`
      INSERT INTO names (decade, gender, rank, name, count)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN");
    try {
      for (const entry of entries) {
        insert.run(decade, gender, entry.rank, entry.name, entry.count);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.logger.debug(
      `Inserted ${entries.length} ${gender} names for decade ${decade}`
    );
  }

  /**
   * Retrieves all name records for a specific decade.
   * @param decade - The decade to query
   * @returns Array of name rows for the decade
   */
  getByDecade(decade: string): NameRow[] {
    const stmt = this.db.prepare("SELECT * FROM names WHERE decade = ?");
    return stmt.all(decade) as unknown as NameRow[];
  }

  /**
   * Retrieves all data organized by decade with separate boy/girl arrays.
   * @returns Consolidated data structure with all decades
   */
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
      boys: boysStmt.all(decade) as unknown as NameEntry[],
      girls: girlsStmt.all(decade) as unknown as NameEntry[],
    }));

    return { decades: result };
  }

  /**
   * Returns the total number of records in the database.
   * @returns Total record count
   */
  getTotalCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM names")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Loads data from a consolidated data structure into the database.
   * @param data - The consolidated data to load
   */
  loadFromConsolidatedData(data: ConsolidatedData): void {
    for (const decadeData of data.decades) {
      this.insertNames(decadeData.decade, "boy", decadeData.boys);
      this.insertNames(decadeData.decade, "girl", decadeData.girls);
    }
    this.logger.debug(`Loaded ${this.getTotalCount()} records from JSON`);
  }

  /**
   * Executes a SQL query and returns all matching rows.
   * @param sql - The SQL query string
   * @param params - Query parameters
   * @param mapRow - Optional row mapping function
   * @returns Array of query results
   */
  query<T>(
    sql: string,
    params: SQLInputValue[] = [],
    mapRow?: (row: unknown) => T
  ): T[] {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];
    return mapRow ? rows.map(mapRow) : (rows as T[]);
  }

  /**
   * Executes a SQL query and returns the first matching row.
   * @param sql - The SQL query string
   * @param params - Query parameters
   * @param mapRow - Optional row mapping function
   * @returns The first result or undefined if no match
   */
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

  close(): void {
    this.logger.debug("Closing database connection");
    this.db.close();
  }
}

export type AggregatedNameRow = {
  id: number;
  name: string;
  count: number;
  gender: "male" | "female";
};

/**
 * Manages an in-memory SQLite database for aggregated Finnish names data.
 * Stores total name counts across all time (not broken down by decade).
 * Used for looking up overall name popularity.
 */
export class AggregatedNameDatabase {
  private db: DatabaseSync;
  private logger: Logger;

  /**
   * Creates a new AggregatedNameDatabase instance with an in-memory SQLite database.
   * @param logger - Logger instance for debug output
   */
  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.debug("Initializing aggregated names SQLite database");
    this.db = new DatabaseSync(":memory:");
    this.createSchema();
    this.logger.debug("Aggregated database schema created");
  }

  /**
   * Creates the database schema for aggregated names.
   */
  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        count INTEGER NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('male', 'female'))
      );

      CREATE INDEX idx_agg_name ON names(name);
      CREATE INDEX idx_agg_gender ON names(gender);
    `);
  }

  /**
   * Loads name data from a CSV file.
   * Expects CSV with name and count columns, handles thousand separators.
   * @param filePath - Path to the CSV file
   * @param gender - Gender to assign to all loaded names
   */
  loadFromCsv(filePath: string, gender: "male" | "female"): void {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");

    // Skip header line
    const dataLines = lines.slice(1);

    const insert = this.db.prepare(`
      INSERT INTO names (name, count, gender)
      VALUES (?, ?, ?)
    `);

    this.db.exec("BEGIN");
    try {
      for (const line of dataLines) {
        const [name, countStr] = line.split(",");
        if (!name || !countStr) {
          continue;
        }

        // Parse count with thousand separators like "43.276" or "43,276"
        const normalizedCount = countStr.replace(/[^\d]/g, "");
        if (!normalizedCount) {
          continue;
        }
        const count = Number.parseInt(normalizedCount, 10);
        if (Number.isNaN(count)) {
          continue;
        }

        insert.run(name.trim(), count, gender);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.logger.debug(`Loaded ${gender} names from ${filePath}`);
  }

  /**
   * Returns the total number of records in the database.
   * @returns Total record count
   */
  getTotalCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM names")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Executes a SQL query and returns all matching rows.
   * @param sql - The SQL query string
   * @param params - Query parameters
   * @param mapRow - Optional row mapping function
   * @returns Array of query results
   */
  query<T>(
    sql: string,
    params: SQLInputValue[] = [],
    mapRow?: (row: unknown) => T
  ): T[] {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];
    return mapRow ? rows.map(mapRow) : (rows as T[]);
  }

  /**
   * Executes a SQL query and returns the first matching row.
   * @param sql - The SQL query string
   * @param params - Query parameters
   * @param mapRow - Optional row mapping function
   * @returns The first result or undefined if no match
   */
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

  close(): void {
    this.logger.debug("Closing aggregated database connection");
    this.db.close();
  }
}
