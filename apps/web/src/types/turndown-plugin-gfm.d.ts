// Ambient types for `turndown-plugin-gfm` (the package ships no bundled or @types/ typings).
// Each export is a turndown Plugin: a function that mutates a TurndownService instance.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  type Plugin = TurndownService.Plugin

  export const gfm: Plugin
  export const highlightedCodeBlock: Plugin
  export const strikethrough: Plugin
  export const tables: Plugin
  export const taskListItems: Plugin
}
