package com.aeswox.arcplayer.tv.arc

import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** The phone said no, and the reason is that this television's key is not one it issued any more. */
class ArcUnauthorized : Exception("this phone no longer accepts this key")

/** Any other answer on the wire, kept as its number so a screen can say which one it was. */
class ArcHttpException(val status: Int) : Exception("http $status")

/** What the TV was told when it asked to be let in. */
data class PairRequest(val code: String, val expiresAt: Long)

/** Where the approval stands, one round trip later. */
sealed interface PairState {
    data class Pending(val tvName: String) : PairState
    data class Approved(val token: String, val device: String) : PairState
    data object Denied : PairState
    data object Expired : PairState
}

/**
 * One phone on the LAN, reached by address.
 *
 * Everything this class builds is a URL with the key already in it, which is what the protocol requires:
 * AVPlay on a Samsung could not send a header, so the key travels in the query and every client after it
 * does the same. That is also why the token is not a header here even though a native HTTP stack could
 * send one — one shape on the wire means one thing for the phone to get right, and a URL a viewer can
 * paste into a browser is a URL that explains itself.
 */
class ArcPhone(host: String, private val tokenProvider: () -> String?) {

    private val base = "http://$host:${ArcContract.PORT}"

    /** A path the phone handed out, made absolute. An already-absolute URL is left alone. */
    fun absolute(path: String?): String? = when {
        path.isNullOrBlank() -> null
        path.startsWith("http") -> path
        else -> base + path
    }

    fun streamUrl(id: Long): String = "$base/stream/$id?k=" + encode(key())

    fun subtitlesUrl(id: Long): String = "$base/api/subtitles/$id?k=" + encode(key())

    suspend fun library(): Library = jsonOf(get("/api/library", READ_TIMEOUT_MS)).let { Library.parse(it) }

    /** The whole shelf's places in one answer, for a television deciding what to put first. */
    suspend fun positions(): Map<Long, Long> {
        val raw = jsonOf(get("/api/progress", READ_TIMEOUT_MS)).optJSONObject("positions") ?: JSONObject()
        val out = LinkedHashMap<Long, Long>()
        raw.keys().forEach { key -> key.toLongOrNull()?.let { out[it] = raw.optLong(key) } }
        return out
    }

    /**
     * Ask to be let in.
     *
     * `tvModel` is what the phone puts on its approval prompt, and a real Android model name is one of
     * the things a native client buys: where the web app has to say "Smart TV", a viewer holding a Shield
     * or a Sony reads the set they are actually sitting in front of.
     */
    suspend fun requestPairing(tvName: String, tvModel: String): PairRequest {
        val body = jsonOf(
            post("/api/pair/request", JSONObject().apply {
                put("tvName", tvName)
                put("tvModel", tvModel)
            }.toString())
        )
        return PairRequest(body.optString("code"), body.optLong("expiresAt"))
    }

    suspend fun pairStatus(code: String): PairState {
        val body = jsonOf(get(pairPath(code), PAIR_TIMEOUT_MS))
        return when (body.optString("state")) {
            "pending" -> PairState.Pending(body.optString("tvName"))
            "approved" -> PairState.Approved(body.optString("token"), body.optString("device"))
            "denied" -> PairState.Denied
            else -> PairState.Expired
        }
    }

    /**
     * Where the sofa stopped.
     *
     * Best effort in both directions: a television that cannot report a place still plays the film, and a
     * phone that has gone to sleep does not owe anybody an error message. The length travels with the
     * position because the phone only trusts a place it can tell apart from an ending.
     */
    suspend fun postProgress(id: Long, positionMs: Long, durationMs: Long) {
        val body = JSONObject().apply {
            put("id", id.toString())
            put("positionMs", positionMs)
            if (durationMs > 0) put("durationMs", durationMs)
        }
        runCatching { post("/api/progress", body.toString(), WRITE_TIMEOUT_MS) }
    }

    private fun key(): String = tokenProvider().orEmpty()

    private fun pairPath(code: String): String = "/api/pair/status?c=" + encode(code)

    private suspend fun get(path: String, timeoutMs: Int = READ_TIMEOUT_MS): Pair<Int, String> =
        request("GET", base + withKey(path), timeoutMs, null)

    private suspend fun post(path: String, json: String, timeoutMs: Int = WRITE_TIMEOUT_MS): Pair<Int, String> =
        request("POST", base + withKey(path), timeoutMs, json)

    private fun withKey(path: String): String {
        val key = key().takeIf { it.isNotEmpty() } ?: return path
        val separator = if (path.contains('?')) '&' else '?'
        return "$path$separator" + "k=" + encode(key)
    }

    private suspend fun jsonOf(response: Pair<Int, String>): JSONObject = when (val status = response.first) {
        401 -> throw ArcUnauthorized()
        in 200..299 -> JSONObject(response.second)
        else -> throw ArcHttpException(status)
    }

    private companion object {
        const val READ_TIMEOUT_MS = 6_000
        const val WRITE_TIMEOUT_MS = 4_000

        /*
         * Shorter than a normal read, because pair status is asked again and again while the viewer reads
         * the phone. An answer slower than this is not worth waiting on — the next poll will get it.
         */
        const val PAIR_TIMEOUT_MS = 3_000
    }
}

private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

/**
 * One request, and the status number rather than an exception when the answer is not a good one.
 *
 * Shared with [PhoneFinder] because a ping needs the same socket and none of the error vocabulary: a
 * phone that is not at an address is not an exceptional situation, it is 253 out of 254 of them.
 */
private suspend fun request(
    method: String,
    url: String,
    timeoutMs: Int,
    body: String?,
): Pair<Int, String> = withContext(Dispatchers.IO) {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = timeoutMs
        readTimeout = timeoutMs
        useCaches = false
        if (body != null) {
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
    }
    return@withContext try {
        if (body != null) connection.outputStream.use { it.write(body.toByteArray()) }
        val status = connection.responseCode
        val stream: InputStream? = if (status in 200..299) connection.inputStream else connection.errorStream
        status to (stream?.readAllBytes()?.decodeToString() ?: "")
    } finally {
        connection.disconnect()
    }
}

/**
 * Finding the phone.
 *
 * A television has no mDNS and, on Android, no way to learn its own subnet without a location permission
 * a media app has no business asking for. So the search is the one the web app already does: ask the
 * addresses this TV was let into before, and only when none of them answers, walk the /24s a home router
 * actually hands out.
 */
object PhoneFinder {

    /**
     * Every phone that answers.
     *
     * Both halves matter. A returning viewer should not wait on a sweep for the one phone they already
     * own, and a household with two phones must be offered both — so a saved answer wins, and
     * `includeSaved = false` is how "find my other phone" still works.
     */
    suspend fun find(
        savedHosts: List<String>,
        includeSaved: Boolean = true,
        forcedHost: String? = null,
        forcedPrefix: String? = null,
    ): List<FoundPhone> = withContext(Dispatchers.IO) {
        forcedHost?.let { host ->
            return@withContext listOfNotNull(ping(host, 1_500))
        }

        if (includeSaved) {
            val known = savedHosts.distinct().mapNotNull { ping(it, ArcContract.SAVED_HOST_TIMEOUT_MS) }
            if (known.isNotEmpty()) return@withContext known.sortedByAddress()
        }

        for (prefix in forcedPrefix?.let(::listOf) ?: ArcContract.SUBNET_PREFIXES) {
            val found = sweep(prefix)
            if (found.isNotEmpty()) return@withContext found.sortedByAddress()
        }
        emptyList()
    }

    /**
     * One /24, with a bounded number of sockets open.
     *
     * 254 connections at once is not a scan, it is a denial-of-service attempt against the television's
     * own router. The cap is the number the web app uses and the one a real panel was verified against.
     */
    private suspend fun sweep(prefix: String): List<FoundPhone> = coroutineScope {
        val gate = Semaphore(ArcContract.SWEEP_CONCURRENCY)
        (1..ArcContract.SWEEP_HOSTS).map { last ->
            async { gate.withPermit { ping(prefix + last, ArcContract.SWEEP_TIMEOUT_MS) } }
        }.awaitAll().filterNotNull()
    }

    /** The one request the whole search rests on: unauthenticated, because the searcher has no key. */
    suspend fun ping(host: String, timeoutMs: Int): FoundPhone? {
        val (status, body) = runCatching {
            request("GET", "http://$host:${ArcContract.PORT}/api/ping", timeoutMs, null)
        }.getOrNull() ?: return null
        if (status !in 200..299) return null
        val info = runCatching { JSONObject(body) }.getOrNull() ?: return null
        if (info.optString("service") != ArcContract.SERVICE) return null
        return FoundPhone(host, info.optString("device").ifEmpty { host }, info.optInt("version"))
    }

    /** 192.168.0.9 before 192.168.0.10, which is the order a viewer reading a list expects. */
    private fun List<FoundPhone>.sortedByAddress() = sortedWith(
        compareBy({ it.host.substringBeforeLast('.').toLongOrNull() ?: 0L },
            { it.host.substringAfterLast('.').toIntOrNull() ?: 0 })
    )
}
