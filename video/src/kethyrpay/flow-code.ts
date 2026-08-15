// Bridge between the plain-string code (code.ts) and the first-generation
// CodeWindow (shared/code-window.tsx, which takes Line[] token tuples).
// The shared tokenizer does the coloring, so snippets stay plain strings.

import type { Line, TokenKind } from "../shared/code";
import { tokenizeLine } from "../shared/highlight";
import { FLOW_CODE } from "./code";

// shared/highlight's token type → shared/code's TokenKind palette. Plain text
// keeps an undefined kind so colorOf falls back to the default ink.
const KIND: Partial<Record<string, TokenKind>> = {
  comment: "cm",
  func: "fn",
  keyword: "kw",
  number: "no",
  property: "at",
  punct: "br",
  string: "str",
  type: "tg",
};

const toLine = (source: string): Line =>
  tokenizeLine(source).map((tok) => [
    tok.text,
    KIND[tok.type],
  ] as const);

export const tokenizeLines = (): Line[] => FLOW_CODE.split("\n").map(toLine);
