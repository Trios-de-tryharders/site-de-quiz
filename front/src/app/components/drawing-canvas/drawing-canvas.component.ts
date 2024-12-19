import { Component, ElementRef, ViewChild, AfterViewInit, Input, Renderer2 } from '@angular/core';
import { WebSocketStoreService } from '../../services/websocket-store.service';

@Component({
  standalone: true,
  selector: 'app-drawing-canvas',
  templateUrl: './drawing-canvas.component.html',
  styleUrls: ['./drawing-canvas.component.scss']
})
export class DrawingCanvasComponent implements AfterViewInit {
  @ViewChild('drawingCanvas') drawingCanvas!: ElementRef<HTMLCanvasElement>;

  @Input() gameId!: string;
  @Input() canDraw!: boolean;
  @Input() isDrawer!: boolean;

  private ctx!: CanvasRenderingContext2D;
  private isDrawing: boolean = false;

  private newCanvas: string = '';
  private oldCanvas: string[] = [];

  gameState: string = '';
  private timeoutId: any = null;

  private keyDownListener: () => void;

  constructor(private wsStore: WebSocketStoreService, private render: Renderer2) { 
    this.keyDownListener = this.render.listen('document', 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'u') {
        console.log('Old canvas:', this.oldCanvas);
        this.newCanvas = this.oldCanvas.pop() ?? '';
        if (this.newCanvas === '') {
          this.resetCanvas();
        } else {
          this.sendCanvas(this.newCanvas);
        }
      }
    });
  }

  ngOnInit() {
    this.wsStore.getWebSocket().addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'canvas') {
          this.displayCanvas(message.image);
        } else if (message.type === 'login') {
          this.displayCanvas(message.image);
        }
        this.gameState = message.state;
      } catch (e) {
        console.error('Invalid JSON format:', event.data);
      }
    });
  }

  ngAfterViewInit() {
    const canvas = this.drawingCanvas.nativeElement;
    this.ctx = canvas.getContext('2d')!;

    // Écoute des événements
    canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    canvas.addEventListener('mousemove', this.draw.bind(this));
    canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
  }

  startDrawing(event: MouseEvent) {
    this.isDrawing = true;
    const { offsetX, offsetY } = event;
    this.ctx.beginPath();
    this.ctx.moveTo(offsetX, offsetY);
  }

  draw(event: MouseEvent) {
    console.log(this.isDrawing, this.canDraw, this.isDrawer)
    if (!this.isDrawing || !this.canDraw) return;
    const { offsetX, offsetY } = event;
    this.ctx.lineTo(offsetX, offsetY);
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();

    if (this.oldCanvas.includes(this.exportCanvas()) && this.gameState === 'playing') {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId); // Annule le timeout précédent
      }
      this.timeoutId = setTimeout(() => {
        this.sendCanvas();
      }, 100);
    }
  }

  stopDrawing() {
    this.isDrawing = false;
    this.ctx.closePath();
    if (!this.oldCanvas.includes(this.exportCanvas()) && this.canDraw) {
      this.oldCanvas.push(this.newCanvas);
      this.newCanvas = this.exportCanvas();
      if (this.oldCanvas.length > 10) {
        this.oldCanvas.shift();
      }
      this.sendCanvas();
    }
  }

  exportCanvas(): string {
    const canvas = this.drawingCanvas.nativeElement;
    return canvas.toDataURL('image/png'); // Convertit le canvas en image base64
  }

  displayCanvas(base64Image: string) {
    const canvas = this.drawingCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();

    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height); // Efface le canvas
      ctx.drawImage(img, 0, 0); // Dessine l'image reçue
    };

    img.src = base64Image;
  }

  resetCanvas() {
    const canvas = this.drawingCanvas.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height); // Efface tout le contenu du canvas
    this.newCanvas = '';
    this.oldCanvas = []; // Réinitialise également l'historique des dessins
    console.log('Canvas reset');

    // Envoyer un canvas vide aux autres joueurs
    const emptyCanvas = canvas.toDataURL('image/png');
    this.sendCanvas(emptyCanvas);
  }


  sendCanvas(canvas?: string) {
    console.log('Sending canvas', canvas);
    let canvasImage = ''; 
    if (canvas !== undefined) {
      console.log('Sending old canvas');
      canvasImage = canvas;
    }
    else {
      console.log('Sending new canvas');
      canvasImage = this.exportCanvas(); // Récupère le base64 depuis le canvas
    }
    const message = {
      type: 'canvas',
      image: canvasImage,
      game: this.gameId
    };

    this.wsStore.sendMessage((message)); // Envoie via WebSocket
  }
}
