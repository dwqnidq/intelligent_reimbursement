import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  TypeFieldPayload,
  ExportFieldPayload,
} from "../api/reimbursementType";

export interface AIReimbursementTypeDraft {
  code: string;
  name: string;
  label: string;
  formula?: string;
  over_limit_threshold?: number;
  fields: TypeFieldPayload[];
  export_fields: ExportFieldPayload[];
}

export type AIChatMessageType =
  | "chat"
  | "reimbursement_type"
  | "invoice_recognition"
  | "reimbursement_extract"
  | "error";

export interface AIChatAttachment {
  name: string;
  size: number;
  kind: "image" | "pdf" | "other";
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: AIChatMessageType;
  data?: unknown;
  attachments?: AIChatAttachment[];
  createdAt: number;
  streaming?: boolean;
}

interface AIStore {
  reimbursementTypeDraft: AIReimbursementTypeDraft[] | null;
  chatHistories: Record<string, AIChatMessage[]>;
  setReimbursementTypeDraft: (
    draft: AIReimbursementTypeDraft | AIReimbursementTypeDraft[],
  ) => void;
  clearReimbursementTypeDraft: () => void;
  getChatMessages: (userId: string) => AIChatMessage[];
  setChatMessages: (userId: string, messages: AIChatMessage[]) => void;
  clearChatMessages: (userId: string) => void;
}

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      reimbursementTypeDraft: null,
      chatHistories: {},
      setReimbursementTypeDraft: (draft) =>
        set({
          reimbursementTypeDraft: Array.isArray(draft) ? draft : [draft],
        }),
      clearReimbursementTypeDraft: () => set({ reimbursementTypeDraft: null }),
      getChatMessages: (userId) => get().chatHistories[userId] ?? [],
      setChatMessages: (userId, messages) =>
        set((state) => ({
          chatHistories: { ...state.chatHistories, [userId]: messages },
        })),
      clearChatMessages: (userId) =>
        set((state) => {
          const next = { ...state.chatHistories };
          delete next[userId];
          return { chatHistories: next };
        }),
    }),
    {
      name: "ai-store",
      partialize: (state) => ({ chatHistories: state.chatHistories }),
    },
  ),
);
