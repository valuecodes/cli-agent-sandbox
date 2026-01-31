import type { Logger } from "~clients/logger";
import { $ } from "zx";

$.verbose = false;

type GitClientOptions = {
  logger: Logger;
};

type GetChangedFilesOptions = {
  base: string;
};

type GetDiffOptions = {
  base: string;
};

export class GitClient {
  private logger: Logger;

  constructor(options: GitClientOptions) {
    this.logger = options.logger;
  }

  async getCurrentBranch(): Promise<string> {
    const result = await $`git branch --show-current`.quiet();
    const branch = result.stdout.trim();
    this.logger.debug("Got current branch", { branch });
    return branch;
  }

  async getChangedFiles({ base }: GetChangedFilesOptions): Promise<string[]> {
    const result = await $`git diff --name-only ${base}...HEAD`.quiet();
    const files = result.stdout
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
    this.logger.debug("Got changed files", { base, count: files.length });
    return files;
  }

  async getDiff({ base }: GetDiffOptions): Promise<string> {
    const result = await $`git diff ${base}...HEAD`.quiet();
    this.logger.debug("Got diff", { base, length: result.stdout.length });
    return result.stdout;
  }
}
