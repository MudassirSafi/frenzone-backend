let onlineSockets = new Map();

async function setSocket(id, socket){
  if (onlineSockets.get(id)) {
    onlineSockets.get(id).push(socket);
  } else {
    onlineSockets.set(id, [socket]);
  }
}

async function getSocket(id){
  var socket = onlineSockets.get(id);
  return socket;
}

module.exports = { setSocket, getSocket }