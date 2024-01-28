const fs = require("fs");

let connectedPlayers = {};
let rooms = {};
let games = {};

function setupSocket(io) {
  io.on("connection", (socket) => {
    const username = socket.handshake.query.username;

    // Validate the username
    if (!isValidUsername(username)) {
      console.error(`Invalid username: ${username}`);
      socket.disconnect(true); // Disconnect the socket
      return;
    }
    socket.emit("setUsername", username);
    console.log(`Player ${username} connected`);
    io.emit("GlobalChat", {
      sender: "Server",
      message: `${username} is Online`,
      date: new Date(),
    });

    // Add the username and socket.id to the connectedPlayers object
    connectedPlayers[socket.id] = username;
    // Broadcast the updated count and the connected players to other connected clients
    io.emit("playerCount", Object.keys(connectedPlayers).length);
    io.emit("connectedPlayers", Object.values(connectedPlayers));
    console.log(connectedPlayers);
    io.emit("rooms", Object.values(rooms));

    socket.on("getPlayerCount", () => {
      socket.emit("playerCount", Object.keys(connectedPlayers).length);
    });
    socket.on("getRooms", () => {
      socket.emit("rooms", Object.values(rooms));
    });
    // Handle other socket events...
    socket.on("createRoom", ({ username, roomName, size }) => {
      // return if the player already has a room
      if (rooms[socket.id]) {
        return;
      }
      const newRoom = {
        id: socket.id,
        roomName: roomName,
        host: socket.id,
        hostUsername: username,
        players: [{ playerid: socket.id, playerName: username, isReady: true }],
        createdAt: new Date(),
        size: size,
        isFull: false,
        state: "waiting",
      };
      const newGame = { isReady: false };
      rooms[socket.id] = newRoom;
      games[socket.id] = newGame;
      // Broadcast the updated list of rooms to all clients
      io.emit("rooms", Object.values(rooms));
      io.emit(
        "RoomChat",
        { sender: "Server", message: `Room Created`, date: new Date() },
        socket.id
      );
    });

    socket.on("getRoomDetails", ({ roomid }) => {
      // Find the room details based on the provided roomid
      const roomDetails = rooms[roomid];
      // Emit the roomDetails back to the client
      socket.emit("roomDetails", roomDetails);
    });

    socket.on("joinRoom", ({ playersocketid, roomid }) => {
      if (rooms[roomid].players.length < rooms[roomid].size) {
        socket.emit("joinedRoom", { success: true, roomid });
        // Update the players array for the specified room
        let updatedRooms = {
          ...rooms,
          [roomid]: {
            ...rooms[roomid],
            players: [
              ...rooms[roomid].players,
              {
                playerid: playersocketid,
                playerName: connectedPlayers[playersocketid],
                isReady: false,
              },
            ],
          },
        };

        // Assign the result to the original rooms object
        rooms = updatedRooms;
        updateRoomIsFull(roomid);
        // Log the updated rooms object
        console.log(rooms);
        const roomDetails = rooms[roomid];
        // Emit the roomDetails back to the client
        io.emit("roomDetails", roomDetails);
        io.emit("rooms", Object.values(rooms));
        io.emit(
          "RoomChat",
          {
            sender: "Server",
            message: `${connectedPlayers[playersocketid]} Joined`,
            date: new Date(),
          },
          roomid
        );
      } else {
        socket.emit("joinedRoom", { success: false, reason: "full" });
      }
    });

    socket.on("quitRoom", ({ playersocketid, roomid }) => {
      //if the player who quit is host delete room
      if (rooms[playersocketid]) {
        delete rooms[playersocketid];
        //kick rest of players from room
        io.emit("kickFromRoom", roomid);
        // delete game if it exists
        if (games && games[roomid]) {
          delete games[roomid];
        }
      }
      //if player who is not host quits
      if (rooms[roomid]) {
        // Find the index of the player in the players array
        const playerIndex = rooms[roomid].players.findIndex(
          (player) => player.playerid === playersocketid
        );
        if (playerIndex !== -1) {
          // Remove the player from the players array
          rooms[roomid].players.splice(playerIndex, 1);
        }
        updateRoomIsFull(roomid);
        rooms[roomid].state === "waiting" &&
          io.emit(
            "RoomChat",
            {
              sender: "Server",
              message: `${connectedPlayers[playersocketid]} Left`,
              date: new Date(),
            },
            roomid
          );
        if (rooms[roomid].state === "playing") {
          io.emit(
            "RoomChat",
            {
              sender: "Server",
              message: `Game Interrupted, Reason: ${connectedPlayers[playersocketid]} Left`,
              date: new Date(),
            },
            roomid
          );
          rooms[roomid].state = "waiting";
          if (games && games[roomid]) {
            delete games[roomid];
          }
        }
        io.emit("roomDetails", rooms[roomid]);
        console.log(rooms[roomid]);
      }

      // Emit the roomDetails back to the clients
      io.emit("rooms", Object.values(rooms));
    });

    socket.on("disconnect", () => {
      if (connectedPlayers[socket.id]) {
        const disconnectedUsername = connectedPlayers[socket.id];
        delete connectedPlayers[socket.id];

        console.log(`Player ${disconnectedUsername} disconnected`);

        io.emit("GlobalChat", {
          sender: "Server",
          message: `${disconnectedUsername} Went Offline`,
          date: new Date(),
        });

        // Broadcast the updated count and the connected players to other connected clients
        io.emit("connectedPlayers", Object.values(connectedPlayers));
        io.emit("playerCount", Object.keys(connectedPlayers).length);
      }
      //if the a host disconnected
      if (rooms[socket.id]) {
        delete rooms[socket.id];
        io.emit("kickFromRoom", socket.id);
        // delete game if it exists
        if (games && games[socket.id]) {
          delete games[socket.id];
        }
      }
      // not host disconnected , Loop through each room
      for (const roomId in rooms) {
        if (rooms.hasOwnProperty(roomId)) {
          // Remove the player from the players array
          const removedPlayer = rooms[roomId].players.find(
            (player) => player.playerid === socket.id
          );
          rooms[roomId].players = rooms[roomId].players.filter(
            (player) => player.playerid !== socket.id
          );
          if (removedPlayer) {
            // Emit a "RoomChat" event when a player leaves
            rooms[roomId].state === "waiting" &&
              io.emit(
                "RoomChat",
                {
                  sender: "Server",
                  message: `${removedPlayer.playerName} disconnected`,
                  date: new Date(),
                },
                roomId
              );
            if (rooms[roomId].state === "playing") {
              io.emit(
                "RoomChat",
                {
                  sender: "Server",
                  message: `Game Interrupted, Reason: ${removedPlayer.playerName} disconnected`,
                  date: new Date(),
                },
                roomId
              );
              rooms[roomId].state = "waiting";
              if (games[roomId]) {
                delete games[roomId];
              }
            }
          }
        }

        // Emit the roomDetails back to the client
        updateRoomIsFull(roomId);
        io.emit("roomDetails", rooms[roomId]);
      }
      // Broadcast the updated list of rooms to all clients
      console.log(rooms);
      io.emit("rooms", Object.values(rooms));
    });

    socket.on("GlobalChat", (Msg) => {
      io.emit("GlobalChat", Msg);
    });

    socket.on("RoomChat", (newMsg, roomid) => {
      console.log("Recieved " + newMsg.message + " In room " + roomid);
      io.emit("RoomChat", newMsg, roomid);
    });

    socket.on("readyUp", ({ roomid }) => {
      const room = rooms[roomid];
      if (room) {
        // Find the player by playerid
        const player = room.players.find(
          (player) => player.playerid === socket.id
        );
        // Check if the player exists
        if (player) {
          // Set the isReady state of the player to true
          player.isReady = true;
          io.emit(
            "RoomChat",
            {
              sender: "Server",
              message: `${player.playerName} is READY`,
              date: new Date(),
            },
            roomid
          );
        }
      }
      io.emit("roomDetails", rooms[roomid]);
    });
    socket.on("startGame", ({ roomid }) => {
      const room = rooms[roomid];
      if (room && room.host === socket.id) {
        room.state = "playing";
        io.emit(
          "RoomChat",
          {
            sender: "Server",
            message: `${room.hostUsername} Started the game`,
            date: new Date(),
          },
          roomid
        );
        games[roomid] = {
          countries:
            getCountriesData() /*[{ country: "ITALY", hints: ["in europe", "has green in it"] },]; */,
          gameInProgress: true,
          gameState: {
            currentCountryIndex: 0,
            scores: {},
          },
          timer: 10,
          isTimeoutProcessing: false,
        };
        for (let player of room.players) {
          games[roomid].gameState.scores[player.playerid] = 0; // Initialize scores to zero
        }
        console.log("*****Game Object******");
        console.dir(games[roomid], { depth: null, colors: true });
      }
      console.log(rooms[roomid]);
      io.emit("roomDetails", rooms[roomid]);
      io.emit("rooms", Object.values(rooms));
    });

    socket.on("gameState", (roomid) => {
      const gameState = games[roomid];
      socket.emit("gameState", gameState);
    });

    socket.on("correctGuess", (roomid) => {
      const gameState = games[roomid];
      console.log(gameState);
      console.log("**********************************");
      gameState.gameState.scores[socket.id] += 10;
      gameStateScores = gameState.gameState.scores;
      const playerIds = Object.keys(gameStateScores);
      handleNextIndexLogic(gameState, playerIds, roomid, socket);
    });

    socket.on("timeout", (roomid) => {
      const gameState = games[roomid];
      console.log("++++TIMEOUT REQUEST++++");
      gameState && console.log(gameState.isTimeoutProcessing);
      if (gameState && !gameState.isTimeoutProcessing) {
        gameState.isTimeoutProcessing = true;
        gameStateScores = gameState.gameState.scores;
        const playerIds = Object.keys(gameStateScores);
        handleNextIndexLogic(gameState, playerIds, roomid, socket);
        // Release the lock after handling the timeout
        setTimeout(() => {
          gameState.isTimeoutProcessing = false;
        }, 1000);
      }
    });
  });

  function handleNextIndexLogic(gameState, playerIds, roomid, socket) {
    if (gameState.gameState.currentCountryIndex < 9) {
      gameState.gameState.currentCountryIndex++;
      for (const socketId of playerIds) {
        io.to(socketId).emit("gameState", gameState);
      }
    } else {
      // Find the player with the highest score
      const highestScore = Math.max(
        ...playerIds.map((playerId) => gameStateScores[playerId] || 0)
      );
      // Find all players with the highest score (could be multiple in case of a draw)
      const winners = playerIds.filter(
        (playerId) => gameStateScores[playerId] === highestScore
      );
      console.log("********Winners*****");
      console.log(winners);
      let result = "No Result";
      if (winners.length === 1) {
        // Single winner
        result = {
          type: "win",
          winnerid: winners[0],
          winner: connectedPlayers[winners[0]],
          scores: playerIds
            .sort((a, b) => gameStateScores[b] - gameStateScores[a])
            .map((playerId) => ({
              playerName: connectedPlayers[playerId],
              score: gameStateScores[playerId] || 0,
            })),
        };
      } else {
        // Draw
        result = {
          type: "draw",
          winners: winners.map((playerId) => connectedPlayers[playerId]),
          scores: playerIds
            .sort((a, b) => gameStateScores[b] - gameStateScores[a])
            .map((playerId) => ({
              playerName: connectedPlayers[playerId],
              score: gameStateScores[playerId] || 0,
            })),
        };
      }
      console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
      console.log(result);
      gameState.gameInProgress = false;
      for (const socketId of playerIds) {
        io.to(socketId).emit("gameResult", result);
      }
      if (result.type === "win") {
        if (playerIds.length === 2) {
          for (const socketId of playerIds) {
            io.to(socketId).emit(
              "RoomChat",
              {
                sender: "Server",
                message: `${result.winner} WON vs ${result.scores[1].playerName}!💪😎 `,
                date: new Date(),
              },
              roomid
            );
          }
          io.emit("GlobalChat", {
            sender: "Server",
            message: `${result.winner} WON vs ${result.scores[1].playerName}!💪😎`,
            date: new Date(),
          });
        } else {
          for (const socketId of playerIds) {
            io.to(socketId).emit(
              "RoomChat",
              {
                sender: "Server",
                message: `${result.winner} WON!💪😎 `,
                date: new Date(),
              },
              roomid
            );
          }

          socket.id === roomid &&
            io.emit("GlobalChat", {
              sender: "Server",
              message: `${result.winner} WON!💪😎`,
              date: new Date(),
            });
        }
      }
      //delete room and game here
      if (games && games[roomid]) {
        delete games[roomid];
      }
      if (rooms && rooms[roomid]) {
        delete rooms[roomid];
        io.emit("rooms", Object.values(rooms));
      }
    }
  }
}

// Validate function to check if the username is valid
function isValidUsername(username) {
  return username && username.trim() !== "";
}

function updateRoomIsFull(roomId) {
  console.log("here");
  const originalRoom = rooms[roomId];
  if (originalRoom) {
    // Create a shallow copy of the room object
    const room = { ...originalRoom };
    // Modify the copied room object
    room.isFull = room.players.length >= room.size;
    // Update the original room in the rooms collection
    rooms[roomId] = room;
    console.log(room);
  } else {
    console.error("Room not found!");
  }
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function getCountriesData() {
  try {
    // Read the contents of the data.json file
    const rawData = fs.readFileSync("data.json");

    // Parse the JSON data
    const data = JSON.parse(rawData);

    // Ensure there are enough elements in the data array
    if (data.length < 10) {
      throw new Error("Insufficient data elements");
    }

    // Shuffle the data array to ensure randomness
    for (let i = data.length - 1; i > 0; i--) {
      const j = getRandomInt(i + 1);
      [data[i], data[j]] = [data[j], data[i]];
    }

    // Select 10 random elements from the shuffled data
    const randomElements = data.slice(0, 10);

    // Modify each element to include only 5 random hints with the flag hint always as the 5th hint
    const result = randomElements.map((element) => {
      const randomHints = [];

      // Exclude reveal letter hints from the first hint
      const firstHintIndex = element.hints.findIndex(
        (hint) => hint.type !== "reveal letter"
      );

      // Add the first hint (excluding reveal letter hints)
      if (firstHintIndex !== -1) {
        randomHints.push(element.hints.splice(firstHintIndex, 1)[0]);
      } else if (element.hints.length > 0) {
        // If no non-reveal letter hints are available, add a random hint
        const randomHintIndex = getRandomInt(element.hints.length);
        randomHints.push(element.hints.splice(randomHintIndex, 1)[0]);
      }

      // Add the next 4 hints
      for (let i = 0; i < 4 && element.hints.length > 0; i++) {
        const randomHintIndex = getRandomInt(element.hints.length);
        randomHints.push(element.hints.splice(randomHintIndex, 1)[0]);
      }

      // Add the flag hint as the 5th hint if available
      const flagHintIndex = element.hints.findIndex(
        (hint) => hint.type === "show flag"
      );
      if (flagHintIndex !== -1) {
        randomHints.push(element.hints.splice(flagHintIndex, 1)[0]);
      }

      // Update the hints property with the selected random hints
      element.hints = randomHints;
      return element;
    });

    return result;
  } catch (error) {
    console.error("Error reading or processing data:", error.message);
    return null; // or handle the error in a way that makes sense for your application
  }
}

module.exports = { setupSocket };
