export interface TeamMessage {
  id: string;
  deploymentId: string;
  fromAgentId: string;
  fromRole: string;
  toAgentId: string;
  toRole: string;
  message: string;
  delivered: boolean;
  readByRecipient: boolean;
  createdAt: string;
  deliveredAt?: string;
}

export interface SendResult {
  messageId: string;
  delivered: boolean;
  agentSpawned: boolean;
  toAgentId: string;
  toRole: string;
}

export interface AgentInfo {
  agentId: string;
  role: string;
  instanceNumber: number;
  status: string;
  canMessage: boolean;
  reportsToAgentId?: string | null;
}
