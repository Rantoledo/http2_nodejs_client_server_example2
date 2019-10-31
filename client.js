const { createWriteStream, readFileSync } = require('fs');
const argv = require('yargs').argv;
const Promise = require('bluebird');
const { join } = require('path');
const http2 = require('http2');
const { compact } = require('lodash');
const { pipeline } = require('stream');

const {
    HTTP2_HEADER_METHOD,
    HTTP2_HEADER_PATH,
    HTTP2_METHOD_GET,
    HTTP2_HEADER_STATUS
} = http2.constants;

process.env.UV_THREADPOOL_SIZE = 128;

process.on('uncaughtException', err => console.error('Got uncaught exception', err));
process.on('unhandledRejection', event => console.error('Got unhandled rejection', event));

main();


function connectToServer(serverIP, port) {
    // on client side - http2.connect method creates Http2Session instance.
    return http2.connect(`https://${serverIP}:${port}`, {
        peerMaxConcurrentStreams: 500,
        ca: readFileSync('./cert/certificate.pem'),
        servername: argv.servername,
        MaxSessionMemory: 1000
    });
}

async function getData(stream) {
    return new Promise((resolve, reject) => {
        let data = '';
        stream.on('data', chunk => {
            data += chunk;
        });
        stream.on('end', () => {
            resolve(data);
        });
        stream.on('error', err => {
            console.error(`Error while receiving data from server. error: ${err}`);
            reject(new Error(err));
        });
    });
}


async function checkResponse(request) {
    return new Promise((resolve, reject) => {
        request.on('response', async headers => {
            console.log(`Got response from server - STATUS CODE: ${headers[HTTP2_HEADER_STATUS]}.`);
            if (headers[HTTP2_HEADER_STATUS] !== 200 && headers[HTTP2_HEADER_STATUS] !== 202) {
                const errorFromServer = await getData(request);
                switch (headers[HTTP2_HEADER_STATUS]) {
                    case 500:
                    case 400:
                        reject(new Error(`Server Error: STATUS ${headers[HTTP2_HEADER_STATUS]}.\nError received from server: ${errorFromServer}`));
                        break;
                    default:
                        reject(new Error('Received unknown status code from server.'));
                }
            } else {
                resolve();
            }
        });
    });
}
async function getList(serverIP, path, port) {
    const client = connectToServer(serverIP, port);

    const request = client.request({
        [HTTP2_HEADER_PATH]: path,
        [HTTP2_HEADER_METHOD]: HTTP2_METHOD_GET
    });

    request.on('error', err => {
        console.error('Request had an error:', err);
    });
    await checkResponse(request);
    const data = await getData(request);
    client.close();
    return data ? JSON.parse(data) : [];
}

async function getSecureReadStream(client, path) {
    const serverStream = client.request({
        [HTTP2_HEADER_PATH]: path,
        [HTTP2_HEADER_METHOD]: HTTP2_METHOD_GET,
    });

    serverStream.on('error', err => {
        console.error('Request had an error:', err);
    });
    await checkResponse(serverStream);
    return serverStream;
}

function gracefullJoin(...paths) {
    return join(...compact(paths));
}

async function main() {

        let entriesArray;
        try {
            entriesArray = await getList(argv.serverIP, argv.srcFolder, argv.port);
        } catch (e) {
            console.error(`error while getting files list:`, e);
        }

        const client = connectToServer(argv.serverIP, argv.port);
        client.on('error', err => {
            console.error(`Client session error: ${err}`);
        });

        await Promise.map(entriesArray, async entry => {
            try {
                const readStream = await getSecureReadStream(client, gracefullJoin(argv.srcFolder, entry));
                const writeStream = createWriteStream(gracefullJoin(argv.trgFolder, entry));
                await pipe(readStream, writeStream);
                readStream.close();
                writeStream.close();
            } catch (e) {
                console.error(`error getting file:`, e);
            }
        }, { concurrency: argv.concurrency});
        client.close();
}

async function pipe(readStream, writeStream) {
    return new Promise((resolve, reject) => {
        pipeline(
            readStream,
            writeStream,
            err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}
