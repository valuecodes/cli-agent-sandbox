#!/usr/bin/env tsx

/**
 * Scaffold a new CLI from the basic template.
 *
 * Usage:
 *   pnpm scaffold:cli -- --name=my-cli --description="My CLI description"
 *   pnpm scaffold:cli -- --name=my-cli  # description defaults to "TODO: Add description"
 */
import fs from "node:fs/promises";
import path from "node:path";
import { argv } from "zx";

const TEMPLATE_DIR = path.join(process.cwd(), "templates", "cli-basic");
const CLI_DIR = path.join(process.cwd(), "src", "cli");

type Placeholders = {
  _CLI_NAME_: string;
  _CLI_TITLE_: string;
  _CLI_DESCRIPTION_: string;
};

const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const validateCliName = (name: string): void => {
  if (!KEBAB_CASE_REGEX.test(name)) {
    console.error(
      `Error: CLI name "${name}" must be kebab-case (e.g., "my-cli", "scrape-data")`
    );
    process.exit(1);
  }

  const reserved = ["cli", "test", "tmp", "node_modules"];
  if (reserved.includes(name)) {
    console.error(`Error: "${name}" is a reserved name`);
    process.exit(1);
  }
};

const checkTargetNotExists = async (
  targetDir: string,
  name: string
): Promise<void> => {
  try {
    await fs.access(targetDir);
    console.error(`Error: CLI directory already exists: src/cli/${name}/`);
    console.error("Remove it first or choose a different name.");
    process.exit(1);
  } catch {
    // Directory doesn't exist - expected
  }
};

const toTitleCase = (kebabName: string): string => {
  return kebabName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const replacePlaceholders = (
  content: string,
  placeholders: Placeholders
): string => {
  let result = content;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    result = result.replaceAll(placeholder, value);
  }
  return result;
};

const copyTemplateFile = async (
  srcPath: string,
  destPath: string,
  placeholders: Placeholders
): Promise<void> => {
  const content = await fs.readFile(srcPath, "utf-8");
  const processed = replacePlaceholders(content, placeholders);
  await fs.writeFile(destPath, processed, "utf-8");
};

const main = async (): Promise<void> => {
  const name = argv.name as string | undefined;
  const description =
    (argv.description as string | undefined) ?? "TODO: Add description";

  if (!name) {
    console.error("Error: --name is required");
    console.error(
      'Usage: pnpm scaffold:cli -- --name=my-cli --description="My description"'
    );
    process.exit(1);
  }

  validateCliName(name);

  const targetDir = path.join(CLI_DIR, name);
  await checkTargetNotExists(targetDir, name);

  try {
    await fs.access(TEMPLATE_DIR);
  } catch {
    console.error(`Error: Template directory not found: ${TEMPLATE_DIR}`);
    process.exit(1);
  }

  const placeholders: Placeholders = {
    _CLI_NAME_: name,
    _CLI_TITLE_: toTitleCase(name),
    _CLI_DESCRIPTION_: description,
  };

  console.log(`Scaffolding new CLI: ${name}`);
  console.log(`  Title: ${placeholders._CLI_TITLE_}`);
  console.log(`  Description: ${description}`);
  console.log(`  Target: src/cli/${name}/`);
  console.log();

  await fs.mkdir(targetDir, { recursive: true });

  const templateFiles = await fs.readdir(TEMPLATE_DIR);

  for (const file of templateFiles) {
    const srcPath = path.join(TEMPLATE_DIR, file);
    const destPath = path.join(targetDir, file);

    const stat = await fs.stat(srcPath);
    if (stat.isFile()) {
      await copyTemplateFile(srcPath, destPath, placeholders);
      console.log(`  Created: src/cli/${name}/${file}`);
    }
  }

  console.log();
  console.log("Done! Next steps:");
  console.log();
  console.log(`  1. Add to package.json scripts:`);
  console.log(`     "run:${name}": "tsx src/cli/${name}/main.ts"`);
  console.log();
  console.log(`  2. Implement your CLI logic in src/cli/${name}/main.ts`);
  console.log();
  console.log(`  3. Run your CLI:`);
  console.log(`     pnpm run:${name}`);
  console.log();
  console.log(`  4. See src/cli/${name}/CHECKLIST.md for full checklist`);
};

main().catch((err: unknown) => {
  console.error("Scaffold failed:", err);
  process.exit(1);
});
