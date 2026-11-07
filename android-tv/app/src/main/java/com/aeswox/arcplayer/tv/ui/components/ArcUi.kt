package com.aeswox.arcplayer.tv.ui.components

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.onFocusEvent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.aeswox.arcplayer.tv.ui.theme.ArcBlack
import com.aeswox.arcplayer.tv.ui.theme.ArcMotion
import com.aeswox.arcplayer.tv.ui.theme.ArcType
import com.aeswox.arcplayer.tv.ui.theme.Ink
import com.aeswox.arcplayer.tv.ui.theme.Muted
import com.aeswox.arcplayer.tv.ui.theme.ShelfInk
import com.aeswox.arcplayer.tv.ui.theme.SurfaceRisen
import com.aeswox.arcplayer.tv.ui.theme.Warning
import com.aeswox.arcplayer.tv.ui.theme.WarningSunken
import kotlinx.coroutines.delay

/**
 * Selection for a television, which has no cursor.
 *
 * `clickable` is deliberately absent: whether it already treats D-pad centre as a click has changed
 * between Compose versions, and a control that answers a remote twice is worse than one that answers it
 * never. The tap gesture stays because a phone or tablet can install this APK too.
 *
 * `onFocusEvent` sits ahead of `focusable` because that is the only order in which it reports anything:
 * measured with a log on both sides, placed after the focusable it received `false` on every D-pad move
 * while `uiautomator` said the same row held focus, so every focus rim in the app painted nothing.
 */
fun Modifier.arcSelect(
    onSelect: () -> Unit,
    onFocused: (Boolean) -> Unit = {},
    enabled: Boolean = true,
): Modifier = this
    .onFocusEvent { onFocused(it.hasFocus) }
    .focusable()
    .focusProperties { canFocus = enabled }
    .onKeyEvent { event ->
        if (!enabled || event.type != KeyEventType.KeyUp) return@onKeyEvent false
        when (event.key) {
            Key.Enter, Key.NumPadEnter, Key.DirectionCenter -> {
                onSelect()
                true
            }
            else -> false
        }
    }
    .pointerInput(onSelect, enabled) {
        if (!enabled) return@pointerInput
        detectTapGestures { onSelect() }
    }

internal val ArriveEase = CubicBezierEasing(0.16f, 0.84f, 0.3f, 1f)

/**
 * The web shell's arrival, ported.
 *
 * Rises 8dp and fades in over 240ms on the curve the CSS uses. Past the eighth element the animation is
 * dropped rather than queued: what follows them simply appears, so a shelf of ninety films is never
 * fifteen half-frames deep and a long episode list is never a wait.
 */
@Composable
fun Modifier.arcArrive(index: Int, eachMs: Long = ArcMotion.arriveEachMs): Modifier {
    if (index >= ArcMotion.arriveCap) return this
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(index) {
        if (index > 0) delay(index * eachMs)
        started = true
    }
    val lift = with(LocalDensity.current) { ArcMotion.arriveLiftPx.dp.toPx() }
    val offset by animateFloatAsState(
        targetValue = if (started) 0f else lift,
        animationSpec = tween(ArcMotion.stdMs, easing = ArriveEase),
    )
    val alpha by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = tween(ArcMotion.stdMs),
    )
    return this.graphicsLayer {
        translationY = offset
        this.alpha = alpha
    }
}

/**
 * A control the viewer can reach.
 *
 * Focus is stated with a fill swap and a size, never with an accent: the secondary button goes from slate
 * to white and the primary keeps its white and gains a dark halo then a white ring outside it. The label
 * changes colour with the fill, so the rim is never the only thing saying which one is live.
 */
@Composable
fun ArcButton(
    text: String,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    enabled: Boolean = true,
    focusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(6.dp)
    val lifted = enabled && (primary || focused)
    Box(
        modifier = modifier
            .scale(if (focused) (if (primary) 1.05f else 1.04f) else 1f)
            .then(
                when {
                    focused && primary -> Modifier.border(4.5.dp, Color.White, shape).padding(4.5.dp)
                    focused && enabled -> Modifier.border(2.dp, Color(0x4DFFFFFF), shape).padding(2.dp)
                    else -> Modifier
                }
            )
            .clip(shape)
            .background(
                when {
                    !enabled -> SurfaceRisen.copy(alpha = 0.5f)
                    lifted -> Color.White
                    else -> SurfaceRisen
                }
            )
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .arcSelect(onSelect, { focused = it }, enabled),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = ArcType.button,
            color = when {
                !enabled -> Color(0x66F7F7F9)
                lifted -> ArcBlack
                else -> Ink
            },
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(
                horizontal = if (primary) 31.dp else 27.dp,
                vertical = if (primary) 11.dp else 10.dp,
            ),
        )
    }
}

/**
 * A fact about the bytes, in a pill. `alert` is the one that means you may hear nothing.
 *
 * The text is left exactly as it is given, because a genre is a word a catalogue wrote ("Drama") while a
 * codec is an acronym this app shouts ("AAC"), and the web shell spells them that way too.
 */
@Composable
fun ArcChip(text: String, modifier: Modifier = Modifier, alert: Boolean = false) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(if (alert) Warning else Color(0x1AFFFFFF))
            .border(0.5.dp, if (alert) Warning else Color(0x29FFFFFF), CircleShape)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = text,
            style = ArcType.pill,
            color = if (alert) Color(0xFF1A1300) else Color(0xFFDCDCE6),
        )
    }
}

/** The mark from the phone's launcher, small enough to sit beside a word. */
@Composable
fun ArcBrand(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(19.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Brush.linearGradient(listOf(Color.White, Color(0xFFB9B9C6)))),
        ) {
            Canvas(Modifier.size(19.dp)) {
                val halfW = 3.dp.toPx()
                val halfH = 4.dp.toPx()
                // A hair right of centre, which is where the CSS puts it: the triangle's optical middle
                // is not its geometric one.
                val cx = size.width / 2f + 0.5.dp.toPx()
                val cy = size.height / 2f
                drawPath(
                    Path().apply {
                        moveTo(cx - halfW, cy - halfH)
                        lineTo(cx + halfW, cy)
                        lineTo(cx - halfW, cy + halfH)
                        close()
                    },
                    color = ArcBlack,
                )
            }
        }
        Text(
            text = "ArcTV",
            style = ArcType.brand,
            color = Ink,
            modifier = Modifier.padding(start = 7.dp),
        )
    }
}

/**
 * Artwork from the phone — the only colour on this screen.
 *
 * The path the phone hands over is already complete and carries the key, because a picture is fetched by
 * something that cannot present a header any other way. Absent artwork is not a grey hole: the title is
 * set into the same gradient the web shell uses, bottom-left, so a card never reads as a failed network.
 */
@Composable
fun ArcArtwork(
    url: String?,
    title: String,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    var failed by remember(url) { mutableStateOf(false) }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF292834), Color(0xFF15151C), Color(0xFF0E0E13)))),
        contentAlignment = Alignment.BottomStart,
    ) {
        if (url != null && !failed) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = contentScale,
                onError = { failed = true },
                modifier = Modifier.matchParentSize(),
            )
        }
        if (url == null || failed) {
            Text(
                text = title,
                style = ArcType.cardFallback,
                color = ShelfInk,
                textAlign = TextAlign.Start,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 12.dp),
            )
        }
    }
}

/**
 * The ring a television puts around the thing it is pointing at.
 *
 * Two rings, as the web shell has them: a rim on the control's own edge and a second one a hair outside
 * it, so the control reads as lifted off the artwork rather than painted on it. Both are drawn after the
 * content because an artwork is opaque and a ring drawn behind one is a ring nobody sees. The outer ring
 * is drawn outside this node's bounds, so whatever holds it must not clip and must leave the gap room.
 */
fun Modifier.arcFocusRing(
    active: Boolean,
    corner: Dp = 6.dp,
    rim: Dp = 2.dp,
    gap: Dp = 3.5.dp,
    halo: Dp = 2.5.dp,
    haloColor: Color = Color(0x21FFFFFF),
): Modifier = this.drawWithContent {
    drawContent()
    if (!active) return@drawWithContent
    val radius = corner.toPx()
    val width = rim.toPx()
    if (width > 0f) {
        drawRoundRect(
            color = Color.White,
            topLeft = Offset(width / 2f, width / 2f),
            size = Size(size.width - width, size.height - width),
            cornerRadius = CornerRadius(radius),
            style = Stroke(width = width),
        )
    }
    val outside = gap.toPx()
    val line = halo.toPx()
    drawRoundRect(
        color = haloColor,
        topLeft = Offset(-outside, -outside),
        size = Size(size.width + outside * 2f, size.height + outside * 2f),
        cornerRadius = CornerRadius(radius + outside),
        style = Stroke(width = line),
    )
}

/**
 * The shimmer the shelf wears while it waits.
 *
 * A band the width of the box itself, walked from one edge to the other, which is what the CSS does with
 * `background-size: 1200px` and a sliding position. The gradient clamps outside its span, so the grey that
 * leads and follows the band is the same grey the skeleton is made of.
 */
@Composable
fun Modifier.arcShimmer(): Modifier {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val slide by transition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1_500, easing = LinearEasing), RepeatMode.Restart),
        label = "slide",
    )
    return this.drawBehind {
        val start = slide * size.width
        drawRect(
            brush = Brush.linearGradient(
                0f to Color(0xFF131319),
                0.5f to Color(0xFF1D1D26),
                1f to Color(0xFF131319),
                start = Offset(start, 0f),
                end = Offset(start + size.width, 0f),
            )
        )
    }
}

/** `2h 14m` — the shelf's way of saying how long, for a hero and a card. */
fun arcRuntime(ms: Long): String {
    if (ms <= 0) return ""
    val minutes = ms / 60_000
    if (minutes < 60) return "${minutes}m"
    val rest = minutes % 60
    return if (rest == 0L) "${minutes / 60}h" else "${minutes / 60}h ${rest}m"
}

/** `1:04:07` — a clock, for anything that counts the seconds a film has been running. */
fun arcClock(ms: Long): String {
    val total = if (ms < 0) 0 else ms / 1_000
    val hours = total / 3_600
    val minutes = (total % 3_600) / 60
    val seconds = total % 60
    val pad = { value: Long -> if (value < 10) "0$value" else "$value" }
    return if (hours > 0) "$hours:${pad(minutes)}:${pad(seconds)}" else "$minutes:${pad(seconds)}"
}

/** `6.2 GB`, or `612 MB` under a gigabyte. */
fun arcSize(bytes: Long): String = when {
    bytes <= 0 -> ""
    bytes >= 1L shl 30 -> String.format("%.1f GB", bytes / 1073741824.0)
    else -> "${Math.round(bytes / 1048576.0)} MB"
}

/** The line under a heading — `2024 · 2h 14m · 1080p · 6.2 GB` — joined the way the web shell joins it. */
@Composable
fun ArcFacts(
    facts: List<String>,
    modifier: Modifier = Modifier,
    style: TextStyle = ArcType.heroMeta,
    color: Color = Muted,
) {
    val joined = facts.filter { it.isNotBlank() }.joinToString("   ·   ")
    if (joined.isEmpty()) return
    Text(joined, style = style, color = color, modifier = modifier)
}

/** The one message on this app that is not white: a film whose audio this panel may not decode. */
@Composable
fun ArcWarningBar(text: String, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(4.dp)
    Text(
        text = text,
        style = ArcType.detailWarn,
        color = Warning,
        modifier = modifier
            .widthIn(max = 440.dp)
            .clip(shape)
            .background(WarningSunken)
            // The rim is on the left alone, which is what makes this block read as an interruption in
            // the page rather than a piece of it.
            .drawBehind { drawRect(Warning, Offset.Zero, Size(2.5.dp.toPx(), size.height)) }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    )
}
