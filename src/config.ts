export default {
    "token": process.env.FIGMA_TOKEN as string,
    "webhook_passcode": process.env.WEBHOOK_PASSCODE as string,
    "matrixOpts": {
        "homeserverUrl": process.env.MATRIX_HOMESERVER_URL as string,
        "accessToken": process.env.MATRIX_ACCESS_TOKEN as string,
    },
    "targetRoom": process.env.TARGET_ROOM as string,
}