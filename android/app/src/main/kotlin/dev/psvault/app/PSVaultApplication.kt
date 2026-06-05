package dev.psvault.app

import android.app.Application
import dev.psvault.app.storage.SecureStorage

class PSVaultApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SecureStorage.init(this)
    }
}
