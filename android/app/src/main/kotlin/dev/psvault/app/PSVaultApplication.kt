package dev.psvault.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import dev.psvault.app.storage.SecureStorage

class PSVaultApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SecureStorage.init(this)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "P.S. Vault Notifications",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Check-in reminders and vault alerts"
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "psvault_notifications"
    }
}
