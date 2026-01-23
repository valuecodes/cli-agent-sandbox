export type LogLevel = "debug" | "info" | "warn" | "error";

export type LoggerConfig = {
  level?: LogLevel;
  useColors?: boolean;
  useTimestamps?: boolean;
};

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

  constructor(config?: LoggerConfig) {
    this.level = config?.level ?? "info";
    this.useColors = config?.useColors ?? Boolean(process.stdout.isTTY);
    this.useTimestamps = config?.useTimestamps ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.LEVELS[level] >= Logger.LEVELS[this.level];
  }

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

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }

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
