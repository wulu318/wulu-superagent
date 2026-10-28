export const CommunityKind = {
  Skill: 'skill',
  Connector: 'connector',
  Expert: 'expert',
} as const;
export type CommunityKind = typeof CommunityKind[keyof typeof CommunityKind];
