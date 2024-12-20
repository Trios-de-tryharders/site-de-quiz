import { Socket } from "dgram";

export interface CustomWebSocket extends WebSocket {
  on(event: string, listener: (data: any) => void): this;
  id: string;
  username: string;
  _socket: Socket; // Ajout explicite de la propriété _socket
}

export interface PlayerWebSocket extends WebSocket {
  on(event: string, listener: (data: any) => void): this;
  id: string;
  username: string;
  score: number;
}