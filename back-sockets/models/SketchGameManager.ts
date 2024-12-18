import { get } from 'http';
import { SketchGames } from '../types/game';
import { PlayerWebSocket } from '../types/websocket';
import { ClientMessage } from '../types/messages';
const wordsList = require('../words.json');

export class SketchGameManager implements SketchGames {
    id: string;
    owner: PlayerWebSocket;
    players: PlayerWebSocket[];
    state: string;
    word: string;
    round: number = 0;
    maxRound: number;
    roundDuration: number;
    roundWinners: PlayerWebSocket[] = [];
    drawer?: PlayerWebSocket;
    drawOrder: PlayerWebSocket[] = [];
    canvas: string = '';
    time: number;
    timerId?: NodeJS.Timeout;
    writtingUsers: PlayerWebSocket[] = [];
    typingTimeouts: {} = {};

    constructor(gameId: string, owner: PlayerWebSocket, maxRound: number = 3, roundDuration: number = 60) {
        this.id = gameId;
        this.owner = owner;
        this.players = [owner];
        this.state = 'waiting';
        this.word = '';
        this.round = 0;
        this.maxRound = maxRound;
        this.roundDuration = roundDuration;
        this.time = roundDuration;
    }

    broadcast(message: any) {
        console.log('Broadcasting to players')
        this.players.forEach((p: PlayerWebSocket) => {
            if (typeof p.send === 'function') {
                p.send(JSON.stringify(message));
                console.log('To user: ', p.username)
            } else {
                console.log('Ready state ', p.readyState === WebSocket.OPEN)
                console.error('Invalid player object. Missing send method:', p.username, ' ', p.readyState);
            }
        });
    }

    broadcastGameEvent(eventType: string, additionalData: any = {}) {
        const message = {
            sender: 'server',
            type: eventType,
            ...this.getGameInfo(),
            ...additionalData,
        };
        this.broadcast(message);
    }

    sendCanvas() {
        this.broadcastGameEvent('canvas')
    }

    getGameInfo() {
        if (this.state === 'playing' || this.state === 'chooseWord') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map((p) => p.username),
                state: this.state,
                drawOrder: this.drawOrder.map((p) => p.username),
                drawer: this.drawer?.username,
                round: this.round,
                maxRound: this.maxRound,
                roundDuration: this.roundDuration,
                roundWinners: this.roundWinners.map((p) => p.username),
                time: this.time,
                image: this.canvas
            }
        } else if (this.state === 'waiting') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map((p) => p.username),
                state: this.state,
                image: this.canvas
            }
        } else if (this.state === 'ended') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map((p) => p.username),
                state: this.state,
                winner: this.players.reduce((a, b) => (a.score > b.score ? a : b)),
            }
        }
    }

    addPlayer(player: PlayerWebSocket) {
        if (!this.players.find((p) => p.id === player.id)) {
            
            this.players.push(player);
            this.drawOrder.push(player);
            this.broadcast({
                ...this.getGameInfo(),
                type: 'playerJoined',
                username: player.username,
            });
        }
    }

    removePlayer(playerId: string) {
        this.players = this.players.filter((p) => p.id !== playerId);

        if (this.state === 'playing') {
            this.drawOrder = this.drawOrder.filter((p) => p.id !== playerId);
            this.broadcast({
                    ...this.getGameInfo(),
                    type: 'gameUpdated',
                });
        }
    }

    addMessage(player: PlayerWebSocket, message: ClientMessage) {
        console.log('add message')
        if (this.state !== 'playing') {
            this.broadcast({
                sender: 'user',
                username: player.username,
                type: 'message',
                value: message.value,
                players: this.players.map((p) => p.username),
                writtingUsers: this.writtingUsers
            });
        }
        if (this.state === 'playing' && !this.isPlayerDrawer(player) && !this.roundWinners.find((p) => p.id === player.id)) {
            this.broadcast({
                sender: player.username,
                type: 'message',
                value: message,
                players: this.players.map((p) => p.username),
                writtingUsers: this.writtingUsers
            });
        }
    }

    startGame() {
        if (this.state === 'playing' || this.state === 'chooseWord') {
            return;
        }
        
        this.state = 'chooseWord';

        const playersCopy = [...this.players];

        for (let i = 0; i < this.players.length; i++) {
            const player = playersCopy.splice(Math.floor(Math.random() * playersCopy.length - 1), 1)[0];
            this.drawOrder.push(player);
        }

        this.drawer = this.drawOrder[0];

        this.players.forEach((p) => {
            if (p.id === this.drawer?.id) {
                p.send(
                    JSON.stringify({
                        ...this.getGameInfo(),
                        type: 'startDrawing',
                        words: this.getRandomWords(3),
                    })
                );
            } else {
                p.send(
                JSON.stringify({
                    ...this.getGameInfo(),
                    type: 'gameUpdated',
                })
            );
            }
            
        });
    }

    chooseWord(player: PlayerWebSocket, word: string) {
        if (this.isPlayerDrawer(player) && this.state === 'chooseWord') {
            this.word = word;
            this.state = 'playing';
            this.time = this.roundDuration;

            this.players.forEach((p) => {
                p.send(
                    JSON.stringify({
                        sender: 'server',
                        type: 'startDrawing',
                        words: this.getRandomWords(3),
                        ...this.getGameInfo(),
                    })
                );
            });

            this.startTimer();
        }
    }

    guessWord(player: PlayerWebSocket, word: ClientMessage) {
        if (word.value.toLowerCase() === this.word.toLowerCase()) {
            player.score += 100 * (1 / this.roundWinners.length);
            this.roundWinners.push(player);

            if (this.roundWinners.length === this.players.length - 1) {
                this.stopTimer();
                this.nextDrawer();
            }
        } else if (this.isWordClose(word.value)) {
            player.send(
                JSON.stringify({
                    sender: 'server',
                    type: 'guess',
                    value: 'You are getting close to the word',
                })
            )
        } else {
            this.addMessage(player, word);
        }
    }

    nextDrawer() {
        const index = this.drawOrder.indexOf(this.drawer as PlayerWebSocket);
        this.word = '';
        if (index + 1 >= this.drawOrder.length) {
            this.nextRound();
        } else {
            this.drawer = this.drawOrder[index + 1];
            this.state = 'chooseWord';

            this.players.forEach((p) => {
                p.send(
                    JSON.stringify({
                        sender: 'server',
                        type: 'nextDrawer',
                        ...this.getGameInfo(),
                    })
                );
            });
        }
    }

    nextRound() {
        this.round++;

        if (this.round >= this.maxRound) {
            this.endGame();
            return;
        }

        this.drawer = this.drawOrder[this.round];

        this.players.forEach((p) => {
            if (p.id === this.drawer?.id) {
                p.send(
                    JSON.stringify({
                        sender: 'server',
                        type: 'startDrawing',
                        words: this.getRandomWords(3),
                        ...this.getGameInfo(),                        
                    })
                )
            }
            else {
                p.send(
                    JSON.stringify({
                        sender: 'server',
                        type: 'nextRound',
                        gameId: this.id,
                        drawer: this.players.find((p) => p.id === this.drawer?.id)?.username,
                    })
                );
            }
            

        });
    }

    endGame() {
        this.state = 'ended';

        this.players.forEach((p) => {
            p.send(
                JSON.stringify({
                    sender: 'server',
                    type: 'gameEnded',
                    ...this.getGameInfo(),
                })
            );
        });
    }

    // ------- Utils --------

    isPlayerDrawer(player: PlayerWebSocket) {
        return this.drawer?.id === player.id;
    }


    getRandomWords(number: number) {
        const wordsCopy = [...wordsList];
        const words: string[] = [];
        for (let i = 0; i < number; i++) {
            const index = Math.floor(Math.random() * wordsCopy.length);
            words.push(wordsCopy.splice(index, 1)[0]);
        }
        return words;
    }

    startTimer() {
        this.stopTimer(); // Assure-toi d'arrêter un timer existant avant d'en démarrer un nouveau
        this.timerId = setInterval(() => {
            this.time -= 1;

            if (this.time <= 0) {
                this.stopTimer();
                this.nextDrawer();
            }
            
            this.broadcastGameEvent('timerUpdate', { time: this.time });
        }, 1000);
    }

    stopTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = undefined; // Réinitialise l'ID du timer
        }
    }


    isWordClose(word: string) {
        console.log(this.word)
        if (this.word === '' || word === '') {
            return false;
        }
    
        const distance = (a: string, b: string): number => {
            const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

            for (let i = 0; i <= a.length; i++) {
                for (let j = 0; j <= b.length; j++) {
                    if (i === 0) {
                        matrix[i][j] = j;
                    } else if (j === 0) {
                        matrix[i][j] = i;
                    } else if (a[i - 1] === b[j - 1]) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = 1 + Math.min(matrix[i - 1][j - 1], matrix[i - 1][j], matrix[i][j - 1]);
                    }
                }
            }

            return matrix[a.length][b.length];
        };

        return distance(this.word.toLowerCase(), word.toLowerCase()) <= 2;
    }
}