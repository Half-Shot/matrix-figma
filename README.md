# matrix-figma

[![#figma-bridge:half-shot.uk](https://img.shields.io/matrix/figma-bridge:half-shot.uk.svg?server_fqdn=chaotic.half-shot.uk&label=%23figma-bridge:half-shot.uk&logo=matrix)](https://matrix.to/#/#figma-bridge:half-shot.uk) [![Docker Cloud Build Status](https://img.shields.io/docker/cloud/build/halfshot/matrix-figma)](https://hub.docker.com/r/halfshot/matrix-figma)

This bridge enables Matrix users to subscribe to Figma files and have comments streamed into Matrix rooms in realtime.

## Setup

To set up the bridge, simply clone this repository.

`git clone git@github.com:Half-Shot/matrix-figma.git`

then you will need to install dependencies

```bash
cd matrix-figma
npm i # Or "yarn"
```

You will need:
    - A Figma personal access token (with admin rights to the team you are trying to bridge)
      from [here](https://www.figma.com/developers/api#authentication)
    - A user account on Matrix for the bot.
    - A Matrix room for admining the bridge. Ensure you invite the bot to the room.
    - The ability to receive webhook messages through your network. The bridge uses `9898`

The bridge is configured by environment variables. Ideally you should set these up in Docker,
but failing that you can use a bash script.

```env
export FIGMA_TOKEN=""
export WEBHOOK_PASSCODE=""
export MATRIX_HOMESERVER_URL=""
export MATRIX_ACCESS_TOKEN=""
export ADMIN_ROOM=""
```

Once you have these things, you should start the bridge (do it before you create the webhook).

`npm run start # Or "yarn start"`

The bridge should be running, and now you will need to create the webhook.

`curl -X POST -H 'X-FIGMA-TOKEN: YOUR_FIGMA_TOKEN' -H "Content-Type: application/json" 'https://api.figma.com/v2/webhooks' -d '{"event_type":"FILE_COMMENT","team_id":"YOUR_TEAM_ID","endpoint":"EXTERNAL_URL","passcode":"GENERATED_PASSCODE","description":"CUSTOM_DESCRIPTION"}'`

You should fill in the gaps here:

- `EXTERNAL_URL` should be the external url required to reach the bridge on 9898 internally.
- Leave `event_type` as `FILE_COMMENT`.
- `YOUR_TEAM_ID` can be found by clicking on your team on https://www.figma.com and noting the ID in the URL `https://www.figma.com/files/team/<YOUR_TEAM_ID>/foo`
- `GENERATED_PASSCODE` can be anything, but should match `WEBHOOK_PASSCODE`
- `CUSTOM_DESCRIPTION` is just a descrption for showing in the Figma UI.

After running that, you should see a PING in the console of the bridge and you are ready to go!

## Connecting rooms

Connecting rooms is as easy as inviting the bot to a room, giving it moderator permissions so it can modify state,
and sending `figma track fileId`. The `fileId` can be found in the URL when viewing a file in Figma (e.g. `https://www.figma.com/file/<FILEID>/foobar`).
You can revoke the moderator permissions afterwards if you wish.