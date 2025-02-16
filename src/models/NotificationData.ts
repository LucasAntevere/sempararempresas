import { NotificationAction } from "./NotificationAction.js";

export class NotificationData {
  tag?: string;
  group?: string;
  image?: string;
  progress: number = 0;
  progress_max: number = 100;
  actions: NotificationAction[] = [];
  priority: string = "high";
  ttl: number = 0;
}