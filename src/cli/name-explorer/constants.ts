export const DECADES: string[] = [
  "1889",
  "1900",
  "1910",
  "1920",
  "1930",
  "1940",
  "1950",
  "1960",
  "1970",
  "1980",
  "1990",
  "2000",
  "2010",
  "2020",
];

export const FETCH_DECADES: string[] = DECADES.slice().reverse();

export const FIRST_DECADE = DECADES[0] ?? "1889";
export const LAST_DECADE = DECADES[DECADES.length - 1] ?? "2020";
