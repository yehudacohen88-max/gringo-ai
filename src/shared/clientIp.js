const net = require('net');
const { env } = require('../config/env');

// Rate-limit address. Express `trust proxy` stays false, so req.ip, req.protocol,
// and the admin loopback check do not follow forwarding headers.
//
// TRUST_PROXY_HOPS is an explicit hop count, not a secret:
// - unset or 0: the TCP peer. X-Forwarded-For and X-Real-IP are ignored.
// - 1..5: walk that many trusted proxies from the right of
//   [X-Forwarded-For entries..., TCP peer]. The address immediately to the
//   left is the client. Extra left-hand entries are ignored, so a caller
//   cannot pick an arbitrary address by prepending one.
// - a missing, non-IP, or too-short chain falls back to the TCP peer.
//
// The hop count is provider-specific. No host is approved for this pilot.
// A single reverse proxy is usually 1. The proxy must be the only path to
// this process; if clients can connect directly, a configured hop count lets
// them influence the address. Do not set Express `trust proxy` to `true`.

function socketAddress(req) {
  const socket = req && (req.socket || req.connection);
  const address = socket && typeof socket.remoteAddress === 'string' ? socket.remoteAddress.trim() : '';
  return address || 'unknown';
}

function forwardedAddresses(req) {
  const header = req && req.headers ? req.headers['x-forwarded-for'] : '';
  if (typeof header !== 'string' || !header.trim()) return [];
  return header.split(',').map((part) => part.trim()).filter(Boolean);
}

function clientIp(req) {
  const peer = socketAddress(req);
  const hops = Number(env.trustProxyHops) || 0;
  if (hops < 1) return peer;

  const chain = forwardedAddresses(req);
  if (peer !== 'unknown') chain.push(peer);
  const index = chain.length - hops - 1;
  if (index < 0) return peer;
  const selected = chain[index];
  if (typeof selected !== 'string' || net.isIP(selected) === 0) return peer;
  return selected;
}

module.exports = {
  clientIp,
  socketAddress,
};
