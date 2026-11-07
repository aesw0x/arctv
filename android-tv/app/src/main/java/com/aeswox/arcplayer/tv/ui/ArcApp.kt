package com.aeswox.arcplayer.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.aeswox.arcplayer.tv.arc.ArcPhone
import com.aeswox.arcplayer.tv.arc.ArcUnauthorized
import com.aeswox.arcplayer.tv.arc.DeviceStore
import com.aeswox.arcplayer.tv.arc.Work
import com.aeswox.arcplayer.tv.arc.adjacentEpisode
import com.aeswox.arcplayer.tv.arc.playPartOf
import com.aeswox.arcplayer.tv.arc.stampWatched
import com.aeswox.arcplayer.tv.ui.theme.ArcTheme
import kotlinx.coroutines.launch

/** Where the television is. Four places, in the order a viewer walks through them. */
sealed interface ArcScreen {
    /** `scanEverything` is the `Switch phone` entry: walk the whole subnet rather than trust the saved list. */
    data class Pairing(val scanEverything: Boolean) : ArcScreen

    data object Shelf : ArcScreen
    data class Work(val key: String) : ArcScreen
    data class Playing(val request: PlayRequest) : ArcScreen
}

/**
 * One part of one work, from one position.
 *
 * The part is named by id rather than carried as a value, because finishing an episode replaces it: the
 * player has to be rebuilt for the next file, and the shelf is the only thing that knows which file that is.
 */
data class PlayRequest(
    val workKey: String,
    val partId: Long,
    val startMs: Long,
    val returnTo: ArcScreen,
)

class ArcSession(val host: String, val deviceName: String, val phone: ArcPhone)

/** The shelf as the television currently knows it. */
sealed interface ShelfState {
    data object Loading : ShelfState

    /**
     * The works, already stamped by anything just watched.
     *
     * Held in memory rather than re-fetched after playback, because a viewer who backs out of a film and
     * sees the old rail for two seconds concludes the film did not register.
     */
    data class Ready(val works: List<Work>) : ShelfState

    data object Unreachable : ShelfState
}

@Composable
fun ArcApp(store: DeviceStore) {
    var session by remember { mutableStateOf<ArcSession?>(null) }
    var screen by remember { mutableStateOf<ArcScreen>(ArcScreen.Pairing(scanEverything = false)) }
    var shelf by remember { mutableStateOf<ShelfState>(ShelfState.Loading) }
    var lastWorkKey by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    /**
     * Loading the shelf, which is also the first thing that proves the key still works.
     *
     * A phone that answers 401 has forgotten this TV — it was unpaired, or its record was cleared — and the
     * only honest answer is to put the pairing screen back up rather than to show an empty shelf under a
     * phone's name.
     */
    fun load(active: ArcSession) {
        scope.launch {
            shelf = ShelfState.Loading
            shelf = try {
                ShelfState.Ready(active.phone.library().works)
            } catch (_: ArcUnauthorized) {
                screen = ArcScreen.Pairing(scanEverything = false)
                return@launch
            } catch (_: Exception) {
                ShelfState.Unreachable
            }
        }
    }

    fun pair(host: String, token: String, name: String) {
        store.rememberHost(host)
        val active = ArcSession(host, name, ArcPhone(host) { store.token(host) })
        session = active
        screen = ArcScreen.Shelf
        load(active)
    }

    fun play(work: Work, partId: Long, startMs: Long, from: ArcScreen) {
        if (partId == 0L) return
        lastWorkKey = work.key
        screen = ArcScreen.Playing(PlayRequest(work.key, partId, startMs, from))
    }

    /**
     * Leaving the player, in whichever direction.
     *
     * The position the phone is told about and the position the shelf then shows come from one stamp, so a
     * bookmark and a rail cannot disagree. `step` is 0 for a back press and ±1 for the episode buttons; the
     * player itself asks for 0 with `finished` when a part runs to its end, and the promotion to the next
     * episode is derived here rather than by the player.
     */
    fun leave(request: PlayRequest, positionMs: Long, durationMs: Long, finished: Boolean, step: Int) {
        val ready = shelf as? ShelfState.Ready
        if (ready == null) {
            screen = request.returnTo
            return
        }
        val now = System.currentTimeMillis()
        val stamped = ready.works.map {
            if (it.key == request.workKey) stampWatched(it, request.partId, positionMs, durationMs, finished, now) else it
        }
        shelf = ShelfState.Ready(stamped)

        val work = stamped.firstOrNull { it.key == request.workKey }
        val part = work?.let { playPartOf(it, request.partId) }
        val advance = if (step != 0) step else if (finished) 1 else 0
        val next = if (advance != 0 && work != null && part != null) adjacentEpisode(work, part, advance) else null
        val nextPart = if (work != null && next != null) playPartOf(work, next.playId) else null

        screen = if (nextPart != null) {
            ArcScreen.Playing(PlayRequest(work!!.key, nextPart.id, next!!.resumeMs, request.returnTo))
        } else {
            request.returnTo
        }
    }

    ArcTheme {
        val active = session
        if (active == null) {
            // Reachable only on a cold launch: pairing is where every visit starts, and no screen past it
            // exists until a phone has said yes.
            PairingScreen(
                store = store,
                scanEverything = (screen as? ArcScreen.Pairing)?.scanEverything ?: false,
                onPaired = ::pair,
            )
        } else {
            when (val current = screen) {
                is ArcScreen.Pairing -> {
                    BackHandler { screen = ArcScreen.Shelf }
                    PairingScreen(store = store, scanEverything = current.scanEverything, onPaired = ::pair)
                }

                ArcScreen.Shelf -> HomeScreen(
                    session = active,
                    state = shelf,
                    focusWorkKey = lastWorkKey,
                    onOpenWork = { work ->
                        lastWorkKey = work.key
                        screen = ArcScreen.Work(work.key)
                    },
                    onPlayWork = { work ->
                        work.playPart?.let { play(work, it.id, work.playResumeMs, ArcScreen.Shelf) }
                    },
                    onSwitchPhone = { screen = ArcScreen.Pairing(scanEverything = true) },
                    onForgetPhone = {
                        store.forget(active.host)
                        session = null
                        shelf = ShelfState.Loading
                        screen = ArcScreen.Pairing(scanEverything = true)
                    },
                    onRetry = { load(active) },
                    onChoosePhone = { screen = ArcScreen.Pairing(scanEverything = false) },
                )

                is ArcScreen.Work -> {
                    val work = (shelf as? ShelfState.Ready)?.works?.firstOrNull { it.key == current.key }
                    if (work == null) {
                        LaunchedEffect(current.key) { screen = ArcScreen.Shelf }
                    } else {
                        BackHandler { screen = ArcScreen.Shelf }
                        WorkScreen(
                            session = active,
                            work = work,
                            onPlayWork = { part -> play(work, part.id, work.playResumeMs, current) },
                            onPlayPart = { part, startMs -> play(work, part.id, startMs, current) },
                        )
                    }
                }

                is ArcScreen.Playing -> {
                    val request = current.request
                    val work = (shelf as? ShelfState.Ready)?.works?.firstOrNull { it.key == request.workKey }
                    val part = work?.let { playPartOf(it, request.partId) }
                    if (work == null || part == null) {
                        LaunchedEffect(request.partId) { screen = request.returnTo }
                    } else {
                        PlayerScreen(
                            session = active,
                            work = work,
                            part = part,
                            startMs = request.startMs,
                            onLeave = { positionMs, durationMs, finished, step ->
                                leave(request, positionMs, durationMs, finished, step)
                            },
                        )
                    }
                }
            }
        }
    }
}
