export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  forAllServers: boolean;
  intervalHours: number;
  autoRepeat: boolean;
  lastAutoSentAt: number;
  skipWhenNoPlayers: boolean;
}

export interface AnnouncementsState {
  version?: number;
  items: AnnouncementItem[];
  selectedId: string | null;
}

export interface AnnouncementsLoadResponse {
  ok?: boolean;
  data?: unknown;
  missing?: boolean;
  error?: string;
}
