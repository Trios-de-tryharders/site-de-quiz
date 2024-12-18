import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import './words.json';
import { CustomWebSocket, PlayerWebSocket } from "./types/websocket";
import { ClientMessage } from "./types/messages";
import { Game, SketchGames } from "./types/game";
import { SketchGameManager } from "./models/SketchGameManager";

// Initialisation du serveur et écoute sur tous les ports
const wss = new WebSocketServer({ port: 8081, host: "0.0.0.0" });

// Conserve les clients connectés et autre
const state: {clients: CustomWebSocket[], typingTimeouts: {}, writting: CustomWebSocket[], sketchGames: SketchGameManager[], quizzes: Game[] }  = {
    clients: [],
    typingTimeouts: {}, // Utilise setTimeout pour gérer le 'User is writting' sur le front
    writting: [], // Liste des utilisateurs en train d'écrire
    sketchGames: [], // Liste des parties draw en cours
    quizzes: [] // Liste des parties de quiz en cours
};


//  Gére la redirection vers les fonctions pour simplifier le code
const messageHandlers = {
  connect: (client: CustomWebSocket, message: ClientMessage) => connectClient(client, message.username),
  message: (client: CustomWebSocket, message: ClientMessage) => handleMessage(client, message.value),
  writting: (client: CustomWebSocket, message: ClientMessage) => handleWritting(client, message.isWritting),
  createGame: (client: CustomWebSocket, message: ClientMessage) => handleCreateGame(client),
  joinGame: (client: CustomWebSocket, message: ClientMessage) => handleJoinGame(client, message),
  launchGame: (client: CustomWebSocket, message: ClientMessage) => handleLaunchGame(client, message),
  guess: (client: CustomWebSocket, message: ClientMessage) => handleGuess(client, message)
};

// Fonction permettant d'envoyer un message à une liste d'utilisateur
const broadcast = (clients: CustomWebSocket[], message) => {
  clients.forEach((client) => client.send(JSON.stringify(message)));
};

// Fonction permettant de créer une partie
const handleCreateGame = (client: CustomWebSocket) => {
  
  let gameId = Math.random().toString(36).substring(2, 10)

  while (gameId in state.sketchGames) {
    gameId = Math.random().toString(36).substring(2, 10);
  }

  const player: PlayerWebSocket = { ...(client as PlayerWebSocket), score: 0, didBuzz: false };

  const game = new SketchGameManager(gameId, player);

  state.sketchGames.push(game);

  client.send(
    JSON.stringify({
      sender: "server",
      type: "gameCreated",
      gameId: game.id,
    })
  );
};

// Fonction permettant de rejoindre une partie
const handleJoinGame = (client: CustomWebSocket, message: ClientMessage) => {
  const game = state.sketchGames.find((g) => g.id === message.game);
  const player: PlayerWebSocket = { ...(client as PlayerWebSocket), score: 0, didBuzz: false };

  if (game && game.state === "waiting" && !game.players.find((p) => p.id === player.id)) {
    game.players.push(player);
  }
};

const handleLaunchGame = (client: CustomWebSocket, message: ClientMessage) => {
  const game = state.sketchGames.find((g) => g.id === message.game);

  if (game && game.owner.id === client.id) {
    game.startGame();
  }
}

const handleGuess = (client: CustomWebSocket, message: ClientMessage) => {
  const game = state.sketchGames.find((g) => g.id === message.game);

  if (!game){
    return;
  }

  const player = game.players.find((p) => p.id === client.id);

  if (!player){
    return;
  }

  if (game.state === "playing") {
    game.guessWord(player, message.value);
  }
};

// Utilise message handler pour rediriger vers la fonction approprié
const handleIncomingMessage = (client: CustomWebSocket, data: any) => {
  try {
    const message: ClientMessage = JSON.parse(data);
    if (messageHandlers[message.type]) {
      messageHandlers[message.type](client, message);
    } else {
      console.warn("Unknown message type:", message.type);
    }
  } catch (e) {
    console.error("Failed to parse message:", e);
  }
};


// Ajoute un client au state et lui donne un pseudo et id
const connectClient = (client: CustomWebSocket, username: string) => {
    client.id = randomUUID();
    client.username = username;
    state.clients.push(client);
    console.log('Client connected: ', client.username);

    const welcomeMessage = {
      sender: "server",
      username: username,
      value: `${username} has joined the chat`,
      type: "connect",
    };

    broadcast([...state.clients.filter((c: CustomWebSocket) => c.id !== client.id)], welcomeMessage)

    client.send(JSON.stringify({
        sender: "server",
        username: "server",
        value: "Welcome to the chat",
        type: "login",
        users: [...state.clients.map((c: CustomWebSocket) => c.username), username].filter((u, i, a) => a.indexOf(u) === i)
    }));
}

// Déconnecte un utilisateur en le retirant du state
const disconnectClient = (client: CustomWebSocket) => {
    state.clients = state.clients.filter((c: CustomWebSocket) => c.id !== client.id);

    const messageToSend = {
      sender: "server",
      username: client.username,
      value: `${client.username} has left the chat`,
      type: "disconnect",
      users: state.clients.map((c: CustomWebSocket) => c.username)
    };

    broadcast(state.clients, messageToSend)
};

// Partage un message reçu à tous les utilisateurs
const handleMessage = (client: CustomWebSocket, message: string) => {
    console.log('Message received: ', message);

    state.writting = state.writting.filter((w: CustomWebSocket) => w.id !== client.id);

    broadcast(state.clients.filter((c: CustomWebSocket) => c.id !== client.id), 
      {
        sender: "user",
        username: client.username,
        value: message,
        type: "message",
        users: state.writting
      });
}

// Permet d'envoyer qui écrit parmis les utilisateurs
const handleWritting = (client: CustomWebSocket, value: boolean) => {
  if (value) {
    if (!state.typingTimeouts[client.id]) {
      state.writting.push(client);
    }

    clearTimeout(state.typingTimeouts[client.id]);

    state.typingTimeouts[client.id] = setTimeout(() => {
      state.writting = state.writting.filter((c) => c.id !== client.id);
      delete state.typingTimeouts[client.id];
      broadcast(state.clients, {
        sender: "user",
        username: client.username,
        users: state.writting.map((c) => c.username),
        type: "writting",
      });
    }, 5000);
  } else {
    if (state.typingTimeouts[client.id]) {
      clearTimeout(state.typingTimeouts[client.id]);
      delete state.typingTimeouts[client.id];
      state.writting = state.writting.filter((c) => c.id !== client.id);
      broadcast(state.clients, {
        sender: "user",
        username: client.username,
        users: state.writting.map((c) => c.username),
        type: "writting",
      });
    }
  }

  broadcast(state.clients, {
    sender: "user",
    username: client.username,
    users: state.writting.map((c) => c.username),
    type: "writting",
  });
};


wss.on("connection", (socket: CustomWebSocket) => {
  socket.on("close", () => {
    disconnectClient(socket);
  });

  socket.on("message", (data) => {
    handleIncomingMessage(socket, data);
  });
});
