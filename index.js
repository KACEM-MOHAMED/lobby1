const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");
const { setupSocket } = require("./socketController");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["*"],
    allowedHeaders: ["*"],
    credentials: true,
  },
});

setupSocket(io);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
