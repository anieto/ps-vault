package dev.psvault.app.services

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dev.psvault.app.api.ApiService
import dev.psvault.app.storage.SecureStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class PushNotificationService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val hasSession = SecureStorage.getString(SecureStorage.Key.REFRESH_TOKEN) != null
        if (hasSession) {
            CoroutineScope(Dispatchers.IO).launch {
                try { ApiService.registerPushToken(token, "fcm") }
                catch (_: Exception) {}
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        // Background notifications are displayed automatically by the OS
    }
}
