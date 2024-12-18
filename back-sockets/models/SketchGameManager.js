"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var wordsList = require('../words.json');
var SketchGameManager = /** @class */ (function () {
    function SketchGameManager(gameId, owner, maxRound, roundDuration) {
        if (maxRound === void 0) { maxRound = 3; }
        if (roundDuration === void 0) { roundDuration = 60; }
        this.round = 0;
        this.roundWinners = [];
        this.drawOrder = [];
        this.canvas = '';
        this.writtingUsers = [];
        this.typingTimeouts = {};
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
    SketchGameManager.prototype.broadcast = function (message) {
        console.log('Broadcasting to players');
        this.players.forEach(function (p) {
            if (typeof p.send === 'function') {
                p.send(JSON.stringify(message));
                console.log('To user: ', p.username);
            }
            else {
                console.log('Ready state ', p.readyState === WebSocket.OPEN);
                console.error('Invalid player object. Missing send method:', p.username, ' ', p.readyState);
            }
        });
    };
    SketchGameManager.prototype.broadcastGameEvent = function (eventType, additionalData) {
        if (additionalData === void 0) { additionalData = {}; }
        var message = __assign(__assign({ sender: 'server', type: eventType }, this.getGameInfo()), additionalData);
        this.broadcast(message);
    };
    SketchGameManager.prototype.sendCanvas = function () {
        this.broadcastGameEvent('canvas');
    };
    SketchGameManager.prototype.getGameInfo = function () {
        var _a;
        if (this.state === 'playing' || this.state === 'chooseWord') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map(function (p) { return p.username; }),
                state: this.state,
                drawOrder: this.drawOrder.map(function (p) { return p.username; }),
                drawer: (_a = this.drawer) === null || _a === void 0 ? void 0 : _a.username,
                round: this.round,
                maxRound: this.maxRound,
                roundDuration: this.roundDuration,
                roundWinners: this.roundWinners.map(function (p) { return p.username; }),
                time: this.time,
                image: this.canvas
            };
        }
        else if (this.state === 'waiting') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map(function (p) { return p.username; }),
                state: this.state,
                image: this.canvas
            };
        }
        else if (this.state === 'ended') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map(function (p) { return p.username; }),
                state: this.state,
                winner: this.players.reduce(function (a, b) { return (a.score > b.score ? a : b); }),
            };
        }
    };
    SketchGameManager.prototype.addPlayer = function (player) {
        if (!this.players.find(function (p) { return p.id === player.id; })) {
            this.players.push(player);
            this.drawOrder.push(player);
            this.broadcast(__assign(__assign({}, this.getGameInfo()), { type: 'playerJoined', username: player.username }));
        }
    };
    SketchGameManager.prototype.removePlayer = function (playerId) {
        this.players = this.players.filter(function (p) { return p.id !== playerId; });
        if (this.state === 'playing') {
            this.drawOrder = this.drawOrder.filter(function (p) { return p.id !== playerId; });
            this.broadcast(__assign(__assign({}, this.getGameInfo()), { type: 'gameUpdated' }));
        }
    };
    SketchGameManager.prototype.addMessage = function (player, message) {
        console.log('add message');
        if (this.state !== 'playing') {
            this.broadcast({
                sender: 'user',
                username: player.username,
                type: 'message',
                value: message.value,
                players: this.players.map(function (p) { return p.username; }),
                writtingUsers: this.writtingUsers
            });
        }
        if (this.state === 'playing' && !this.isPlayerDrawer(player) && !this.roundWinners.find(function (p) { return p.id === player.id; })) {
            this.broadcast({
                sender: player.username,
                type: 'message',
                value: message,
                players: this.players.map(function (p) { return p.username; }),
                writtingUsers: this.writtingUsers
            });
        }
    };
    SketchGameManager.prototype.startGame = function () {
        var _this = this;
        this.state = 'chooseWord';
        var playersCopy = __spreadArray([], this.players, true);
        for (var i = 0; i < this.players.length; i++) {
            var player = playersCopy.splice(Math.floor(Math.random() * playersCopy.length - 1), 1)[0];
            this.drawOrder.push(player);
        }
        this.drawer = this.drawOrder[0];
        this.players.forEach(function (p) {
            var _a;
            if (p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id)) {
                p.send(JSON.stringify(__assign(__assign({}, _this.getGameInfo()), { type: 'startDrawing', words: _this.getRandomWords(3) })));
            }
            else {
                p.send(JSON.stringify(__assign(__assign({}, _this.getGameInfo()), { type: 'gameUpdated' })));
            }
        });
    };
    SketchGameManager.prototype.chooseWord = function (player, word) {
        var _this = this;
        if (this.isPlayerDrawer(player) && this.state === 'chooseWord') {
            this.word = word;
            this.state = 'playing';
            this.time = this.roundDuration;
            this.players.forEach(function (p) {
                p.send(JSON.stringify(__assign({ sender: 'server', type: 'startDrawing', words: _this.getRandomWords(3) }, _this.getGameInfo())));
            });
            this.startTimer();
        }
    };
    SketchGameManager.prototype.guessWord = function (player, word) {
        if (word.value.toLowerCase() === this.word.toLowerCase()) {
            player.score += 100 * (1 / this.roundWinners.length);
            this.roundWinners.push(player);
            if (this.roundWinners.length === this.players.length - 1) {
                this.stopTimer();
                this.nextDrawer();
            }
        }
        else if (this.isWordClose(word.value)) {
            player.send(JSON.stringify({
                sender: 'server',
                type: 'guess',
                value: 'You are getting close to the word',
            }));
        }
        else {
            this.addMessage(player, word);
        }
    };
    SketchGameManager.prototype.nextDrawer = function () {
        var _this = this;
        var index = this.drawOrder.indexOf(this.drawer);
        this.word = '';
        if (index + 1 >= this.drawOrder.length) {
            this.nextRound();
        }
        else {
            this.drawer = this.drawOrder[index + 1];
            this.state = 'chooseWord';
            this.players.forEach(function (p) {
                p.send(JSON.stringify(__assign({ sender: 'server', type: 'nextDrawer' }, _this.getGameInfo())));
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
            var _a, _b;
            if (p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id)) {
                p.send(JSON.stringify(__assign({ sender: 'server', type: 'startDrawing', words: _this.getRandomWords(3) }, _this.getGameInfo())));
            }
            else {
                p.send(JSON.stringify({
                    sender: 'server',
                    type: 'nextRound',
                    gameId: _this.id,
                    drawer: (_b = _this.players.find(function (p) { var _a; return p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id); })) === null || _b === void 0 ? void 0 : _b.username,
                }));
            }
        });
    };
    SketchGameManager.prototype.endGame = function () {
        var _this = this;
        this.state = 'ended';
        this.players.forEach(function (p) {
            p.send(JSON.stringify(__assign({ sender: 'server', type: 'gameEnded' }, _this.getGameInfo())));
        });
    };
    // ------- Utils --------
    SketchGameManager.prototype.isPlayerDrawer = function (player) {
        var _a;
        return ((_a = this.drawer) === null || _a === void 0 ? void 0 : _a.id) === player.id;
    };
    SketchGameManager.prototype.getRandomWords = function (number) {
        var wordsCopy = __spreadArray([], wordsList, true);
        var words = [];
        for (var i = 0; i < number; i++) {
            var index = Math.floor(Math.random() * wordsCopy.length);
            words.push(wordsCopy.splice(index, 1)[0]);
        }
        return words;
    };
    SketchGameManager.prototype.startTimer = function () {
        var _this = this;
        this.stopTimer(); // Assure-toi d'arrêter un timer existant avant d'en démarrer un nouveau
        this.timerId = setInterval(function () {
            _this.time -= 1;
            if (_this.time <= 0) {
                _this.stopTimer();
                _this.nextDrawer();
            }
            _this.broadcastGameEvent('timerUpdate', { time: _this.time });
        }, 1000);
    };
    SketchGameManager.prototype.stopTimer = function () {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = undefined; // Réinitialise l'ID du timer
        }
    };
    SketchGameManager.prototype.isWordClose = function (word) {
        console.log(this.word);
        if (this.word === '' || word === '') {
            return false;
        }
        var distance = function (a, b) {
            var matrix = Array.from({ length: a.length + 1 }, function () { return Array(b.length + 1).fill(0); });
            for (var i = 0; i <= a.length; i++) {
                for (var j = 0; j <= b.length; j++) {
                    if (i === 0) {
                        matrix[i][j] = j;
                    }
                    else if (j === 0) {
                        matrix[i][j] = i;
                    }
                    else if (a[i - 1] === b[j - 1]) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    }
                    else {
                        matrix[i][j] = 1 + Math.min(matrix[i - 1][j - 1], matrix[i - 1][j], matrix[i][j - 1]);
                    }
                }
            }
            return matrix[a.length][b.length];
        };
        return distance(this.word.toLowerCase(), word.toLowerCase()) <= 2;
    };
    return SketchGameManager;
}());
exports.SketchGameManager = SketchGameManager;
