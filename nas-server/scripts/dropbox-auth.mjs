#!/usr/bin/env node
/**
 * dropbox-auth.mjs — one-time helper to mint a Dropbox refresh token.
 *
 * Dropbox refresh tokens never expire (so long as the app stays enabled),
 * which makes them the right thing to store in .env. The minted refresh
 * token lets the server exchange for short-lived access tokens on demand.
 *
 * Usage:
 *   cd nas-server
 *   node scripts/dropbox-auth.mjs
 *
 * You'll be prompted for your App key + App secret (from
 * dropbox.com/developers/apps → your app), then told to visit a URL,
 * authorize, paste the resulting code back. Out comes a refresh token.
 */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

function prompt(q) {
  return rl.question(q);
}

console.log('\n— Dropbox refresh-token setup —\n');
console.log('Step 1. Get your App key + App secret from:');
console.log('  https://www.dropbox.com/developers/apps\n');

const appKey    = (await prompt('App key:    ')).trim();
const appSecret = (await prompt('App secret: ')).trim();

if (!appKey || !appSecret) {
  console.error('\n✗ Need both App key and App secret. Aborting.');
  rl.close();
  process.exit(1);
}

const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(appKey)}&response_type=code&token_access_type=offline`;

console.log('\nStep 2. Open this URL in your browser:\n');
console.log('  ' + authUrl + '\n');
console.log('Click "Allow", then copy the authorization code shown on the next page.\n');

const code = (await prompt('Paste the authorization code here: ')).trim();

if (!code) {
  console.error('\n✗ No code provided. Aborting.');
  rl.close();
  process.exit(1);
}

console.log('\nExchanging code for refresh token…');

const body = new URLSearchParams({
  code,
  grant_type: 'authorization_code',
});
const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');

const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${basicAuth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body,
});

if (!res.ok) {
  const txt = await res.text();
  console.error(`\n✗ Token exchange failed (${res.status}):`);
  console.error(txt);
  rl.close();
  process.exit(1);
}

const data = await res.json();

if (!data.refresh_token) {
  console.error('\n✗ Dropbox did not return a refresh_token. Did you include token_access_type=offline?');
  console.error('Full response:', data);
  rl.close();
  process.exit(1);
}

console.log('\n✓ Success!\n');
console.log('Add these to your nas-server/.env file:\n');
console.log(`DROPBOX_APP_KEY=${appKey}`);
console.log(`DROPBOX_APP_SECRET=${appSecret}`);
console.log(`DROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
console.log('\nThen restart the container:');
console.log('  sudo docker-compose up -d --build\n');

rl.close();
