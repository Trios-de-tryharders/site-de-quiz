import { Component, ElementRef, ViewChild, AfterViewInit, Input } from '@angular/core';
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

  private newCanvas!: string;
  private oldCanvas: string = '';

  constructor(private wsStore: WebSocketStoreService) { }

  ngOnInit() {
    this.wsStore.getWebSocket().addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        if (message.type === 'canvas') {
          console.log('Received canvas');
          this.displayCanvas(message.image);
        } else if (message.type === 'login') {
          this.displayCanvas(message.image);
        }
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
    if (!this.isDrawing && this.canDraw) return;
    const { offsetX, offsetY } = event;
    this.ctx.lineTo(offsetX, offsetY);
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
  }

  stopDrawing() {
    this.isDrawing = false;
    this.ctx.closePath();
    if (this.oldCanvas !== this.exportCanvas()) {
      this.newCanvas = this.exportCanvas();
      this.oldCanvas = this.newCanvas;
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

  sendCanvas() {
    console.log('Sending canvas');
    const canvasImage = this.exportCanvas(); // Récupère le base64 depuis le canvas
    const message = {
      type: 'canvas',
      image: canvasImage,
      game: this.gameId
    };

    this.wsStore.sendMessage((message)); // Envoie via WebSocket
  }
}
