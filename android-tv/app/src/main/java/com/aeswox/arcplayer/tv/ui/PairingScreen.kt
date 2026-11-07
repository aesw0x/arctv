package com.aeswox.arcplayer.tv.ui

import android.os.Build
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aeswox.arcplayer.tv.arc.ArcPhone
import com.aeswox.arcplayer.tv.arc.DeviceStore
import com.aeswox.arcplayer.tv.arc.FoundPhone
import com.aeswox.arcplayer.tv.arc.PairState
import com.aeswox.arcplayer.tv.arc.PhoneFinder
import com.aeswox.arcplayer.tv.ui.components.ArcBrand
import com.aeswox.arcplayer.tv.ui.components.ArcButton
import com.aeswox.arcplayer.tv.ui.components.ArriveEase
import com.aeswox.arcplayer.tv.ui.components.arcArrive
import com.aeswox.arcplayer.tv.ui.components.arcSelect
import com.aeswox.arcplayer.tv.ui.theme.ArcBlack
import com.aeswox.arcplayer.tv.ui.theme.ArcMotion
import com.aeswox.arcplayer.tv.ui.theme.ArcType
import com.aeswox.arcplayer.tv.ui.theme.Faint
import com.aeswox.arcplayer.tv.ui.theme.Ink
import com.aeswox.arcplayer.tv.ui.theme.Muted
import com.aeswox.arcplayer.tv.ui.theme.Surface
import com.aeswox.arcplayer.tv.ui.theme.SurfaceRisen
import kotlinx.coroutines.delay

/** How often the television asks whether the phone has been persuaded — the web shell's cadence. */
private const val POLL_MS = 2_000L

private enum class Awaiting(val headline: String, val line: String, val hint: String) {
    Asking("Waiting for approval", "", "A prompt should appear on your phone. Press Allow."),
    Denied("Waiting for approval", "This TV was denied on your phone.", "Press the back button to choose another device."),
    Expired("Waiting for approval", "The code expired.", "Press the back button and try again."),
    Unreachable("Waiting for approval", "", "Press the back button and try again."),
}

private sealed interface Stage {
    data object Scanning : Stage
    data object NotFound : Stage
    data class Devices(val found: List<FoundPhone>) : Stage
    data class Waiting(val device: FoundPhone, val code: String?, val awaiting: Awaiting) : Stage
    data class Address(val value: String, val note: String?, val probing: String?) : Stage
}

/**
 * Choosing a phone, then waiting for it to agree.
 *
 * Nothing connects by itself on launch, deliberately: a household with two Arc Player installs has to be
 * offered both, and a television that quietly reuses the last pairing never tells the viewer which phone it
 * is about to stream from. A saved phone is still first in the list, so a returning viewer presses OK once.
 */
@Composable
fun PairingScreen(
    store: DeviceStore,
    scanEverything: Boolean,
    onPaired: (host: String, token: String, name: String) -> Unit,
) {
    var stage by remember { mutableStateOf<Stage>(Stage.Scanning) }
    var scanId by remember { mutableStateOf(0) }
    val savedHosts = remember { store.known().map { it.host } }
    val firstFocus = remember { FocusRequester() }

    LaunchedEffect(scanId, scanEverything) {
        stage = Stage.Scanning
        val found = PhoneFinder.find(savedHosts, includeSaved = !scanEverything)
        stage = if (found.isEmpty()) Stage.NotFound else Stage.Devices(found)
    }

    // Whatever the new stage is, the viewer is being asked to pick something — so the remote has to be
    // holding the first thing that can be picked, or the screen looks frozen to anyone not looking at a TV.
    LaunchedEffect(stage) {
        if (stage == Stage.Scanning) return@LaunchedEffect
        withFrameNanos { }
        runCatching { firstFocus.requestFocus() }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(ArcBlack),
    ) {
        // The shell centres this screen rather than stacking it under a header: a pairing is one question,
        // and the television asking it is sitting across the room from the viewer.
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 120.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            ArcBrand(Modifier.padding(bottom = 26.dp))

            when (val current = stage) {
                Stage.Scanning -> {
                    Heading("Choose your phone", "Scanning your Wi-Fi for Arc Player…")
                    ScanningDots()
                }

                Stage.NotFound -> NotFoundBody(onSearchAgain = { scanId++ }, onAddress = {
                    stage = Stage.Address("", "The address is on the phone, under Settings → TV access.", null)
                })

                is Stage.Devices -> DeviceList(
                    found = current.found,
                    firstFocus = firstFocus,
                    onChoose = { device ->
                        val token = store.token(device.host)
                        if (token != null) {
                            onPaired(device.host, token, store.name(device.host) ?: device.device)
                        } else {
                            stage = Stage.Waiting(device, null, Awaiting.Asking)
                        }
                    },
                    onAddress = {
                        stage = Stage.Address("", "The address is on the phone, under Settings → TV access.", null)
                    },
                )

                is Stage.Waiting -> WaitingBody(current, store, onPaired) { updated -> stage = updated }

                is Stage.Address -> AddressPad(
                    stage = current,
                    onType = { stage = Stage.Address(it, current.note, null) },
                    onCancel = { stage = Stage.Scanning },
                    onConnect = { stage = Stage.Address(current.value, "Asking ${current.value}…", current.value) },
                )
            }
        }
    }

    // The address pad's probe is its own effect, so typing a digit does not restart anything else.
    val probing = (stage as? Stage.Address)?.probing
    LaunchedEffect(probing) {
        val host = probing ?: return@LaunchedEffect
        val device = PhoneFinder.find(savedHosts, forcedHost = host).firstOrNull()
        if (device == null) {
            stage = Stage.Address(host, "Nothing answered at $host.", null)
            return@LaunchedEffect
        }
        val token = store.token(host)
        if (token != null) {
            onPaired(host, token, store.name(host) ?: device.device)
        } else {
            stage = Stage.Waiting(device, null, Awaiting.Asking)
        }
    }
}

/** The two lines every stage of this screen opens with, spaced as `.screen-title` and `.screen-subtitle`. */
@Composable
private fun Heading(title: String, line: String) {
    Text(
        text = title,
        style = ArcType.screenTitle,
        color = Ink,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .arcArrive(0)
            .padding(bottom = 8.dp),
    )
    Text(
        text = line,
        style = ArcType.screenSubtitle,
        color = Muted,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .arcArrive(1)
            .widthIn(max = 550.dp)
            .padding(bottom = 23.dp),
    )
}

@Composable
private fun NotFoundBody(onSearchAgain: () -> Unit, onAddress: () -> Unit) {
    Heading("No phone found", "Open Arc Player on your phone, on the same Wi-Fi as this TV.")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        ArcButton("Search again", primary = true, onSelect = onSearchAgain)
        ArcButton("Connect by address", onSelect = onAddress)
    }
}

@Composable
private fun DeviceList(
    found: List<FoundPhone>,
    firstFocus: FocusRequester,
    onChoose: (FoundPhone) -> Unit,
    onAddress: () -> Unit,
) {
    Heading(
        "Choose your phone",
        if (found.size == 1) "Found one device. Press OK to connect." else "Found ${found.size} devices. Choose one.",
    )
    Column(
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        found.forEachIndexed { index, device ->
            DeviceRow(
                title = device.device.ifEmpty { device.host },
                subtitle = "${device.host}   ·   port 8080",
                index = index,
                focusRequester = if (index == 0) firstFocus else null,
                onSelect = { onChoose(device) },
            )
        }
        DeviceRow(
            title = "Connect by address",
            subtitle = "For a phone on a network that blocks device-to-device traffic",
            index = found.size,
            focusRequester = null,
            onSelect = onAddress,
        )
    }
}

/**
 * One phone the sweep answered.
 *
 * Focus moves the row rather than repainting it: `.device-row.focused` slides 10 CSS pixels right and puts
 * a white rim on a slate fill, so the viewer sees which line the remote is holding without losing the name
 * written on it. The shell also carries a shadow here, and it is black on black — a panel has no room to
 * be lifted off a screen that is already the darkest thing in the room.
 */
@Composable
private fun DeviceRow(
    title: String,
    subtitle: String,
    index: Int,
    focusRequester: FocusRequester?,
    onSelect: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(9.dp)
    val raised by animateFloatAsState(
        targetValue = if (focused) 1f else 0f,
        animationSpec = tween(ArcMotion.fastMs, easing = ArriveEase),
        label = "device-row",
    )
    Row(
        modifier = Modifier
            .arcArrive(index, 55L)
            .width(440.dp)
            .graphicsLayer { translationX = raised * 5.dp.toPx() }
            .clip(shape)
            .background(if (focused) SurfaceRisen else Surface, shape)
            .border(1.dp, if (focused) Color.White else Color.Transparent, shape)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .arcSelect(onSelect, onFocused = { focused = it })
            .padding(horizontal = 15.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PhoneMark()
        Column(
            modifier = Modifier.weight(1f).padding(start = 12.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(title, style = ArcType.deviceName, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                subtitle,
                style = ArcType.deviceAddress,
                color = Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = "›",
            style = ArcType.chevron,
            color = if (focused) Color.White else Faint,
            modifier = Modifier
                .padding(start = 10.dp)
                .graphicsLayer { translationX = raised * 3.dp.toPx() },
        )
    }
}

/**
 * The 56×56 CSS square with a 18×30 outline inside it, which is the shell's drawing of a phone.
 *
 * It stays the same when the row takes focus, because the shell leaves it alone too: the rim and the slide
 * say which line is live, and a mark that also changed colour would be three things saying one thing.
 */
@Composable
private fun PhoneMark() {
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0x0FFFFFFF)),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(width = 9.dp, height = 15.dp)
                .border(1.25.dp, Color(0xFFD2D2DE), RoundedCornerShape(2.5.dp)),
        )
    }
}

/**
 * The round trip that turns a waiting screen into a session.
 *
 * Keyed on the address rather than started from the tap, so leaving the screen — Back, or a phone that
 * finally answers — cancels the poll instead of leaving it running behind the shelf. The six dots are drawn
 * before the code arrives so the box already holds the shape of what replaces it.
 */
@Composable
private fun WaitingBody(
    waiting: Stage.Waiting,
    store: DeviceStore,
    onPaired: (host: String, token: String, name: String) -> Unit,
    onUpdate: (Stage.Waiting) -> Unit,
) {
    val device = waiting.device
    val label = device.device.ifEmpty { device.host }

    LaunchedEffect(device.host) {
        val phone = ArcPhone(device.host) { store.token(device.host) }
        var code: String? = null
        fun publish(awaiting: Awaiting) = onUpdate(Stage.Waiting(device, code, awaiting))

        val request = runCatching {
            phone.requestPairing(tvName = "TV", tvModel = "${Build.MANUFACTURER} ${Build.MODEL}")
        }.getOrNull()
        if (request == null) {
            publish(Awaiting.Unreachable)
            return@LaunchedEffect
        }
        code = request.code
        publish(Awaiting.Asking)

        while (true) {
            delay(POLL_MS)
            val status = runCatching { phone.pairStatus(request.code) }.getOrNull()
            when (status) {
                null, is PairState.Pending -> Unit
                is PairState.Approved -> {
                    val name = status.device.ifEmpty { label }
                    store.save(device.host, status.token, name)
                    onPaired(device.host, status.token, name)
                    return@LaunchedEffect
                }
                PairState.Denied -> {
                    publish(Awaiting.Denied)
                    return@LaunchedEffect
                }
                PairState.Expired -> {
                    publish(Awaiting.Expired)
                    return@LaunchedEffect
                }
            }
        }
    }

    val line = when (waiting.awaiting) {
        Awaiting.Asking -> "Asking $label for permission…"
        Awaiting.Unreachable -> "$label did not answer."
        else -> waiting.awaiting.line
    }

    Heading(waiting.awaiting.headline, line)

    /*
     * The shell draws six dots first and lets the digits replace them in the same statement that starts the
     * settle, so the box is solid while it is a promise and fades up only when it becomes a code.
     */
    val hasCode = waiting.code != null
    val settle by animateFloatAsState(
        targetValue = if (hasCode) 1f else 0f,
        animationSpec = tween(ArcMotion.stdMs, easing = ArriveEase),
        label = "pair-code",
    )
    CodeBox(
        text = waiting.code ?: "······",
        modifier = Modifier.graphicsLayer {
            alpha = if (hasCode) settle else 1f
            scaleX = 0.98f + 0.02f * settle
            scaleY = 0.98f + 0.02f * settle
            translationY = (1f - settle) * 5.dp.toPx()
        },
    )

    Text(
        text = waiting.awaiting.hint,
        style = ArcType.screenSubtitle,
        color = Muted,
        textAlign = TextAlign.Center,
        modifier = Modifier.arcArrive(3),
    )
}

/**
 * `.pair-code`: a monospaced box, wider than it is tall, whose padding is heavier on the left than the
 * right because the letter-spacing itself leaves a gap after the last character.
 */
@Composable
private fun CodeBox(text: String, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(9.dp)
    Box(
        modifier = modifier
            .padding(top = 13.dp, bottom = 15.dp)
            .clip(shape)
            .background(Color(0x0DFFFFFF), shape)
            .border(0.5.dp, Color(0x17FFFFFF), shape)
            .padding(start = 18.dp, top = 9.dp, end = 10.dp, bottom = 9.dp),
    ) {
        Text(text = text, style = ArcType.pairCode, color = Color.White)
    }
}

/**
 * A remote with no keyboard.
 *
 * The sweep walks the four /24s a home router hands out, which means it cannot see a dev machine — an
 * emulator's host is 10.0.2.2 — and a guest Wi-Fi that blocks device-to-device traffic hides a real phone
 * the same way. Both cases have the same answer, so the pad is drawn rather than an IME asked for: on a
 * set with no keyboard attached there is often nothing to ask.
 */
@Composable
private fun AddressPad(
    stage: Stage.Address,
    onType: (String) -> Unit,
    onCancel: () -> Unit,
    onConnect: () -> Unit,
) {
    Heading("Connect by address", "Four numbers, three dots, no spaces.")
    CodeBox(
        text = if (stage.value.isEmpty()) "···.···.···.···" else stage.value,
        modifier = Modifier.arcArrive(2),
    )
    stage.note?.let {
        Text(
            text = it,
            style = ArcType.screenSubtitle,
            color = Muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.arcArrive(3),
        )
    }

    val connectable = isAddress(stage.value) && stage.probing == null
    Row(
        modifier = Modifier.padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(30.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf(".", "0", "←"))
                .forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { key ->
                            KeyButton(key) {
                                if (key == "←") onType(stage.value.dropLast(1))
                                else if (stage.value.length < 15) onType(stage.value + key)
                            }
                        }
                    }
                }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ArcButton(
                text = if (stage.probing == null) "Connect" else "Asking…",
                primary = true,
                enabled = connectable,
                onSelect = onConnect,
                modifier = Modifier.width(170.dp),
            )
            ArcButton(text = "Cancel", onSelect = onCancel, modifier = Modifier.width(170.dp))
        }
    }
}

@Composable
private fun KeyButton(text: String, onSelect: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .size(width = 58.dp, height = 46.dp)
            .scale(if (focused) 1.06f else 1f)
            .clip(RoundedCornerShape(8.dp))
            .background(if (focused) Color.White else SurfaceRisen)
            .arcSelect(onSelect, onFocused = { focused = it }),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = ArcType.deviceName,
            color = if (focused) ArcBlack else Ink,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * The web shell's three dots.
 *
 * `.scanning span` pulses in colour and size on one 1.2s cycle, the second and third starting 0.18s and
 * 0.36s into it — so one clock drives all three and each takes its own slice of it. Nothing moves vertically:
 * a scanning row that shifted position makes the heading above it jump while a viewer is still reading it.
 */
@Composable
private fun ScanningDots() {
    val clock = rememberInfiniteTransition(label = "scanning")
    val cycle by clock.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1_200, easing = LinearEasing), RepeatMode.Restart),
        label = "cycle",
    )
    Row(
        modifier = Modifier.padding(bottom = 17.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(3) { index ->
            val phase = (cycle + index * 0.15f) % 1f
            val raised = if (phase < 0.5f) phase * 2f else (1f - phase) * 2f
            Box(
                Modifier
                    .size(6.dp)
                    .scale(1f + 0.25f * raised)
                    .clip(CircleShape)
                    .background(lerp(Color(0xFF3A3A46), Color(0xFFF0F0F6), raised)),
            )
        }
    }
}

private fun isAddress(value: String): Boolean {
    val parts = value.split('.')
    if (parts.size != 4) return false
    return parts.all { it.isNotEmpty() && it.toIntOrNull() != null && it.toInt() in 0..255 }
}
