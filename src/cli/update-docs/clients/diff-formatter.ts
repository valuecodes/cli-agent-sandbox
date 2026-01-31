export class DiffFormatter {
  formatMarkdown(
    branch: string,
    base: string,
    changedFiles: string[],
    diff: string
  ): string {
    const lines: string[] = [
      `# Changes: ${branch} vs ${base}`,
      "",
      `## Changed Files (${changedFiles.length})`,
      "",
    ];

    for (const file of changedFiles) {
      lines.push(`- ${file}`);
    }

    lines.push("", "## Full Diff", "", "```diff", diff, "```");

    return lines.join("\n");
  }
}
