import http from "./http";

export type NotificationItem = {
  _id: string;
  type: "approval_pending" | "approval_skipped" | "approval_result" | string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  read: boolean;
  createdAt?: string;
};

export const getMyNotifications = (unreadOnly = false) =>
  http.get<{ list: NotificationItem[]; unread: number }>(
    `/notifications/mine${unreadOnly ? "?unread_only=1" : ""}`,
  );

export const markNotificationRead = (id: string) =>
  http.patch<{ id: string; read: boolean }>(`/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  http.post<{ modified: number }>("/notifications/read-all");
