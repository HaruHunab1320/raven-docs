import { atomWithWebStorage } from "@/lib/jotai-helper.ts";
import { atom } from "jotai";

export const mobileSidebarAtom = atom<boolean>(false);

export const desktopSidebarAtom = atomWithWebStorage<boolean>(
  "showSidebar",
  true,
);

export const desktopAsideAtom = atom<boolean>(false);

type AsideStateType = {
  tab: string;
  isAsideOpen: boolean;
};

export const asideStateAtom = atom<AsideStateType>({
  tab: "",
  isAsideOpen: false,
});

export const sidebarWidthAtom = atomWithWebStorage<number>('sidebarWidth', 300);

export const agentChatDrawerAtom = atom<boolean>(false);

export type AgentChatContext = {
  spaceId?: string;
  pageId?: string;
  projectId?: string;
  contextLabel?: string;
  sessionId?: string;
} | null;

export const agentChatContextAtom = atom<AgentChatContext>(null);
