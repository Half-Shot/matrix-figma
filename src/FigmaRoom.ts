import { MatrixEvent, MessageEventContent, MatrixClient } from "matrix-bot-sdk";

export const FigmaRoomStateFileEventType = "uk.half-shot.matrix-figma.file";
export interface IFigmaRoomStateFile {
    fileId: string;
}

export const FigmaRoomStateGlobalConfigEventType = "uk.half-shot.matrix-figma.globalconfig";
export interface IFigmaRoomStateGlobalConfig {
    adminUsers: string[];
}

import markdownit from "markdown-it";
import { IFigmaPayload } from "./IPayload";
const md = markdownit();

export class FigmaFileRoom {
    public static async createState(roomId: string, fileId: string, client: MatrixClient) {
        await client.sendStateEvent(roomId, FigmaRoomStateFileEventType, fileId, {
            fileId: fileId,
        } as IFigmaRoomStateFile);
    }

    constructor(public readonly roomId: string, public readonly stateKey: string, private state: IFigmaRoomStateFile, private client: MatrixClient) { }

    public get fileId() {
        return this.state.fileId;
    }

    public async onMessageEvent(event: MatrixEvent<MessageEventContent>) {

    }

    public async handleNewComment(payload: IFigmaPayload) {
        const permalink = `https://www.figma.com/file/${payload.file_key}#${payload.comment_id}`
        const body = `**${payload.triggered_by.handle}** [commented](${permalink}) on [${payload.file_name}](https://www.figma.com/file/${payload.file_key}): ${payload.comment[0].text}`;
        return this.client.sendMessage(this.roomId, {
            "msgtype": "m.text",
            "body": body,
            "formatted_body": md.renderInline(body),
            "format": "org.matrix.custom.html",
        });
    }

    public async updateState(state: IFigmaRoomStateFile) {
        this.state = state;
    }
}