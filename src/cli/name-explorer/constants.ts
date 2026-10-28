const DECADES: string[] = [
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

const FETCH_DECADES: string[] = [...DECADES].reverse();

const FIRST_DECADE = DECADES[0] ?? "1889";
const LAST_DECADE = DECADES.at(-1) ?? "2020";

export { DECADES, FETCH_DECADES, FIRST_DECADE, LAST_DECADE };
