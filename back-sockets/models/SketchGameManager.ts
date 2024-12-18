import { SketchGames } from '../types/game';
import { PlayerWebSocket } from '../types/websocket';

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

    constructor(gameId: string, owner: PlayerWebSocket, maxRound: number = 3, roundDuration: number = 60) {
        this.id = gameId;
        this.owner = owner;
        this.players = [owner];
        this.state = '';
        this.word = '';
        this.round = 0;
        this.maxRound = maxRound;
        this.roundDuration = roundDuration;
    }

    addPlayer(player: PlayerWebSocket) {
        if (!this.players.find((p) => p.id === player.id)) this.players.push(player);
    }

    removePlayer(player: PlayerWebSocket) {
        this.players = this.players.filter((p) => p.id !== player.id);
    }

    startGame() {
        this.state = 'playing';

        const playersCopy = [...this.players];

        for (let i = 0; i < this.players.length; i++) {
            const player = playersCopy.splice(Math.floor(Math.random() * playersCopy.length - 1), 1)[0];
            this.drawOrder.push(player);
        }

        this.drawer = this.drawOrder[0];

        this.players.forEach((p) => {
            p.send(
                JSON.stringify({
                    sender: 'server',
                    type: 'gameStarted',
                    gameId: this.id,
                    players: this.players.map((p) => p.username),
                    drawer: this.players.find((p) => p.id === this.drawer?.id)?.username,
                    drawOrder: this.drawOrder.map((p) => p.username),
                })
            );
        });
    }

    guessWord(player: PlayerWebSocket, word: string) {
        if (word.toLowerCase() === this.word.toLowerCase()) {
            player.score += 100 * (1 / this.roundWinners.length);
            this.roundWinners.push(player);

            if (this.roundWinners.length === this.players.length - 1) {
                this.nextDrawer();
            }
        }
    }

    nextDrawer() {
        const index = this.drawOrder.indexOf(this.drawer as PlayerWebSocket);

        if (index + 1 >= this.drawOrder.length) {
            this.nextRound();
        } else {
            this.drawer = this.drawOrder[index + 1];

            this.players.forEach((p) => {
                p.send(
                    JSON.stringify({
                        sender: 'server',
                        type: 'nextDrawer',
                        gameId: this.id,
                        drawer: this.players.find((p) => p.id === this.drawer?.id)?.username,
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
            p.send(
                JSON.stringify({
                    sender: 'server',
                    type: 'nextRound',
                    gameId: this.id,
                    drawer: this.players.find((p) => p.id === this.drawer?.id)?.username,
                })
            );
        });
    }

    endGame() {
        this.state = 'ended';

        this.players.forEach((p) => {
            p.send(
                JSON.stringify({
                    sender: 'server',
                    type: 'gameEnded',
                    gameId: this.id,
                    winner: this.players.reduce((a, b) => (a.score > b.score ? a : b)),
                })
            );
        });
    }

    isPlayerDrawer(player: PlayerWebSocket) {
        return this.drawer?.id === player.id;
    }
}