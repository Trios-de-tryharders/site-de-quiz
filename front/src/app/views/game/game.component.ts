import { Component } from '@angular/core';
import { ActivatedRoute, Route, Router } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { WebSocketStoreService } from '../../services/websocket-store.service';
import { DrawingCanvasComponent } from '../../components/drawing-canvas/drawing-canvas.component';
import { ChatComponent } from '../../components/chat/chat.component';
import { FormsModule } from '@angular/forms';

enum GameState {
  Waiting = 'waiting',
  Playing = 'playing',
  ChooseWord = 'chooseWord',
  Ended = 'ended',
  Timeout = 'timeout'
}

@Component({
  selector: 'app-game',
  imports: [DrawingCanvasComponent, ChatComponent, FormsModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss'
})
export class GameComponent {
  // --------------------------------------
  // Propriétés
  // --------------------------------------
  error = '';
  inputUsername = '';
  username = '';
  gameId!: string;

  // États du jeu
  state: string = GameState.Waiting;
  canDraw: boolean = false;
  logging: boolean = false;
  connected: boolean = false;
  joining: boolean = false;

  // Joueurs et scores
  owner: string = '';
  players: { username: string; score: number }[] = [];
  drawer: string = '';
  drawOrder: string[] = [];

  // Informations de la partie
  word: string = '';
  words: string[] = [];
  time!: number;
  round: number = 0;
  maxRound!: number;
  roundWinners: string[] = [];
  winner!: { username: string; score: number };

  // Messages
  messages: { username: string; message: string }[] = [];

  constructor(private cookieService: CookieService, private route: Router, private activatedRoute: ActivatedRoute, private wsStore: WebSocketStoreService) {
    this.username = this.cookieService.get('username') ?? '';
    if(!this.username) {
      this.error = 'Please enter a valid username';
    }
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
    this.wsStore.connect('ws://back-sockets-production.up.railway.app:8081');
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
          if (this.username) {
            this.wsStore.sendMessage({ type: 'connect', username: this.username });
          }
        }
    }
  }

  private handleWebSocketMessage(message: any): void {
    const handlers: { [key: string]: () => void } = {
      gameUpdated: () => this.handleUpdateGame(message),
      getSketchGame: () => this.handleGetSketchGame(message),
      login: () => this.handleLogin(message),
      playerJoined: () => {
        this.handleUpdateGame(message);
        this.playSound('audio/join.wav');
      },
      playerLeft: () => {
        this.handleUpdateGame(message);
        this.playSound('audio/leave.wav');
      },
      startDrawing: () => {
        this.handleUpdateGame(message, false);
      },
      wordChosen: () => {
        this.handleWordChosen(message);
      },
      timerUpdate: () => this.handleTimerUpdate(message),
      nextDrawer: () => {
        this.handleUpdateGame(message, false);
        if (message.time <= 10) {
          this.playSound('audio/clock.wav');
        }
      },
      gameEnded: () => {
        this.handleUpdateGame(message, false);
        this.playSound('audio/win.wav');
      },
      foundWord: () => {
        this.handleFoundWord(message);
        this.playSound('audio/foundWord.wav');
      },
      guess: () => this.handleUpdateGame(message),
      revealWord: () => {
        this.handleFoundWord(message);
        if (!message.roundWinners.find((p: { username: string }) => p.username === this.username)) {
          this.playSound('audio/error.wav');
        }
      },
    };

    if (handlers[message.type]) {
      handlers[message.type]();
    }
  }

  private requestGameData(): void {
    this.wsStore.sendMessage({ type: 'getSketchGame', game: this.gameId });
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
      } else if (this.logging) {
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

  handleUpdateGame(message: any, forceCanDraw?: boolean): void {
    const { state, players, owner, round, maxRound, roundWinners, time, drawer, drawOrder, words } = message;

    this.state = state;
    this.players = players ?? [];
    this.owner = owner;
    this.round = round;
    this.maxRound = maxRound;
    this.roundWinners = roundWinners ?? [];
    this.time = time;
    this.drawer = drawer;
    this.drawOrder = drawOrder ?? this.drawOrder;

    if (state === GameState.ChooseWord && this.drawer === this.username) {
      this.words = words ?? [];
      this.canDraw = false;
    } else if (state === GameState.Timeout) {
      this.canDraw = false;
    } else if (state === GameState.Ended) {
      this.winner = message.winner;
    }

    if (forceCanDraw) this.canDraw = forceCanDraw;
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

    if (message.state === 'playing') {
      this.word = message.word;
    }

    if (message.time === 0) {
      this.canDraw = false;
    }

    if (message.state === 'timeout') {
      this.handleUpdateGame(message, false);
    }
  }


  launchGame() {
    this.wsStore.sendMessage({ type: 'launchSketchGame', game: this.gameId });
  }

  chooseWord(word: string) {
    this.word = word;
    this.wsStore.sendMessage({ type: 'chooseWord', game: this.gameId, value: word });
  }

  handleFoundWord(message: any) {
    this.roundWinners = message.roundWinners;
    this.word = message.word;
    console.log('word:', message.word);
    this.playSound('audio/foundWord.mp3');
  }

  playSound(soundFilePath: string): void {
    const audio = new Audio(soundFilePath);
    audio.play().catch(error => console.error('Error playing sound:', error));
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
    } else if (this.state === 'timeout') {
      return 'Timeout';
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
    } else if (this.state === 'timeout') {
      return 'Time is up!';
    } else {
      return '';
    }
  }
}
