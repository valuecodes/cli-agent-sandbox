import { z } from "zod";

const PublicationLink = z.object({
  title: z.string(),
  url: z.url(),
  date: z.iso.date().optional(),
});

const LinkCandidate = z.object({
  url: z.url(),
  html: z.string(),
});

const SelectorResult = z.object({
  titleSelector: z.string(),
  dateSelector: z.string().nullable(),
});

const ContentSelectorResult = z.object({
  contentSelector: z.string(),
});

const Publication = z.object({
  title: z.string(),
  url: z.url(),
  date: z.iso.date().optional(),
  content: z.string(),
  extractedAt: z.iso.datetime(),
});

export {
  ContentSelectorResult,
  LinkCandidate,
  Publication,
  PublicationLink,
  SelectorResult,
};
