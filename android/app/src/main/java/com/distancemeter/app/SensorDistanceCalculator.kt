package com.distancemeter.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

data class GroundPoint(
    val xMeters: Double,
    val zMeters: Double,
    val horizontalDistanceMeters: Double,
    val tiltFromNadirDeg: Double,
    val azimuthDeg: Double
)

data class SensorOrientation(
    val tiltFromNadirDeg: Double = 45.0,
    val azimuthDeg: Double = 0.0,
    val isAimValidForGround: Boolean = true,
    val sensorSourceLabel: String = "Akcelerometr (SensorManager)"
)

object SensorDistanceCalculator {

    private const val MIN_TILT_FROM_NADIR_DEG = 2.0
    private const val MAX_TILT_FROM_NADIR_DEG = 86.0

    /**
     * Wyznacza rzut punktu na płaszczyznę podłoża na podstawie wysokości trzymania telefonu (H),
     * kąta odchylenia od pionu w dół (tiltFromNadirDeg: 0° = prosto w dół, 90° = horyzont)
     * oraz azymutu (azimuthDeg).
     */
    fun projectToGround(
        phoneHeightMeters: Double,
        tiltFromNadirDeg: Double,
        azimuthDeg: Double
    ): GroundPoint? {
        if (phoneHeightMeters <= 0.05) return null
        if (tiltFromNadirDeg < MIN_TILT_FROM_NADIR_DEG || tiltFromNadirDeg > MAX_TILT_FROM_NADIR_DEG) {
            return null
        }

        val tiltRad = tiltFromNadirDeg * PI / 180.0
        val azimuthRad = azimuthDeg * PI / 180.0

        val groundDist = phoneHeightMeters * tan(tiltRad)
        val x = groundDist * cos(azimuthRad)
        val z = groundDist * sin(azimuthRad)

        return GroundPoint(
            xMeters = x,
            zMeters = z,
            horizontalDistanceMeters = groundDist,
            tiltFromNadirDeg = tiltFromNadirDeg,
            azimuthDeg = azimuthDeg
        )
    }

    /**
     * Oblicza odległość euklidesową między punktem A i punktem B na podłożu (w metrach).
     */
    fun distanceBetween(a: GroundPoint, b: GroundPoint): Double {
        val dx = b.xMeters - a.xMeters
        val dz = b.zMeters - a.zMeters
        return sqrt(dx * dx + dz * dz)
    }

    fun formatMetersAndCm(distanceMeters: Double): Pair<String, String> {
        val cm = round(distanceMeters * 100.0).toInt()
        val mFormatted = String.format(java.util.Locale.US, "%.2f m", distanceMeters)
        val cmFormatted = "$cm cm"
        return mFormatted to cmFormatted
    }
}

class OrientationTracker(
    context: Context,
    private val onOrientationChanged: (SensorOrientation) -> Unit
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val magnetometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private val rotationVectorSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)

    private val rotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)
    private val gravity = FloatArray(3)
    private val geomagnetic = FloatArray(3)
    private var hasGravity = false
    private var hasMagnetic = false

    private var smoothedTiltDeg = 45.0
    private var smoothedAzimuthDeg = 0.0
    private var isFirstReading = true

    fun start(samplingPeriodUs: Int = SensorManager.SENSOR_DELAY_UI) {
        // Zawsze rejestrujemy akcelerometr (podstawowy pomiar kąta na każdym telefonie)
        accelerometer?.let { sensorManager.registerListener(this, it, samplingPeriodUs) }

        // Opcjonalnie rejestrujemy wektor rotacji / magnetometr do wyznaczania obrotu w poziomie (azymutu)
        if (rotationVectorSensor != null) {
            sensorManager.registerListener(this, rotationVectorSensor, samplingPeriodUs)
        } else {
            magnetometer?.let { sensorManager.registerListener(this, it, samplingPeriodUs) }
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        var rawTiltFromNadirDeg: Double? = null
        var rawAzimuthDeg: Double? = null
        var sourceLabel = "Akcelerometr (SensorManager)"

        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                // Filtr dolnoprzepustowy wyodrębniający wektor grawitacji z akcelerometru
                val gAlpha = 0.8f
                if (!hasGravity) {
                    System.arraycopy(event.values, 0, gravity, 0, 3)
                    hasGravity = true
                } else {
                    gravity[0] = gAlpha * gravity[0] + (1f - gAlpha) * event.values[0]
                    gravity[1] = gAlpha * gravity[1] + (1f - gAlpha) * event.values[1]
                    gravity[2] = gAlpha * gravity[2] + (1f - gAlpha) * event.values[2]
                }

                // Kąt pochylenia bezpośrednio z akcelerometru: działa nawet bez magnetometru i żyroskopu!
                val norm = sqrt(
                    (gravity[0] * gravity[0] + gravity[1] * gravity[1] + gravity[2] * gravity[2]).toDouble()
                )
                if (norm > 0.1) {
                    // Oś +Z telefonu skierowana jest do użytkownika; tylna kamera patrzy wzdłuż -Z.
                    val cosTilt = (gravity[2] / norm).coerceIn(-1.0, 1.0)
                    rawTiltFromNadirDeg = Math.toDegrees(acos(cosTilt))
                }

                if (hasMagnetic && SensorManager.getRotationMatrix(rotationMatrix, null, gravity, geomagnetic)) {
                    SensorManager.getOrientation(rotationMatrix, orientationAngles)
                    rawAzimuthDeg = (Math.toDegrees(orientationAngles[0].toDouble()) + 360.0) % 360.0
                    sourceLabel = "Akcelerometr + Magnetometr"
                }
            }
            Sensor.TYPE_MAGNETIC_FIELD -> {
                System.arraycopy(event.values, 0, geomagnetic, 0, 3)
                hasMagnetic = true
                if (!hasGravity) return
                if (!SensorManager.getRotationMatrix(rotationMatrix, null, gravity, geomagnetic)) return
                SensorManager.getOrientation(rotationMatrix, orientationAngles)
                rawAzimuthDeg = (Math.toDegrees(orientationAngles[0].toDouble()) + 360.0) % 360.0
                sourceLabel = "Akcelerometr + Magnetometr"
            }
            Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GAME_ROTATION_VECTOR -> {
                SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                val worldZOfCameraForward = -rotationMatrix[8].toDouble().coerceIn(-1.0, 1.0)
                rawTiltFromNadirDeg = Math.toDegrees(acos(-worldZOfCameraForward.coerceIn(-1.0, 1.0)))
                SensorManager.getOrientation(rotationMatrix, orientationAngles)
                rawAzimuthDeg = (Math.toDegrees(orientationAngles[0].toDouble()) + 360.0) % 360.0
                sourceLabel = "Rotation Vector + Akcelerometr"
            }
            else -> return
        }

        val tiltCandidate = rawTiltFromNadirDeg ?: smoothedTiltDeg
        val azCandidate = rawAzimuthDeg ?: smoothedAzimuthDeg

        val alpha = 0.22
        if (isFirstReading) {
            smoothedTiltDeg = tiltCandidate
            smoothedAzimuthDeg = azCandidate
            isFirstReading = false
        } else {
            smoothedTiltDeg += alpha * (tiltCandidate - smoothedTiltDeg)
            val diff = atan2(
                sin(Math.toRadians(azCandidate - smoothedAzimuthDeg)),
                cos(Math.toRadians(azCandidate - smoothedAzimuthDeg))
            )
            smoothedAzimuthDeg = (smoothedAzimuthDeg + Math.toDegrees(diff) * alpha + 360.0) % 360.0
        }

        val validGroundAim = smoothedTiltDeg in 2.0..86.0
        onOrientationChanged(
            SensorOrientation(
                tiltFromNadirDeg = smoothedTiltDeg,
                azimuthDeg = smoothedAzimuthDeg,
                isAimValidForGround = validGroundAim,
                sensorSourceLabel = sourceLabel
            )
        )
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Brak dodatkowej akcji wymaganej podczas zmiany dokładności
    }
}
