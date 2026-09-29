// The only module that imports generated Lexicon code (§0.3). Renaming the
// namespace = move lexicons/com/example/cooklog, update the `id`s, run
// `pnpm lex:build`, then fix the import paths below. Nothing else imports
// from lib/lexicons-gen.
export * as cook from "./lexicons-gen/com/example/cooklog/cook";
export * as kudos from "./lexicons-gen/com/example/cooklog/kudos";
export * as comment from "./lexicons-gen/com/example/cooklog/comment";
export * as follow from "./lexicons-gen/com/example/cooklog/follow";
export * as strongRef from "./lexicons-gen/com/atproto/repo/strongRef";
