export enum AppState {
  HOME,
  IDLE,
  GENERATE_PROMPT,
  TOOL_SELECTION,
  EDITING,
  EXPANDING,
  LOADING,
  RESULT,
}

export type Tool = 'magicFill' | 'insert' | 'expand';