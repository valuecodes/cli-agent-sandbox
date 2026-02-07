import { describe, expect, it } from "vitest";

import {
  AgentConfigSchema,
  CliArgsSchema,
  SupportedModelSchema,
} from "./schemas";

describe("SupportedModelSchema", () => {
  it("accepts gpt-5-mini", () => {
    expect(SupportedModelSchema.parse("gpt-5-mini")).toBe("gpt-5-mini");
  });

  it("accepts gpt-4.1-nano", () => {
    expect(SupportedModelSchema.parse("gpt-4.1-nano")).toBe("gpt-4.1-nano");
  });

  it("accepts gpt-4.1-mini", () => {
    expect(SupportedModelSchema.parse("gpt-4.1-mini")).toBe("gpt-4.1-mini");
  });

  it("rejects unknown models", () => {
    expect(() => SupportedModelSchema.parse("gpt-unknown")).toThrow();
  });
});

describe("CliArgsSchema --compare", () => {
  it("parses --compare with two models", () => {
    const result = CliArgsSchema.parse({
      suite: "example",
      compare: "gpt-5-mini,gpt-4.1-nano",
    });
    expect(result.compare).toEqual(["gpt-5-mini", "gpt-4.1-nano"]);
  });

  it("trims whitespace around model names", () => {
    const result = CliArgsSchema.parse({
      suite: "example",
      compare: "gpt-5-mini , gpt-4.1-nano",
    });
    expect(result.compare).toEqual(["gpt-5-mini", "gpt-4.1-nano"]);
  });

  it("rejects --compare with only one model", () => {
    expect(() =>
      CliArgsSchema.parse({
        suite: "example",
        compare: "gpt-5-mini",
      })
    ).toThrow("at least 2 models");
  });

  it("rejects --compare with unknown model", () => {
    expect(() =>
      CliArgsSchema.parse({
        suite: "example",
        compare: "gpt-5-mini,unknown-model",
      })
    ).toThrow();
  });

  it("allows omitting --compare", () => {
    const result = CliArgsSchema.parse({ suite: "example" });
    expect(result.compare).toBeUndefined();
  });

  it("parses three models", () => {
    const result = CliArgsSchema.parse({
      suite: "example",
      compare: "gpt-5-mini,gpt-4.1-nano,gpt-4.1-mini",
    });
    expect(result.compare).toEqual([
      "gpt-5-mini",
      "gpt-4.1-nano",
      "gpt-4.1-mini",
    ]);
  });
});

describe("AgentConfigSchema", () => {
  it("accepts supported models", () => {
    const config = AgentConfigSchema.parse({
      name: "TestAgent",
      model: "gpt-4.1-nano",
      instructions: "Test",
    });
    expect(config.model).toBe("gpt-4.1-nano");
  });

  it("rejects unsupported models", () => {
    expect(() =>
      AgentConfigSchema.parse({
        name: "TestAgent",
        model: "unsupported-model",
        instructions: "Test",
      })
    ).toThrow();
  });
});
