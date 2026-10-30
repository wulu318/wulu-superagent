export const CommunityKind = {
  Skill: 'skill',
  Connector: 'connector',
  Expert: 'expert',
} as const;
export type CommunityKind = typeof CommunityKind[keyof typeof CommunityKind];
export const CommunityTransport = { Stdio: 'stdio', Http: 'http', Sse: 'sse' } as const;

export const CommunityStatus = {
  Pending: 'pending', Approved: 'approved', Rejected: 'rejected', Withdrawn: 'withdrawn',
} as const;
export type CommunityStatus = typeof CommunityStatus[keyof typeof CommunityStatus];

export const CommunityIpc = {
  Request: 'community:request',
  Upload: 'community:upload',
  Sources: 'community:sources',
} as const;

export const CommunityAction = {
  List: 'list', Submit: 'submit', Update: 'update', Withdraw: 'withdraw', History: 'history',
} as const;
export type CommunityAction = typeof CommunityAction[keyof typeof CommunityAction];

export interface CommunityPayload {
  name: string;
  description: string;
  version: string;
  license: string;
  tags: string[];
  connector?: {
    transportType: typeof CommunityTransport[keyof typeof CommunityTransport];
    command?: string;
    defaultArgs?: string[];
    url?: string;
    requiredEnvKeys: string[];
    category?: string;
  };
  skills?: Array<{ id: string; name: string; description?: string }>;
}

export interface CommunitySubmission {
  id: string;
  kind: CommunityKind;
  payload: CommunityPayload;
  upload_id: string | null;
  revision: number;
  status: CommunityStatus;
  published: boolean;
  review_note: string;
}

export interface CommunityReview {
  revision: number;
  decision: string;
  note: string;
  created_at: number;
}

export interface CommunityRequest {
  action: CommunityAction;
  id?: string;
  body?: CommunityPayload & { kind: CommunityKind; revision?: number; uploadId?: string };
}

export interface CommunityResponse {
  success: boolean;
  status?: number;
  data?: { items?: CommunitySubmission[]; reviews?: CommunityReview[]; id?: string; revision?: number };
  error?: string;
}

export interface CommunityUploadResult {
  success: boolean;
  status?: number;
  id?: string;
  name?: string;
  size?: number;
  error?: string;
}

export interface CommunitySource {
  id: string;
  bundleId?: string;
  name: string;
  description: string;
  version: string;
  connector?: CommunityPayload['connector'];
}
