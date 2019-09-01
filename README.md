# http2_nodejs_client_server_example2

This repo is for reproducing an node js http2 bug: 


Deployment instructions:
1. clone files and put server and client on a different linux machines.

# deploy server:
2. create certificate and key using open ssl (name them 'certificate.pem' and 'key.pem').
3. create directory 'cert' next to server.js, and place 'certificate.pem' and 'key.pem' in it.
4. in server directory, init npm (`npm init`), and install 'yargs' (`npm i yargs`) and 'mime-types'.
5. execute `node server.js --port=<port-number>` to deploy the server. 
  
# client side:
6. go to client directory, and execute `npm init`, then install 'yargs', 'lodash' and 'bluebird'.
7. create directory 'cert' next to client.js and place 'certificate.pem' there.
8. execute `node client.js --serverIP=<ip> --port=<server-port> --srcFolder=<path-to-directory-with-files> --trgFolder=<relative-path-to-target-folder-client-side> --concurrency=<number> --servername=<your-server-name>` do download directory with files from server.
  
client arguments (all required):  
serverIP: ip of the server you deployed.  
port: port your server is listening on.  
srcFolder: **ABSOLUTE** path for the directory you want to download. directory must be exists and contain regular files only (no subdirectories, symlinks etc).  
trgFolder: **relative** path to target folder on client side. all files will be downloaded to that folder. folder must be exists.  
concurrecncy: number of files that node handles.  
servername: the server name as you created your key and certificate with.  
