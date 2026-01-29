import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline";
import type { Logger } from "~clients/logger";

import { CLAUDE_PROJECTS_PATH, PROVIDER_CLAUDE } from "../constants";
import type { ClaudeLogEntry, UsageRecord } from "../types/schemas";
import { ClaudeLogEntrySchema } from "../types/schemas";

type ClaudeLogReaderOptions = {
  logger: Logger;
  basePath?: string;
  debug?: boolean;
};

type GetUsageOptions = {
  since: Date;
  repoPath: string;
};

/**
 * Encodes a repo path to the Claude projects directory format.
 * /home/juha/code/foo -> -home-juha-code-foo
 */
const encodeRepoPath = (repoPath: string): string => {
  const normalizedPath = repoPath.replace(/\\/g, "/");
  return normalizedPath.replace(/\//g, "-");
};

export class ClaudeLogReader {
  private logger: Logger;
  private basePath: string;
  private debug: boolean;

  constructor(options: ClaudeLogReaderOptions) {
    this.logger = options.logger;
    this.basePath = options.basePath ?? CLAUDE_PROJECTS_PATH;
    this.debug = options.debug ?? false;
  }

  /**
   * Find all JSONL log files for a given repo path.
   */
  async findLogFiles(repoPath: string): Promise<string[]> {
    const encodedPath = encodeRepoPath(repoPath);
    const projectDir = join(this.basePath, encodedPath);

    try {
      await stat(projectDir);
    } catch {
      if (this.debug) {
        this.logger.debug("Claude project dir not found", { projectDir });
      }
      return [];
    }

    const files: string[] = [];
    const entries = await readdir(projectDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(join(projectDir, entry.name));
      }
    }

    if (this.debug) {
      this.logger.debug("Found Claude log files", { count: files.length });
    }

    return files;
  }

  /**
   * Parse a single JSONL file and yield usage entries.
   */
  async *parseFile(filePath: string): AsyncGenerator<ClaudeLogEntry> {
    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(line);
        const result = ClaudeLogEntrySchema.safeParse(parsed);

        if (result.success) {
          yield result.data;
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  /**
   * Get usage records filtered by time and repo.
   */
  async getUsage(options: GetUsageOptions): Promise<UsageRecord[]> {
    const { since, repoPath } = options;
    const files = await this.findLogFiles(repoPath);
    const records: UsageRecord[] = [];

    for (const file of files) {
      for await (const entry of this.parseFile(file)) {
        // Only process assistant entries with usage data
        if (entry.type !== "assistant") {
          continue;
        }
        if (!entry.message?.usage) {
          continue;
        }
        if (!entry.message.model) {
          continue;
        }
        // Skip synthetic entries (client-side error messages, not real API calls)
        if (entry.message.model === "<synthetic>") {
          continue;
        }

        const timestamp = new Date(entry.timestamp);
        if (timestamp < since) {
          continue;
        }

        // Skip if cwd is missing or doesn't match repo
        if (!entry.cwd) {
          if (this.debug) {
            this.logger.debug("Skipping entry: cwd missing", { repoPath });
          }
          continue;
        }
        if (!entry.cwd.startsWith(repoPath)) {
          if (this.debug) {
            this.logger.debug("Skipping entry: cwd mismatch", {
              cwd: entry.cwd,
              repoPath,
            });
          }
          continue;
        }

        const usage = entry.message.usage;
        records.push({
          provider: PROVIDER_CLAUDE,
          model: entry.message.model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          cacheWriteTokens: usage.cache_creation_input_tokens,
          timestamp,
        });
      }
    }

    if (this.debug) {
      this.logger.debug("Found Claude usage records", {
        count: records.length,
      });
    }

    return records;
  }
}
