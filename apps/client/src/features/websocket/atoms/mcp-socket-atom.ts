import { atom } from "jotai";
import { Socket } from "socket.io-client";

export const mcpSocketAtom = atom<Socket | null>(null);
