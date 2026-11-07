package com.aeswox.arcplayer.tv.arc

import org.json.JSONArray
import org.json.JSONObject

/**
 * The shelf, in the shape `/api/library` answers with.
 *
 * A [Work] is a film or a series and owns the pictures and the synopsis; a [Part] is one file and owns
 * everything that differs per file. That split is the phone's, not a choice made here: it is what let a
 * television stop showing nine identical posters for one upload of one film.
 *
 * Ids are `Long`, exactly as the phone mints them. It sends them as strings because JavaScript would
 * round anything past 2^53, and this app is not JavaScript — so the digits are read back into the type
 * they were before the wire touched them.
 */
data class FoundPhone(val host: String, val device: String, val protocol: Int)

data class Part(
    val id: Long,
    val fileName: String,
    val season: Int?,
    val episode: Int?,
    val sizeBytes: Long,
    val durationMs: Long,
    val introEndMs: Long?,
    val outroStartMs: Long?,
    val outroEndMs: Long?,
    val width: Int,
    val height: Int,
    val mimeType: String,
    val resumeMs: Long,
    val watchedAtMs: Long,
    val bitrateMbps: Double,
    val audioCodec: String?,
    val needsRemux: Boolean,
    val fromTelegram: Boolean,
) {
    companion object {
        fun parse(raw: JSONObject) = Part(
            id = raw.longId("id") ?: 0L,
            fileName = raw.optString("fileName"),
            season = raw.intOrNull("season"),
            episode = raw.intOrNull("episode"),
            sizeBytes = raw.optLong("sizeBytes"),
            durationMs = raw.optLong("durationMs"),
            introEndMs = raw.longOrNull("introEndMs"),
            outroStartMs = raw.longOrNull("outroStartMs"),
            outroEndMs = raw.longOrNull("outroEndMs"),
            width = raw.optInt("width"),
            height = raw.optInt("height"),
            mimeType = raw.optString("mimeType"),
            resumeMs = raw.optLong("resumeMs"),
            watchedAtMs = raw.optLong("watchedAtMs"),
            bitrateMbps = raw.optDouble("bitrateMbps", 0.0),
            audioCodec = raw.stringOrNull("audioCodec"),
            needsRemux = raw.optBoolean("needsRemux"),
            fromTelegram = raw.optString("source") == "telegram",
        )
    }
}

data class Episode(
    val season: Int,
    val episode: Int,
    val playId: Long,
    val resumeMs: Long,
    val durationMs: Long,
    val watched: Boolean,
    val copyIds: List<Long>,
)

data class Work(
    val key: String,
    val isSeries: Boolean,
    val title: String,
    val year: Int?,
    val overview: String,
    val genres: List<String>,
    val posterPath: String?,
    val backdropPath: String?,
    val logoPath: String?,
    val episodes: List<Episode>,
    val partCount: Int,
    val seasonCount: Int,
    val watchedAtMs: Long,
    val playId: Long?,
    val playResumeMs: Long,
    val resumeId: Long?,
    val resumeMs: Long,
    val resumeLengthMs: Long,
    val parts: List<Part>,
) {
    /**
     * The copy this work's Play button opens.
     *
     * The phone has already answered which of several files a button should open — the same verdict the
     * app's own Play makes, and it can be the downloaded copy rather than the streaming one. Picking the
     * first file here would be choosing a copy for the viewer instead of honouring the one they last sat
     * in, so the id is looked up rather than assumed. The fallback to the only copy that exists is for
     * the case the phone names an id this work no longer holds.
     */
    val playPart: Part?
        get() = parts.firstOrNull { it.id == playId } ?: parts.firstOrNull()

    /** Which part of a show a copy is, the way a viewer would say it. Null for a film. */
    fun partLabel(part: Part): String? = when {
        part.episode == null -> null
        part.season == 0 -> "Special · Episode ${part.episode}"
        part.season == null -> "Episode ${part.episode}"
        else -> "S${part.season} · Episode ${part.episode}"
    }

    fun episodeOf(part: Part): Episode? = episodes.firstOrNull { it.copyIds.contains(part.id) }

    companion object {
        fun parse(group: JSONObject): Work {
            val parts = mutableListOf<Part>()
            val partsArray = group.optJSONArray("items") ?: JSONArray()
            for (index in 0 until partsArray.length()) {
                parts.add(Part.parse(partsArray.getJSONObject(index)))
            }
            val episodes = mutableListOf<Episode>()
            val episodeArray = group.optJSONArray("episodes") ?: JSONArray()
            for (index in 0 until episodeArray.length()) {
                val raw = episodeArray.getJSONObject(index)
                val copyIds = mutableListOf<Long>()
                raw.optJSONArray("copyIds")?.let { ids ->
                    for (position in 0 until ids.length()) copyIds.add(ids.optString(position).toLongOrNull() ?: 0L)
                }
                episodes.add(
                    Episode(
                        season = raw.optInt("season"),
                        episode = raw.optInt("episode"),
                        playId = raw.longId("playId") ?: 0L,
                        resumeMs = raw.optLong("resumeMs"),
                        durationMs = raw.optLong("durationMs"),
                        watched = raw.optBoolean("watched"),
                        copyIds = copyIds,
                    )
                )
            }
            return Work(
                key = group.optString("key"),
                isSeries = group.optBoolean("isSeries"),
                title = group.optString("title"),
                year = group.intOrNull("year"),
                overview = group.optString("overview"),
                genres = group.stringList("genres"),
                posterPath = group.stringOrNull("posterUrl"),
                backdropPath = group.stringOrNull("backdropUrl"),
                logoPath = group.stringOrNull("logoUrl"),
                episodes = episodes,
                partCount = group.optInt("partCount"),
                seasonCount = group.optInt("seasonCount"),
                watchedAtMs = group.optLong("watchedAtMs"),
                playId = group.longId("playId"),
                playResumeMs = group.optLong("playResumeMs"),
                resumeId = group.longId("resumeId"),
                resumeMs = group.optLong("resumeMs"),
                resumeLengthMs = group.optLong("resumeLengthMs"),
                parts = parts,
            )
        }
    }
}

data class Library(val generatedAt: Long, val works: List<Work>) {
    companion object {
        fun parse(body: JSONObject): Library {
            val groups = body.optJSONArray("groups") ?: JSONArray()
            val works = ArrayList<Work>(groups.length())
            for (index in 0 until groups.length()) {
                runCatching { Work.parse(groups.getJSONObject(index)) }.getOrNull()?.let(works::add)
            }
            return Library(body.optLong("generatedAt"), works)
        }
    }
}

/**
 * An id, read as digits.
 *
 * The phone sends every 64-bit id as a string and a companion that reads it as a number is the bug that
 * makes two films share a bookmark, so the string form is the expected one. `toLongOrNull` rather than
 * `toLong` because a field that is not an id is a reason to skip a card, not to crash the shelf.
 */
private fun JSONObject.longId(name: String): Long? = opt(name)?.let { value ->
    (value as? String)?.toLongOrNull() ?: value as? Long
}

/** Present-and-null versus absent: `optLong` answers 0 for both, and a 0 is a real length. */
private fun JSONObject.longOrNull(name: String): Long? =
    if (isNull(name)) null else optLong(name).takeIf { opt(name) != null }

private fun JSONObject.intOrNull(name: String): Int? = if (isNull(name)) null else optInt(name)

private fun JSONObject.stringOrNull(name: String): String? = if (isNull(name)) null else optString(name).ifEmpty { null }

private fun JSONObject.stringList(name: String): List<String> {
    val array = optJSONArray(name) ?: return emptyList()
    return (0 until array.length()).mapNotNull { array.optString(it).ifEmpty { null } }
}
