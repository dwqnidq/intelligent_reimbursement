import { create } from "zustand";
import type {
  TypeFieldPayload,
  ExportFieldPayload,
} from "../api/reimbursementType";

export interface AIReimbursementTypeDraft {
  code: string;
  label: string;
  formula?: string;
  over_limit_threshold?: number;
  fields: TypeFieldPayload[];
  export_fields: ExportFieldPayload[];
}

interface AIStore {
  reimbursementTypeDraft: AIReimbursementTypeDraft | null;
  setReimbursementTypeDraft: (draft: AIReimbursementTypeDraft) => void;
  clearReimbursementTypeDraft: () => void;
}

export const useAIStore = create<AIStore>((set) => ({
  reimbursementTypeDraft: null,
  setReimbursementTypeDraft: (draft) => set({ reimbursementTypeDraft: draft }),
  clearReimbursementTypeDraft: () => set({ reimbursementTypeDraft: null }),
}));
