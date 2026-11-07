package com.aeswox.arcplayer.tv.ui

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.nativeKeyCode
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import coil.compose.rememberAsyncImagePainter
import com.aeswox.arcplayer.tv.arc.Part
import com.aeswox.arcplayer.tv.arc.Work
import com.aeswox.arcplayer.tv.ui.components.ArcGlyph
import com.aeswox.arcplayer.tv.ui.components.ArcGlyphs
import com.aeswox.arcplayer.tv.ui.components.ArcIcon
import com.aeswox.arcplayer.tv.ui.components.ArriveEase
import com.aeswox.arcplayer.tv.ui.components.arcClock
import com.aeswox.arcplayer.tv.ui.theme.ArcBlack
import com.aeswox.arcplayer.tv.ui.theme.ArcMotion
import com.aeswox.arcplayer.tv.ui.theme.ArcType
import com.aeswox.arcplayer.tv.ui.theme.Ink
import com.aeswox.arcplayer.tv.ui.theme.Muted
import com.aeswox.arcplayer.tv.ui.theme.PlayerBackFill
import com.aeswox.arcplayer.tv.ui.theme.PlayerBarBase
import com.aeswox.arcplayer.tv.ui.theme.PlayerBottomScrim
import com.aeswox.arcplayer.tv.ui.theme.PlayerContextFill
import com.aeswox.arcplayer.tv.ui.theme.PlayerContextLine
import com.aeswox.arcplayer.tv.ui.theme.PlayerControlFill
import com.aeswox.arcplayer.tv.ui.theme.PlayerControlFocusedInk
import com.aeswox.arcplayer.tv.ui.theme.PlayerControlInk
import com.aeswox.arcplayer.tv.ui.theme.PlayerControlLine
import com.aeswox.arcplayer.tv.ui.theme.PlayerLoadingDim
import com.aeswox.arcplayer.tv.ui.theme.PlayerMessageInk
import com.aeswox.arcplayer.tv.ui.theme.PlayerOptionFill
import com.aeswox.arcplayer.tv.ui.theme.PlayerOptionInk
import com.aeswox.arcplayer.tv.ui.theme.PlayerOptionLine
import com.aeswox.arcplayer.tv.ui.theme.PlayerOptionMetaFocused
import com.aeswox.arcplayer.tv.ui.theme.PlayerSheetFill
import com.aeswox.arcplayer.tv.ui.theme.PlayerSheetLine
import com.aeswox.arcplayer.tv.ui.theme.PlayerSheetNoteInk
import com.aeswox.arcplayer.tv.ui.theme.PlayerTimeInk
import com.aeswox.arcplayer.tv.ui.theme.PlayerTopScrim
import kotlinx.coroutines.delay

/*
 * The player, screen for screen the web shell's.
 *
 * One node holds focus and every key is read there, because that is how the television app works: the
 * shell's controls are `tabindex="-1"` and `document` owns `keydown`, so the highlighted button is a
 * number in the script rather than the platform's focus. Copying that — rather than letting Compose walk
 * focus between six circles — is what keeps the key map identical: Up leaves the row entirely, Left on a
 * focused button moves along the row instead of seeking, and the pill swallows Left and Right outright.
 */

/** `HIDE_CONTROLS_MS` in `tizen/js/player.js`. */
private const val HideControlsMs = 4_000L

/** The two non-button values of the shell's `focusIndex`. */
private const val ContextFocus = -2
private const val NoFocus = -1

/** What the hint says when nothing in the chrome is pointing at anything. */
private const val IdleHint = "Left / Right to seek · OK to pause · Up / Down for controls"

/** CSS `ease-out`, which is what the wordmark fades in on. */
private val EaseOut = CubicBezierEasing(0f, 0f, 0.58f, 1f)

@Composable
fun PlayerScreen(
    session: ArcSession,
    work: Work,
    part: Part,
    startMs: Long,
    onLeave: (positionMs: Long, durationMs: Long, finished: Boolean, step: Int) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val playback = remember(part.id) { ArcPlayback(context, session.phone, work, part, startMs, scope) }

    // A plain field, not state: the engine only reads it when it files the bookmark, long after this line.
    playback.onLeave = onLeave
    DisposableEffect(playback) { onDispose { playback.destroy() } }

    var focusIndex by remember(playback) { mutableStateOf(NoFocus) }
    var sheetIndex by remember(playback) { mutableStateOf(0) }
    var sheetReturn by remember(playback) { mutableStateOf(NoFocus) }
    var hint by remember(playback) { mutableStateOf(IdleHint) }
    var visible by remember(playback) { mutableStateOf(true) }
    var wakeTick by remember(playback) { mutableStateOf(0) }

    val rootFocus = remember { FocusRequester() }
    LaunchedEffect(playback) {
        withFrameNanos { }
        runCatching { rootFocus.requestFocus() }
    }

    val loading = playback.message != null || playback.failed
    val items = controlsFor(playback)
    val options = sheetOptionsFor(playback)

    fun wake() {
        visible = true
        wakeTick++
    }

    fun clearControlFocus() {
        focusIndex = NoFocus
        hint = IdleHint
    }

    /**
     * The timeout the shell restarts on every key.
     *
     * It is never armed while a sheet is up or the picture is waiting on bytes, which is what stops the
     * chrome vanishing out from under a viewer who is still reading a track list.
     */
    LaunchedEffect(wakeTick, visible, playback.sheetOpen, playback.message, playback.failed) {
        if (!visible || playback.sheetOpen || loading) return@LaunchedEffect
        delay(HideControlsMs)
        if (!visible || playback.sheetOpen || playback.message != null || playback.failed) return@LaunchedEffect
        visible = false
        clearControlFocus()
    }

    fun setControlFocus(index: Int) {
        if (loading || items.isEmpty()) return
        val clamped = index.coerceIn(0, items.size - 1)
        focusIndex = clamped
        hint = items[clamped].hintFor(playback)
        wake()
    }

    fun moveControlFocus(delta: Int) {
        if (focusIndex < 0 || items.isEmpty()) {
            setControlFocus(0)
            return
        }
        setControlFocus((focusIndex + delta + items.size) % items.size)
    }

    fun openSheet(type: Int) {
        if (!playback.canAct) return
        val tracks = if (type == C.TRACK_TYPE_AUDIO) playback.audioTracks else playback.textTracks
        if (tracks.isEmpty()) {
            hint = if (type == C.TRACK_TYPE_AUDIO) "No audio tracks found" else "No embedded subtitles found"
            return
        }
        sheetReturn = focusIndex
        sheetIndex = 0
        focusIndex = NoFocus
        playback.openTrackSheet(type)
        wake()
    }

    fun activate(control: ArcControl) {
        when (control) {
            ArcControl.Previous -> playback.step(-1)
            ArcControl.Next -> playback.step(1)
            ArcControl.Aspect -> {
                playback.cycleDisplayMode()
                hint = playback.displayLabel
            }

            ArcControl.Subtitles -> openSheet(C.TRACK_TYPE_TEXT)
            ArcControl.Audio -> openSheet(C.TRACK_TYPE_AUDIO)
        }
    }

    fun closeSheet() {
        if (!playback.sheetOpen) return
        playback.closeTrackSheet()
        sheetIndex = 0
        val back = sheetReturn
        sheetReturn = NoFocus
        if (back >= 0) setControlFocus(back) else wake()
    }

    fun moveSheet(delta: Int) {
        if (options.isEmpty()) return
        sheetIndex = (sheetIndex + delta + options.size) % options.size
    }

    fun selectSheetOption() {
        val type = playback.sheetType ?: return
        if (options.isEmpty()) return
        val picked = options[sheetIndex.coerceIn(0, options.size - 1)]
        // The engine answers first, because closing a sheet hands the hint back to the button that opened
        // it — and the track that was just chosen has to be the last word.
        val message = playback.selectTrack(type, picked)
        closeSheet()
        hint = message
    }

    fun focusContext() {
        if (playback.contextKind == ArcContext.None || loading) return
        focusIndex = ContextFocus
        hint = pillLabel(playback.contextKind)
        wake()
    }

    /**
     * The key map, tested in the order the shell tests it.
     *
     * Anything not listed is handed back, so volume, the guide button and a set's own shortcuts still
     * reach the television. The web shell swallows every key because one `document` listener serves the
     * whole app; here this screen is the only thing alive.
     */
    fun handleKey(code: Int): Boolean {
        wake()
        if (loading) return true

        if (playback.sheetOpen) {
            when (code) {
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_UP -> moveSheet(-1)
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_DOWN -> moveSheet(1)
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER ->
                    selectSheetOption()

                // The sheet's own note promises this, and the shell keeps the promise: out of a track
                // list Back steps back to the pill, it does not leave the film.
                KeyEvent.KEYCODE_BACK -> closeSheet()
            }
            return true
        }

        when (code) {
            KeyEvent.KEYCODE_DPAD_UP -> {
                if (focusIndex >= 0 || focusIndex == ContextFocus) clearControlFocus()
                else if (playback.contextKind != ArcContext.None) focusContext()
                else setControlFocus(0)
                return true
            }

            KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (focusIndex < 0) setControlFocus(0) else clearControlFocus()
                return true
            }

            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                val delta = if (code == KeyEvent.KEYCODE_DPAD_LEFT) -1 else 1
                if (focusIndex >= 0) moveControlFocus(delta)
                else if (focusIndex != ContextFocus) playback.seekBy(delta * SEEK_STEP_MS)
                return true
            }

            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                when {
                    focusIndex == ContextFocus -> playback.activateContext()
                    focusIndex in 0 until items.size -> activate(items[focusIndex])
                    else -> playback.toggle()
                }
                return true
            }

            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                playback.toggle()
                return true
            }

            KeyEvent.KEYCODE_MEDIA_REWIND -> {
                playback.seekBy(-LARGE_STEP_MS)
                return true
            }

            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                playback.seekBy(LARGE_STEP_MS)
                return true
            }
        }
        return false
    }

    BackHandler { playback.close() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(rootFocus)
            .focusable()
            .onPreviewKeyEvent { event ->
                event.type == KeyEventType.KeyDown && handleKey(event.key.nativeKeyCode)
            },
    ) {
        VideoSurface(playback)

        if (loading) LoadingLayer(session, work, playback)

        if (visible) {
            TopBar(work, part, playback, loading)
            if (!loading) BottomBar(playback, items, focusIndex, hint, ::activate)
            // `.is-loading` takes the sheet away, so a stall that starts while a track list is standing
            // shows the held picture and the waiting words rather than a menu over them — the keys still
            // belong to the sheet, exactly as they still do in the shell.
            if (playback.sheetOpen && !loading) {
                TrackSheet(playback, options, sheetIndex) { index ->
                    sheetIndex = index
                    selectSheetOption()
                }
            }
        }

        // Outside the chrome that fades, exactly as the shell's z-index 4 sits above `#player-ui`: the offer
        // to skip an intro is worth more than a clean frame.
        if (playback.contextKind != ArcContext.None && !playback.sheetOpen) {
            ContextPill(playback.contextKind, focusIndex == ContextFocus) { playback.activateContext() }
        }
    }
}

/* ------------------------------------------------------------------ chrome */

/**
 * The bottom third: the line, the clock, the six circles.
 *
 * None of it animates. The web shell says so out loud — an animated layer over the surface the decoder is
 * still painting is how a television starts dropping the picture instead of the menu — so focus here is a
 * fill that flips in one frame.
 */
@Composable
private fun BoxScope.BottomBar(
    playback: ArcPlayback,
    items: List<ArcControl>,
    focusIndex: Int,
    hint: String,
    onActivate: (ArcControl) -> Unit,
) {
    Column(
        modifier = Modifier
            .align(Alignment.BottomStart)
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    0f to Color.Transparent,
                    0.26f to Color(0x6B040509),
                    0.58f to Color(0xE0040509),
                    1f to PlayerBottomScrim,
                ),
            )
            .padding(start = 42.dp, end = 42.dp, top = 75.dp, bottom = 28.dp),
    ) {
        val total = playback.durationMs
        val fraction = if (total > 0) (playback.positionMs.toFloat() / total).coerceIn(0f, 1f) else 0f
        // `#player-bar` rounds its own 6px height and never clips. That distinction is the whole point:
        // `#player-thumb` hangs half past the end of the played line, and a clip would cut it into a
        // half-circle for every film that starts at zero.
        val barShape = RoundedCornerShape(1.5.dp)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(PlayerBarBase, barShape),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .fillMaxHeight()
                    .background(Color.White, barShape),
            ) {
                Box(
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        // `right: -7px` on a 14px circle, so its centre sits on the end of the line.
                        .offset(x = 3.5.dp)
                        .size(7.dp)
                        .background(Color.White, CircleShape),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 11.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(arcClock(playback.positionMs), style = ArcType.playerTime, color = PlayerTimeInk)
            Text(
                text = hint,
                style = ArcType.playerHint,
                color = Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 16.dp),
            )
            Text(arcClock(playback.durationMs), style = ArcType.playerTime, color = PlayerTimeInk)
        }

        Row(modifier = Modifier.padding(top = 13.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            items.forEachIndexed { index, control ->
                ControlCircle(
                    control = control,
                    playback = playback,
                    focused = index == focusIndex,
                    disabled = control.dimmed(playback),
                    onSelect = { onActivate(control) },
                )
            }
        }
    }
}

@Composable
private fun ControlCircle(
    control: ArcControl,
    playback: ArcPlayback,
    focused: Boolean,
    disabled: Boolean,
    onSelect: () -> Unit,
) {
    val shape = CircleShape
    Box(
        modifier = Modifier
            .alpha(if (disabled) 0.34f else 1f)
            .size(42.dp)
            .background(if (focused) Color.White else PlayerControlFill, shape)
            .border(1.dp, if (focused) Color.White else PlayerControlLine, shape)
            .arcTap(onSelect),
        contentAlignment = Alignment.Center,
    ) {
        ArcIcon(
            glyph = control.glyphFor(playback),
            size = 20.dp,
            tint = if (focused) PlayerControlFocusedInk else PlayerControlInk,
        )
    }
}

/**
 * The back button and the line the viewer is watching.
 *
 * The gradient goes while the film is still arriving, because there is nothing behind it yet — the shell
 * takes the same background off in the same rule that hides the title.
 */
@Composable
private fun BoxScope.TopBar(work: Work, part: Part, playback: ArcPlayback, loading: Boolean) {
    Row(
        modifier = Modifier
            .align(Alignment.TopStart)
            .fillMaxWidth()
            .then(
                if (loading) {
                    Modifier
                } else {
                    Modifier.background(Brush.verticalGradient(0f to PlayerTopScrim, 1f to Color.Transparent))
                },
            )
            .padding(start = 42.dp, end = 42.dp, top = 30.dp, bottom = 55.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .padding(end = 15.dp)
                .clip(RoundedCornerShape(5.dp))
                .background(PlayerBackFill)
                .border(1.dp, Color.Transparent, RoundedCornerShape(5.dp))
                .arcTap { playback.close() }
                .padding(horizontal = 9.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ArcIcon(ArcGlyphs.Back, size = 15.dp, tint = Color.White)
            Text("Back", style = ArcType.playerBack, color = Color.White)
        }
        if (!loading) {
            val label = work.partLabel(part)
            Text(
                text = if (label == null) work.title else "${work.title} · $label",
                style = ArcType.playerTitle,
                color = Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun BoxScope.ContextPill(kind: ArcContext, focused: Boolean, onActivate: () -> Unit) {
    val shape = CircleShape
    Box(
        modifier = Modifier
            .align(Alignment.BottomEnd)
            .padding(end = 42.dp, bottom = 145.dp)
            .background(if (focused) Color.White else PlayerContextFill, shape)
            .border(1.dp, if (focused) Color.White else PlayerContextLine, shape)
            .arcTap(onActivate)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    ) {
        Text(pillLabel(kind), style = ArcType.playerContext, color = if (focused) ArcBlack else Color.White)
    }
}

/* ------------------------------------------------------------------ sheet */

/**
 * The track list, which is chrome and therefore arrives on the frame the button was pressed and leaves on
 * the frame the choice was made.
 */
@Composable
private fun BoxScope.TrackSheet(
    playback: ArcPlayback,
    options: List<ArcTrack>,
    sheetIndex: Int,
    onPick: (Int) -> Unit,
) {
    val state = rememberLazyListState()
    LaunchedEffect(sheetIndex, options.size) {
        val shown = state.layoutInfo.visibleItemsInfo
        val first = shown.firstOrNull()?.index ?: 0
        val last = shown.lastOrNull()?.index ?: 0
        if (sheetIndex < first || sheetIndex > last) state.scrollToItem(sheetIndex)
    }
    val heading = if (playback.sheetType == C.TRACK_TYPE_AUDIO) "Audio track" else "Subtitles"

    Column(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .padding(bottom = 120.dp)
            .widthIn(max = 490.dp)
            .heightIn(max = 260.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(PlayerSheetFill, RoundedCornerShape(14.dp))
            .border(0.5.dp, PlayerSheetLine, RoundedCornerShape(14.dp))
            .padding(horizontal = 19.dp, vertical = 17.dp),
    ) {
        Column(modifier = Modifier.padding(bottom = 11.dp)) {
            Text(heading, style = ArcType.playerSheetTitle, color = Color.White)
            Text(
                "Use the remote to choose · Back closes",
                style = ArcType.playerSheetNote,
                color = PlayerSheetNoteInk,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        LazyColumn(state = state, modifier = Modifier.heightIn(max = 195.dp)) {
            itemsIndexed(options) { index, option ->
                SheetRow(
                    option = option,
                    focused = index == sheetIndex,
                    last = index == options.lastIndex,
                    onSelect = { onPick(index) },
                )
            }
        }
    }
}

@Composable
private fun SheetRow(option: ArcTrack, focused: Boolean, last: Boolean, onSelect: () -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    val current = option.meta == "Current"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = if (last) 0.dp else 5.dp)
            .heightIn(min = 36.dp)
            .clip(shape)
            .background(if (focused) Color.White else PlayerOptionFill, shape)
            .border(0.5.dp, if (focused) Color.White else PlayerOptionLine, shape)
            .arcTap(onSelect)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = option.label,
            style = if (current) ArcType.playerOptionSelected else ArcType.playerOption,
            color = if (focused) PlayerControlFocusedInk else PlayerOptionInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (option.meta.isNotEmpty()) {
            Text(
                text = option.meta,
                style = ArcType.playerOptionMeta,
                color = when {
                    focused -> PlayerOptionMetaFocused
                    current -> PlayerOptionInk
                    else -> PlayerSheetNoteInk
                },
                modifier = Modifier.padding(start = 12.dp),
            )
        }
    }
}

/* ---------------------------------------------------------------- opening */

/**
 * The veil over the first frame, and over any later wait.
 *
 * It is opaque while the film is still opening, because none of it has been painted yet, and translucent
 * from the first advancing tick on, so a stall mid-scene shows the held picture behind the words instead
 * of a black screen. Only the opening version of this overlay is allowed to move.
 */
@Composable
private fun BoxScope.LoadingLayer(session: ArcSession, work: Work, playback: ArcPlayback) {
    val backdrop = session.phone.absolute(work.backdropPath ?: work.posterPath)
    val logo = rememberAsyncImagePainter(model = session.phone.absolute(work.logoPath))
    val logoReady = logo.state is AsyncImagePainter.State.Success

    var started by remember(playback) { mutableStateOf(false) }
    LaunchedEffect(playback) { started = true }

    val settle by animateFloatAsState(
        targetValue = if (playback.opening && !started) 0f else 1f,
        animationSpec = tween(ArcMotion.slowMs, easing = ArriveEase),
        label = "settle",
    )
    val logoAlpha by animateFloatAsState(
        targetValue = if (logoReady) 1f else 0f,
        animationSpec = tween(ArcMotion.stdMs, easing = EaseOut),
        label = "logo",
    )

    Box(
        modifier = Modifier
            .align(Alignment.TopStart)
            .fillMaxSize()
            .background(if (playback.opening) ArcBlack else Color.Transparent),
        contentAlignment = Alignment.Center,
    ) {
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Box(Modifier.fillMaxSize().background(PlayerLoadingDim))

        Column(
            modifier = Modifier
                .widthIn(max = 550.dp)
                .padding(horizontal = 24.dp)
                .graphicsLayer {
                    alpha = settle
                    scaleX = 0.98f + 0.02f * settle
                    scaleY = 0.98f + 0.02f * settle
                    translationY = (1f - settle) * 5.dp.toPx()
                },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // The wordmark replaces the name once its bytes have arrived, so it fades in rather than
            // cutting the title out from under the viewer.
            if (logoReady) {
                Image(
                    painter = logo,
                    contentDescription = work.title,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .widthIn(max = 380.dp)
                        .heightIn(max = 110.dp)
                        .alpha(logoAlpha),
                )
            } else {
                Text(
                    text = work.title,
                    style = ArcType.playerWorkTitle,
                    color = Ink,
                    textAlign = TextAlign.Center,
                )
            }

            if (!playback.failed) {
                Spinner(Modifier.padding(top = 17.dp, bottom = 11.dp))
            }

            Text(
                text = playback.message.orEmpty(),
                style = ArcType.playerMessage,
                color = PlayerMessageInk,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .widthIn(max = 440.dp)
                    .padding(top = if (playback.failed) 17.dp else 0.dp),
            )

            if (playback.failed) {
                Text(
                    "Press Back to return.",
                    style = ArcType.playerError,
                    color = Color.White,
                    modifier = Modifier.padding(top = 11.dp),
                )
            }
        }
    }
}

/**
 * The one thing in the player that turns, and only while there is no picture to drop.
 *
 * The CSS draws it as a ring with its top edge brighter than the rest, which is a full circle and a
 * quarter arc; nothing here re-measures it per frame because a spinner is the cheapest thing on screen.
 */
@Composable
private fun Spinner(modifier: Modifier = Modifier) {
    val spin = rememberInfiniteTransition(label = "spinner")
    val angle by spin.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing)),
        label = "angle",
    )
    Canvas(modifier.size(15.dp)) {
        val ring = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Butt)
        // The CSS spins the whole ring; a full circle looks the same turned, so only the bright quarter
        // has to move, and moving it is one number rather than a transform over the draw scope.
        drawArc(Color(0x38FFFFFF), 0f, 360f, useCenter = false, style = ring)
        drawArc(Color.White, angle, 90f, useCenter = false, style = ring)
    }
}

/* ---------------------------------------------------------------- surface */

/**
 * The picture.
 *
 * `PlayerView` rather than a bare surface, because it is the part of media3 that owns the three ways a
 * panel can place a frame the shape of a different rectangle — and the one that paints captions.
 */
@OptIn(UnstableApi::class)
@Composable
private fun VideoSurface(playback: ArcPlayback) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            PlayerView(ctx).apply {
                setUseController(false)
                setControllerAutoShow(false)
                // A panel puts its screensaver on after a few quiet minutes, and a film asked for from a
                // sofa is not quiet enough to count as idle. The view's own flag goes when it leaves.
                keepScreenOn = true
                setPlayer(playback.player)
            }
        },
        update = { it.setResizeMode(resizeModeFor(playback.displayMode)) },
        onRelease = { it.setPlayer(null) },
    )
}

private fun resizeModeFor(mode: Int): Int = when (mode) {
    1 -> AspectRatioFrameLayout.RESIZE_MODE_FILL
    2 -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
    else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
}

/* ---------------------------------------------------------------- buttons */

/** The five things a viewer can land on, in the order the row builds itself. */
private enum class ArcControl { Previous, Aspect, Subtitles, Audio, Next }

private fun controlsFor(playback: ArcPlayback): List<ArcControl> = buildList {
    if (playback.hasPrevious) add(ArcControl.Previous)
    add(ArcControl.Aspect)
    add(ArcControl.Subtitles)
    add(ArcControl.Audio)
    if (playback.hasNext) add(ArcControl.Next)
}

private fun ArcControl.glyphFor(playback: ArcPlayback): ArcGlyph = when (this) {
    ArcControl.Previous -> ArcGlyphs.Previous
    ArcControl.Next -> ArcGlyphs.Next
    ArcControl.Subtitles -> ArcGlyphs.Subtitles
    ArcControl.Audio -> ArcGlyphs.Audio
    ArcControl.Aspect -> when (playback.displayMode) {
        1 -> ArcGlyphs.Stretch
        2 -> ArcGlyphs.Crop
        else -> ArcGlyphs.Fit
    }
}

/** The hint line for a button, which for the size control is the mode it is currently in. */
private fun ArcControl.hintFor(playback: ArcPlayback): String = when (this) {
    ArcControl.Previous -> "Previous episode"
    ArcControl.Next -> "Next episode"
    ArcControl.Subtitles -> "Subtitles"
    ArcControl.Audio -> "Audio"
    ArcControl.Aspect -> playback.displayLabel
}

/** A track button with nothing behind it is shown and dimmed, never hidden — and it does nothing. */
private fun ArcControl.dimmed(playback: ArcPlayback): Boolean = when (this) {
    ArcControl.Subtitles -> playback.textTracks.isEmpty()
    ArcControl.Audio -> playback.audioTracks.isEmpty()
    else -> false
}

private fun pillLabel(kind: ArcContext): String = when (kind) {
    ArcContext.SkipIntro -> "Skip intro"
    ArcContext.NextEpisode -> "Next episode"
    ArcContext.None -> ""
}

/**
 * A track sheet's rows: what the file carries, plus the way out for captions.
 *
 * `Off` is offered for subtitles and never for audio, because a film with no voice track is not a film
 * anybody chose to watch silently.
 */
private fun sheetOptionsFor(playback: ArcPlayback): List<ArcTrack> {
    val type = playback.sheetType ?: return emptyList()
    val tracks = if (type == C.TRACK_TYPE_AUDIO) playback.audioTracks else playback.textTracks
    if (type != C.TRACK_TYPE_TEXT) return tracks
    val off = tracks.none { it.current }
    return listOf(ArcTrack("Off", if (off) "Current" else "", off, null)) + tracks
}

/** The web shell's controls answer a click as well as a key, and a television has both. */
private fun Modifier.arcTap(onSelect: () -> Unit): Modifier =
    pointerInput(onSelect) { detectTapGestures { onSelect() } }
