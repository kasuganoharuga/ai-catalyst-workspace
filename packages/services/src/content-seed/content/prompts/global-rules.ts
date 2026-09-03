export const GLOBAL_MARKDOWN_TABLE_INTEGRITY_RULE = `## Global Markdown table integrity

Before previewing or saving any Markdown that contains a table, validate every table. The header
column count, separator row column count, and every body row column count must all be equal. If any
table fails this check, repair it before preview or save; never preview or save a malformed table.`;

export const withGlobalMarkdownRules = (content: string): string =>
  `${content}\n\n${GLOBAL_MARKDOWN_TABLE_INTEGRITY_RULE}`;
