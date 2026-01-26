import { z } from "zod";

// Value with raw number and localized string representation
export const LocalizedValueSchema = z.object({
  raw: z.number(),
  localized: z.string(),
});

// Single data point in the time series
export const SeriesPointSchema = z.object({
  date: z.string(), // ISO format: "YYYY-MM-DD"
  value: LocalizedValueSchema,
});

// Full API response from justetf.com
export const EtfDataResponseSchema = z.object({
  latestQuote: LocalizedValueSchema,
  latestQuoteDate: z.string(),
  price: LocalizedValueSchema,
  performance: LocalizedValueSchema,
  prevDaySeries: z.array(SeriesPointSchema),
  series: z.array(SeriesPointSchema),
});

export type LocalizedValue = z.infer<typeof LocalizedValueSchema>;
export type SeriesPoint = z.infer<typeof SeriesPointSchema>;
export type EtfDataResponse = z.infer<typeof EtfDataResponseSchema>;

/** Type guard to check if data matches the expected ETF response shape */
export const isEtfDataResponse = (data: unknown): data is EtfDataResponse => {
  return EtfDataResponseSchema.safeParse(data).success;
};
