const { v4: uuidV4 } = require('uuid');

class ChatRoom {
    constructor(app, wss) {
        this.app = app;
        this.wss = wss;
        this.roomWssMap = {};
        this.roomIdTokenSetup = new Map();
    }

    initialiseAllRoutes() {
        this.app.post('/room', (req, res) => {
            const roomId = uuidV4();
            const joiningToken = uuidV4();
            this.roomIdTokenSetup.set(roomId, joiningToken);
            this.roomWssMap[roomId] = [];
            return res.status(201).json({id: roomId});
        });
        this.app.get('/roomtoken/room/:roomId', (req, res) => {
            const roomId = req.params.roomId;
            if (!roomId) {
                return res.status(400).json({err: 'No room Id'});
            }
            if (!this.roomIdTokenSetup.has(roomId)) {
                return res.status(404).json({err: 'Room does not exist'});
            }
            const roomIdToken = this.roomIdTokenSetup.get(roomId);
            return res.status(200).json({token: roomIdToken, id: roomId});
        });
    }

    initialiseWebSocket() {
        this.wss.on('connection', ws => {
            ws.on('message', msg => {
                const message = JSON.parse(msg);
                if (message.type == "ID") {
                    if (message.data && message.data.roomId && message.data.token) {
                        if (this.roomIdTokenSetup.get(message.data.roomId) == message.data.token) {
                            const roomId = message.data.roomId;
                            if (Array.isArray(this.roomWssMap[roomId])) {
                                this.roomWssMap[roomId].push(ws);
                                ws.send(JSON.stringify({type: "SUCCESS"}));
                                ws.roomId = roomId;
                            } else {
                                ws.close(1008, "ROOM DOES NOT EXISTS")
                            }
                        } else {
                            ws.close(1008, "INCORRECT TOKEN");
                        }
                    } else {
                        ws.close(1008, "ROOM ID OR TOKEN DOES NOT EXISTS");
                    }
                }
                if (message.type == "BROADCAST") {
                    if (message.data) {
                        const roomId = ws.roomId;
                        if (Array.isArray(this.roomWssMap[roomId])) {
                            this.roomWssMap[roomId].forEach(client => {
                                client.send(JSON.stringify({type: "BROADCAST", message: message.data}));
                            });
                        }
                    }
                }
            });
            ws.on('close', () => {
                const roomId = ws.roomId;
                if (Array.isArray(this.roomWssMap[roomId])) {
                    this.roomWssMap[roomId] = this.roomWssMap[roomId].filter(client => client !== ws);
                }
            });
        })
    }
}

module.exports = ChatRoom;