import type { Logger } from "~clients/logger";
import { $ } from "zx";

$.verbose = false;

type GitClientOptions = {
  logger: Logger;
};

export class GitClient {
  private logger: Logger;

  constructor(options: GitClientOptions) {
    this.logger = options.logger;
  }

  async getCurrentBranch(): Promise<string> {
    const result = await $`git branch --show-current`.quiet();
    return result.stdout.trim();
  }

  async getChangedFiles(base: string): Promise<string[]> {
    const result = await $`git diff --name-only ${base}...HEAD`.quiet();
    return result.stdout
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  }

  async getDiff(base: string): Promise<string> {
    const result = await $`git diff ${base}...HEAD`.quiet();
    return result.stdout;
  }

  async isCodexAvailable(): Promise<boolean> {
    try {
      await $`which codex`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  async launchCodex(prompt: string): Promise<boolean> {
    if (!(await this.isCodexAvailable())) {
      this.logger.warn("codex CLI not found. Skipping auto-update step.");
      return false;
    }

    this.logger.info("Launching codex to update docs...");
    await $({ stdio: "inherit" })`codex exec --full-auto ${prompt}`;
    return true;
  }
}
