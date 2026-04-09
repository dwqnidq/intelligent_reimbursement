import http from "./http";

export interface OpinionItem {
  _id: string;
  uid: { _id: string; username: string; real_name: string };
  title: string;
  content: string;
  status: number;
  createdAt: string;
}

export const createOpinion = (data: { title: string; content: string }) =>
  http.post<OpinionItem>("/v1/opinions", data);

export const getOpinions = () => http.get<OpinionItem[]>("/v1/opinions");
export const getMyOpinions = () => http.get<OpinionItem[]>("/v1/opinions/mine");

export const updateOpinionStatus = (id: string, status: number) =>
  http.patch<OpinionItem>(`/v1/opinions/${id}/status`, { status });
