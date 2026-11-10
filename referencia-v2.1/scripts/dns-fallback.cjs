// Solo para scripts locales: si la resolución DNS del sistema falla (algunos entornos
// aislados), usa la consulta DNS directa. Uso: node --require ./scripts/dns-fallback.cjs ...
const dns = require("node:dns");
const original = dns.lookup;
dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === "function") [callback, options] = [options, {}];
  const opts = typeof options === "number" ? { family: options } : options || {};
  original.call(dns, hostname, opts, (err, address, family) => {
    if (!err) return callback(null, address, family);
    dns.resolve4(hostname, (err4, addrs) => {
      if (err4 || !addrs.length) return callback(err);
      if (opts.all) return callback(null, addrs.map((a) => ({ address: a, family: 4 })));
      callback(null, addrs[0], 4);
    });
  });
};
