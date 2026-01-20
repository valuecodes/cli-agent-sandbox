// pnpm run:guestbook

import { Agent, run } from "@openai/agents";
import "dotenv/config";
import { question } from "zx";
import { readFileTool, writeFileTool } from "./tools";

console.log("Guestbook running...");

const agent = new Agent({
  name: "GuestbookAgent",
  model: "gpt-5-mini",
  tools: [writeFileTool, readFileTool],
  instructions: `
You maintain a shared "greeting guestbook" at guestbook.md.
Rules:
- Only read/write files under tmp. Paths are relative to the tmp directory (e.g., use "guestbook.md" not "./tmp/guestbook.md").
- Use Markdown.
- If the file exists, append a new dated entry at the top under "## Entries".
- If it doesn't exist, create it with a header and an Entries section.
- Each entry must include the user's name.
- Keep it upbeat and a little nerdy, but not cringe.
`,
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

const result = await run(agent, prompt);

console.log("Agent result:", result.finalOutput);

// Optional: show the file contents after write
const preview = await run(agent, `Read and print the contents of guestbook.md`);
console.log("\n--- Preview ---\n");
console.log(preview.finalOutput);
