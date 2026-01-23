// TypeScript interfaces for name statistics

export type DecadeGenderStats = {
  decade: string;
  gender: "boy" | "girl";
  totalBirths: number;
  nameCount: number;
  topNConcentration: {
    top1: number;
    top5: number;
    top10: number;
  };
  namesToReach: {
    pct25: number;
    pct50: number;
  };
  hhi: number;
  effectiveNames: number;
  entropy: number;
};

export type TopName = {
  decade: string;
  gender: "boy" | "girl";
  rank: number;
  name: string;
  count: number;
  share: number;
};

export type NameDynamics = {
  name: string;
  gender: "boy" | "girl";
  peakDecade: string;
  peakRank: number;
  firstAppearance: string;
  lastAppearance: string;
  timeToPeak: number;
  longevity: number;
  avgRank: number;
  rankStddev: number;
};

export type RankChange = {
  name: string;
  gender: "boy" | "girl";
  fromDecade: string;
  toDecade: string;
  fromRank: number;
  toRank: number;
  change: number;
};

export type NewEntry = {
  name: string;
  gender: "boy" | "girl";
  decade: string;
  rank: number;
  count: number;
};

export type Comeback = {
  name: string;
  gender: "boy" | "girl";
  comebackDecade: string;
  previousDecade: string;
  gapDecades: number;
  comebackRank: number;
};

export type ChurnMetrics = {
  fromDecade: string;
  toDecade: string;
  gender: "boy" | "girl";
  churnRate: number;
  newNames: number;
  exitedNames: number;
  jaccardSimilarity: number;
};

export type UnisexName = {
  name: string;
  decade: string;
  boyRank: number;
  girlRank: number;
  boyCount: number;
  girlCount: number;
};

export type EvergreenName = {
  name: string;
  gender: "boy" | "girl";
  decadesPresent: number;
  avgRank: number;
  totalCount: number;
};

export type LetterStats = {
  decade: string;
  gender: "boy" | "girl";
  letter: string;
  nameCount: number;
  totalBirths: number;
  share: number;
};

export type SuffixStats = {
  decade: string;
  gender: "boy" | "girl";
  suffix: string;
  nameCount: number;
  totalBirths: number;
  share: number;
};

export type NameLengthStats = {
  decade: string;
  gender: "boy" | "girl";
  avgLength: number;
  minLength: number;
  maxLength: number;
};

export type SpecialCharStats = {
  decade: string;
  gender: "boy" | "girl";
  namesWithUmlautA: number;
  namesWithUmlautO: number;
  totalNames: number;
  umlautAShare: number;
  umlautOShare: number;
};

export type AllStats = {
  generatedAt: string;
  dataSource: string;
  decadeRange: { first: string; last: string };
  totalUniqueNames: number;
  totalRecords: number;

  decadeStats: DecadeGenderStats[];
  topNames: TopName[];
  nameDynamics: NameDynamics[];
  biggestClimbers: RankChange[];
  biggestFallers: RankChange[];
  newEntries: NewEntry[];
  comebacks: Comeback[];
  churnMetrics: ChurnMetrics[];
  unisexNames: UnisexName[];
  evergreenNames: EvergreenName[];
  letterStats: LetterStats[];
  suffixStats: SuffixStats[];
  nameLengthStats: NameLengthStats[];
  specialCharStats: SpecialCharStats[];
};
