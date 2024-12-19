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
    words: string[] = [];
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
    hiddenWord: string = '';

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

    broadcast(message: any, clients: PlayerWebSocket[] = this.players) {
        console.log('Broadcasting to players')
        clients.forEach((p: PlayerWebSocket) => {
            if (typeof p.send === 'function') {
                p.send(JSON.stringify(message));
                console.log('To user: ', p.username)
            } else {
                console.log('Ready state ', p.readyState === WebSocket.OPEN)
                console.error('Invalid player object. Missing send method:', p.username, ' ', p.readyState);
            }
        });
    }

    broadcastGameEvent(eventType: string, additionalData: any = {}, clients: PlayerWebSocket[] = this.players) {
        const message = {
            sender: 'server',
            type: eventType,
            ...this.getGameInfo(),
            ...additionalData,
        };
        this.broadcast(message, clients);
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

            if (this.state === 'playing' || this.state === 'chooseWord') {
                this.drawOrder.push(player);
            }

            this.broadcastGameEvent('playerJoined',
                { username: player.username }
            );
        }
    }

    removePlayer(playerId: string) {
        const player = this.players.find((p) => p.id === playerId);

        if (!player) {
            return;
        }

        this.players = this.players.filter((p) => p.id !== player.id);
        
        if (this.state === 'playing' || this.state === 'chooseWord') {
            this.drawOrder = this.drawOrder.filter((p) => p.id !== player.id);
            if (playerId === this.drawer?.id) {
                this.nextDrawer();
            }
        }

        if (this.players.length === 0) {
            return;
        }
        
        this.owner = this.players[0];

        this.broadcastGameEvent('playerLeft',
            { username: player.username }
        );
    }

    addMessage(player: PlayerWebSocket, message: ClientMessage, clients: PlayerWebSocket[] = this.players) {
        console.log('add message: ', message)
        console.log('clients: ', clients.map((p) => p.username))
            this.broadcast({
                sender: 'user',
                username: player.username,
                type: 'message',
                value: message.value,
                players: this.players.map((p) => p.username),
                writtingUsers: this.writtingUsers
            }, clients);
    }

    startGame() {
        if (this.state === 'playing' || this.state === 'chooseWord') {
            return;
        }

        this.state = 'chooseWord';

        this.round = 0;
        this.roundWinners = [];
        this.words = [];
        this.drawOrder = [];
        this.hiddenWord = '';
        this.canvas = '';

        this.sendCanvas();

        const playersCopy = [...this.players];
        console.log('Players Copy Before for', playersCopy.map((p) => p.username))
        console.log('Draw Order Before for', this.drawOrder.map((p) => p.username))

        while (playersCopy.length > 0) {
            const randomIndex = Math.floor(Math.random() * playersCopy.length);
            const player = playersCopy.splice(randomIndex, 1)[0]; // Retire un élément aléatoire
            console.log('Player', player.username);
            this.drawOrder.push(player);
            console.log('Draw Order', this.drawOrder.map((p) => p.username));
            console.log('Players Copy', playersCopy.map((p) => p.username));
        }

        this.drawer = this.drawOrder[0];
        this.words = this.getRandomWords(3);

        this.players.forEach((p) => {
            if (p.id === this.drawer?.id) {
                p.send(
                    JSON.stringify({
                        ...this.getGameInfo(),
                        type: 'startDrawing',
                        words: this.words,
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
        if (this.isPlayerDrawer(player) && this.state === 'chooseWord' && this.words.includes(word)) {
            this.word = word;
            this.state = 'playing';
            this.time = this.roundDuration;
            this.hiddenWord = this.getHiddenWord();
            this.startTimer();
            this.canvas = '';

            this.broadcastGameEvent('wordChosen', { username: this.drawer?.username, word: this.getHiddenWord() });
        }
    }

    getHiddenWord() {
        return this.word.replace(/[a-zA-Z]/g, '_');
    }

    getRandomPartOfWord() {
        let hiddenWord: string = this.hiddenWord;
        const i = Math.floor(Math.random() * hiddenWord.length - 1);
        let hiddenWordArray = hiddenWord.split('');
        hiddenWordArray[i] = this.word[i];
        this.hiddenWord = hiddenWordArray.join('');
    }

    guessWord(player: PlayerWebSocket, word: ClientMessage) {
        if (word.value.toLowerCase() === this.word.toLowerCase() 
            && !this.roundWinners.find((p) => p.id === player.id) 
            && !this.isPlayerDrawer(player) 
            && this.state === 'playing'
            && this.time > 0
        ) {
            player.score += 100 * (1 / this.roundWinners.length);
            this.roundWinners.push(player);
            this.broadcastGameEvent('guess', { isRight: true, value: `${player.username} has found the word !` })
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
                    guess: word.value,
                    isRight: false
                })
            )
        } else if (this.roundWinners.find((p) => p.id === player.id) || this.isPlayerDrawer(player)) {
            if (this.drawer){
                this.addMessage(player, word, [...this.roundWinners, this.drawer])
            } else {
                this.addMessage(player, word, this.roundWinners)
            }
        } 
        else {
            this.addMessage(player, word);
        }
    }

    nextDrawer() {
        const index = this.drawOrder.indexOf(this.drawer as PlayerWebSocket);
        this.word = '';
        this.words = this.getRandomWords(3);
        this.hiddenWord = '';
    
        if (index === this.drawOrder.length) {
            this.nextRound();
        } else {
            this.drawer = this.drawOrder[index + 1];
            this.state = 'chooseWord';

            this.players.forEach((p) => {
                if (p.id === this.drawer?.id) {
                    p.send(
                        JSON.stringify({
                            ...this.getGameInfo(),
                            type: 'startDrawing',
                            words: this.words,
                        })
                    );
                } else {
                    p.send(
                    JSON.stringify({
                        ...this.getGameInfo(),
                        type: 'nextDrawer',
                    })
                    );
                }
            });
        }
    }

    nextRound() {
        this.round++;

        if (this.round >= this.maxRound) {
            this.endGame();
            return;
        }

        this.drawer = this.drawOrder[0];

        this.nextDrawer();
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

            if (this.time === 40 || this.time === 20) {
                this.getRandomPartOfWord();
                console.log('Hidden word: ', this.hiddenWord)
                this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.hiddenWord });
            } else {
                this.broadcastGameEvent('timerUpdate', { time: this.time });
            }
            
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