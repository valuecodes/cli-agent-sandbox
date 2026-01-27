import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "~clients/logger";

import { SUITE_FILE_EXTENSION, SUITES_DIR } from "../constants";
import type { EvalSuite } from "../schemas";
import { EvalSuiteSchema } from "../schemas";

export type SuiteLoaderConfig = {
  logger: Logger;
  suitesDir?: string;
};

/**
 * Loads evaluation suite definitions from JSON files.
 * Suite files are stored in the suites/ directory with .json extension.
 */
export class SuiteLoader {
  private logger: Logger;
  private suitesDir: string;

  constructor(config: SuiteLoaderConfig) {
    this.logger = config.logger;
    this.suitesDir = config.suitesDir ?? SUITES_DIR;
  }

  /**
   * Load a single suite by name.
   * @param name Suite name (without .json extension)
   */
  async load(name: string): Promise<EvalSuite> {
    const filePath = path.join(
      this.suitesDir,
      `${name}${SUITE_FILE_EXTENSION}`
    );
    this.logger.debug("Loading suite", { name, path: filePath });

    const content = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(content) as unknown;
    const suite = EvalSuiteSchema.parse(json);

    this.logger.info("Suite loaded", {
      name: suite.name,
      caseCount: suite.cases.length,
    });
    return suite;
  }

  /**
   * List all available suite names.
   */
  async listSuites(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.suitesDir, { withFileTypes: true });
      const suiteNames = entries
        .filter(
          (entry) => entry.isFile() && entry.name.endsWith(SUITE_FILE_EXTENSION)
        )
        .map((entry) => entry.name.replace(SUITE_FILE_EXTENSION, ""));

      this.logger.debug("Available suites", { suites: suiteNames });
      return suiteNames;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.warn("Suites directory not found", { dir: this.suitesDir });
        return [];
      }
      throw err;
    }
  }

  /**
   * Load all available suites.
   */
  async loadAll(): Promise<EvalSuite[]> {
    const names = await this.listSuites();
    const suites: EvalSuite[] = [];

    for (const name of names) {
      const suite = await this.load(name);
      suites.push(suite);
    }

    return suites;
  }
}
