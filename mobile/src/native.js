// Phone-app hooks, bundled into www/js/native.js by build.mjs (the website uses the
// do-nothing js/native.js instead).
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// False when www/ is opened in a desktop browser for testing; then everything below is a no-op.
export const NATIVE = Capacitor.isNativePlatform();
if (NATIVE) document.documentElement.classList.add('is-native', 'is-' + Capacitor.getPlatform());

// Links to the app's own pages stay in the app; target=_blank would hand them to the browser.
document.addEventListener('click', e => {
  const a = e.target.closest('a[target]');
  if (a && new URL(a.href, location.href).origin === location.origin) a.removeAttribute('target');
}, true);

export async function pushState() {
  if (!NATIVE) return 'unsupported';
  return (await FirebaseMessaging.checkPermissions()).receive;
}

// Asks for permission if needed, then passes the FCM token to save(); returns the token or null.
let listening = false;
export async function enablePush(save) {
  if (!NATIVE) return null;
  let { receive } = await FirebaseMessaging.checkPermissions();
  if (receive !== 'granted' && receive !== 'denied') ({ receive } = await FirebaseMessaging.requestPermissions());
  if (receive !== 'granted') return null;
  const { token } = await FirebaseMessaging.getToken();
  await save(token);
  if (!listening) {
    listening = true;
    FirebaseMessaging.addListener('tokenReceived', e => save(e.token));
  }
  return token;
}

export function onPushTap(cb) {
  if (!NATIVE) return;
  FirebaseMessaging.addListener('notificationActionPerformed', () => cb());
}

// Saves a file and opens the share sheet (e.g. to add the .ics to the phone's calendar).
export async function shareFile(name, text) {
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: name, files: [uri] });
  return true;
}
