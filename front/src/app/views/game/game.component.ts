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

  connected: boolean = false;
  owner: string = '';
  username = '';
  players: { username: string, score: number }[] = [];
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
  winner!: { username: string, score: number };

  logging: boolean = false;
  gameId!: string;
  canDraw: boolean = false;

  constructor(private cookieService: CookieService, private route: Router, private activatedRoute: ActivatedRoute, private wsStore: WebSocketStoreService) {
    this.username = this.cookieService.get('username') ?? '';
    this.activatedRoute.params.subscribe(params => {
        this.gameId = params['id'];
    });
    if (this.wsStore.getWebSocket()){
      this.wsStore.getWebSocket().addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (e) {
          console.error('Invalid JSON format:', event.data);
        }
      });
      this.wsStore.sendMessage({type: 'getSketchGame', game: this.gameId})
    } else {
        this.wsStore.connect('ws://'+ window.location.hostname +':8081');
        this.wsStore.getWebSocket().onopen = () => {
          this.wsStore.getWebSocket().addEventListener('message', (event) => {
            try {
              const message = JSON.parse(event.data);
              this.handleWebSocketMessage(message);
            } catch (e) {
              console.error('Invalid JSON format:', event.data);
            }
          });
          this.wsStore.sendMessage({type: 'getSketchGame', game: this.gameId})
        }
    }
  }

  private handleWebSocketMessage(message: any): void {
    const handlers: { [key: string]: () => void } = {
      gameUpdated: () => this.handleUpdateGame(message),
      getSketchGame: () => this.handleGetSketchGame(message),
      login: () => this.handleLogin(message),
      playerJoined: () => this.handleUpdateGame(message),
      playerLeft: () => this.handleUpdateGame(message),
      startDrawing: () => this.handleUpdateGame(message, false),
      wordChosen: () => this.handleWordChosen(message),
      timerUpdate: () => this.handleTimerUpdate(message),
      nextDrawer: () => this.handleUpdateGame(message, false),
      gameEnded: () => this.handleUpdateGame(message, false),
      foundWord: () => this.handleFoundWord(message),
      guess: () => this.handleUpdateGame(message),
    };

    if (handlers[message.type]) {
      handlers[message.type]();
    }
  }

  ngOnInit() {
    this.username = this.cookieService.get('username');
    if (!this.username) {
      this.promptForUsername();
    }
  }

  promptForUsername() {
    this.error = 'Please enter a valid username';
  }

  connectToWebSocket() {
      this.username = this.inputUsername
      this.wsStore.sendMessage({ type: 'connect', username: this.username });
  }

  handleGetSketchGame(message: any) {
    if (message.state === 'notFound') {
      this.route.navigate(['/']);
    } else if (this.username) {
      if (message.players.find((p: { username: string, score: number }) => p.username === this.username)) {
        this.connected = true;
        this.handleUpdateGame(message);
      } else  if (this.logging) {
        this.connected = true;
        this.logging = false;
        this.wsStore.sendMessage({ type: 'joinSketchGame', username: this.username, game: this.gameId });
      }
    }
  }

  handleLogin(message: any) {
    if (message.success) {
      this.logging = true;
      this.wsStore.sendMessage({type: 'getSketchGame', game: this.gameId})
    } else {
      this.error = 'Username already taken';
    }
  }

  handleUpdateGame(message: any, forceCanDraw?: boolean) {
    if (message.state === 'waiting') {
      this.owner = message.owner;
      this.players = message.players.map((p: { username: string, score: number }) => ({ ...p }));
      this.state = message.state;
      this.canDraw = true;
    } else if (message.state === 'playing' || message.state === 'chooseWord') {
      this.owner = message.owner;
      this.players = message.players.map((p: { username: string, score: number }) => ({ ...p }));
      this.state = message.state;
      this.drawer = message.drawer;
      this.drawOrder = message.drawOrder ?? this.drawOrder;
      this.time = message.time;
      this.roundWinners = message.roundWinners ?? this.roundWinners;
      this.round = message.round;
      this.maxRound = message.maxRound;
      if (message.state === 'chooseWord') {
        if ( this.drawer === this.username) {
          this.words = message.words ?? this.words;
        }
        this.canDraw = false;
      }
    } else if (message.state === 'ended') {
      this.owner = message.owner;
      this.players = message.players.map((p: { username: string, score: number }) => ({ ...p }));
      this.state = message.state;
      this.roundWinners = message.roundWinners ?? this.roundWinners;
      this.round = message.round;
      this.winner = message.winner;
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

    this.word = message.word;

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
    this.connectToWebSocket();
    this.wsStore.sendMessage({ type: 'connect', username: this.inputUsername, game: this.gameId });
    this.wsStore.sendMessage({ type: 'joinSketchGame', username: this.inputUsername, game: this.gameId });
  }

  handleFoundWord(message: any) {
    this.roundWinners = message.roundWinners;
    this.word = message.word;
  }

  getStateBadge() {
    if (this.state === 'waiting') {
      return 'Waiting';
    } else if (this.state === 'playing') {
      return 'Game in progress';
    } else if (this.state === 'chooseWord') {
      return 'Chose a word';
    } else if (this.state === 'ended') {
      return 'Game Ended';
    } else {
      return '';
    }
  }

  getStateText() {
      if (this.state === 'waiting') {
        return 'Waiting for players';
      } else if (this.state === 'playing') {
        return 'Playing';
      } else if (this.state === 'chooseWord') {
        return 'A player is choosing a word';
      } else if (this.state === 'ended') {
        return 'Game has ended and the winner is ' + this.winner.username;
    } else {
      return '';
    }
  }
}
