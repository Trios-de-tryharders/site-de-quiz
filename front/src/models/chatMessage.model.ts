import { ChatType } from "./chatType";
import { SenderType } from "./senderType";

export interface ChatMessage {
  value: string;
  username?: string;
  type: ChatType;
  sender: SenderType;
}