package com.distancemeter.app

import android.Manifest
import android.content.pm.PackageManager
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val deviceProfile = DeviceCapabilityManager.detectDeviceProfile(this)

        setContent {
            DistanceMeterTheme(tier = deviceProfile.tier) {
                DistanceMeterScreen(deviceProfile = deviceProfile)
            }
        }
    }
}

@Composable
private fun DistanceMeterTheme(
    tier: PerformanceTier,
    content: @Composable () -> Unit
) {
    val useDark = when (tier) {
        PerformanceTier.LITE -> false // Maksymalna czytelność i brak zbędnych przełączeń na starszych urządzeniach
        PerformanceTier.STANDARD, PerformanceTier.ULTRA -> isSystemInDarkTheme()
    }

    val colorScheme = if (useDark) {
        darkColorScheme(
            primary = Color(0xFF3B82F6),
            surface = Color(0xFF111827),
            background = Color(0xFF0B0F19),
            onSurface = Color(0xFFF8FAFC)
        )
    } else {
        lightColorScheme(
            primary = Color(0xFF2563EB),
            surface = Color(0xFFFFFFFF),
            background = Color(0xFFF8FAFC),
            onSurface = Color(0xFF0F172A)
        )
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}

@Composable
private fun DistanceMeterScreen(deviceProfile: DeviceProfile) {
    val context = LocalContext.current
    val tier = deviceProfile.tier

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    var phoneHeightCm by remember { mutableFloatStateOf(140f) }
    var focalLengthMm by remember { mutableFloatStateOf(26f) }
    var useArCoreIfAvailable by remember { mutableStateOf(deviceProfile.isArCoreSupported) }
    var showSettings by remember { mutableStateOf(false) }

    var orientation by remember { mutableStateOf(SensorOrientation()) }
    var pointA by remember { mutableStateOf<GroundPoint?>(null) }
    var pointB by remember { mutableStateOf<GroundPoint?>(null) }

    // W LITE odczytujemy czujniki nieco rzadziej dla oszczędności baterii i CPU
    val samplingRate = if (tier == PerformanceTier.LITE) {
        SensorManager.SENSOR_DELAY_NORMAL
    } else {
        SensorManager.SENSOR_DELAY_UI
    }

    DisposableEffect(samplingRate) {
        val tracker = OrientationTracker(context) { updated ->
            orientation = updated
        }
        tracker.start(samplingRate)
        onDispose { tracker.stop() }
    }

    val liveAimPoint = remember(phoneHeightCm, orientation) {
        if (!orientation.isAimValidForGround) null
        else SensorDistanceCalculator.projectToGround(
            phoneHeightMeters = phoneHeightCm / 100.0,
            tiltFromNadirDeg = orientation.tiltFromNadirDeg,
            azimuthDeg = orientation.azimuthDeg
        )
    }

    val liveDistanceMeters = remember(pointA, pointB, liveAimPoint) {
        val a = pointA
        val b = pointB
        when {
            a != null && b != null -> SensorDistanceCalculator.distanceBetween(a, b)
            a != null && liveAimPoint != null -> SensorDistanceCalculator.distanceBetween(a, liveAimPoint)
            else -> null
        }
    }

    val cardElevation = if (tier == PerformanceTier.LITE) 0.dp else 6.dp
    val surfaceModifier = if (tier == PerformanceTier.LITE) {
        Modifier.fillMaxSize()
    } else {
        Modifier.fillMaxSize().animateContentSize()
    }

    Surface(modifier = surfaceModifier, color = MaterialTheme.colorScheme.background) {
        Box(modifier = Modifier.fillMaxSize()) {
            // 1. Podgląd kamery (CameraX z bezpiecznym fallbackiem przy braku uprawnień)
            if (hasCameraPermission) {
                CameraPreviewView(
                    modifier = Modifier.fillMaxSize(),
                    usePerformancePreview = tier == PerformanceTier.LITE
                )
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF0F172A))
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Wymagany dostęp do kamery do wyświetlania celownika",
                        color = Color.White,
                        fontSize = 16.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                        Text("Włącz kamerę")
                    }
                }
            }

            // 2. Celownik na środku ekranu (w trybie ULTRA dodatkowe prowadnice precyzyjne API 37+)
            CenterCrosshairOverlay(
                isAimValid = orientation.isAimValidForGround,
                hasPointA = pointA != null,
                tier = tier
            )

            // 3. Górny pasek informacyjny i przycisk ustawień
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .background(Color.Black.copy(alpha = 0.55f))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Tryb ${tier.name} · H: ${phoneHeightCm.roundToInt()} cm",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    // W LITE ukrywamy szczegółową telemetrię czujników dla przejrzystości
                    if (tier != PerformanceTier.LITE) {
                        val modeText = if (useArCoreIfAvailable && deviceProfile.isArCoreSupported) {
                            "ARCore + Czujniki"
                        } else {
                            orientation.sensorSourceLabel
                        }
                        Text(
                            text = "$modeText · Kąt: ${orientation.tiltFromNadirDeg.roundToInt()}°",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp
                        )
                    }
                }

                IconButton(onClick = { showSettings = true }) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Ustawienia",
                        tint = Color.White
                    )
                }
            }

            // 4. Funkcja dostępna wyłącznie od API 37 (Android 17+) - bezpiecznie chroniona przed NoSuchMethodError
            if (tier == PerformanceTier.ULTRA && Build.VERSION.SDK_INT >= 37) {
                UltraApi37PrecisionBanner(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 68.dp),
                    focalLengthMm = focalLengthMm
                )
            }

            // 5. Dolny panel pomiaru: Wynik na żywo + Przyciski Punkt A / Punkt B / Reset
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = cardElevation),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    if (!orientation.isAimValidForGround) {
                        Text(
                            text = "Skieruj celownik w dół na powierzchnię",
                            color = Color(0xFFD97706),
                            fontWeight = FontWeight.Medium,
                            fontSize = 14.sp
                        )
                    } else if (liveDistanceMeters != null) {
                        val (metersText, cmText) = SensorDistanceCalculator.formatMetersAndCm(liveDistanceMeters)
                        Text(
                            text = if (pointB == null) "Odległość na żywo (A → celownik)" else "Zmierzona odległość (A → B)",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(
                            verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                text = metersText,
                                fontSize = 30.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "($cmText)",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    } else {
                        val previewDist = liveAimPoint?.horizontalDistanceMeters
                        val hintText = if (previewDist != null) {
                            val (_, cm) = SensorDistanceCalculator.formatMetersAndCm(previewDist)
                            "Dystans do celu: $cm · Wyznacz Punkt A"
                        } else {
                            "Wyceluj w punkt początkowy i naciśnij Punkt A"
                        }
                        Text(
                            text = hintText,
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = {
                                if (pointA == null) {
                                    pointA = liveAimPoint
                                } else {
                                    pointB = liveAimPoint
                                }
                            },
                            enabled = liveAimPoint != null && pointB == null,
                            modifier = Modifier.weight(1f).height(48.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary
                            )
                        ) {
                            Text(
                                text = when {
                                    pointA == null -> "Ustaw Punkt A"
                                    pointB == null -> "Ustaw Punkt B"
                                    else -> "Zablokowano A → B"
                                },
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        OutlinedButton(
                            onClick = {
                                pointA = null
                                pointB = null
                            },
                            modifier = Modifier.height(48.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Reset",
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.size(6.dp))
                            Text("Reset")
                        }
                    }
                }
            }
        }
    }

    if (showSettings) {
        SettingsDialog(
            deviceProfile = deviceProfile,
            phoneHeightCm = phoneHeightCm,
            onHeightChange = { phoneHeightCm = it },
            focalLengthMm = focalLengthMm,
            onFocalLengthChange = { focalLengthMm = it },
            useArCore = useArCoreIfAvailable,
            onUseArCoreChange = { useArCoreIfAvailable = it },
            onDismiss = { showSettings = false }
        )
    }
}

@Composable
private fun CameraPreviewView(
    modifier: Modifier = Modifier,
    usePerformancePreview: Boolean
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PreviewView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                // COMPATIBLE zużywa mniej zasobów GPU na starszych/budżetowych układach (np. Galaxy A02)
                implementationMode = if (usePerformancePreview) {
                    PreviewView.ImplementationMode.COMPATIBLE
                } else {
                    PreviewView.ImplementationMode.PERFORMANCE
                }
            }
        },
        update = { previewView ->
            val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also {
                    it.surfaceProvider = previewView.surfaceProvider
                }
                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview
                    )
                } catch (_: Exception) {
                    // Bezpieczne pominięcie w przypadku braku tylnej kamery w emulatorze
                }
            }, ContextCompat.getMainExecutor(context))
        }
    )
}

@Composable
private fun CenterCrosshairOverlay(
    isAimValid: Boolean,
    hasPointA: Boolean,
    tier: PerformanceTier
) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val cx = size.width / 2f
        val cy = size.height / 2f
        val reticleColor = when {
            !isAimValid -> Color(0xFFF59E0B)
            hasPointA -> Color(0xFF3B82F6)
            else -> Color.White
        }

        val radius = if (tier == PerformanceTier.ULTRA) 24.dp.toPx() else 18.dp.toPx()
        val arm = 12.dp.toPx()

        drawCircle(
            color = reticleColor,
            radius = radius,
            center = Offset(cx, cy),
            style = Stroke(width = 2.dp.toPx())
        )
        drawCircle(
            color = reticleColor,
            radius = 3.dp.toPx(),
            center = Offset(cx, cy)
        )
        drawLine(reticleColor, Offset(cx - radius - arm, cy), Offset(cx - radius + 4f, cy), 2.dp.toPx())
        drawLine(reticleColor, Offset(cx + radius - 4f, cy), Offset(cx + radius + arm, cy), 2.dp.toPx())
        drawLine(reticleColor, Offset(cx, cy - radius - arm), Offset(cx, cy - radius + 4f), 2.dp.toPx())
        drawLine(reticleColor, Offset(cx, cy + radius - 4f), Offset(cx, cy + radius + arm), 2.dp.toPx())
    }
}

@RequiresApi(37)
@Composable
private fun UltraApi37PrecisionBanner(
    modifier: Modifier = Modifier,
    focalLengthMm: Float
) {
    Surface(
        modifier = modifier.padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFF1D4ED8).copy(alpha = 0.88f)
    ) {
        Text(
            text = "Android 17 ULTRA · Stabilizacja optyczna (${focalLengthMm.roundToInt()} mm)",
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

@Composable
private fun SettingsDialog(
    deviceProfile: DeviceProfile,
    phoneHeightCm: Float,
    onHeightChange: (Float) -> Unit,
    focalLengthMm: Float,
    onFocalLengthChange: (Float) -> Unit,
    useArCore: Boolean,
    onUseArCoreChange: (Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ustawienia kalibracji") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Urządzenie: API ${deviceProfile.sdkInt} · RAM ${String.format(java.util.Locale.US, "%.1f", deviceProfile.totalRamGb)} GB · Tryb ${deviceProfile.tier.name}",
                    fontSize = 12.sp
                )

                Column {
                    Text(
                        text = "Wysokość trzymania telefonu: ${phoneHeightCm.roundToInt()} cm",
                        fontWeight = FontWeight.Medium
                    )
                    Slider(
                        value = phoneHeightCm,
                        onValueChange = onHeightChange,
                        valueRange = 60f..220f
                    )
                }

                // W trybie STANDARD i ULTRA odblokowujemy dokładną regulację ogniskowej i ARCore
                if (deviceProfile.tier != PerformanceTier.LITE) {
                    Column {
                        Text(
                            text = "Ogniskowa obiektywu: ${focalLengthMm.roundToInt()} mm",
                            fontWeight = FontWeight.Medium
                        )
                        Slider(
                            value = focalLengthMm,
                            onValueChange = onFocalLengthChange,
                            valueRange = 18f..50f
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (deviceProfile.isArCoreSupported) "Użyj ARCore (wykryto)" else "ARCore niedostępny (tryb czujników)",
                            fontSize = 13.sp,
                            modifier = Modifier.weight(1f)
                        )
                        Switch(
                            checked = useArCore,
                            onCheckedChange = onUseArCoreChange,
                            enabled = deviceProfile.isArCoreSupported
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Gotowe")
            }
        }
    )
}
