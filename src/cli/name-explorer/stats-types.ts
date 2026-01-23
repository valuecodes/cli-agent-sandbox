// TypeScript interfaces for name statistics

export interface DecadeGenderStats {
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
}

export interface TopName {
  decade: string;
  gender: "boy" | "girl";
  rank: number;
  name: string;
  count: number;
  share: number;
}

export interface NameDynamics {
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
}

export interface RankChange {
  name: string;
  gender: "boy" | "girl";
  fromDecade: string;
  toDecade: string;
  fromRank: number;
  toRank: number;
  change: number;
}

export interface NewEntry {
  name: string;
  gender: "boy" | "girl";
  decade: string;
  rank: number;
  count: number;
}

export interface Comeback {
  name: string;
  gender: "boy" | "girl";
  comebackDecade: string;
  previousDecade: string;
  gapDecades: number;
  comebackRank: number;
}

export interface ChurnMetrics {
  fromDecade: string;
  toDecade: string;
  gender: "boy" | "girl";
  churnRate: number;
  newNames: number;
  exitedNames: number;
  jaccardSimilarity: number;
}

export interface UnisexName {
  name: string;
  decade: string;
  boyRank: number;
  girlRank: number;
  boyCount: number;
  girlCount: number;
}

export interface EvergreenName {
  name: string;
  gender: "boy" | "girl";
  decadesPresent: number;
  avgRank: number;
  totalCount: number;
}

export interface LetterStats {
  decade: string;
  gender: "boy" | "girl";
  letter: string;
  nameCount: number;
  totalBirths: number;
  share: number;
}

export interface SuffixStats {
  decade: string;
  gender: "boy" | "girl";
  suffix: string;
  nameCount: number;
  totalBirths: number;
  share: number;
}

export interface NameLengthStats {
  decade: string;
  gender: "boy" | "girl";
  avgLength: number;
  minLength: number;
  maxLength: number;
}

export interface SpecialCharStats {
  decade: string;
  gender: "boy" | "girl";
  namesWithUmlautA: number;
  namesWithUmlautO: number;
  totalNames: number;
  umlautAShare: number;
  umlautOShare: number;
}

export interface AllStats {
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
}
