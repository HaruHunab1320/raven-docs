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

// Section heights for resizable sidebar sections (in pixels, null means auto/flex)
export type SidebarSectionHeights = {
  personal: number | null;
  projects: number | null;
};

export const sidebarSectionHeightsAtom = atomWithWebStorage<SidebarSectionHeights>(
  'sidebarSectionHeights',
  { personal: null, projects: 150 }
);

export const agentChatDrawerAtom = atom<boolean>(false);

export interface AgentChatContext {
  spaceId?: string;
  pageId?: string;
  projectId?: string;
  contextLabel?: string;
  sessionId?: string;
}

export const agentChatContextAtom = atom(null as AgentChatContext | null);
