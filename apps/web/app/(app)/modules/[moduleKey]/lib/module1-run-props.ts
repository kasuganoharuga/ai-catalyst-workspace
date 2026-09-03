import type { Module1RunProps } from "../types";

type SharedModule1RunProps = Pick<
  Module1RunProps,
  | "moduleKey"
  | "moduleIndex"
  | "provider"
  | "connected"
  | "artifacts"
  | "prepDocuments"
  | "startPrompt"
  | "nextModuleTitle"
>;

type VariableModule1RunProps = Omit<
  Module1RunProps,
  keyof SharedModule1RunProps
>;

/**
 * Module1Run is invoked twice — once with real run data, once with the
 * "not-started" read-only preview — and the two calls share half their
 * props verbatim. This just merges the shared half with whichever half
 * actually varies, so neither call site repeats the other's fields.
 */
export function module1RunProps(
  shared: SharedModule1RunProps,
  variable: VariableModule1RunProps,
): Module1RunProps {
  return { ...shared, ...variable };
}
