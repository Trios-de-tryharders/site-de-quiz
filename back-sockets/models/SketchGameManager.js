"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SketchGameManager = void 0;
var SketchGameManager = /** @class */ (function () {
    function SketchGameManager(gameId, owner, maxRound, roundDuration) {
        if (maxRound === void 0) { maxRound = 3; }
        if (roundDuration === void 0) { roundDuration = 60; }
        this.round = 0;
        this.roundWinners = [];
        this.drawOrder = [];
        this.id = gameId;
        this.owner = owner;
        this.players = [owner];
        this.state = '';
        this.word = '';
        this.round = 0;
        this.maxRound = maxRound;
        this.roundDuration = roundDuration;
    }
    SketchGameManager.prototype.addPlayer = function (player) {
        if (!this.players.find(function (p) { return p.id === player.id; }))
            this.players.push(player);
    };
    SketchGameManager.prototype.removePlayer = function (player) {
        this.players = this.players.filter(function (p) { return p.id !== player.id; });
    };
    SketchGameManager.prototype.startGame = function () {
        var _this = this;
        this.state = 'playing';
        var playersCopy = __spreadArray([], this.players, true);
        for (var i = 0; i < this.players.length; i++) {
            var player = playersCopy.splice(Math.floor(Math.random() * playersCopy.length - 1), 1)[0];
            this.drawOrder.push(player);
        }
        this.drawer = this.drawOrder[0];
        this.players.forEach(function (p) {
            var _a;
            p.send(JSON.stringify({
                sender: 'server',
                type: 'gameStarted',
                gameId: _this.id,
                players: _this.players.map(function (p) { return p.username; }),
                drawer: (_a = _this.players.find(function (p) { var _a; return p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id); })) === null || _a === void 0 ? void 0 : _a.username,
                drawOrder: _this.drawOrder.map(function (p) { return p.username; }),
            }));
        });
    };
    SketchGameManager.prototype.guessWord = function (player, word) {
        if (word.toLowerCase() === this.word.toLowerCase()) {
            player.score += 100 * (1 / this.roundWinners.length);
            this.roundWinners.push(player);
            if (this.roundWinners.length === this.players.length - 1) {
                this.nextDrawer();
            }
        }
    };
    SketchGameManager.prototype.nextDrawer = function () {
        var _this = this;
        var index = this.drawOrder.indexOf(this.drawer);
        if (index + 1 >= this.drawOrder.length) {
            this.nextRound();
        }
        else {
            this.drawer = this.drawOrder[index + 1];
            this.players.forEach(function (p) {
                var _a;
                p.send(JSON.stringify({
                    sender: 'server',
                    type: 'nextDrawer',
                    gameId: _this.id,
                    drawer: (_a = _this.players.find(function (p) { var _a; return p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id); })) === null || _a === void 0 ? void 0 : _a.username,
                }));
            });
        }
    };
    SketchGameManager.prototype.nextRound = function () {
        var _this = this;
        this.round++;
        if (this.round >= this.maxRound) {
            this.endGame();
            return;
        }
        this.drawer = this.drawOrder[this.round];
        this.players.forEach(function (p) {
            var _a;
            p.send(JSON.stringify({
                sender: 'server',
                type: 'nextRound',
                gameId: _this.id,
                drawer: (_a = _this.players.find(function (p) { var _a; return p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id); })) === null || _a === void 0 ? void 0 : _a.username,
            }));
        });
    };
    SketchGameManager.prototype.endGame = function () {
        var _this = this;
        this.state = 'ended';
        this.players.forEach(function (p) {
            p.send(JSON.stringify({
                sender: 'server',
                type: 'gameEnded',
                gameId: _this.id,
                winner: _this.players.reduce(function (a, b) { return (a.score > b.score ? a : b); }),
            }));
        });
    };
    SketchGameManager.prototype.isPlayerDrawer = function (player) {
        var _a;
        return ((_a = this.drawer) === null || _a === void 0 ? void 0 : _a.id) === player.id;
    };
    return SketchGameManager;
}());
exports.SketchGameManager = SketchGameManager;
