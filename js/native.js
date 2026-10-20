// Phone-app hooks. On the website these do nothing; the App Store / Google Play builds
// replace this file with mobile/src/native.js (see mobile/build.mjs).
export const NATIVE = false;
export async function pushState() { return 'unsupported'; }
export async function enablePush() { return null; }
export function onPushTap() {}
export async function shareFile() { return false; }
