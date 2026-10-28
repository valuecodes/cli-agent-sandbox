const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatNumber = (n: number): string => n.toLocaleString("fi-FI");

const formatPercent = (n: number, decimals = 1): string =>
  `${(n * 100).toFixed(decimals)}%`;

const formatDecimal = (n: number, decimals = 2): string => n.toFixed(decimals);

export { escapeHtml, formatNumber, formatPercent, formatDecimal };
