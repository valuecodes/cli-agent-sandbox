// pnpm run:owner-lookup -- --name="Skandinaviska Enskilda Banken Ab (publ) Helsingin Sivukonttori"

// Look up Finnish company name translations from PRH by shareholder/company name

import "dotenv/config";

import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";

import { detectLanguage } from "./clients/language-detector";
import { findBestMatch } from "./clients/name-matcher";
import { PrhClient } from "./clients/prh-client";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger();

try {
  const { name } = parseArgs({ logger, schema: CliArgsSchema });

  logger.info("owner-lookup running...", { name });

  const detectedLang = detectLanguage(name);
  logger.info("Detected input language", { language: detectedLang });

  const prhClient = new PrhClient({ logger });
  const response = await prhClient.searchByName(name);

  if (response.companies.length === 0) {
    logger.warn("No companies found in PRH for this name");
    process.exitCode = 1;
  } else {
    const match = findBestMatch({ query: name, companies: response.companies });

    if (!match) {
      logger.warn("No matching company found in results", {
        totalResults: response.totalResults,
      });
      process.exitCode = 1;
    } else {
      const { company, matchedName, confidence } = match;
      const activeNames = company.names.filter((n) => !n.endDate);

      logger.info("Match found", {
        businessId: company.businessId.value,
        confidence,
        matchedOn: matchedName.name,
      });

      logger.answer("Name translations:");
      for (const nameEntry of activeNames) {
        const lang = detectLanguage(nameEntry.name);
        const langLabel = lang === "unknown" ? "??" : lang;
        logger.answer("  [" + langLabel + "] " + nameEntry.name);
      }
    }
  }

  logger.info("owner-lookup completed.");
} catch (error) {
  logger.error("Fatal error", { error });
  process.exitCode = 1;
}
