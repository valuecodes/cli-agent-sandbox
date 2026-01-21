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
