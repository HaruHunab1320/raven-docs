import { atomWithStorage } from "jotai/utils";

import { ICurrentUser, IUser } from "@/features/user/types/user.types";
import { IWorkspace } from "@/features/workspace/types/workspace.types";
import { atom } from "jotai";

export const currentUserAtom = atomWithStorage<ICurrentUser | null>(
  "currentUser",
  null,
);

export const userAtom = atom(
  (get) => get(currentUserAtom)?.user ?? null,
  (get, set, newUser: IUser) => {
    const current = get(currentUserAtom);
    if (current) {
      set(currentUserAtom, { ...current, user: newUser });
    }
  }
);
export const workspaceAtom = atom(
  (get) => get(currentUserAtom)?.workspace ?? null,
  (get, set, newWorkspace: IWorkspace) => {
    const current = get(currentUserAtom);
    if (current) {
      set(currentUserAtom, { ...current, workspace: newWorkspace });
    }
  }
);
