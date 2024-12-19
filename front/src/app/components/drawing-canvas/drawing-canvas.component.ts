import { Component, ElementRef, ViewChild, AfterViewInit, Input, Renderer2 } from '@angular/core';
import { WebSocketStoreService } from '../../services/websocket-store.service';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [FormsModule],
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
  fillMode: boolean = false;

  gameState: string = '';
  private timeoutId: any = null;

  private keyDownListener: () => void;

  penColor: string = '#000000'; 
  penSize: number = 2;          
  constructor(private wsStore: WebSocketStoreService, private render: Renderer2) { 
    this.keyDownListener = this.render.listen('document', 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'u' && this.canDraw) {
        this.undo();
      } else if (event.key === 'c' && this.canDraw) {
        this.resetCanvas();
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
    canvas.addEventListener('mousedown', (event) => {
    const { offsetX, offsetY } = event;

    if (event.button === 0 && this.fillMode) { // Left-click + Fill Mode
      this.floodFill(Math.floor(offsetX), Math.floor(offsetY), this.penColor);
      this.saveCanvasState();
      this.sendCanvas();
    } else {
      this.startDrawing(event);
    }
  });
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
    if (!this.isDrawing || !this.canDraw) return;
    const { offsetX, offsetY } = event;
    this.ctx.lineTo(offsetX, offsetY);
    this.ctx.strokeStyle = this.penColor; // Utilise la couleur sélectionnée
    this.ctx.lineWidth = this.penSize;    // Utilise la taille sélectionnée
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

    // Envoyer un canvas vide aux autres joueurs
    const emptyCanvas = canvas.toDataURL('image/png');
    this.sendCanvas(emptyCanvas);
  }


  sendCanvas(canvas?: string) {
    let canvasImage = ''; 
    if (canvas !== undefined) {
      canvasImage = canvas;
    }
    else {
      canvasImage = this.exportCanvas(); // Récupère le base64 depuis le canvas
    }
    const message = {
      type: 'canvas',
      image: canvasImage,
      game: this.gameId
    };

    this.wsStore.sendMessage((message)); // Envoie via WebSocket
  }

  undo(){
    this.newCanvas = this.oldCanvas.pop() ?? '';
    if (this.newCanvas === '') {
      this.resetCanvas();
    } else {
      this.sendCanvas(this.newCanvas);
    }
  }

  fillCanvas() {
    this.ctx.fillStyle = this.penColor;
    this.ctx.fillRect(0, 0, this.drawingCanvas.nativeElement.width, this.drawingCanvas.nativeElement.height);
    this.saveCanvasState();
    this.sendCanvas();
  }

  changePenSize() {
    console.log(`Pen size changed to: ${this.penSize}`);
  }

  changePenColor(event: Event) {
    const input = event.target as HTMLInputElement;
    this.penColor = input.value;
  }

  saveCanvasState() {
    this.oldCanvas.push(this.newCanvas);
    this.newCanvas = this.exportCanvas();
    if (this.oldCanvas.length > 10) this.oldCanvas.shift();
  }

  toggleFillMode() {
    this.fillMode = !this.fillMode;
  }

  // Récupère la couleur d'un pixel
  getPixelColor(pixels: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
    const index = (y * width + x) * 4;
    return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]; // [R, G, B, A]
  }

  // Définit la couleur d'un pixel
  setPixelColor(pixels: Uint8ClampedArray, width: number, x: number, y: number, color: [number, number, number, number]) {
    const index = (y * width + x) * 4;
    [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]] = color;
  }

  // Compare deux couleurs RGBA
  colorsMatch(color1: [number, number, number, number], color2: [number, number, number, number]): boolean {
    return color1[0] === color2[0] && color1[1] === color2[1] && color1[2] === color2[2] && color1[3] === color2[3];
  }

  // Convertit un hexadécimal en RGBA
  hexToRgba(hex: string): [number, number, number, number] {
    const bigint = parseInt(hex.slice(1), 16);
    return [
      (bigint >> 16) & 255, // R
      (bigint >> 8) & 255,  // G
      bigint & 255,         // B
      255                   // A (opaque)
    ];
  }


  floodFill(x: number, y: number, fillColor: string) {
    const canvas = this.drawingCanvas.nativeElement;
    const ctx = this.ctx;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    const targetColor = this.getPixelColor(pixels, canvas.width, x, y);
    const replacementColor = this.hexToRgba(fillColor);

    if (this.colorsMatch(targetColor, replacementColor)) {
      return; // Évite de remplir si la couleur cible est identique
    }

    const stack: { x: number; y: number }[] = [{ x, y }];

    while (stack.length > 0) {
      const { x, y } = stack.pop()!;
      const currentColor = this.getPixelColor(pixels, canvas.width, x, y);

      if (this.colorsMatch(currentColor, targetColor)) {
        this.setPixelColor(pixels, canvas.width, x, y, replacementColor);

        stack.push({ x: x + 1, y });
        stack.push({ x: x - 1, y });
        stack.push({ x, y: y + 1 });
        stack.push({ x, y: y - 1 });
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

}
