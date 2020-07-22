import * as Figma from "figma-js";
import express from "express";
import e, { Request, Response } from "express";
import bodyParser from "body-parser";
import { MatrixClient, MatrixEvent, MessageEventContent, MembershipEventContent, AutojoinUpgradedRoomsMixin, StateEvent, LogService, LogLevel } from "matrix-bot-sdk";
import config from "./config";
import { FigmaRoomStateGlobalConfigEventType, IFigmaRoomStateGlobalConfig, FigmaFileRoom, IFigmaRoomStateFile, FigmaRoomStateFileEventType } from "./FigmaRoom";
import { IFigmaPayload } from "./IPayload";

LogService.setLevel(LogLevel.INFO);

class FigmaApp {
    private figma: Figma.ClientInterface;
    private matrixClient: MatrixClient;
    private globalState!: IFigmaRoomStateGlobalConfig;
    private figmaRooms: FigmaFileRoom[] = [];
    private myUserId: string = "";
    private catchAllRoom: FigmaFileRoom;

    constructor() {
        this.figma = Figma.Client({
            personalAccessToken: config.token,
        });
        this.matrixClient = new MatrixClient(
            config.matrixOpts.homeserverUrl,
            config.matrixOpts.accessToken
        );
        this.matrixClient.on("room.message", this.onRoomMessage.bind(this));
        this.matrixClient.on("room.event", this.onRoomEvent.bind(this));
        this.matrixClient.on("room.invite", this.onInvite.bind(this))
        AutojoinUpgradedRoomsMixin.setupOnClient(this.matrixClient);
        this.catchAllRoom = new FigmaFileRoom(config.adminRoom, "", { fileId: "" }, this.matrixClient);
    }

    private async onInvite(roomId: string, event: MatrixEvent<MembershipEventContent>) {
        if (!this.globalState) {
            // Still starting up, ignore
            return;
        }
        if (!this.globalState.adminUsers.includes(event.sender)) {
            console.warn(`Rejecting invite from ${event.sender} because they are not an admin`);
            await this.matrixClient.kickUser(this.matrixClient.getUserId(), roomId, "User is not on the permitted admin user list");
            return;
        }
        await this.matrixClient.joinRoom(roomId);
        let existingRoom = false;
        if (!existingRoom) {
            await this.matrixClient.sendNotice(roomId, "Hello 👋. Please give me moderator permissions, and say `figma track <fileId>` to start tracking comments for a file.");
        }
    }

    private async onRoomEvent(roomId: string, event: any) {
        if (event.unsigned?.age && event.unsigned?.age > 15000) {
            console.log("ignoring old event");
        }
        console.debug("onRoomEvent => ", roomId, event.event_id, event.type, event.state_key);
        if (event.type === FigmaRoomStateFileEventType && event.state_key) {
            // Do we have a room for this already?
            const existingRoom = this.figmaRooms.find((r) => r.roomId === roomId && r.stateKey === event.state_key);
            if (existingRoom) {
                console.log("Updating state for existing room", event);
                existingRoom.updateState(event.content as IFigmaRoomStateFile);
            } else {
                // Create a new room.
                console.log("Created new room from state", event);
                const state = event.content as IFigmaRoomStateFile;
                await this.matrixClient.sendNotice(roomId, `Excellent! I am tracking ${state.fileId}.`);
                this.figmaRooms.push(new FigmaFileRoom(roomId, event.state_key, state, this.matrixClient));
            }
        } else if (event.type === FigmaRoomStateGlobalConfigEventType && event.state_key === "" && roomId === config.adminRoom) {
            console.log("Updating global config to", event.content);
            this.globalState = event.content as IFigmaRoomStateGlobalConfig;
        }
        // Otherwise, ignore the event.
    } 

    private async onRoomMessage(roomId: string, event: any) {
        console.debug("onRoomMessage => ", roomId, event.type, event.sender);
        if (event.unsigned?.age && event.unsigned.age > 15000) {
            console.log("ignoring old event");
        }
        if (!event.content.body || event.sender === this.myUserId) {
            // Needs to be a message.
            return;
        }
        // Is it an existing figma room.
        const figmaRooms = this.figmaRooms.filter(r =>r.roomId === roomId);
        if (figmaRooms.length === 0) {
            // Not a figma room, is it a construction message?
            const result = /figma track ([A-Za-z]+)/.exec(event.content.body);
            if (result) {
                // It is!
                let resultEmoji = "✅";
                try {
                    await FigmaFileRoom.createState(roomId, result[1], this.matrixClient);
                } catch (ex) {
                    await this.matrixClient.sendNotice(roomId, "Sorry, I need permission to send state events in order to start tracking. You can revoke the permission afterwards.");
                    resultEmoji = "❌";
                    return;
                }
                await this.matrixClient.sendEvent(roomId, "m.reaction", {
                    "m.relates_to": {
                        rel_type: "m.annotation",
                        event_id: event.event_id,
                        key: resultEmoji,
                    }
                });
                // We don't need to push it, we will get the state reflected back.
                return;
            }
        }
        for (const figmaRoom of figmaRooms) {
            console.log(`Sending event to figma room`);
            await figmaRoom.onMessageEvent(event);
        }
    }

    private async syncRooms() {
        let joinedRooms: string[]|undefined;
        while(joinedRooms === undefined) {
            try {
                joinedRooms = await this.matrixClient.getJoinedRooms();
            } catch (ex) {
                console.warn("Could not get joined rooms, retrying in 5s");
                await new Promise(res => setTimeout(res, 5000));
            }
        }
        for (const roomId of joinedRooms) {
            try {
                const roomState = await this.matrixClient.getRoomState(roomId);
                for (const event of roomState) {
                    if (event.type === FigmaRoomStateFileEventType) {
                        console.log("Created new room from state", roomId, event.content);
                        this.figmaRooms.push(new FigmaFileRoom(roomId, event.state_key, event.content as IFigmaRoomStateFile, this.matrixClient));
                    }
                    // Else, ignore.
                }
            } catch (ex) {
                console.warn("Couldn't get room state for:", roomId, ex);
            }
        }
    }

    private async onWebhook(req: Request, res: Response) {
        const payload = req.body as IFigmaPayload;
        if (payload.passcode !== config.webhook_passcode) {
            console.warn("Invalid passcode for payload!");
            return res.sendStatus(401);
        }
        res.sendStatus(200);
        console.log("Got payload:", req.body, req.rawHeaders, req.query);
        if (!payload.file_name || !payload.comment_id) {
            return;
        }
        // We need to check if the comment was actually new.
        // There isn't a way to tell how the comment has changed, so for now check the timestamps
        if (Date.now() - Date.parse(payload.created_at) > 5000) {
            // Comment was created at least 5 seconds before the webhook, ignore it.
            console.log("Comment is stale, ignoring");
            return;
        }
        const rooms = this.figmaRooms.filter((r) => r.fileId === payload.file_key);
        if (rooms.length) {
            await Promise.all(rooms.map(async (r) => 
                r.handleNewComment(payload)
            ));
        } else {
            // Send to the catch-all
            this.catchAllRoom.handleNewComment(payload);
        }
    }

    public async startup() {    
        console.log("Syncing rooms...");
        await this.syncRooms();
        this.myUserId = await this.matrixClient.getUserId();

        // Get config from admin room.
        while(this.globalState === undefined) {
            try {
                await this.matrixClient.joinRoom(config.adminRoom);
                this.globalState = await this.matrixClient.getRoomStateEvent(config.adminRoom, FigmaRoomStateGlobalConfigEventType, ""); 
                console.log(this.globalState);   
            } catch (ex) {
                console.error(`Could not start, waiting for ${FigmaRoomStateGlobalConfigEventType} to be defined in ${config.adminRoom}. Waiting 5s`);
                await new Promise(res => setTimeout(res, 5000));
            } 
        }
    
        const app = express()
            .use(bodyParser.json())
            .post("/", this.onWebhook.bind(this))
            .listen(9898);
        console.log(`Listening on http://0.0.0.0:9898`);
        console.log("Starting matrix sync..");
        await this.matrixClient.start();
    }
}

async function main() {
    const app = new FigmaApp();
    await app.startup();
}

main().catch((ex) => {
    console.log("FATAL EXCEPTION", ex);
})