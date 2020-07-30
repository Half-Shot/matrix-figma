import { MatrixEvent, MessageEventContent, MatrixClient, RichReply } from "matrix-bot-sdk";

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

    private commentIdToEvent: Map<string,string> = new Map();

    public get fileId() {
        return this.state.fileId;
    }

    public async onMessageEvent(event: MatrixEvent<MessageEventContent>) {

    }

    public async handleNewComment(payload: IFigmaPayload) {
        const permalink = `https://www.figma.com/file/${payload.file_key}#${payload.comment_id}`;
        const comment = payload.comment.map(({text}) => text).join("\n");
        const empty = "‎"; // This contains an empty character to thwart the notification matcher.
        const name = payload.triggered_by.handle.split(' ').map(p => p[0] + empty + p.slice(1)).join(' ');
        const parentEventId = this.commentIdToEvent.get(payload.parent_id);
        let content;
        if (parentEventId) {
            const body = `**${name}**: ${comment}`;
            content = RichReply.createFor(this.roomId, parentEventId, body, md.renderInline(body));
        } else {
            const body = `**${name}** [commented](${permalink}) on [${payload.file_name}](https://www.figma.com/file/${payload.file_key}): ${comment}`;
            content = {
                "msgtype": "m.notice",
                "body": body,
                "formatted_body": md.renderInline(body),
                "format": "org.matrix.custom.html"
            };
        }
        content["uk.half-shot.matrix-figma.comment_id"] = payload.comment_id;
        const eventId = await this.client.sendMessage(this.roomId, content);
        this.commentIdToEvent.set(payload.comment_id, {
            ...content,
            event_id: eventId,
            sender: await this.client.getUserId(),
        });
    }

    public async updateState(state: IFigmaRoomStateFile) {
        this.state = state;
    }
}