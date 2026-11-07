package com.aeswox.arcplayer.tv.arc

import android.content.Context
import org.json.JSONObject

/**
 * Which phones this television has been let into, and the key each one gave.
 *
 * Two names per record, because a television that has paired twice must be able to say which phone it is
 * about to ask, and an address a viewer cannot read is not a name.
 *
 * The tokens live in this app's private preferences. They are the keys to a whole library, so nothing
 * here is ever logged, and `allowBackup="false"` in the manifest keeps them out of an adb or a cloud
 * copy of the app's data.
 */
class DeviceStore(context: Context) {

    /** A phone this television has a key for, whether or not it answers today. */
    data class Known(val host: String, val name: String, val token: String)

    private val prefs = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    private fun devices(): Map<String, Pair<String, String>> {
        val raw = runCatching { JSONObject(prefs.getString(DEVICES_KEY, "{}")!!) }.getOrNull() ?: JSONObject()
        val map = LinkedHashMap<String, Pair<String, String>>()
        raw.keys().forEach { host ->
            val value = raw.optJSONObject(host) ?: return@forEach
            map[host] = value.optString("token") to value.optString("name").ifEmpty { host }
        }
        return map
    }

    private fun write(map: Map<String, Pair<String, String>>, forgetHost: String? = null) {
        val json = JSONObject()
        map.forEach { (host, value) ->
            json.put(host, JSONObject().put("token", value.first).put("name", value.second))
        }
        prefs.edit().apply {
            putString(DEVICES_KEY, json.toString())
            if (forgetHost != null && lastHost() == forgetHost) remove(LAST_HOST_KEY)
        }.apply()
    }

    fun known(): List<Known> = devices().map { (host, value) -> Known(host, value.second, value.first) }

    fun token(host: String): String? = devices()[host]?.first?.takeIf { it.isNotBlank() }

    fun name(host: String): String? = devices()[host]?.second

    fun save(host: String, token: String, name: String?) {
        val map = devices().toMutableMap()
        map[host] = token to (name?.takeIf { it.isNotBlank() } ?: map[host]?.second ?: host)
        write(map)
    }

    /**
     * Forget one phone.
     *
     * The last-used address goes with it: a forgotten phone left as the address this TV walks to first
     * would answer the next search from the saved list, and the device that was just forgotten is then
     * the only one a viewer is offered.
     */
    fun forget(host: String) {
        val map = devices().toMutableMap()
        map.remove(host)
        write(map, forgetHost = host)
    }

    fun lastHost(): String? = prefs.getString(LAST_HOST_KEY, null)

    fun rememberHost(host: String) {
        prefs.edit().putString(LAST_HOST_KEY, host).apply()
    }

    private companion object {
        const val NAME = "arctv"
        const val DEVICES_KEY = "devices"
        const val LAST_HOST_KEY = "lastHost"
    }
}
