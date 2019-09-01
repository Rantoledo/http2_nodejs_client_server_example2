const http2 = require('http2');
const { openSync, closeSync, readFileSync } = require('fs');
const { readdir, lstat } = require('fs').promises;
const mimeType = require('mime-types');
const argv = require('yargs').argv;

const TYPE_DIRECTORY = 'DIRECTORY';
const TYPE_FILE = 'FILE';
const TYPE_OTHER = 'OTHER';

const {
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_CONTENT_TYPE,
    HTTP2_HEADER_PATH,
    HTTP2_HEADER_METHOD,
    HTTP2_METHOD_GET
} = http2.constants;

process.env.UV_THREADPOOL_SIZE = 128;


process.on('uncaughtException', err => console.error('Got uncaught exception', err));
process.on('unhandledRejection', event => console.error('Got unhandled rejection', event));


main();

async function main() {

    // deploy server
    const server = initServer(argv.port);

    server.on('error', err => {
        console.error(`Server has encountered an error: ${err}.\nClosing server...`);
        server.close();
        process.exit(1);
    });

    server.on('sessionError', err => {
        console.error(`Server had a session error:`, err);
    });

    server.on('stream', async (stream, headers) => {
        try {
            await dispatch(stream, headers);
        } catch (err) {
            console.error(`dispatch failed: `, err);
            stream.respond({[HTTP2_HEADER_STATUS]: 500});
            stream.end(err.toString());
        }
    });
}

function initServer(port){

    const server = http2.createSecureServer({
        peerMaxConcurrentStreams: 500,
        key: readFileSync('./cert/key.pem'),
        cert: readFileSync('./cert/certificate.pem')
    });
    server.listen(port);
    console.log(`Server deployed. Listening on port number: ${port}`);
    return server;
}

async function dispatch(stream, headers) {

    const method = headers[HTTP2_HEADER_METHOD];
    console.log(`method received from client: ${method}`);
    if (method === HTTP2_METHOD_GET) {

        // get path type
        const {[HTTP2_HEADER_PATH]: path} = headers;
        const stats = await lstat(path);
        const type = getType(stats);

        switch (type) {
            case TYPE_DIRECTORY: { // if type is directory, list entries and send back
                const entries = await readdir(path);
                console.log(`Files list: ${JSON.stringify(entries)}`);
                stream.respond({
                    [HTTP2_HEADER_STATUS]: 200
                });
                stream.end(JSON.stringify(entries));
                break;
            }

            case TYPE_FILE: { // if type is file, download it.
                const contentType = mimeType.lookup(path) || 'application/octet-stream';
                console.log(`file: ${path}, contentType: ${contentType}`);
                const fileHandle = openSync(path, 'r');
                stream.respondWithFD(fileHandle, {
                    [HTTP2_HEADER_CONTENT_TYPE]: contentType,
                    [HTTP2_HEADER_STATUS]: 200
                });
                stream.on('close', () => {
                    console.log(`got close from client! closing fd`);
                    closeSync(fileHandle);
                });
                break;
            }
        }
    }
}


function getType(stats){
    let type = TYPE_OTHER;
    if (stats.isDirectory()) {
        type = TYPE_DIRECTORY;
    } else if (stats.isFile()) {
        type = TYPE_FILE;
    }
    return type;
}


