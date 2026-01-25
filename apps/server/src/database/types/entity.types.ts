import { Insertable, Selectable, Updateable } from 'kysely';
import {
  Attachments,
  Comments,
  Groups,
  Pages,
  Projects,
  ProjectViews,
  Spaces,
  TaskDependencies,
  TaskLabelAssignments,
  TaskLabels,
  Tasks,
  TaskWatchers,
  Users,
  Workspaces,
  PageHistory as History,
  GroupUsers,
  SpaceMembers,
  WorkspaceInvitations,
  UserTokens,
  Backlinks,
  TaskBacklinks,
  Billing as BillingSubscription,
  AuthProviders,
  AuthAccounts,
  McpApiKeys,
} from './db';

// Workspace
export type Workspace = Selectable<Workspaces>;
export type InsertableWorkspace = Insertable<Workspaces>;
export type UpdatableWorkspace = Updateable<Omit<Workspaces, 'id'>>;

// WorkspaceInvitation
export type WorkspaceInvitation = Selectable<WorkspaceInvitations>;
export type InsertableWorkspaceInvitation = Insertable<WorkspaceInvitations>;
export type UpdatableWorkspaceInvitation = Updateable<
  Omit<WorkspaceInvitations, 'id'>
>;

// User
export type User = Selectable<Users>;
export type InsertableUser = Insertable<Users>;
export type UpdatableUser = Updateable<Omit<Users, 'id'>>;

// Space
export type Space = Selectable<Spaces>;
export type InsertableSpace = Insertable<Spaces>;
export type UpdatableSpace = Updateable<Omit<Spaces, 'id'>>;

// SpaceMember
export type SpaceMember = Selectable<SpaceMembers>;
export type InsertableSpaceMember = Insertable<SpaceMembers>;
export type UpdatableSpaceMember = Updateable<Omit<SpaceMembers, 'id'>>;

// Group
export type ExtendedGroup = Groups & { memberCount: number };

export type Group = Selectable<Groups>;
export type InsertableGroup = Insertable<Groups>;
export type UpdatableGroup = Updateable<Omit<Groups, 'id'>>;

// GroupUser
export type GroupUser = Selectable<GroupUsers>;
export type InsertableGroupUser = Insertable<GroupUsers>;
export type UpdatableGroupUser = Updateable<Omit<GroupUsers, 'id'>>;

// Page
export type Page = Selectable<Pages>;
export type InsertablePage = Insertable<Pages>;
export type UpdatablePage = Updateable<Omit<Pages, 'id'>>;

// PageHistory
export type PageHistory = Selectable<History>;
export type InsertablePageHistory = Insertable<History>;
export type UpdatablePageHistory = Updateable<Omit<History, 'id'>>;

// Comment
export type Comment = Selectable<Comments>;
export type InsertableComment = Insertable<Comments>;
export type UpdatableComment = Updateable<Omit<Comments, 'id'>>;

// Attachment
export type Attachment = Selectable<Attachments>;
export type InsertableAttachment = Insertable<Attachments>;
export type UpdatableAttachment = Updateable<Omit<Attachments, 'id'>>;

// User Token
export type UserToken = Selectable<UserTokens>;
export type InsertableUserToken = Insertable<UserTokens>;
export type UpdatableUserToken = Updateable<Omit<UserTokens, 'id'>>;

// Backlink
export type Backlink = Selectable<Backlinks>;
export type InsertableBacklink = Insertable<Backlink>;
export type UpdatableBacklink = Updateable<Omit<Backlink, 'id'>>;

// Task Backlink
export type TaskBacklink = Selectable<TaskBacklinks>;
export type InsertableTaskBacklink = Insertable<TaskBacklink>;
export type UpdatableTaskBacklink = Updateable<Omit<TaskBacklink, 'id'>>;

// Billing
export type Billing = Selectable<BillingSubscription>;
export type InsertableBilling = Insertable<BillingSubscription>;
export type UpdatableBilling = Updateable<Omit<BillingSubscription, 'id'>>;

// Auth Provider
export type AuthProvider = Selectable<AuthProviders>;
export type InsertableAuthProvider = Insertable<AuthProviders>;
export type UpdatableAuthProvider = Updateable<Omit<AuthProviders, 'id'>>;

// Auth Account
export type AuthAccount = Selectable<AuthAccounts>;
export type InsertableAuthAccount = Insertable<AuthAccounts>;
export type UpdatableAuthAccount = Updateable<Omit<AuthAccounts, 'id'>>;

// MCP API Keys
export interface MCPApiKeys {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  hashedKey: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export type InsertableMCPApiKey = Insertable<MCPApiKeys>;
export type UpdateableMCPApiKey = Updateable<MCPApiKeys>;
export type MCPApiKey = Selectable<McpApiKeys>;

// Project
export type Project = Selectable<Projects>;
export type InsertableProject = Insertable<Projects>;
export type UpdatableProject = Updateable<Omit<Projects, 'id'>>;

// ProjectView
export type ProjectView = Selectable<ProjectViews>;
export type InsertableProjectView = Insertable<ProjectViews>;
export type UpdatableProjectView = Updateable<Omit<ProjectViews, 'id'>>;

// Task
export type Task = Selectable<Tasks>;
export type InsertableTask = Insertable<Tasks>;
export type UpdatableTask = Updateable<Omit<Tasks, 'id'>>;

// TaskDependency
export type TaskDependency = Selectable<TaskDependencies>;
export type InsertableTaskDependency = Insertable<TaskDependencies>;
export type UpdatableTaskDependency = Updateable<Omit<TaskDependencies, 'id'>>;

// TaskLabel
export type TaskLabel = Selectable<TaskLabels>;
export type InsertableTaskLabel = Insertable<TaskLabels>;
export type UpdatableTaskLabel = Updateable<Omit<TaskLabels, 'id'>>;

// TaskLabelAssignment
export type TaskLabelAssignment = Selectable<TaskLabelAssignments>;
export type InsertableTaskLabelAssignment = Insertable<TaskLabelAssignments>;
export type UpdatableTaskLabelAssignment = Updateable<
  Omit<TaskLabelAssignments, 'id'>
>;

// TaskWatcher
export type TaskWatcher = Selectable<TaskWatchers>;
export type InsertableTaskWatcher = Insertable<TaskWatchers>;
export type UpdatableTaskWatcher = Updateable<Omit<TaskWatchers, 'id'>>;

// Parallax Agent types are defined in the repo files
// Re-exported here for convenience
export type {
  ParallaxAgent,
  InsertableParallaxAgent,
  UpdateableParallaxAgent,
  ParallaxAgentStatus,
} from '../repos/parallax-agent/parallax-agent.repo';

export type {
  ParallaxAgentAssignment,
  InsertableAgentAssignment,
  AssignmentType,
  AgentRole,
} from '../repos/parallax-agent/parallax-agent-assignment.repo';

export type {
  ParallaxAgentActivity,
  InsertableAgentActivity,
  ParallaxAgentActivityDaily,
} from '../repos/parallax-agent/parallax-agent-activity.repo';
