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
var ws_1 = require("ws");
var node_crypto_1 = require("node:crypto");
require("./words.json");
var SketchGameManager_1 = require("./models/SketchGameManager");
// Initialisation du serveur et écoute sur tous les ports
var wss = new ws_1.WebSocketServer({ port: 8081, host: "0.0.0.0" });
// Conserve les clients connectés et autre
var state = {
    clients: [],
    typingTimeouts: {}, // Utilise setTimeout pour gérer le 'User is writting' sur le front
    writting: [], // Liste des utilisateurs en train d'écrire
    sketchGames: [], // Liste des parties draw en cours
    quizzes: [] // Liste des parties de quiz en cours
};
//  Gére la redirection vers les fonctions pour simplifier le code
var messageHandlers = {
    connect: function (client, message) { return connectClient(client, message.username); },
    message: function (client, message) { return handleMessage(client, message.value); },
    writting: function (client, message) { return handleWritting(client, message.isWritting); },
    createGame: function (client, message) { return handleCreateGame(client); },
    joinGame: function (client, message) { return handleJoinGame(client, message); },
    launchGame: function (client, message) { return handleLaunchGame(client, message); },
    guess: function (client, message) { return handleGuess(client, message); }
};
// Fonction permettant d'envoyer un message à une liste d'utilisateur
var broadcast = function (clients, message) {
    clients.forEach(function (client) { return client.send(JSON.stringify(message)); });
};
// Fonction permettant de créer une partie
var handleCreateGame = function (client) {
    var gameId = Math.random().toString(36).substring(2, 10);
    while (gameId in state.sketchGames) {
        gameId = Math.random().toString(36).substring(2, 10);
    }
    var player = __assign(__assign({}, client), { score: 0, didBuzz: false });
    var game = new SketchGameManager_1.SketchGameManager(gameId, player);
    state.sketchGames.push(game);
    client.send(JSON.stringify({
        sender: "server",
        type: "gameCreated",
        gameId: game.id,
    }));
};
// Fonction permettant de rejoindre une partie
var handleJoinGame = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    var player = __assign(__assign({}, client), { score: 0, didBuzz: false });
    if (game && game.state === "waiting" && !game.players.find(function (p) { return p.id === player.id; })) {
        game.players.push(player);
    }
};
var handleLaunchGame = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (game && game.owner.id === client.id) {
        game.startGame();
    }
};
var handleGuess = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (!game) {
        return;
    }
    var player = game.players.find(function (p) { return p.id === client.id; });
    if (!player) {
        return;
    }
    if (game.state === "playing") {
        game.guessWord(player, message.value);
    }
};
// Utilise message handler pour rediriger vers la fonction approprié
var handleIncomingMessage = function (client, data) {
    try {
        var message = JSON.parse(data);
        if (messageHandlers[message.type]) {
            messageHandlers[message.type](client, message);
        }
        else {
            console.warn("Unknown message type:", message.type);
        }
    }
    catch (e) {
        console.error("Failed to parse message:", e);
    }
};
// Ajoute un client au state et lui donne un pseudo et id
var connectClient = function (client, username) {
    client.id = (0, node_crypto_1.randomUUID)();
    client.username = username;
    state.clients.push(client);
    console.log('Client connected: ', client.username);
    var welcomeMessage = {
        sender: "server",
        username: username,
        value: "".concat(username, " has joined the chat"),
        type: "connect",
    };
    broadcast(__spreadArray([], state.clients.filter(function (c) { return c.id !== client.id; }), true), welcomeMessage);
    client.send(JSON.stringify({
        sender: "server",
        username: "server",
        value: "Welcome to the chat",
        type: "login",
        users: __spreadArray(__spreadArray([], state.clients.map(function (c) { return c.username; }), true), [username], false).filter(function (u, i, a) { return a.indexOf(u) === i; })
    }));
};
// Déconnecte un utilisateur en le retirant du state
var disconnectClient = function (client) {
    state.clients = state.clients.filter(function (c) { return c.id !== client.id; });
    var messageToSend = {
        sender: "server",
        username: client.username,
        value: "".concat(client.username, " has left the chat"),
        type: "disconnect",
        users: state.clients.map(function (c) { return c.username; })
    };
    broadcast(state.clients, messageToSend);
};
// Partage un message reçu à tous les utilisateurs
var handleMessage = function (client, message) {
    console.log('Message received: ', message);
    state.writting = state.writting.filter(function (w) { return w.id !== client.id; });
    broadcast(state.clients.filter(function (c) { return c.id !== client.id; }), {
        sender: "user",
        username: client.username,
        value: message,
        type: "message",
        users: state.writting
    });
};
// Permet d'envoyer qui écrit parmis les utilisateurs
var handleWritting = function (client, value) {
    if (value) {
        if (!state.typingTimeouts[client.id]) {
            state.writting.push(client);
        }
        clearTimeout(state.typingTimeouts[client.id]);
        state.typingTimeouts[client.id] = setTimeout(function () {
            state.writting = state.writting.filter(function (c) { return c.id !== client.id; });
            delete state.typingTimeouts[client.id];
            broadcast(state.clients, {
                sender: "user",
                username: client.username,
                users: state.writting.map(function (c) { return c.username; }),
                type: "writting",
            });
        }, 5000);
    }
    else {
        if (state.typingTimeouts[client.id]) {
            clearTimeout(state.typingTimeouts[client.id]);
            delete state.typingTimeouts[client.id];
            state.writting = state.writting.filter(function (c) { return c.id !== client.id; });
            broadcast(state.clients, {
                sender: "user",
                username: client.username,
                users: state.writting.map(function (c) { return c.username; }),
                type: "writting",
            });
        }
    }
    broadcast(state.clients, {
        sender: "user",
        username: client.username,
        users: state.writting.map(function (c) { return c.username; }),
        type: "writting",
    });
};
wss.on("connection", function (socket) {
    socket.on("close", function () {
        disconnectClient(socket);
    });
    socket.on("message", function (data) {
        handleIncomingMessage(socket, data);
    });
});
