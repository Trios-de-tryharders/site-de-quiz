import { Component } from '@angular/core';
import { ActivatedRoute, Route, Router } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { WebSocketStoreService } from '../../services/websocket-store.service';
import { DrawingCanvasComponent } from '../../components/drawing-canvas/drawing-canvas.component';
import { ChatComponent } from '../../components/chat/chat.component';

@Component({
  selector: 'app-game',
  imports: [DrawingCanvasComponent, ChatComponent],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss'
})
export class GameComponent {

  username = '';
  players: string[] = [];
  state: string = 'waiting';
  drawer: string = '';
  drawOrder: string[] = [];
  word: string = '';
  time!: number;
  roundWinners: string[] = [];
  round: number = 0;
  maxRound!: number;
  messages: {username: string, message: string}[] = [];

  gameId!: string;
  canDraw: boolean = false;

  constructor(private cookieService: CookieService, private route: Router, private activatedRoute: ActivatedRoute, private wsStore: WebSocketStoreService) {
    this.username = this.cookieService.get('username');
    this.activatedRoute.params.subscribe(params => {
        this.gameId = params['id'];
        console.log('ID de la route :', this.gameId);
    });
  }

  private handleWebSocketMessage(message: any): void {
    const handlers: { [key: string]: () => void } = {
      gameUpdated: () => this.handleUpdateGame(message),
      getSketchGame: () => this.handleGetSketchGame(message),
      playerJoined: () => this.handleUpdateGame(message),
    };

    if (handlers[message.type]) {
      handlers[message.type]();
    }
  }

  ngOnInit() {
    if (this.wsStore.getWebSocket()) {
      this.wsStore.sendMessage({type: 'getSketchGame', game: this.gameId})
      console.log('ReadyState', this.wsStore.getWebSocket().readyState === WebSocket.OPEN)
      this.wsStore.getWebSocket().addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (e) {
          console.error('Invalid JSON format:', event.data);
        }
      });
    } else {
      this.wsStore.connect('ws://localhost:8081');
      this.wsStore.getWebSocket().onopen = () => {
        this.wsStore.sendMessage({ type: 'getSketchGame', game: this.gameId });
        this.wsStore.getWebSocket().addEventListener('message', (event) => {
          try {
          const message = JSON.parse(event.data);

          this.handleWebSocketMessage(message);
        } catch (e) {
          console.error('Invalid JSON format:', event.data);
        }
        });
      }
    }
  }


  handleGetSketchGame(message: any) {
    if (message.state === 'notFound') {
      this.route.navigate(['/']);
    } else {
      if (message.players.includes(this.username)) {
        this.handleUpdateGame(message);
      }
      else {
        this.wsStore.sendMessage({ type: 'connect', username: this.username, game: this.gameId });
        this.wsStore.sendMessage({ type: 'joinSketchGame', username: this.username, game: this.gameId });
      }
      
    }
    
  }

  handleUpdateGame(message: any) {
    if (message.state === 'waiting') {
      this.players = message.players;
      this.state = message.state;
      this.canDraw = true;
    } else if (message.state === 'playing' || message.state === 'chooseWord') {
      this.players = message.players;
      this.state = message.state;
      this.drawer = message.drawer;
      this.drawOrder = message.drawOrder;
      this.word = message.word;
      this.time = message.time;
      this.roundWinners = message.roundWinners;
      this.round = message.round;
      this.maxRound = message.maxRound;
      this.canDraw = this.drawer === this.username;
    } else if (message.state === 'ended') {
      this.players = message.players;
      this.state = message.state;
      this.roundWinners = message.roundWinners;
      this.round = message.round;
      this.players = message.players;
    }
  }

  lauchGame() {
    this.wsStore.sendMessage({ type: 'launchSketchGame', game: this.gameId });
  }
}
