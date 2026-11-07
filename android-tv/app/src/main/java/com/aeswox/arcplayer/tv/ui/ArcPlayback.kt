package com.aeswox.arcplayer.tv.ui

import android.content.Context
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import com.aeswox.arcplayer.tv.arc.ArcPhone
import com.aeswox.arcplayer.tv.arc.Part
import com.aeswox.arcplayer.tv.arc.Work
import com.aeswox.arcplayer.tv.arc.adjacentEpisode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private const val TICK_MS = 500L
private const val REPORT_MS = 10_000L

/*
 * The two distances a remote can move a play head. A television has no scrubber, so an arrow key is the
 * scrubber — and it has to be big enough to cross a scene in a few presses without overshooting a sentence.
 */
const val SEEK_STEP_MS = 10_000L
const val LARGE_STEP_MS = 30_000L

/** Which of the two one-tap actions the pill in the corner is offering right now. */
enum class ArcContext { None, SkipIntro, NextEpisode }

/**
 * One selectable audio or caption track.
 *
 * The label is what the file declares and the meta is what the bytes are, so a viewer choosing between
 * two languages sees the same two lines the web shell's sheet gives them.
 */
@OptIn(UnstableApi::class)
data class ArcTrack(
    val label: String,
    val meta: String,
    val current: Boolean,
    val override: TrackSelectionOverride?,
)

/**
 * Playback, and nothing a screen can see.
 *
 * This is the web shell's state machine, kept rule for rule rather than re-derived, because the two rules
 * that matter most are the invisible ones:
 *
 *  - A position is only *watched* when the clock is seen advancing. A seek target, a ready state or a
 *    play call proves nothing, so a resume point can only come from a tick that moved. Without this the
 *    television would tell the phone it finished an episode the moment it was asked to open one.
 *  - A part is finished when the panel says the stream ended, or when the viewer leaves it inside the
 *    credits window the phone marked. Nothing else — never a tap.
 *
 * One instance is built per file, so an episode hand-off tears this down and starts again exactly as
 * `Player.open` did: the old listener, the old timers and the old watched position all go with it.
 */
@OptIn(UnstableApi::class)
class ArcPlayback(
    context: Context,
    private val phone: ArcPhone,
    private val work: Work,
    private val part: Part,
    startMs: Long,
    private val scope: CoroutineScope,
) {
    val player: ExoPlayer = ExoPlayer.Builder(context).build()

    /** Where the sofa stopped, handed to the shelf so it can restamp itself and pick the next episode. */
    var onLeave: (positionMs: Long, durationMs: Long, finished: Boolean, step: Int) -> Unit =
        { _, _, _, _ -> }

    var positionMs by mutableStateOf(0L); private set
    var durationMs by mutableStateOf(0L); private set
    var message by mutableStateOf<String?>(null); private set
    var failed by mutableStateOf(false); private set
    var opening by mutableStateOf(true); private set
    var displayMode by mutableStateOf(0); private set
    var audioTracks by mutableStateOf(listOf<ArcTrack>()); private set
    var textTracks by mutableStateOf(listOf<ArcTrack>()); private set
    var contextKind by mutableStateOf(ArcContext.None); private set

    /**
     * The two things the track sheet needs the engine for: whether it is standing, and which half of the
     * tracks it is listing. Both are engine state because an open sheet silences the corner pill, and the
     * engine is the only thing that decides whether a pill exists.
     */
    var sheetOpen by mutableStateOf(false); private set
    var sheetType by mutableStateOf<Int?>(null); private set

    private var ready = false
    private var seeking = false
    private var buffering = false
    private var hasPlayed = false
    private var lastPlayedPosition = 0L
    private var observedPosition: Long? = null
    private var observedAt = 0L
    private var actualDuration = 0L
    private var lastReported = -1L
    private var introTarget = 0L
    private var destroyed = false

    private val tickJob = scope.launch {
        while (isActive) {
            delay(TICK_MS)
            tick()
        }
    }
    private val reportJob = scope.launch {
        while (isActive) {
            delay(REPORT_MS)
            report(force = false)
        }
    }

    // Declared before `init` because initialisation runs in declaration order, and the first thing the
    // engine does is hand this listener to the player.
    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            if (destroyed) return
            when (state) {
                Player.STATE_READY -> {
                    ready = true
                    val wasSeeking = seeking
                    seeking = false
                    buffering = false
                    if (wasSeeking) observedPosition = null else resetObservation()
                    // Playing is proved by an advancing clock, not by arriving at the target: only a
                    // viewer who is parked says the loader may go now.
                    if (!opening && isPaused()) hideLoading()
                }

                Player.STATE_BUFFERING -> if (ready) bufferStart()

                Player.STATE_ENDED -> if (ready && !seeking && !opening) finish(ended = true, step = 0)

                else -> {}
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            if (destroyed) return
            fail(if (ready) "Playback failed: " + describe(error) else startFailure(error))
        }

        override fun onTracksChanged(tracks: Tracks) = refreshTracks()

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) resetObservation()
        }
    }

    init {
        player.addListener(listener)
        player.setMediaItem(MediaItem.fromUri(phone.streamUrl(part.id)))
        player.seekTo(positive(startMs))
        player.prepare()
        player.playWhenReady = true
        message = if (part.fromTelegram) TELEGRAM_WAIT else LOADING
        refreshTracks()
    }

    val canAct: Boolean get() = !destroyed && ready && message == null && !failed

    /** The episode before or after this one, which is what makes the two step buttons appear. */
    val hasPrevious: Boolean get() = adjacentEpisode(work, part, -1) != null
    val hasNext: Boolean get() = adjacentEpisode(work, part, 1) != null

    fun seekBy(delta: Long) = seekTo(position() + delta)

    /**
     * Aim the play head somewhere else.
     *
     * Refused while anything else is already waiting for bytes, which is the rule that keeps a viewer
     * holding down a key from queueing six seeks against a stream that has not answered the first.
     */
    fun seekTo(ms: Long) {
        if (!canAct || seeking || duration() == 0L) return
        val target = clampSeek(ms)
        if (kotlin.math.abs(target - position()) < 250) return
        observePlayback(position())
        seeking = true
        buffering = false
        observedPosition = null
        message = SEEKING
        player.seekTo(target)
    }

    fun toggle() {
        if (!canAct) return
        observePlayback(position())
        if (player.playWhenReady) player.playWhenReady = false
        else {
            resetObservation()
            player.playWhenReady = true
        }
    }

    /** Which of the three ways this panel can place a picture the screen is currently showing. */
    val displayLabel: String get() = DISPLAY_LABELS[displayMode]

    fun cycleDisplayMode() {
        displayMode = (displayMode + 1) % DISPLAY_LABELS.size
    }

    /**
     * Put the track sheet up, or say why there is nothing to put in it.
     *
     * Refused unless the film is actually playing, because a sheet over a stalled stream is a list of
     * choices that cannot be applied — and the web shell has learned that the hard way on a real panel.
     */
    fun openTrackSheet(type: @C.TrackType Int) {
        if (!canAct || sheetOpen) return
        sheetType = type
        sheetOpen = true
        // The pill goes away the moment the sheet stands, rather than on the next tick, so the two never
        // share a screen.
        updateContext(position())
    }

    fun closeTrackSheet() {
        if (!sheetOpen) return
        sheetOpen = false
        sheetType = null
    }

    /**
     * Say which track to take, or take the captions away, and return what the chrome should then say.
     *
     * The message is the caller's to place because the sheet it came from is closing, and closing a sheet
     * restores focus to the button that opened it — which would otherwise overwrite the answer with the
     * button's own name.
     *
     * A media3 override pins one track in one group, so choosing a language also stops the player from
     * ever switching it under the viewer — which is what a deliberate pick on a television means.
     */
    fun selectTrack(type: @C.TrackType Int, track: ArcTrack): String {
        val builder = player.trackSelectionParameters.buildUpon()
        builder.clearOverridesOfType(type)
        // `setDisabledTrackTypes` is deprecated in media3 1.5.1 and takes the whole set at once, so the
        // per-type form is the one that keeps a caption choice from switching the audio off with it.
        builder.setTrackTypeDisabled(type, track.override == null)
        if (track.override != null) builder.setOverrideForType(track.override)
        player.trackSelectionParameters = builder.build()
        refreshTracks()
        return (if (type == C.TRACK_TYPE_AUDIO) "Audio: " else "Subtitles: ") + track.label
    }

    fun activateContext() {
        if (!canAct) return
        updateContext(position())
        when (contextKind) {
            ArcContext.SkipIntro -> seekTo(introTarget)
            ArcContext.NextEpisode -> step(1)
            ArcContext.None -> {}
        }
    }

    /**
     * Leave for the next or previous episode.
     *
     * `finish` is what reports and restamps; the step only decides which of the two the shelf is told
     * about, so a hand-off and a back press leave the same bookmark behind.
     */
    fun step(delta: Int) {
        if (!canAct || (delta != -1 && delta != 1)) return
        if (!(if (delta < 0) hasPrevious else hasNext)) return
        finish(ended = false, step = delta)
    }

    fun close() = finish(ended = false, step = 0)

    fun destroy() {
        if (destroyed) return
        destroyed = true
        tickJob.cancel()
        reportJob.cancel()
        player.removeListener(listener)
        runCatching { player.stop() }
        runCatching { player.release() }
    }

    private fun finish(ended: Boolean, step: Int) {
        if (destroyed) return
        val finalMs = if (hasPlayed) lastPlayedPosition else 0L
        val total = duration().takeIf { it > 0 } ?: positive(part.durationMs)
        val bounds = trustedBounds()
        val finished = hasPlayed &&
            (ended || (bounds != null && bounds.outro > 0 && finalMs >= bounds.outro && finalMs <= bounds.end))
        report(force = true)
        val leave = onLeave
        destroy()
        // The shelf may open the next file from inside this call, so nothing of this one may outlive it.
        leave(finalMs, total, finished, step)
    }

    private fun position(): Long = if (destroyed || !ready) 0L else positive(player.currentPosition)

    private fun duration(): Long {
        val raw = if (ready && !destroyed) player.duration else C.TIME_UNSET
        if (raw != C.TIME_UNSET && raw > 0) actualDuration = raw
        return actualDuration
    }

    private fun clampSeek(ms: Long): Long {
        val total = duration()
        val value = positive(ms)
        return if (total > 0) maxOf(0L, minOf(value, total - 1000)) else value
    }

    private fun isPaused(): Boolean = ready && !failed && !player.playWhenReady

    private fun tick() {
        if (destroyed || failed) return
        val pos = position()
        val total = duration()
        observePlayback(pos)
        positionMs = pos
        if (total > 0) durationMs = total
        updateContext(pos)
    }

    private fun observePlayback(pos: Long) {
        if (destroyed || !ready || seeking || buffering || !player.isPlaying) return
        val now = System.currentTimeMillis()
        val observed = observedPosition
        if (observed != null && pos > observed && pos - observed <= maxOf(2_000L, (now - observedAt) * 2 + 500)) {
            hasPlayed = true
            lastPlayedPosition = pos
            duration()
            if (opening) opening = false
            hideLoading()
        }
        if (observed != pos) {
            observedPosition = pos
            observedAt = now
        }
    }

    private fun resetObservation() {
        observedPosition = position()
        observedAt = System.currentTimeMillis()
    }

    private fun bufferStart() {
        buffering = true
        observedPosition = null
        message = if (seeking) SEEKING else "Buffering…"
    }

    private fun hideLoading() {
        if (failed) return
        message = null
    }

    private fun fail(text: String) {
        if (destroyed || failed) return
        failed = true
        seeking = false
        buffering = false
        message = text
        runCatching { player.pause() }
    }

    /**
     * What to say when the very first open is what broke.
     *
     * A cloud file fails for a reason the viewer can act on — the phone asleep, or the one stream slot
     * already taken by the phone's own player — so it gets told that, in the web shell's own words.
     */
    private fun startFailure(error: PlaybackException): String =
        if (part.fromTelegram) {
            "Could not start Telegram stream: " + describe(error) +
                ". Keep your phone on the same Wi-Fi and stop other cloud playback."
        } else {
            "Could not start: " + describe(error)
        }

    /**
     * Where the phone's marks may be trusted against what is actually playing.
     *
     * A mark only means something when the length this panel measured agrees with the length the shelf
     * was told about; a file whose real runtime differs by more than five per cent is a different cut,
     * and skipping into its opening on the strength of another copy's numbers would lose a scene.
     */
    private fun trustedBounds(): Bounds? {
        val cached = positive(part.durationMs)
        val total = actualDuration
        if (cached == 0L || total == 0L || kotlin.math.abs(total - cached) > maxOf(2_000.0, cached * 0.05)) return null
        var intro = positive(part.introEndMs ?: 0L)
        var outro = positive(part.outroStartMs ?: 0L)
        val end = part.outroEndMs?.let { positive(it) } ?: total
        if (intro <= 1_500 || intro >= total / 2) intro = 0
        if (outro < total / 2 || outro <= intro || outro >= end || end > total) outro = 0
        introTarget = intro
        return Bounds(intro, outro, end)
    }

    private fun updateContext(pos: Long) {
        val bounds = trustedBounds()
        var action = ArcContext.None
        if (ready && hasPlayed && message == null && !failed && !sheetOpen && bounds != null) {
            if (bounds.intro > 0 && pos < bounds.intro - 1_500) {
                action = ArcContext.SkipIntro
            } else if (hasNext) {
                // Credits start if the phone knows it; the last twenty seconds of a film it has not marked.
                val window = if (bounds.outro > 0) bounds.outro else maxOf(0L, actualDuration - 20_000)
                if (pos >= window) action = ArcContext.NextEpisode
            }
        }
        contextKind = action
    }

    private fun report(force: Boolean) {
        if (!hasPlayed) return
        val pos = lastPlayedPosition
        if (pos < 1_000) return
        if (!force && lastReported >= 0 && kotlin.math.abs(pos - lastReported) < 5_000) return
        lastReported = pos
        // The phone applies its own resume rules to this, including the tail that clears a bookmark, so
        // a watched verdict is never sent from here and a requested seek never turns into a lie.
        scope.launch { phone.postProgress(part.id, pos, duration().takeIf { it > 0 } ?: positive(part.durationMs)) }
    }

    private fun refreshTracks() {
        if (destroyed) return
        val audio = mutableListOf<ArcTrack>()
        val text = mutableListOf<ArcTrack>()
        for (group in player.currentTracks.groups) {
            if (!group.isSupported()) continue
            for (index in 0 until group.length) {
                val format = group.getTrackFormat(index)
                val track = ArcTrack(
                    label = trackLabel(format, if (group.type == C.TRACK_TYPE_AUDIO) audio.size else text.size),
                    meta = trackMeta(format),
                    current = group.isTrackSelected(index),
                    override = TrackSelectionOverride(group.mediaTrackGroup, index),
                )
                if (group.type == C.TRACK_TYPE_AUDIO) audio.add(track) else if (group.type == C.TRACK_TYPE_TEXT) text.add(track)
            }
        }
        audioTracks = audio
        textTracks = text
    }

    private class Bounds(val intro: Long, val outro: Long, val end: Long)

    private companion object {
        const val LOADING = "Loading…"
        const val SEEKING = "Seeking…"
        const val TELEGRAM_WAIT = "Fetching from Telegram through your phone…"

        val DISPLAY_LABELS = listOf("Fit to screen", "Stretch", "Crop to fit")

        fun positive(value: Long): Long = if (value > 0) value else 0L

        fun describe(error: PlaybackException): String =
            listOfNotNull(error.errorCodeName, error.message, error.cause?.message)
                .filter { it.isNotBlank() }
                .joinToString(": ")

        /**
         * The name the file carries, or the language it declares, or the number it is in the list.
         *
         * Uppercased because that is how a track sheet reads on a television: `ENG` is a flag, and
         * `English (eng)` is a database row.
         */
        fun trackLabel(format: androidx.media3.common.Format, position: Int): String {
            val named = format.label?.takeIf { it.isNotBlank() }
                ?: format.language?.takeIf { it.isNotBlank() }?.uppercase()
            return named ?: "Track ${position + 1}"
        }

        /**
         * The bytes behind the name, in the shorthand a viewer recognises.
         *
         * media3 1.5.1 gives a track no display name, so this maps the mime the demuxer reported. A mime it
         * does not know is left out rather than printed as `MP4A-LATM`, because a sheet full of container
         * jargon is worse than a sheet with one line instead of two.
         */
        fun trackMeta(format: androidx.media3.common.Format): String {
            val parts = mutableListOf<String>()
            format.sampleMimeType?.let { codecLabel(it)?.let { label -> parts.add(label) } }
            if (format.bitrate > 0) parts.add("${Math.round(format.bitrate / 1000.0)} kbps")
            if (format.channelCount > 0) parts.add("${format.channelCount} ch")
            return parts.joinToString(" · ")
        }

        fun codecLabel(mime: String): String? = when (mime) {
            MimeTypes.AUDIO_AAC -> "AAC"
            MimeTypes.AUDIO_MPEG, MimeTypes.AUDIO_MPEG_L2 -> "MP3"
            MimeTypes.AUDIO_MPEG_L1 -> "MP1"
            MimeTypes.AUDIO_FLAC -> "FLAC"
            MimeTypes.AUDIO_ALAC -> "ALAC"
            MimeTypes.AUDIO_VORBIS -> "VORBIS"
            MimeTypes.AUDIO_OPUS -> "OPUS"
            MimeTypes.AUDIO_AC3 -> "AC-3"
            MimeTypes.AUDIO_E_AC3 -> "E-AC-3"
            MimeTypes.AUDIO_E_AC3_JOC -> "E-AC-3 JOC"
            MimeTypes.AUDIO_AC4 -> "AC-4"
            MimeTypes.AUDIO_TRUEHD -> "TRUEHD"
            MimeTypes.AUDIO_DTS -> "DTS"
            MimeTypes.AUDIO_DTS_HD -> "DTS-HD"
            MimeTypes.AUDIO_DTS_X -> "DTS-X"
            MimeTypes.AUDIO_RAW -> "PCM"
            MimeTypes.VIDEO_H264 -> "AVC"
            MimeTypes.VIDEO_H265 -> "HEVC"
            MimeTypes.VIDEO_VP9 -> "VP9"
            MimeTypes.VIDEO_AV1 -> "AV1"
            MimeTypes.TEXT_VTT -> "VTT"
            MimeTypes.TEXT_SSA -> "SSA"
            MimeTypes.APPLICATION_SUBRIP -> "SRT"
            MimeTypes.APPLICATION_TTML -> "TTML"
            else -> null
        }
    }
}
