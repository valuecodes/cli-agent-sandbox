import type { z } from "zod";
import type { Logger } from "~clients/logger";

import type {
  LinkCandidate,
  Publication,
  PublicationLink,
  SelectorResult,
} from "../types/publication";

type FetchSource = "playwright" | "basic-fetch";

type PublicationPipelineConfig = {
  logger: Logger;
  outputDir: string;
  refetch?: boolean;
};

type FetchSourceResult = {
  markdown: string;
  html: string;
  fromCache: { markdown: boolean; html: boolean };
  source: FetchSource;
};

type DiscoverLinksResult = {
  allLinks: string[];
  filteredLinks: string[];
  linkCandidates: z.infer<typeof LinkCandidate>[];
  source: FetchSource;
  usedFallback: boolean;
};

type IdentifyAndExtractResult = {
  selectors: z.infer<typeof SelectorResult>;
  publications: z.infer<typeof PublicationLink>[];
};

type FetchPublicationsResult = {
  fetchedCount: number;
  skippedCount: number;
  markdownCount: number;
};

type ExtractionResult = { success: boolean; filename: string; error?: string };

type ExtractContentResult = {
  publications: z.infer<typeof Publication>[];
  report: {
    total: number;
    successful: number;
    failed: number;
    results: ExtractionResult[];
  };
};

export type {
  DiscoverLinksResult,
  ExtractContentResult,
  ExtractionResult,
  FetchPublicationsResult,
  FetchSource,
  FetchSourceResult,
  IdentifyAndExtractResult,
  PublicationPipelineConfig,
};
