import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { loggerPlugin, NO_TEMPLATE_LITERAL_MESSAGE } from "./logger-plugin";

RuleTester.describe = describe;
RuleTester.it = it;

const rule = loggerPlugin.rules["no-template-literal"];
if (!rule) {
  throw new Error("logger plugin is missing no-template-literal");
}

const error = { message: NO_TEMPLATE_LITERAL_MESSAGE };

new RuleTester({ languageOptions: { sourceType: "module" } }).run(
  "no-template-literal",
  rule,
  {
    valid: [
      // Structured arguments are the point of the rule.
      'logger.info("Saved file", { path });',
      'this.logger.info("msg", { count: n });',
      // Only direct arguments are checked, like the old `>` child selector.
      "logger.info('m', { s: `x` });",
      "logger.info(format(`x ${y}`));",
      // Methods outside the logger level set.
      "logger.child(`x`);",
      "logger.infoLater(`x`);",
      // Not a logger receiver.
      "console.log(`x`);",
      "other.info(`x`);",
      "loggerFactory.info(`x`);",
      "this.log.info(`x`);",
      // Computed member access was never matched by the selector.
      'logger["info"](`x`);',
      // Tagged templates are TaggedTemplateExpression, not TemplateLiteral.
      "logger.info(tag`x`);",
    ],
    invalid: [
      { code: "logger.info(`a ${b}`);", errors: [error] },
      { code: "this.logger.warn(`x`);", errors: [error] },
      { code: "obj.logger.error(`${e}`);", errors: [error] },
      { code: "logger.debug(`x`);", errors: [error] },
      { code: "logger.tool(`x`);", errors: [error] },
      { code: "logger.question(`x`);", errors: [error] },
      { code: "logger.answer(`x`);", errors: [error] },
      // Any argument position, one report per template literal.
      { code: 'logger.info("msg", `x`);', errors: [error] },
      { code: "logger.info(`a`, `b`);", errors: [error, error] },
      { code: "logger?.info(`x`);", errors: [error] },
    ],
  }
);
