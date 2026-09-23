import type { RuleTester } from "oxlint/plugins-dev";

// oxlint only exports `RuleTester` from its plugin types; the rule shape is
// recovered from its `run` signature.
type Rule = Parameters<RuleTester["run"]>[1];
type Plugin = { meta: { name: string }; rules: Record<string, Rule> };

const LOGGER_METHODS = /^(debug|info|warn|error|tool|question|answer)$/;

export const NO_TEMPLATE_LITERAL_MESSAGE =
  "Avoid template literals in logger calls. Use a plain string and pass data as extra args (e.g. logger.info('Saved file', { path })).";

/**
 * Port of the ESLint `no-restricted-syntax` selectors this repo used:
 *   CallExpression[callee.object.name='logger'][callee.property.name=/…/] > TemplateLiteral
 *   CallExpression[callee.object.property.name='logger'][callee.property.name=/…/] > TemplateLiteral
 * So `logger.info(…)`, `this.logger.info(…)`, `this.#logger.info(…)` and
 * `obj.logger.info(…)` are matched, and only template literals that are
 * *direct* arguments are reported (any position; one nested in an object
 * argument is not).
 */
const noTemplateLiteral: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow template literals as logger arguments" },
  },
  create: (context) => ({
    CallExpression: (node) => {
      const callee = node.callee;
      if (callee.type !== "MemberExpression") {
        return;
      }
      const method = callee.property;
      if (method.type !== "Identifier" || !LOGGER_METHODS.test(method.name)) {
        return;
      }
      const receiver = callee.object;
      const isLogger =
        (receiver.type === "Identifier" && receiver.name === "logger") ||
        (receiver.type === "MemberExpression" &&
          // `PrivateIdentifier` too: the old selector matched `this.#logger`,
          // since ESTree gives private names a `name` as well.
          (receiver.property.type === "Identifier" ||
            receiver.property.type === "PrivateIdentifier") &&
          receiver.property.name === "logger");
      if (!isLogger) {
        return;
      }
      for (const arg of node.arguments) {
        if (arg.type === "TemplateLiteral") {
          context.report({ node: arg, message: NO_TEMPLATE_LITERAL_MESSAGE });
        }
      }
    },
  }),
};

export const loggerPlugin: Plugin = {
  meta: { name: "logger" },
  rules: { "no-template-literal": noTemplateLiteral },
};

// oxlint loads `jsPlugins` entries through their default export.
// oxlint-disable-next-line import/no-default-export -- required by the oxlint JS plugin loader
export default loggerPlugin;
