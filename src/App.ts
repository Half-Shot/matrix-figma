import * as config from "./config.json";
import * as Figma from "figma-js";
import express from "express";
import bodyParser from "body-parser";
import { MatrixClient } from "matrix-bot-sdk";
import markdownit from "markdown-it";

const md = markdownit();

interface Payload {
        comment: [ { text: string, } ],
        comment_id: string,
        created_at: string,
        event_type: string,
        file_key: string,
        file_name: string,
        mentions: any[],
        order_id: string,
        parent_id: string,
        passcode: string,
        protocol_version: string,
        resolved_at: string,
        retries: number,
        timestamp: string,
        triggered_by: { id: string, handle: string },
        webhook_id: string,
}

async function main() {
    const client = Figma.Client({
        personalAccessToken: config.token,
    });

    const matrixClient = new MatrixClient(config.matrixOpts.homeserverUrl, config.matrixOpts.accessToken);

    // Ensure we are joined.
    await matrixClient.joinRoom(config.targetRoom);

    const app = express().use(bodyParser.json()).post("/", (req, res) => {
        const payload = req.body as Payload;
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
        const body = `**${payload.triggered_by.handle}** commented on [${payload.file_name}](https://www.figma.com/file/${payload.file_key}): ${payload.comment[0].text}`;
        matrixClient.sendMessage(config.targetRoom, {
            "msgtype": "m.text",
            "body": body,
            "formatted_body": md.renderInline(body),
            "format": "org.matrix.custom.html",
        });
    }).listen(9898);
}

main().catch((ex) => {
    console.log("FATAL EXCEPTION", ex);
})