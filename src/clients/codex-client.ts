import type { Logger } from "~clients/logger";
import { $ } from "zx";

$.verbose = false;

type CodexClientOptions = {
  logger: Logger;
};

type LaunchOptions = {
  prompt: string;
  context?: string;
};

export class CodexClient {
  private logger: Logger;

  constructor(options: CodexClientOptions) {
    this.logger = options.logger;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await $`which codex`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  async launch({ prompt, context }: LaunchOptions): Promise<boolean> {
    if (!(await this.isAvailable())) {
      this.logger.warn("codex CLI not found, skipping step", {
        context: context ?? "auto",
      });
      return false;
    }

    this.logger.info("Launching codex", { context });
    await $({ stdio: "inherit" })`codex exec --full-auto ${prompt}`;
    return true;
  }
}
