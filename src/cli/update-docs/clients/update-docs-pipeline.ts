import fs from "node:fs/promises";
import { CodexClient } from "~clients/codex-client";
import { GitClient } from "~clients/git-client";
import type { Logger } from "~clients/logger";
import { $ } from "zx";

import {
  CODEX_PROMPT_TEMPLATE,
  getChangesPath,
  getOutputDir,
} from "../constants";
import { DiffFormatter } from "./diff-formatter";

type UpdateDocsPipelineOptions = {
  logger: Logger;
};

type RunOptions = {
  base: string;
  codex: boolean;
};

type RunResult = {
  changesPath: string;
  changedFiles: string[];
  codexLaunched: boolean;
};

export class UpdateDocsPipeline {
  private logger: Logger;

  constructor(options: UpdateDocsPipelineOptions) {
    this.logger = options.logger;
  }

  async run(options: RunOptions): Promise<RunResult> {
    const gitClient = new GitClient({ logger: this.logger });
    const codexClient = new CodexClient({ logger: this.logger });
    const formatter = new DiffFormatter();

    const branch = await gitClient.getCurrentBranch();
    this.logger.info("Current branch", { branch });
    this.logger.info("Comparing against base branch", { base: options.base });

    const [changedFiles, diff] = await Promise.all([
      gitClient.getChangedFiles({ base: options.base }),
      gitClient.getDiff({ base: options.base }),
    ]);

    this.logger.info("Found changed files", { count: changedFiles.length });

    if (changedFiles.length === 0) {
      this.logger.info("No changes found, nothing to do");
      return {
        changesPath: "",
        changedFiles: [],
        codexLaunched: false,
      };
    }

    const markdown = formatter.formatMarkdown(
      branch,
      options.base,
      changedFiles,
      diff
    );

    const outputDir = getOutputDir(branch);
    await fs.mkdir(outputDir, { recursive: true });

    const changesPath = getChangesPath(branch);
    await fs.writeFile(changesPath, markdown, "utf-8");

    this.logger.info("Changes written", { path: changesPath });

    let codexLaunched = false;

    if (options.codex) {
      const prompt = CODEX_PROMPT_TEMPLATE(changesPath);
      codexLaunched = await codexClient.launch({
        prompt,
        context: "update docs",
      });
    }

    await this.runFormat();

    return { changesPath, changedFiles, codexLaunched };
  }

  private async runFormat(): Promise<void> {
    this.logger.info("Running pnpm format...");
    await $`pnpm format`;
    this.logger.info("Format complete");
  }
}
