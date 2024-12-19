import { NgClass } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatComponent } from '../../components/chat/chat.component';
import { CookieService } from 'ngx-cookie-service';
import { Router } from '@angular/router';
import { WebSocketStoreService } from '../../services/websocket-store.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule, NgClass, ChatComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  username = '';
  gameId = '';
  error = '';
  connected: boolean = false;
  users: string[] = [];


  constructor(private cookieService: CookieService, private router: Router, private wsStore: WebSocketStoreService) {
    if (this.cookieService.get('username')) {
      this.username = this.cookieService.get('username');
    }
  }

  ngOnInit() {
    this.wsStore.connect('ws://' + window.location.hostname + ':8081');

    this.wsStore.getWebSocket().addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'gameStarted') {
          this.users = message.players;
        } else if (message.type === 'gameCreated') {
          this.router.navigate([`${message.gameId}`]);
        }
      } catch (e) {
        console.error('Invalid JSON format:', event.data);
      }
    });
  }

  createGame() {
    if (!this.username || /^\s*$/.test(this.username)) {
      this.error = 'Please enter a valid username';
      return;
    }
    this.wsStore.sendMessage({ type: 'connect', username: this.username });

    this.wsStore.sendMessage({ type: 'createSketchGame', username: this.username });
  }

  connectToGame() {
    if (!this.username || /^\s*$/.test(this.username)) {
      this.error = 'Please enter a valid username';
      return;
    }
    if (!this.gameId || /^\s*$/.test(this.gameId)) {
      this.error = 'Please enter a valid game id';
      return;
    }
    if (this.gameId.length < 4) {
      this.error = 'Game id must be 4 characters long';
      return;
    }
    this.cookieService.set('username', this.username);
    this.wsStore.sendMessage({ type: 'connect', username: this.username, game: this.gameId });
    this.wsStore.sendMessage({ type: 'joinSketchGame', username: this.username, game: this.gameId });
    this.router.navigate([`${this.gameId}`]);
  }
}
