export type LogLevel = "debug" | "info" | "warn" | "error";

export type LoggerConfig = {
  level?: LogLevel;
  useColors?: boolean;
  useTimestamps?: boolean;
};

/**
 * Configurable console logger with support for log levels, colors, and timestamps.
 * Provides standard logging methods (debug, info, warn, error) and specialized
 * methods for tool output, questions, and answers.
 */
export class Logger {
  private level: LogLevel;
  private useColors: boolean;
  private useTimestamps: boolean;

  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private static readonly COLORS: Record<LogLevel, string> = {
    debug: "\x1b[90m", // Gray
    info: "\x1b[36m", // Cyan
    warn: "\x1b[33m", // Yellow
    error: "\x1b[31m", // Red
  };

  private static readonly MAGENTA = "\x1b[35m";
  private static readonly GREEN = "\x1b[32m";
  private static readonly BLUE = "\x1b[34m";

  private static readonly RESET = "\x1b[0m";

  /**
   * Creates a new Logger instance.
   * @param config - Optional configuration for level, colors, and timestamps
   */
  constructor(config?: LoggerConfig) {
    this.level = config?.level ?? "info";
    this.useColors = config?.useColors ?? process.stdout.isTTY;
    this.useTimestamps = config?.useTimestamps ?? true;
  }

  /**
   * Checks if a message at the given level should be logged.
   * @param level - The log level to check
   * @returns True if the level meets or exceeds the configured threshold
   */
  private shouldLog(level: LogLevel): boolean {
    return Logger.LEVELS[level] >= Logger.LEVELS[this.level];
  }

  /**
   * Formats a log message with timestamp and level tag.
   * @param level - The log level for coloring
   * @param message - The message to format
   * @returns Formatted message string
   */
  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];

    if (this.useTimestamps) {
      parts.push(new Date().toISOString());
    }

    const levelTag = `[${level.toUpperCase()}]`;
    if (this.useColors) {
      parts.push(`${Logger.COLORS[level]}${levelTag}${Logger.RESET}`);
    } else {
      parts.push(levelTag);
    }

    parts.push(message);

    return parts.join(" ");
  }

  /**
   * Logs a debug message (lowest priority).
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.debug
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  /**
   * Logs an info message.
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.log
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", message), ...args);
    }
  }

  /**
   * Logs a warning message.
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.warn
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  /**
   * Logs an error message (highest priority).
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.error
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }

  /**
   * Logs a tool-related message with magenta [TOOL] tag.
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.log
   */
  tool(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      const parts: string[] = [];
      if (this.useTimestamps) {
        parts.push(new Date().toISOString());
      }
      const tag = "[TOOL]";
      if (this.useColors) {
        parts.push(`${Logger.MAGENTA}${tag}${Logger.RESET}`);
      } else {
        parts.push(tag);
      }
      parts.push(message);
      console.log(parts.join(" "), ...args);
    }
  }

  /**
   * Logs a question message with green [QUESTION] tag.
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.log
   */
  question(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      const parts: string[] = [];
      if (this.useTimestamps) {
        parts.push(new Date().toISOString());
      }
      const tag = "[QUESTION]";
      if (this.useColors) {
        parts.push(`${Logger.GREEN}${tag}${Logger.RESET}`);
      } else {
        parts.push(tag);
      }
      parts.push(message);
      console.log(parts.join(" "), ...args);
    }
  }

  /**
   * Logs an answer message with blue [ANSWER] tag.
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.log
   */
  answer(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      const parts: string[] = [];
      if (this.useTimestamps) {
        parts.push(new Date().toISOString());
      }
      const tag = "[ANSWER]";
      if (this.useColors) {
        parts.push(`${Logger.BLUE}${tag}${Logger.RESET}`);
      } else {
        parts.push(tag);
      }
      parts.push(message);
      console.log(parts.join(" "), ...args);
    }
  }
}
