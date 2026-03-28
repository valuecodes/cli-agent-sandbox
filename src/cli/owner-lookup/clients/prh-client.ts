import type { Logger } from "~clients/logger";
import { resolveAndValidateUrl } from "~tools/utils/url-safety";

import {
  DEFAULT_TIMEOUT_MS,
  MAX_COMPANIES_TO_RETURN,
  PRH_API_BASE_URL,
  USER_AGENT,
} from "../constants";
import type { PrhApiResponse } from "../types/schemas";
import { PrhApiResponseSchema } from "../types/schemas";

type PrhClientOptions = {
  logger: Logger;
};

export class PrhClient {
  private logger: Logger;

  constructor({ logger }: PrhClientOptions) {
    this.logger = logger;
  }

  async searchByName(name: string): Promise<PrhApiResponse> {
    const url = `${PRH_API_BASE_URL}?name=${encodeURIComponent(name)}`;

    const validation = await resolveAndValidateUrl(url);
    if (!validation.valid) {
      throw new Error(
        "URL validation failed: " + (validation.error ?? "Unknown error")
      );
    }

    this.logger.info("Searching PRH...", { name });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          "PRH API error: " +
            String(response.status) +
            " " +
            response.statusText
        );
      }

      const json: unknown = await response.json();
      const parsed = PrhApiResponseSchema.safeParse(json);

      if (!parsed.success) {
        throw new Error("Invalid PRH API response: " + parsed.error.message);
      }

      const result = parsed.data;
      if (result.companies.length > MAX_COMPANIES_TO_RETURN) {
        result.companies = result.companies.slice(0, MAX_COMPANIES_TO_RETURN);
      }

      this.logger.info("PRH search complete", {
        totalResults: result.totalResults,
        returned: result.companies.length,
      });

      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
