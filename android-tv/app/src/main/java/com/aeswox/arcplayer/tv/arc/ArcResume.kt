package com.aeswox.arcplayer.tv.arc

/**
 * What the shelf looks like the moment the viewer leaves the player.
 *
 * The phone is told where the sofa stopped, and it will answer that way on the next `/api/library` — but a
 * television that re-fetches to learn what it just watched shows a stale rail for a second, and the hero
 * falls back to whatever was last reached for rather than the film that was just reached for. So the same
 * verdict is applied here, in memory, the instant the player closes.
 *
 * The rules are the phone's, ported rather than re-derived, because two answers for one question is how a
 * film ends up half-watched in one rail and finished in the next:
 *
 *  - A part left within its last minutes is *finished*, not parked. The window is 8% of the runtime capped
 *    at 90 seconds, because a 90-second buffer at the end of a short film would hide an ending.
 *  - A part shorter than 30 seconds never gets a resume point at all: there is nothing to resume into.
 *  - Under 3 seconds in, the old position stands, so opening a film and backing out does not erase a place.
 *  - Every copy of the part is stamped together. Copies are the same episode, and a bookmark that belongs
 *    to one file rather than the other is the bug that makes a viewer re-watch a scene.
 *  - Finishing promotes the work's Play button onto the next episode, which is what makes a series binge.
 */
fun stampWatched(
    work: Work,
    partId: Long,
    finalMs: Long,
    totalMs: Long,
    finished: Boolean,
    nowMs: Long,
): Work {
    val played = work.parts.firstOrNull { it.id == partId } ?: return work
    if (finalMs <= 0) return work

    val length = if (totalMs > 0) totalMs else played.durationMs
    val nearEnd = length > 0 && finalMs >= length - minOf(length * 0.08, 90_000.0).toLong()
    val position = when {
        finished || nearEnd -> 0L
        length in 1..29_999 -> 0L
        finalMs >= 3_000 -> finalMs
        else -> played.resumeMs
    }

    val episode = work.episodeOf(played)
    val copyIds = episode?.copyIds ?: work.parts.map { it.id }.toSet()
    val next = if (finished) adjacentEpisode(work, played, 1) else null

    val parts = work.parts.map { part ->
        if (!copyIds.contains(part.id)) return@map part
        part.copy(
            resumeMs = position,
            durationMs = if (part.id == played.id) length else part.durationMs,
            watchedAtMs = if (part.id == played.id) nowMs else part.watchedAtMs,
        )
    }

    val episodes = work.episodes.map { entry ->
        if (episode == null || entry.season != episode.season || entry.episode != episode.episode) return@map entry
        entry.copy(
            playId = played.id,
            resumeMs = position,
            durationMs = length,
            watched = if (position > 0) false else (finished || entry.watched),
        )
    }

    val resuming = when {
        position > 0 -> WorkResume(played.id, position, length)
        work.resumeId?.let { copyIds.contains(it) } == true -> WorkResume(null, 0, 0)
        else -> WorkResume(work.resumeId, work.resumeMs, work.resumeLengthMs)
    }

    return work.copy(
        parts = parts,
        episodes = episodes,
        watchedAtMs = nowMs,
        playId = next?.playId ?: played.id,
        playResumeMs = if (next != null) next.resumeMs else position,
        resumeId = resuming.id,
        resumeMs = resuming.ms,
        resumeLengthMs = resuming.lengthMs,
    )
}

/** The episode before or after the one this file belongs to, in the phone's own ordering. */
fun adjacentEpisode(work: Work, part: Part, delta: Int): Episode? {
    val episode = work.episodeOf(part) ?: return null
    val index = work.episodes.indexOfFirst { it.season == episode.season && it.episode == episode.episode }
    if (index < 0) return null
    return work.episodes.getOrNull(index + delta)
}

fun playPartOf(work: Work, partId: Long?): Part? =
    work.parts.firstOrNull { it.id == partId } ?: work.parts.firstOrNull()

private data class WorkResume(val id: Long?, val ms: Long, val lengthMs: Long)
