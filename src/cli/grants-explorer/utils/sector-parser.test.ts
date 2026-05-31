import { describe, expect, it } from "vitest";

import { parseSectorOption } from "./sector-parser";

describe("parseSectorOption", () => {
  it.each([
    [
      "S15 Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt",
      {
        code: "S15",
        label: "Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt",
      },
    ],
    ["S2 Ulkomaat", { code: "S2", label: "Ulkomaat" }],
    ["S11 Yritykset", { code: "S11", label: "Yritykset" }],
    ["S141 Työnantaja", { code: "S141", label: "Työnantaja" }],
    [
      "S1242 Muut yhteissijoitusyritykset",
      { code: "S1242", label: "Muut yhteissijoitusyritykset" },
    ],
    [
      "S13111 Valtion budjettitalous",
      { code: "S13111", label: "Valtion budjettitalous" },
    ],
    ["S131311 Kunnat", { code: "S131311", label: "Kunnat" }],
    // Non-breaking space (U+00A0) between code and label — Power BI
    // renders one occasionally; the \s+ in the regex covers it.
    ["S14 Kotitaloudet", { code: "S14", label: "Kotitaloudet" }],
    // Surrounding whitespace is trimmed before parsing.
    ["  S12212 Talletuspankit  ", { code: "S12212", label: "Talletuspankit" }],
    // Special buckets map to sentinel codes.
    ["(Tyhjä)", { code: "BLANK", label: "(Tyhjä)" }],
    [
      "Sektoriluokitus puuttuu",
      { code: "PUUTTUU", label: "Sektoriluokitus puuttuu" },
    ],
  ])("parses %j", (input, expected) => {
    expect(parseSectorOption(input)).toEqual(expected);
  });

  it.each([
    "",
    "   ",
    "S15", // no label
    "S15  ", // label is whitespace only after trim
    "X15 Something", // wrong prefix
    "s15 lowercase prefix",
    "S1234567 too many digits", // 7 digits, beyond S\d{1,6}
    "15 Kotitaloudet", // missing S
    "Valitse kaikki", // select-all control, not an option
  ])("returns null for non-option input %j", (input) => {
    expect(parseSectorOption(input)).toBeNull();
  });
});
