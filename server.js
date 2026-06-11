const ChatRoom = require("./chat-room");
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const chatRoom = new ChatRoom(app, wss);
chatRoom.initialiseAllRoutes();
chatRoom.initialiseWebSocket();

server.listen(3000, () => console.log("Server running on port 3000"));
