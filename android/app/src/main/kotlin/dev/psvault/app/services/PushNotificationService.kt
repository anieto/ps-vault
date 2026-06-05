package dev.psvault.app.services

// TODO: Enable FCM push notifications
//
// Setup steps:
// 1. Create a Firebase project at console.firebase.google.com
// 2. Add Android app with package name "dev.psvault.app"
// 3. Download google-services.json to android/app/
// 4. In android/build.gradle.kts, uncomment:
//      id("com.google.gms.google-services") version "4.4.2" apply false
// 5. In android/app/build.gradle.kts, uncomment:
//      id("com.google.gms.google-services")
//      implementation(platform("com.google.firebase:firebase-bom:33.2.0"))
//      implementation("com.google.firebase:firebase-messaging-ktx")
// 6. In AndroidManifest.xml, uncomment the PushNotificationService <service> block
// 7. Uncomment the class body below
// 8. Add FCM server key to the PS Vault server environment: FCM_SERVER_KEY=<key>
// 9. Set APNS_SANDBOX=false before App Store submission

// import com.google.firebase.messaging.FirebaseMessagingService
// import com.google.firebase.messaging.RemoteMessage
// import dev.psvault.app.api.ApiService
// import dev.psvault.app.storage.SecureStorage
// import kotlinx.coroutines.CoroutineScope
// import kotlinx.coroutines.Dispatchers
// import kotlinx.coroutines.launch
//
// class PushNotificationService : FirebaseMessagingService() {
//
//     override fun onNewToken(token: String) {
//         super.onNewToken(token)
//         // Register token with PS Vault server if authenticated
//         val hasSession = SecureStorage.getString(SecureStorage.Key.REFRESH_TOKEN) != null
//         if (hasSession) {
//             CoroutineScope(Dispatchers.IO).launch {
//                 try { ApiService.registerPushToken(token, "android") }
//                 catch (_: Exception) {}
//             }
//         }
//     }
//
//     override fun onMessageReceived(message: RemoteMessage) {
//         super.onMessageReceived(message)
//         // Check-in reminder notifications are handled by the OS notification tray
//         // No additional processing needed — the notification auto-displays
//     }
// }
