export type IAuthProvider = {
  id?: string;
  type?: string;
  name?: string;
};

export interface IWorkspace {
  id: string;
  name: string;
  description: string;
  logo: string;
  hostname: string;
  defaultSpaceId: string;
  customDomain: string;
  enableInvite: boolean;
  settings: any;
  status: string;
  enforceSso: boolean;
  billingEmail: string;
  trialEndAt: Date;
  createdAt: Date;
  updatedAt: Date;
  emailDomains: string[];
  memberCount?: number;
  plan?: string;
  hasLicenseKey?: boolean;
}

export interface ICreateInvite {
  role: string;
  emails: string[];
  groupIds: string[];
}

export interface IInvitation {
  id: string;
  role: string;
  email: string;
  workspaceId: string;
  invitedById: string;
  createdAt: Date;
}

export interface IInvitationLink {
  inviteLink: string;
}

export interface IAcceptInvite {
  invitationId: string;
  name: string;
  password: string;
  token: string;
}

export interface IPublicWorkspace {
  id: string;
  name: string;
  logo: string;
  hostname: string;
  enforceSso: boolean;
  authProviders: IAuthProvider[];
  hasLicenseKey?: boolean;
}

export interface IVersion {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
}

export interface IWorkspaceIntegrations {
  repoTokens?: {
    githubToken?: boolean;
    gitlabToken?: boolean;
    bitbucketToken?: boolean;
  };
  slack?: {
    enabled?: boolean;
    configured?: boolean;
    teamId?: string | null;
    botTokenHint?: string | null;
    signingSecretHint?: string | null;
    defaultChannelId?: string | null;
    defaultUserId?: string | null;
  };
  discord?: {
    enabled?: boolean;
    configured?: boolean;
    guildId?: string | null;
    botTokenHint?: string | null;
    publicKeyHint?: string | null;
    defaultChannelId?: string | null;
    defaultUserId?: string | null;
  };
}

export interface IChannelMapping {
  slackChannelId: string;
  spaceId: string;
  spaceName?: string;
}
