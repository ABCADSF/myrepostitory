package com.distancemeter.app

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.google.ar.core.ArCoreApk

enum class PerformanceTier {
    /** Android 5.0–9 (API < 29) lub < 3 GB RAM: brak cieni, rozmyć i animacji, tylko podstawowy pomiar. */
    LITE,
    /** Android 10–16 (API 29–36) i >= 3 GB RAM: pełne animacje Compose, cienie kart, Dark Mode, historia. */
    STANDARD,
    /** Android 17+ (API 37+) i >= 3 GB RAM: pełne efekty graficzne, funkcje @RequiresApi(37) i stabilizacja AI/AR. */
    ULTRA
}

data class DeviceProfile(
    val tier: PerformanceTier,
    val sdkInt: Int,
    val totalRamGb: Double,
    val isArCoreSupported: Boolean,
    val hasGyroscope: Boolean
)

object DeviceCapabilityManager {

    private const val THREE_GB_IN_BYTES = 3L * 1024L * 1024L * 1024L

    fun detectDeviceProfile(context: Context): DeviceProfile {
        val sdkInt = Build.VERSION.SDK_INT
        val totalRamBytes = readTotalRamBytes(context)
        val totalRamGb = totalRamBytes / (1024.0 * 1024.0 * 1024.0)
        val tier = resolvePerformanceTier(sdkInt, totalRamBytes)
        val isArCoreSupported = checkArCoreAvailabilitySafe(context)
        val hasGyroscope = context.packageManager.hasSystemFeature(PackageManager.FEATURE_SENSOR_GYROSCOPE)

        return DeviceProfile(
            tier = tier,
            sdkInt = sdkInt,
            totalRamGb = totalRamGb,
            isArCoreSupported = isArCoreSupported,
            hasGyroscope = hasGyroscope
        )
    }

    fun resolvePerformanceTier(sdkInt: Int, totalRamBytes: Long): PerformanceTier {
        if (sdkInt < Build.VERSION_CODES.Q || totalRamBytes < THREE_GB_IN_BYTES) {
            return PerformanceTier.LITE
        }
        if (sdkInt >= 37) {
            return PerformanceTier.ULTRA
        }
        return PerformanceTier.STANDARD
    }

    private fun readTotalRamBytes(context: Context): Long {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            ?: return THREE_GB_IN_BYTES
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        return memInfo.totalMem
    }

    private fun checkArCoreAvailabilitySafe(context: Context): Boolean {
        return try {
            val availability = ArCoreApk.getInstance().checkAvailability(context)
            availability.isSupported
        } catch (_: Throwable) {
            // Na telefonach bez usług Google Play dla AR (np. budżetowe modele A02) wracamy bezpiecznie do czujników
            false
        }
    }
}
