import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root' // Le service est accessible dans toute l'application
})
export class WebSocketStoreService {
  private webSocket!: WebSocket;

  // Initialise le WebSocket
  public connect(url: string): void {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      this.webSocket = new WebSocket(url);

      this.webSocket.onopen = () => console.log('WebSocket connected!');
      this.webSocket.onclose = () => console.log('WebSocket disconnected!');
      this.webSocket.onerror = (err) => console.error('WebSocket error:', err);
      this.webSocket.onmessage = (event) => console.log('Message received:', event.data);
    }
  }

  // Récupère l'instance WebSocket
  public getWebSocket(): WebSocket {
    return this.webSocket;
  }

  // Envoie un message via WebSocket
  public sendMessage(message: any): void {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open. Cannot send message.');
    }
  }

  // Ferme la connexion WebSocket
  public disconnect(): void {
    if (this.webSocket) {
      this.webSocket.close();
    }
  }
}
