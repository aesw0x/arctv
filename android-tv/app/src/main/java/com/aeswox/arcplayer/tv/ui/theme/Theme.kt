package com.aeswox.arcplayer.tv.ui.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/*
 * The palette of tizen/css/app.css, verbatim. A viewer who owns both this and the web app should not
 * be able to tell which one answered by looking at the shelf, and the web sheet is the older of the
 * two — so the numbers travel from there to here rather than being picked again.
 *
 * There is no accent. The television states what is focused with size and a rim, never with colour,
 * because artwork is the only colour on screen and a coloured control competes with it.
 */
val ArcBlack = Color(0xFF08080A)
val Ink = Color(0xFFF7F7F9)
val Muted = Color(0xFF9A9AA6)
val Faint = Color(0xFF6B6B78)
val Hairline = Color(0xFF26262F)
val Surface = Color(0xFF17171D)
val SurfaceRisen = Color(0xFF23232C)
val Warning = Color(0xFFF0B429)
val WarningSunken = Color(0xFF241C08)

/*
 * The three greys a card and a hero are actually written in. They are not the four tokens above, which
 * are the chrome's: a poster caption on a shelf is a dimmer ink than a heading on a page, and setting it
 * to the chrome's muted would make the shelf read as one flat sheet of grey.
 */
val ShelfInk = Color(0xFFE2E2EA)
val ShelfFaint = Color(0xFF8C8C99)
val HeroKickerInk = Color(0xFFB9B9C6)
val HeroMetaInk = Color(0xFFD0D0DA)
val HeroOverviewInk = Color(0xFFC3C3CF)

/*
 * The film page, which is written in its own greys again. An episode row and a copies sheet are the two
 * largest surfaces the app draws and both are authored as flat fills rather than translucency over the
 * backdrop — so their numbers travel exactly, including the one accent this app allows itself.
 */
val DetailInk = Color(0xFFF4F4FA)
val DetailDim = Color(0xFFB6B6C3)
val DetailState = Color(0xFFD8D8E5)
val DetailResumeInk = Color(0xFFD6D6E0)
val DetailNumber = Color(0xFFBABACA)
val PosterInk = Color(0xFFC8C8D2)

/*
 * The slate-blue the web shell uses in two places only, and never to say what is focused: the rim of the
 * season that is showing and the part of an episode row already watched.
 */
val DetailAccent = Color(0xFFA5B2CC)
val TabSelected = Color(0xFF252D3E)
val RowBase = Color(0xFF14141B)
val RowLine = Color(0xFF272730)
val RowFocused = Color(0xFF30303D)
val CopyBase = Color(0xFF202029)
val CopyLine = Color(0xFF343440)
val Scrim = Color(0xCC000000)

/*
 * The player's own greys. They are not the shelf's, because the chrome is painted over a moving picture
 * rather than over artwork: every one of these is a translucent white or black that the web shell states
 * as an rgba, and the opacity is the part doing the work.
 */
val PlayerTopScrim = Color(0xD1000000)
val PlayerBottomScrim = Color(0xF0040509)
val PlayerBackFill = Color(0x80000000)
val PlayerLoadingDim = Color(0xAD000000)
val PlayerMessageInk = Color(0xFFDEDEE6)
val PlayerTimeInk = Color(0xFFD6D6E0)
val PlayerControlFill = Color(0xD10E111A)
val PlayerControlLine = Color(0x33FFFFFF)
val PlayerControlInk = Color(0xFFF7F8FC)
val PlayerControlFocusedInk = Color(0xFF07080D)
val PlayerContextFill = Color(0xFF1B1C23)
val PlayerContextLine = Color(0x66FFFFFF)
val PlayerBarBase = Color(0x38FFFFFF)
val PlayerSheetFill = Color(0xF2080A10)
val PlayerSheetLine = Color(0x24FFFFFF)
val PlayerSheetNoteInk = Color(0xFF9AA0B5)
val PlayerOptionFill = Color(0x0DFFFFFF)
val PlayerOptionLine = Color(0x14FFFFFF)
val PlayerOptionInk = Color(0xFFDFE2EC)
val PlayerOptionMetaFocused = Color(0xFF4C5164)

private val Colors = darkColorScheme(
    primary = Ink,
    onPrimary = ArcBlack,
    secondary = Muted,
    onSecondary = ArcBlack,
    background = ArcBlack,
    onBackground = Ink,
    surface = Surface,
    onSurface = Ink,
    surfaceVariant = SurfaceRisen,
    onSurfaceVariant = Muted,
    outline = Hairline,
    error = Warning,
    onError = ArcBlack,
)

@Composable
@OptIn(ExperimentalFoundationApi::class)
fun ArcTheme(content: @Composable () -> Unit) {
    val density = LocalDensity.current
    val reveal = remember(density) {
        ArcRevealSpec(with(density) { 66.dp.toPx() }, with(density) { 20.dp.toPx() })
    }
    CompositionLocalProvider(LocalBringIntoViewSpec provides reveal) {
        MaterialTheme(colorScheme = Colors, content = content)
    }
}

/**
 * The reveal of `focus.js:50-76`, ported.
 *
 * Android's own spec is a pivot: it slides whatever gains focus until that item's top sits at 30% of the
 * viewport, whether or not it was already on screen. The hero's Play button is a legitimate place to open
 * a shelf — the shell starts an unremembered visit right there — but it is also plainly visible, so the
 * pivot spent 174px of scroll moving a page nobody asked it to move. This one only scrolls when the item
 * is genuinely outside the band the shell keeps: 66dp clear of the top for the pinned bar, 20dp short of
 * the bottom so the next row still reads as a continuation. An item taller than the band goes to the top,
 * which is what the shell's if/else-if does.
 *
 * Instant, because the shell assigns `scrollTop` outright: no `scroll-behavior` appears anywhere in its
 * CSS, so a tween here would be something we made up.
 *
 * Only `verticalScroll` and `horizontalScroll` read this — a `LazyRow` installs its own responder — so the
 * rails keep their own minimal reveal, which is already what the shell does sideways.
 */
@OptIn(ExperimentalFoundationApi::class)
private class ArcRevealSpec(
    private val padStartPx: Float,
    private val padEndPx: Float,
) : BringIntoViewSpec {
    override val scrollAnimationSpec: AnimationSpec<Float> = snap()

    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        if (offset < padStartPx) return offset - padStartPx
        if (offset + size > containerSize - padEndPx) return offset + size - (containerSize - padEndPx)
        return 0f
    }
}
