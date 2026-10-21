# EmptyHands app for the App Store and Google Play

This folder turns the student app (`index.html` in this repository) into real iPhone and Android apps using [Capacitor](https://capacitorjs.com). It's the same app with three extras:

- **Push notifications.** Students get a phone notification when a coach sends a notice, even when the app is closed.
- **Add to calendar** opens the phone's share sheet, so the dojo dates can go straight into the phone's calendar.
- **Nothing is downloaded at runtime.** Firebase is bundled into the app, as Apple requires.

The coach panel is a separate website ([emptyhands.control.panel](https://github.com/rauf-mushtaq/emptyhands.control.panel)). Coaches don't need an app.

GitHub builds the apps for you (**Actions** tab → *Android app* / *iOS app*), so **you don't need a Mac**. You only need Android Studio or Xcode if you want to run the app on your own phone while developing.

## What it costs

| | Cost | Notes |
| --- | --- | --- |
| Apple Developer Program | £79 / year | Needed to publish on the App Store. |
| Google Play Console | $25 one-off | Needed to publish on Google Play. |
| Firebase Blaze plan | Pay as you go, about £0 for a dojo | Needed only for push notifications (the Cloud Function). Set a £1 budget alert. |

**Personal or organisation account?** With a *personal* account your own name shows as the seller, and Google makes new personal accounts run a **closed test with at least 12 testers for 14 days** before the app can go public. An *organisation* account shows "EmptyHands" as the seller and skips that test, but needs a free D-U-N-S number for the business (apply at dnb.co.uk; it can take a couple of weeks). If EmptyHands is a registered business, the organisation route is usually worth it.

## 1. Finish the Firebase setup

1. Do the Firebase setup in the **emptyhands.control.panel** README first, and put the same config in `js/config.js` here, so the website version is live and working.
2. Switch the Firebase project to the **Blaze** plan (Firebase console → ⚙ → Usage and billing), then add a budget alert.
3. Deploy the push-notification function from the **emptyhands.control.panel** repository. On any computer with Node.js:
   ```sh
   npm install -g firebase-tools
   firebase login
   git clone https://github.com/rauf-mushtaq/emptyhands.control.panel
   cd emptyhands.control.panel/firebase
   firebase use --add            # pick your project
   firebase deploy --only functions,firestore:rules
   ```
4. In the Firebase console, open **Project settings → Your apps → Add app**:
   - **Android**: package name `uk.co.emptyhands.app`. Download `google-services.json`.
   - **iOS**: bundle ID `uk.co.emptyhands.app`. Download `GoogleService-Info.plist`.

   Commit them to `mobile/android/app/google-services.json` and `mobile/ios/App/App/GoogleService-Info.plist`. On GitHub you can do this with *Add file → Upload files*. They aren't secret, the same as the web config.

## 2. Google Play

1. Create a signing key once and keep it safe; you'll need it for every future update. On any computer with Java installed:
   ```sh
   keytool -genkey -v -keystore emptyhands-release.jks -alias emptyhands -keyalg RSA -keysize 2048 -validity 10000
   base64 -i emptyhands-release.jks | pbcopy     # macOS; on Windows: certutil -encode, on Linux: base64 -w0
   ```
2. On GitHub, open **Settings → Secrets and variables → Actions** and add:
   `ANDROID_KEYSTORE_BASE64` (the base64 text), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`emptyhands`) and `ANDROID_KEY_PASSWORD`.
3. Run **Actions → Android app → Run workflow**. Download the `.aab` from the run's *Artifacts*.
4. In [Play Console](https://play.google.com/console), create the app, open **Testing → Internal testing**, and upload the `.aab`. Install it on your own phone from the testing link and check sign-in, the calendar and notifications.
5. Fill in the store listing (see *Store listing* below), then go through closed testing if your account needs it, then **Production**.

## 3. App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/).
2. In [Certificates, IDs & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list), create a key with **Apple Push Notifications service (APNs)**. Download the `.p8` file and upload it in Firebase → Project settings → **Cloud Messaging → Apple app configuration**, along with the Key ID and your Team ID.
3. In [App Store Connect](https://appstoreconnect.apple.com), go to **Apps → + → New App**, choose bundle ID `uk.co.emptyhands.app` and name it **EmptyHands** (if that name is taken, use e.g. "EmptyHands Dojo").
4. In **Users and Access → Integrations → App Store Connect API**, create a key with the **Admin** role and download it. Then add these GitHub secrets:
   `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_BASE64` (the `.p8` file, base64 encoded) and `APPLE_TEAM_ID` (Membership details page).
5. Run **Actions → iOS app → Run workflow**. It signs the app and uploads it to **TestFlight**. Install TestFlight on your iPhone and test it.
6. Fill in the listing and submit for review.

Each time you run a workflow the build number goes up automatically. To release a new *version* (e.g. 1.1), change `versionName` in `android/app/build.gradle` and `MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`.

## Store listing — what you'll be asked for

- **Privacy policy URL:** `https://rauf-mushtaq.github.io/emptyhands.student/privacy.html`. Read it through and change anything that isn't right for you before submitting.
- **Support URL:** `https://rauf-mushtaq.github.io/emptyhands/contact.html`
- **Category:** Education (or Health & Fitness). **Don't** choose Apple's "Kids" category; it has extra rules this app doesn't need.
- **Age rating:** answer "no" to everything, which gives 4+ / Everyone.
- **App privacy / Data safety forms:** you collect *name, email, phone number* and *other user content* (classes, grade), linked to the user, used for *app functionality*, not for tracking. Data is encrypted in transit, and users can delete their account in the app.
- **Screenshots:** iPhone 6.9″ (1320×2868) and Android phone. Take them from the app on a phone, or from a phone-size browser window.
- **App Review sign-in:** Apple needs a working student login. Create one (e.g. `review@emptyhands.co.uk`) and put the email and password in the *App Review Information* section.
- **Description**, for example: *"The official app for EmptyHands KaraTe School students in Ilford. See the dojo calendar with your training dates, closures, gradings and black-belt classes, get a countdown to your next class, and receive notices from your Sensei."*

## Developing on your own computer (optional)

```sh
cd mobile
npm install
npm run android     # builds www/, syncs and opens Android Studio
npm run ios         # same for Xcode (Mac only)
```

`npm run build` copies the student app from the repository root into `www/` and bundles `src/firebase-sdk.js` and `src/native.js` in place of the website versions. Change the app itself in the repository root, not in `www/`. If you change the source images in `assets/`, run `npm run icons` to regenerate the icons and splash screens.
