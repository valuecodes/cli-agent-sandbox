// pnpm run:guestbook

import "dotenv/config";

import { AgentRunner } from "~clients/agent-runner";
import { Logger } from "~clients/logger";
import { createReadFileTool } from "~tools/read-file/read-file-tool";
import { createWriteFileTool } from "~tools/write-file/write-file-tool";
import { z } from "zod";
import { question } from "zx";

const logger = new Logger();

logger.info("Guestbook running...");

const OutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const agentRunner = new AgentRunner({
  name: "GuestbookAgent",
  model: "gpt-5-mini",
  tools: [createWriteFileTool({ logger }), createReadFileTool({ logger })],
  outputType: OutputSchema,
  instructions: `
You maintain a shared "greeting guestbook" at guestbook.md.
Rules:
- Only read/write files under tmp. Paths are relative to the tmp directory (e.g., use "guestbook.md" not "./tmp/guestbook.md").
- Use Markdown.
- If the file exists, append a new dated entry at the top under "## Entries".
- If it doesn't exist, create it with a header and an Entries section.
- Each entry must include the user's name.
- Keep it upbeat and a little nerdy, but not cringe.

IMPORTANT: Always respond with a JSON object in this format:
{"success": true/false, "message": "description of what was done"}
`,
  logger,
  stateless: true, // Each run is independent
});

const userName = await question("Enter user name: ");

const tone = await question("Tone (friendly/formal/sarcastic/cyberpunk): ");
const lang = await question("Language (en/fi): ");
const funFact = await question("Fun fact (optional): ");
const goal = await question("What are you building right now? (optional): ");

const prompt = `
Add a guestbook entry for user: "${userName}"

User preferences:
- tone: ${tone}
- language: ${lang}
- funFact: ${funFact || "(none)"}
- goal: ${goal || "(none)"}

File path: guestbook.md (relative to tmp directory)

Steps:
1) Try to read the file.
2) If it exists, append a new entry (with ISO date-time and user name) at the top under "## Entries".
3) If not found, create a new file with:
   - Title: "# Guestbook"
   - "## Entries" with the first entry including the user's name.
4) Write the final Markdown back to guestbook.md.
`;

const result = await agentRunner.run({ prompt });
const parseResult = OutputSchema.safeParse(result.finalOutput);

if (parseResult.success) {
  logger.info("Result", { message: parseResult.data.message });
} else {
  logger.warn("Unexpected response format");
  logger.info(String(result.finalOutput));
}

// Show the file contents after write
const preview = await agentRunner.run({
  prompt: `Read guestbook.md and include its full contents in your response message.`,
});
const previewResult = OutputSchema.safeParse(preview.finalOutput);
if (previewResult.success) {
  logger.answer(previewResult.data.message);
} else {
  logger.answer(JSON.stringify(preview.finalOutput, null, 2));
}
