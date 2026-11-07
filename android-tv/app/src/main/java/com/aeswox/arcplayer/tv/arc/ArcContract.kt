package com.aeswox.arcplayer.tv.arc

/**
 * The wire contract with Arc Player, as numbers and names.
 *
 * docs/PROTOCOL.md is the specification and this is the only place in the Android app that repeats it;
 * everything else asks these constants, so a version bump cannot leave one screen quoting an older
 * contract than the next.
 */
object ArcContract {
    const val PORT = 8080
    const val VERSION = 2
    const val SERVICE = "arcplayer"

    /**
     * The /24s home routers actually hand out, in the order a sweep tries them.
     *
     * A television cannot read its own address from Android without a network permission this app does
     * not need, so it walks the likely ones and stops at the first that answers — the phone is on the
     * same network as the TV, so only one of these can hold it.
     */
    val SUBNET_PREFIXES = listOf("192.168.1.", "192.168.0.", "192.168.100.", "10.0.0.")

    const val SWEEP_HOSTS = 254
    const val SWEEP_CONCURRENCY = 48
    const val SWEEP_TIMEOUT_MS = 350
    const val SAVED_HOST_TIMEOUT_MS = 1200
}
