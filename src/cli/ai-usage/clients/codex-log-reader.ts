import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline";
import type { Logger } from "~clients/logger";

import { CODEX_SESSIONS_PATH, PROVIDER_CODEX } from "../constants";
import type { UsageRecord } from "../types/schemas";
import {
  CodexEventMsgPayloadSchema,
  CodexLogEntrySchema,
  CodexSessionMetaPayloadSchema,
  CodexTurnContextPayloadSchema,
} from "../types/schemas";

type CodexLogReaderOptions = {
  logger: Logger;
  basePath?: string;
  debug?: boolean;
};

type GetUsageOptions = {
  since: Date;
  repoPath: string;
};

type SessionData = {
  cwd?: string;
  model?: string;
};

export class CodexLogReader {
  private logger: Logger;
  private basePath: string;
  private debug: boolean;

  constructor(options: CodexLogReaderOptions) {
    this.logger = options.logger;
    this.basePath = options.basePath ?? CODEX_SESSIONS_PATH;
    this.debug = options.debug ?? false;
  }

  /**
   * Find all JSONL log files within the date range.
   * Codex stores logs in YYYY/MM/DD directories.
   */
  async findLogFiles(since: Date): Promise<string[]> {
    const files: string[] = [];

    try {
      await stat(this.basePath);
    } catch {
      if (this.debug) {
        this.logger.debug("Codex sessions dir not found", {
          basePath: this.basePath,
        });
      }
      return [];
    }

    // Walk through year/month/day directories
    const years = await this.safeReaddir(this.basePath);

    for (const year of years) {
      const yearPath = join(this.basePath, year);
      const yearStat = await this.safeStat(yearPath);
      if (!yearStat?.isDirectory()) {
        continue;
      }

      const months = await this.safeReaddir(yearPath);

      for (const month of months) {
        const monthPath = join(yearPath, month);
        const monthStat = await this.safeStat(monthPath);
        if (!monthStat?.isDirectory()) {
          continue;
        }

        const days = await this.safeReaddir(monthPath);

        for (const day of days) {
          const dayPath = join(monthPath, day);
          const dayStat = await this.safeStat(dayPath);
          if (!dayStat?.isDirectory()) {
            continue;
          }

          // Check if this date is within range
          const dirDate = new Date(`${year}-${month}-${day}`);
          if (dirDate < since) {
            continue;
          }

          const dayFiles = await this.safeReaddir(dayPath);

          for (const file of dayFiles) {
            if (file.endsWith(".jsonl")) {
              files.push(join(dayPath, file));
            }
          }
        }
      }
    }

    if (this.debug) {
      this.logger.debug("Found Codex log files", { count: files.length });
    }

    return files;
  }

  private async safeReaddir(path: string): Promise<string[]> {
    try {
      return await readdir(path);
    } catch {
      return [];
    }
  }

  private async safeStat(path: string) {
    try {
      return await stat(path);
    } catch {
      return null;
    }
  }

  /**
   * Parse a session file and extract usage records.
   * Need to track session metadata and model across entries.
   * Codex emits duplicate token_count events - we dedupe by tracking last seen values.
   */
  async parseSession(
    filePath: string,
    repoPath: string,
    since: Date
  ): Promise<UsageRecord[]> {
    const records: UsageRecord[] = [];
    const sessionData: SessionData = {};
    let lastUsageKey = "";

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
        const baseResult = CodexLogEntrySchema.safeParse(parsed);
        if (!baseResult.success) {
          continue;
        }

        const entry = baseResult.data;
        const timestamp = new Date(entry.timestamp);

        // Extract session metadata (cwd)
        if (entry.type === "session_meta") {
          const metaResult = CodexSessionMetaPayloadSchema.safeParse(
            entry.payload
          );
          if (metaResult.success) {
            sessionData.cwd = metaResult.data.cwd;
          }
        }

        // Extract model from turn_context
        if (entry.type === "turn_context") {
          const contextResult = CodexTurnContextPayloadSchema.safeParse(
            entry.payload
          );
          if (contextResult.success && contextResult.data.model) {
            sessionData.model = contextResult.data.model;
          }
        }

        // Extract token usage from event_msg
        if (entry.type === "event_msg") {
          const eventResult = CodexEventMsgPayloadSchema.safeParse(
            entry.payload
          );
          if (!eventResult.success) {
            continue;
          }

          const payload = eventResult.data;
          if (payload.type !== "token_count") {
            continue;
          }
          // Use last_token_usage (incremental per-request) not total_token_usage (cumulative)
          if (!payload.info?.last_token_usage) {
            continue;
          }

          // Skip if before since date
          if (timestamp < since) {
            continue;
          }

          // Skip if cwd doesn't match repo
          if (sessionData.cwd && !sessionData.cwd.startsWith(repoPath)) {
            if (this.debug) {
              this.logger.debug("Skipping Codex entry: cwd mismatch", {
                cwd: sessionData.cwd,
                repoPath,
              });
            }
            continue;
          }

          const usage = payload.info.last_token_usage;

          // Dedupe: Codex emits duplicate token_count events with identical values
          const usageKey = `${usage.input_tokens}:${usage.output_tokens}:${usage.cached_input_tokens}`;
          if (usageKey === lastUsageKey) {
            continue;
          }
          lastUsageKey = usageKey;

          records.push({
            provider: PROVIDER_CODEX,
            model: sessionData.model ?? "unknown",
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheReadTokens: usage.cached_input_tokens,
            cacheWriteTokens: 0, // Codex doesn't track cache writes separately
            timestamp,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return records;
  }

  /**
   * Get usage records filtered by time and repo.
   */
  async getUsage(options: GetUsageOptions): Promise<UsageRecord[]> {
    const { since, repoPath } = options;
    const files = await this.findLogFiles(since);
    const allRecords: UsageRecord[] = [];

    for (const file of files) {
      const records = await this.parseSession(file, repoPath, since);
      allRecords.push(...records);
    }

    if (this.debug) {
      this.logger.debug("Found Codex usage records", {
        count: allRecords.length,
      });
    }

    return allRecords;
  }
}
