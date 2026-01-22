import { z } from "zod";

export const PublicationLink = z.object({
  title: z.string(),
  url: z.url(),
  date: z.iso.date().optional(),
});

export const LinkCandidate = z.object({
  url: z.url(),
  html: z.string(),
});

export const SelectorResult = z.object({
  titleSelector: z.string(),
  dateSelector: z.string().nullable(),
});

export const ContentSelectorResult = z.object({
  contentSelector: z.string(),
});

export const Publication = z.object({
  title: z.string(),
  url: z.url(),
  date: z.iso.date().optional(),
  content: z.string(),
  extractedAt: z.string().datetime(),
});
