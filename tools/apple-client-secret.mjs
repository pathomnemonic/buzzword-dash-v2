#!/usr/bin/env node
/**
 * apple-client-secret.mjs — makes the "client secret" that Supabase's Apple sign-in setting asks for.
 *
 * Apple does not give you a ready-made secret: you sign one yourself from the key file (.p8) you download in the Apple
 * developer account, and it stops working after at most six months (180 days). Run this again before it expires.
 *
 *   node tools/apple-client-secret.mjs --team ABCDE12345 --key-id K1234567 --services-id com.pathomnemonic.dxdash.web --p8 ~/Downloads/AuthKey_K1234567.p8
 *
 * It prints the secret (one long line of three parts joined by dots) and the date it stops working. Paste the line into
 * Supabase → Authentication → Sign In / Providers → Apple → "Secret Key (for OAuth)". The .p8 file never leaves your
 * computer and is never printed; keep it out of the repository.
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

export function appleProviderSecret(opts, nowSec) {
  var DAYS = 180;
  var b64 = function (buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var header = { alg: 'ES256', kid: opts.keyId, typ: 'JWT' };
  var exp = nowSec + DAYS * 86400 - 3600;
  var claims = { iss: opts.teamId, iat: nowSec, exp: exp, aud: 'https://appleid.apple.com', sub: opts.servicesId };
  var input = b64(JSON.stringify(header)) + '.' + b64(JSON.stringify(claims));
  var sig = createSign('SHA256').update(input).sign({ key: opts.privateKey, dsaEncoding: 'ieee-p1363' });
  return { secret: input + '.' + b64(sig), expires: new Date(exp * 1000) };
}

function arg(name) {
  var i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : '';
}

if (process.argv[1] && process.argv[1].endsWith('apple-client-secret.mjs')) {
  var teamId = arg('team'), keyId = arg('key-id'), servicesId = arg('services-id'), p8 = arg('p8');
  if (!teamId || !keyId || !servicesId || !p8) {
    console.error('Usage: node tools/apple-client-secret.mjs --team <Team ID> --key-id <Key ID> --services-id <Services ID> --p8 <path to AuthKey_XXXX.p8>');
    process.exit(2);
  }
  var out = appleProviderSecret({ teamId: teamId, keyId: keyId, servicesId: servicesId, privateKey: readFileSync(p8, 'utf8') }, Math.floor(Date.now() / 1000));
  console.log(out.secret);
  console.error('\nStops working on ' + out.expires.toISOString().slice(0, 10) + '. Put a reminder in your calendar a week before.');
}
