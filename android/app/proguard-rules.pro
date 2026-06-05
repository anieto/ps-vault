# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class dev.psvault.app.**$$serializer { *; }
-keepclassmembers class dev.psvault.app.** {
    *** Companion;
}
-keepclasseswithmembers class dev.psvault.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# JNA (required by lazysodium)
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }

# lazysodium
-keep class com.goterl.lazysodium.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Compose
-keep class androidx.compose.** { *; }
