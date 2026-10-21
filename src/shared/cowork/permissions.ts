export const CoworkPermissionMode = {
  Ask: 'ask',
  Routine: 'routine',
  All: 'all',
} as const;

export type CoworkPermissionMode = typeof CoworkPermissionMode[keyof typeof CoworkPermissionMode];

export const normalizeCoworkPermissionMode = (value: unknown): CoworkPermissionMode => (
  value === CoworkPermissionMode.All || value === CoworkPermissionMode.Routine
    ? value : CoworkPermissionMode.Ask
);
