import { NgClass } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, Renderer2, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatType } from '../../../models/chatType';
import { ChatMessage } from '../../../models/chatMessage.model';
import { getMessageClasses } from '../../utils/classes';
import { DrawingCanvasComponent } from '../drawing-canvas/drawing-canvas.component';
import { WebSocketStoreService } from '../../services/websocket-store.service';
import { CookieService } from 'ngx-cookie-service';


@Component({
  selector: 'app-chat',
  standalone: true,
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  imports: [NgClass, FormsModule, DrawingCanvasComponent],
})
export class ChatComponent implements OnInit {
  @Input() gameId!: string;
  @Input() players!: string[];

  username: string = '';
  messages: {username: string, value: string, sender: string}[] = [];
  writtingUsers: string[] = []
  getMessageClasses = getMessageClasses;

  newMessage: string = '';

  @ViewChild('chatMessages') chatMessages!: ElementRef;

  constructor(private elementRef: ElementRef, private wsStore: WebSocketStoreService, private cookieService: CookieService) {
    if (this.cookieService.get('username')) {
      this.username = this.cookieService.get('username');
    }
  }

  ngOnInit(): void {
    this.wsStore.getWebSocket().addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('message:', message);
        if (message.type === 'message') {
          this.writtingUsers = message.writtingUsers;
          this.addMessage(message);
        } else if (message.type === 'writting') {
          this.writtingUsers = message.writtingUsers
        }
      } catch (e) {
        console.error('Invalid JSON format:', event.data);
      }
    });
  }


  onInput(): void {
    if (this.newMessage.trim()) {
      this.wsStore.sendMessage({ value: true, type: 'writting', game: this.gameId }
      );
    }
  }

  addMessage(message: any) {
    this.messages.push({username: message.username, value: message.value, sender: message.username === this.username ? 'self' : message.sender});

    if (this.writtingUsers.includes(message.username)) {
      this.writtingUsers = this.writtingUsers.filter(user => user !== message.username);
    }

    setTimeout(() => {
      this.chatMessages.nativeElement.scrollTop = this.chatMessages.nativeElement.scrollHeight;
    }, 10);
  }

  sendMessage(){
    if (this.newMessage.trim()) {
      this.wsStore.sendMessage({ value: this.newMessage, type: 'guess', game: this.gameId });
      this.newMessage = '';
    }
  }
}
