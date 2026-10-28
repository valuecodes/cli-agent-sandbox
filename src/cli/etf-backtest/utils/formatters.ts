import { DECIMAL_PLACES, PERCENT_MULTIPLIER } from "../constants";

const formatPercent = (
  value: number,
  decimals = DECIMAL_PLACES.percent
): string => `${(value * PERCENT_MULTIPLIER).toFixed(decimals)}%`;

const formatFixed = (value: number, decimals: number): string =>
  value.toFixed(decimals);

export { formatFixed, formatPercent };
