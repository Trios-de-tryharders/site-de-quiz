import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { CustomWebSocket, PlayerWebSocket } from "./types/websocket";
import { ClientMessage } from "./types/messages";
import { Game, SketchGames } from "./types/game";
import { SketchGameManager } from "./models/SketchGameManager";

// Initialisation du serveur et écoute sur tous les ports
const wss = new WebSocketServer({ port: 8081, host: "0.0.0.0" });

// Conserve les clients connectés et autre
const state: {clients: CustomWebSocket[], typingTimeouts: {}, writting: CustomWebSocket[], sketchGames: SketchGameManager[], quizzes: Game[]}  = {
    clients: [],
    typingTimeouts: {}, // Utilise setTimeout pour gérer le 'User is writting' sur le front
    writting: [], // Liste des utilisateurs en train d'écrire
    sketchGames: [], // Liste des parties draw en cours
    quizzes: [], // Liste des parties de quiz en cours
};


//  Gére la redirection vers les fonctions pour simplifier le code
const messageHandlers = {
  connect: (client: CustomWebSocket, message: ClientMessage) => connectClient(client, message.username),
  // message: (client: CustomWebSocket, message: ClientMessage) => handleMessage(client, message),
  writting: (client: CustomWebSocket, message: ClientMessage) => handleWritting(client, message),
  createSketchGame: (client: CustomWebSocket, message: ClientMessage) => handleCreateSketchGame(client),
  joinSketchGame: (client: CustomWebSocket, message: ClientMessage) => handleJoinSketchGame(client, message),
  getSketchGame: (client: CustomWebSocket, message: ClientMessage) => handleGetSketchGame(client, message),
  launchSketchGame: (client: CustomWebSocket, message: ClientMessage) => handleLaunchSketchGame(client, message),
  guess: (client: CustomWebSocket, message: ClientMessage) => handleGuess(client, message),
  canvas: (client: CustomWebSocket, message: ClientMessage) => handleCanvas(client, message),
  hello: (client: CustomWebSocket, message: ClientMessage) => console.log('Hello', client.id)
};

const handleCanvas = (client: CustomWebSocket, message: ClientMessage) => {
  const game = state.sketchGames.find((g) => g.id === message.game)

  if (!game) return;

  game.canvas = message.image;

  game.sendCanvas();
}

// Fonction permettant d'envoyer un message à une liste d'utilisateur
const broadcast = (clients: CustomWebSocket[], message) => {
  console.log('Broadcasting to clients:', clients.map((c) => c.id)); // Log pour chaque client
  clients.forEach((client) => {
    client.send(JSON.stringify(message));
  });
};

// Fonction permettant de créer une partie
const handleCreateSketchGame = (client: CustomWebSocket) => {
  
  let gameId = Math.random().toString(36).substring(2, 10)

  while (gameId in state.sketchGames) {
    gameId = Math.random().toString(36).substring(2, 10);
  }

  const player: PlayerWebSocket = Object.assign(client, { score: 0 });

  const game = new SketchGameManager(gameId, player);

  state.sketchGames.push(game);

  client.send(
    JSON.stringify({
      sender: "server",
      type: "gameCreated",
      ...game.getGameInfo(),
      gameId: game.id,
    })
  );

};

// Fonction permettant de rejoindre une partie
const handleJoinSketchGame = (client: CustomWebSocket, message: ClientMessage) => {
  const game = state.sketchGames.find((g) => g.id === message.game);
  const player: PlayerWebSocket = Object.assign(client, { score: 0 });

  if (game && game.state === "waiting" && !game.players.find((p) => p.id === player.id)) {
    game.addPlayer(player);
  }
};

const handleGetSketchGame = (client: CustomWebSocket, message: ClientMessage) => {
  const game = state.sketchGames.find((g) => g.id === message.game);

  if (game) {
    client.send(
      JSON.stringify({
        sender: "server",
        type: "getSketchGame",
        ...game.getGameInfo(),
      })
    );
  } else {
    client.send(
      JSON.stringify({
        sender: "server",
        type: "getSketchGame",
        state: "notFound",
      })
    );
  }
};

const handleLaunchSketchGame = (client: CustomWebSocket, message: ClientMessage) => {
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

  console.log('Guess:', message.value);

  game.guessWord(player, message);
  
};

// Utilise message handler pour rediriger vers la fonction approprié
const handleIncomingMessage = (client: CustomWebSocket, data: any) => {
  console.log('client: ' + client)
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
    console.log('Client connected: ', client.username, client.id);
    
    const welcomeMessage = {
      sender: "server",
      username: username,
      value: `${username} has joined the chat`,
      type: "connect",
    };

    broadcast([...state.clients.filter((c: CustomWebSocket) => c.id !== client.id)], welcomeMessage)

    client.send(JSON.stringify({
        sender: "server",
        value: "Welcome to the chat",
        type: "login",
        users: [...state.clients.map((c: CustomWebSocket) => c.username), username].filter((u, i, a) => a.indexOf(u) === i),
    }));

    console.log('Clients:', state.clients.map((c: CustomWebSocket) => c.username));
}

// Déconnecte un utilisateur en le retirant du state
const disconnectClient = (client: CustomWebSocket) => {
    console.log('Client disconnected: ', client.username);
    state.sketchGames.forEach((g) => {
      g.removePlayer(client.id);
    });

    const messageToSend = {
      sender: "server",
      username: client.username,
      value: `${client.username} has left the chat`,
      type: "disconnect",
      users: state.clients.map((c: CustomWebSocket) => c.username)
    };

    broadcast(state.clients, messageToSend)

    state.clients = state.clients.filter((c: CustomWebSocket) => c.id !== client.id);    
};

// // Partage un message reçu à tous les utilisateurs
// const handleMessage = (client: CustomWebSocket, message: ClientMessage) => {
//     console.log('Message received: ', message);

//     const game = state.sketchGames.find((g) => g.id === message.game);

//     if (!game) {
//       return
//     }

//     const player = game.players.find((p) => p.id === client.id );

//     if (player) {
//       game.guessWord(player, message);
//     }
// }

// Permet d'envoyer qui écrit parmis les utilisateurs
const handleWritting = (client: CustomWebSocket, message: ClientMessage) => {
  const game = state.sketchGames.find((g) => g.id === message.game )
  if (!game) return;

  const player = game.players.find((p) => p.id === client.id)

  if (!player) return;

  if (!game.typingTimeouts[player.id]) {
    game.writtingUsers.push(player);
  }

  console.log(client.username + ' is writting')

  clearTimeout(game.typingTimeouts[player.id]);

  game.typingTimeouts[client.id] = setTimeout(() => {
    game.writtingUsers = game.writtingUsers.filter((c) => c.id !== player.id);
    delete game.typingTimeouts[player.id];
    game.broadcastGameEvent('writting', {
      sender: "user",
      username: client.username,
      writtingUsers: state.writting.map((c) => c.username),
    });
  }, 5000);

  game.broadcastGameEvent('writting', {
    sender: "user",
    username: client.username,
    writtingUsers: game.writtingUsers.map((c) => c.username),
  });
};


wss.on("connection", (socket: CustomWebSocket) => {
  socket.on("close", () => {
    console.log('closing')
    disconnectClient(socket);
  });

  socket.on("message", (data) => {
    handleIncomingMessage(socket, data);
  });
});
