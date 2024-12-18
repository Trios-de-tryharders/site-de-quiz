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
var ws_1 = require("ws");
var node_crypto_1 = require("node:crypto");
// Initialisation du serveur et écoute sur tous les ports
var wss = new ws_1.WebSocketServer({ port: 8081, host: "0.0.0.0" });
// Conserve les clients connectés et autre
var state = {
    clients: [],
    typingTimeouts: {}, // Utilise setTimeout pour gérer le 'User is writting' sur le front
    writting: []
};
//  Gére la redirection vers les fonctions pour simplifier le code
var messageHandlers = {
    connect: function (client, message) { return connectClient(client, message.username); },
    message: function (client, message) { return handleMessage(client, message.value); },
    writting: function (client, message) { return handleWritting(client, message.isWritting); },
};
// Fonction permettant d'envoyer un message à une liste d'utilisateur
var broadcast = function (clients, message) {
    clients.forEach(function (client) { return client.send(JSON.stringify(message)); });
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
var disconnectClient = function (client) {
    state.clients = state.clients.filter(function (c) { return c.id !== client.id; });
    var messageToSend = {
        sender: "server",
        username: client.username,
        value: "".concat(client.username, " has left the chat"),
        type: "disconnect",
    };
    broadcast(state.clients, messageToSend);
};
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
var handleWritting = function (client, value) {
    if (value) {
        if (!state.typingTimeouts[client.id]) {
            state.writting.push(client);
        }
        clearTimeout(state.typingTimeouts[client.id]);
        state.typingTimeouts[client.id] = setTimeout(function () {
            state.writting = state.writting.filter(function (c) { return c.id !== client.id; });
            console.log("Delete", client.username);
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
