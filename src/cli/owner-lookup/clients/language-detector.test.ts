import { describe, expect, it } from "vitest";

import { detectLanguage } from "./language-detector";

describe("detectLanguage", () => {
  it("detects Finnish from 'Oy'", () => {
    expect(detectLanguage("Nordea Pankki Oy")).toBe("fi");
  });

  it("detects Finnish from 'Oyj'", () => {
    expect(detectLanguage("Nokia Oyj")).toBe("fi");
  });

  it("detects Finnish from 'rahasto'", () => {
    expect(detectLanguage("Nordea Rahasto")).toBe("fi");
  });

  it("detects Finnish from 'eläke'", () => {
    expect(detectLanguage("Keskinäinen Eläkevakuutusyhtiö Ilmarinen")).toBe(
      "fi"
    );
  });

  it("detects Finnish from 'sivukonttori'", () => {
    expect(
      detectLanguage(
        "Skandinaviska Enskilda Banken Ab (publ) Helsingin Sivukonttori"
      )
    ).toBe("fi");
  });

  it("detects Swedish from 'Ab'", () => {
    expect(detectLanguage("Skandinaviska Enskilda Banken Ab")).toBe("sv");
  });

  it("detects Swedish from 'Abp'", () => {
    expect(detectLanguage("Nokia Abp")).toBe("sv");
  });

  it("detects Swedish from 'stiftelse'", () => {
    expect(detectLanguage("Svenska kulturfonden Stiftelse")).toBe("sv");
  });

  it("detects Swedish from 'filial'", () => {
    expect(detectLanguage("SEB Filial i Finland")).toBe("sv");
  });

  it("detects English from 'Ltd'", () => {
    expect(detectLanguage("Acme Solutions Ltd")).toBe("en");
  });

  it("detects English from 'Branch'", () => {
    expect(detectLanguage("SEB Helsinki Branch")).toBe("en");
  });

  it("detects English from 'Fund'", () => {
    expect(detectLanguage("Nordic Growth Fund")).toBe("en");
  });

  it("returns 'unknown' for names without language keywords", () => {
    expect(detectLanguage("Skandinaviska Enskilda Banken")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(detectLanguage("NOKIA OYJ")).toBe("fi");
    expect(detectLanguage("acme ltd")).toBe("en");
  });

  it("does not match partial words", () => {
    // "royal" contains "oy" but not as a word boundary
    expect(detectLanguage("Royal Bank")).not.toBe("fi");
  });
});
