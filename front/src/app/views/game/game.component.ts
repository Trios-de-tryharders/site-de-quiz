import { Component } from '@angular/core';
import { ActivatedRoute, Route, Router } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { WebSocketStoreService } from '../../services/websocket-store.service';
import { DrawingCanvasComponent } from '../../components/drawing-canvas/drawing-canvas.component';
import { ChatComponent } from '../../components/chat/chat.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-game',
  imports: [DrawingCanvasComponent, ChatComponent, FormsModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss'
})
export class GameComponent {
  error = '';
  inputUsername = '';

  owner: string = '';
  username = '';
  players: string[] = [];
  state: string = 'waiting';
  drawer: string = '';
  drawOrder: string[] = [];
  word: string = '';
  words: string[] = [];
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
    });
  }

  private handleWebSocketMessage(message: any): void {
    const handlers: { [key: string]: () => void } = {
      gameUpdated: () => this.handleUpdateGame(message),
      getSketchGame: () => this.handleGetSketchGame(message),
      playerJoined: () => this.handleUpdateGame(message),
      playerLeft: () => this.handleUpdateGame(message),
      startDrawing: () => this.handleUpdateGame(message, false),
      wordChosen: () => this.handleWordChosen(message),
      timerUpdate: () => this.handleTimerUpdate(message),
      nextDrawer: () => this.handleUpdateGame(message, false),
      gameEnded: () => this.handleUpdateGame(message, false),
    };

    if (handlers[message.type]) {
      handlers[message.type]();
    }
  }

  ngOnInit() {
    if (this.wsStore.getWebSocket()) {
      this.wsStore.sendMessage({type: 'getSketchGame', game: this.gameId})
      this.wsStore.getWebSocket().addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (e) {
          console.error('Invalid JSON format:', event.data);
        }
      });
    } else {
      this.wsStore.connect('ws://'+ window.location.hostname +':8081');
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

  handleUpdateGame(message: any, forceCanDraw?: boolean) {
    if (message.state === 'waiting') {
      this.owner = message.owner;
      this.players = message.players;
      this.state = message.state;
      this.canDraw = true;
    } else if (message.state === 'playing' || message.state === 'chooseWord') {
      this.owner = message.owner;
      this.players = message.players;
      this.state = message.state;
      this.drawer = message.drawer;
      this.drawOrder = message.drawOrder;
      this.time = message.time;
      this.roundWinners = message.roundWinners;
      this.round = message.round;
      this.maxRound = message.maxRound;
      if (message.state === 'chooseWord') {
        if ( this.drawer === this.username) {
          this.words = message.words;
        }
        this.canDraw = false;
        console.log('Choose Word')
      }
    } else if (message.state === 'ended') {
      this.owner = message.owner;
      this.players = message.players;
      this.state = message.state;
      this.roundWinners = message.roundWinners;
      this.round = message.round;
      this.players = message.players;
    }

    if (forceCanDraw) {
      this.canDraw = forceCanDraw;
    }
  }

  handleWordChosen(message: any) {
    if (message.username === this.username) {
      this.canDraw = true;
      this.words = [];
    } else {
      this.word = message.word;
      this.canDraw = false;
    }
    this.state = message.state;
  }

  handleTimerUpdate(message: any) {
    this.time = message.time;
    if (message.word && (this.username !== this.drawer || !message.roundWinners.includes(this.username))) {
      this.word = message.word;
    }

    if (message.time === 0) {
      this.canDraw = false;
    }
  }

  launchGame() {
    this.wsStore.sendMessage({ type: 'launchSketchGame', game: this.gameId });
  }

  chooseWord(word: string) {
    this.word = word;
    this.wsStore.sendMessage({ type: 'chooseWord', game: this.gameId, value: word });
  }

  connectToGame() {
    if (!this.inputUsername || /^\s*$/.test(this.inputUsername)) {
      this.error = 'Please enter a valid username';
      return;
    }
    this.cookieService.set('username', this.inputUsername);
    this.username = this.inputUsername;
    this.wsStore.sendMessage({ type: 'connect', username: this.inputUsername, game: this.gameId });
    this.wsStore.sendMessage({ type: 'joinSketchGame', username: this.inputUsername, game: this.gameId });
  }
}
