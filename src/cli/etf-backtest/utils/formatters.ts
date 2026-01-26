import { DECIMAL_PLACES, PERCENT_MULTIPLIER } from "../constants";

export const formatPercent = (
  value: number,
  decimals = DECIMAL_PLACES.percent
): string => `${(value * PERCENT_MULTIPLIER).toFixed(decimals)}%`;

export const formatFixed = (value: number, decimals: number): string =>
  value.toFixed(decimals);
