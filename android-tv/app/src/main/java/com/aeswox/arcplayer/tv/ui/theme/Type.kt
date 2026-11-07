package com.aeswox.arcplayer.tv.ui.theme

import androidx.compose.runtime.Stable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/*
 * The type scale of tizen/css/app.css.
 *
 * A Tizen panel is laid out at 1920x1080 CSS pixels and the platform scales the whole surface, so the
 * web app's numbers are pixels on a full-HD screen. Android TV makes the same screen 960x540 dp, which
 * means every size here is the CSS figure halved — the same ink on the same glass, from the same sofa.
 *
 * Below 12sp the halving stops being honest and a floor takes over. A card's caption is 19 CSS pixels,
 * which is 9.5dp, and 9.5dp of type on a television is not text a viewer can read at ten feet. The web
 * app got away with it because the panel it runs on is usually closer than a TV. Nothing else is nudged.
 */
@Stable
object ArcType {
    val brand = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 13.sp, letterSpacing = 1.2.sp)
    val screenTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 31.sp)
    val screenSubtitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 13.sp)
    val pairCode = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 44.sp, letterSpacing = 8.sp)
    val chevron = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 20.sp, lineHeight = 20.sp)
    val button = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    val pill = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 0.5.sp)
    val deviceName = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    val deviceAddress = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)

    val heroKicker = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.8.sp)
    val heroTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 36.sp, letterSpacing = (-1).sp, lineHeight = 37.sp)
    val heroMeta = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val heroOverview = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 18.sp)

    val railTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
    val railCount = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val cardTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 15.sp)
    val cardMeta = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val cardFallback = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp)

    val detailTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 33.sp, letterSpacing = (-0.5).sp, lineHeight = 35.sp)
    val detailMeta = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val detailOverview = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 18.sp)
    val detailBody = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val detailWarn = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 17.sp)
    val backHint = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, letterSpacing = 0.25.sp)

    val sectionTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    val sheetTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 17.sp)
    val episodeNumber = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 15.sp)
    val episodeTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
    val episodeMeta = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val episodeState = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 19.sp)
    val copyName = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 17.sp)
    val posterFallback = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)

    val playerWorkTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 27.sp, lineHeight = 32.sp)
    val playerMessage = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 18.sp)
    val playerError = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val playerTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, letterSpacing = (-0.15).sp)
    val playerBack = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val playerContext = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)

    /*
     * Tabular figures are the one thing here that is not a size: the clock sits in a row with a hint beside
     * it, and proportional digits make the whole line shuffle every second over a playing frame.
     */
    val playerTime = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, fontFeatureSettings = "tnum")
    val playerHint = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp, letterSpacing = 0.25.sp)

    val playerSheetTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
    val playerSheetNote = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val playerOption = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
    val playerOptionSelected = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 12.sp)
    val playerOptionMeta = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp)
}

/**
 * The four motion rules of the web shell, kept because they are about a television rather than a browser.
 *
 * Only transform and opacity animate; an arrival carries at most eight elements and everything after them
 * simply appears, because a long episode list must not become a queue of fifteen half-frames; and an exit
 * is instant, because a key press must never wait on an animation to show the next screen.
 */
@Stable
object ArcMotion {
    const val stdMs = 240
    const val fastMs = 150
    const val slowMs = 330
    const val arriveCap = 8
    const val arriveEachMs = 45L
    const val arriveLiftPx = 16f
}
