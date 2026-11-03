// Client address for rate limits.
//
// Deploy assumption: this process is reached directly by the client. The limit
// key is the TCP peer (`socket.remoteAddress`), never X-Forwarded-For,
// X-Real-IP, or req.ip. `trust proxy` stays false. A caller cannot move to
// another bucket by sending a forwarding header.
//
// If a reverse proxy is later placed in front of the process, every user
// shares that proxy's address until a reviewed change trusts exactly that
// one hop. Do not set `trust proxy` to `true`: that trusts the whole
// forwarded chain and lets the client spoof the address.

function clientIp(req) {
  const socket = req && (req.socket || req.connection);
  const address = socket && typeof socket.remoteAddress === 'string' ? socket.remoteAddress.trim() : '';
  return address || 'unknown';
}

module.exports = {
  clientIp,
};
