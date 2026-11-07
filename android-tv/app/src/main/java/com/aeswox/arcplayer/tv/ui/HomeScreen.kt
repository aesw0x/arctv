package com.aeswox.arcplayer.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import coil.compose.AsyncImage
import com.aeswox.arcplayer.tv.arc.Part
import com.aeswox.arcplayer.tv.arc.Work
import com.aeswox.arcplayer.tv.ui.components.ArcArtwork
import com.aeswox.arcplayer.tv.ui.components.ArcBrand
import com.aeswox.arcplayer.tv.ui.components.ArcButton
import com.aeswox.arcplayer.tv.ui.components.ArcChip
import com.aeswox.arcplayer.tv.ui.components.ArcFacts
import com.aeswox.arcplayer.tv.ui.components.ArriveEase
import com.aeswox.arcplayer.tv.ui.components.arcArrive
import com.aeswox.arcplayer.tv.ui.components.arcFocusRing
import com.aeswox.arcplayer.tv.ui.components.arcRuntime
import com.aeswox.arcplayer.tv.ui.components.arcSelect
import com.aeswox.arcplayer.tv.ui.components.arcShimmer
import com.aeswox.arcplayer.tv.ui.components.arcSize
import com.aeswox.arcplayer.tv.ui.theme.ArcBlack
import com.aeswox.arcplayer.tv.ui.theme.ArcMotion
import com.aeswox.arcplayer.tv.ui.theme.ArcType
import com.aeswox.arcplayer.tv.ui.theme.Faint
import com.aeswox.arcplayer.tv.ui.theme.HeroKickerInk
import com.aeswox.arcplayer.tv.ui.theme.HeroMetaInk
import com.aeswox.arcplayer.tv.ui.theme.HeroOverviewInk
import com.aeswox.arcplayer.tv.ui.theme.Ink
import com.aeswox.arcplayer.tv.ui.theme.Muted
import com.aeswox.arcplayer.tv.ui.theme.ShelfFaint
import com.aeswox.arcplayer.tv.ui.theme.ShelfInk
import com.aeswox.arcplayer.tv.ui.theme.Warning

/** A row of half-watched films longer than this stops being a reminder and becomes a list. */
private const val CONTINUING_LIMIT = 12

/** How many grey posters make the shape of a rail while the shelf is still being read. */
private const val SKELETON_CARDS = 7

private data class Rail(val title: String, val count: String, val items: List<Work>)

private fun plural(count: Int, one: String, many: String) = "$count ${if (count == 1) one else many}"

/**
 * The shelf: a featured work and a row of cards for each kind of thing on it.
 *
 * The phone hands over works, not files, so a card is a film or a show and the nine copies of one episode
 * live underneath it. The hero is whichever work the household last reached for, and its Play button opens
 * the part the phone picked — not necessarily the part with the most bytes.
 *
 * Three rows of focus, as the web shell has them: the device pill, the hero's buttons, then one rail per
 * kind. Rails run sideways, the page runs up and down, and the bar stays where it is.
 */
@Composable
fun HomeScreen(
    session: ArcSession,
    state: ShelfState,
    focusWorkKey: String?,
    onOpenWork: (Work) -> Unit,
    onPlayWork: (Work) -> Unit,
    onSwitchPhone: () -> Unit,
    onForgetPhone: () -> Unit,
    onRetry: () -> Unit,
    onChoosePhone: () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(ArcBlack)) {
        when (val current = state) {
            ShelfState.Loading -> LoadingShelf()
            ShelfState.Unreachable -> ShelfError(onRetry, onChoosePhone)
            is ShelfState.Ready -> ShelfBody(
                works = current.works,
                session = session,
                focusWorkKey = focusWorkKey,
                onOpenWork = onOpenWork,
                onPlayWork = onPlayWork,
                onSwitchPhone = onSwitchPhone,
                onForgetPhone = onForgetPhone,
            )
        }
    }
}

@Composable
private fun ShelfBody(
    works: List<Work>,
    session: ArcSession,
    focusWorkKey: String?,
    onOpenWork: (Work) -> Unit,
    onPlayWork: (Work) -> Unit,
    onSwitchPhone: () -> Unit,
    onForgetPhone: () -> Unit,
) {
    var sheetOpen by remember { mutableStateOf(false) }
    val rows = railsOf(works)
    val pillFocus = remember { FocusRequester() }
    val heroPlay = remember(works) { FocusRequester() }

    /*
     * Coming back from a film page or the player should land on the work you were looking at, not back at
     * the top of the shelf. A half-watched work sits in two rails, so the first rail that holds it wins:
     * that is the row the viewer was reading when they left.
     */
    val remembered = focusWorkKey?.let { key -> works.any { it.key == key } }
    val restoreCard = if (remembered == true) remember(works) { FocusRequester() } else null

    /*
     * Where a visit begins. The web shell starts an unremembered one on the hero, so the rim is already on
     * the button the viewer is most likely to press, and a return lands on the card they left. One frame
     * first: the requesters are attached by this pass's composition, but the focus owner only knows them
     * after it has run.
     */
    LaunchedEffect(works) {
        withFrameNanos { }
        runCatching { (restoreCard ?: heroPlay).requestFocus() }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            if (works.isEmpty()) {
                Text(
                    text = "Arc Player has no films in this shelf yet.",
                    style = ArcType.screenSubtitle,
                    color = Muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 126.dp, bottom = 70.dp),
                )
            } else {
                ShelfHero(featuredOf(works), session, onPlayWork, onOpenWork, heroPlay)
                rows.forEach { rail ->
                    RailRow(
                        rail = rail,
                        session = session,
                        restoreFor = restoreCard,
                        focusWorkKey = focusWorkKey,
                        onOpen = onOpenWork,
                    )
                }
                Spacer(Modifier.height(32.dp))
            }
        }

        TopBar(session = session, pillFocus = pillFocus, onPill = { sheetOpen = true })

        if (sheetOpen) {
            DeviceSheet(
                modifier = Modifier.align(Alignment.TopEnd),
                session = session,
                onDismiss = {
                    sheetOpen = false
                    runCatching { pillFocus.requestFocus() }
                },
                onSwitchPhone = onSwitchPhone,
                onForgetPhone = onForgetPhone,
            )
        }
    }
}

/**
 * The shelf sorted into the three rows a viewer actually thinks in.
 *
 * A work can appear in two of them: "Continue watching" is a reminder, not a category, so a half-watched
 * film also sits in Movies. The phone already answered which part is unfinished by filling in `resumeId`,
 * so this only reads that stamp rather than re-deciding anything.
 */
private fun railsOf(works: List<Work>): List<Rail> {
    val rows = mutableListOf<Rail>()
    val continuing = works.filter { it.playResumeMs > 0 }
        .sortedByDescending { it.watchedAtMs }
        .take(CONTINUING_LIMIT)
    if (continuing.isNotEmpty()) {
        rows.add(Rail("Continue watching", plural(continuing.size, "film", "films"), continuing))
    }
    val movies = works.filterNot { it.isSeries }
    if (movies.isNotEmpty()) {
        rows.add(Rail("Movies", plural(movies.size, "film", "films"), movies))
    }
    val series = works.filter { it.isSeries }
    if (series.isNotEmpty()) {
        rows.add(Rail("Series", plural(series.size, "show", "shows"), series))
    }
    return rows
}

/**
 * The work this household last reached for, which is how the phone's own rail leads.
 *
 * Ranking by resume position instead picked whichever film was simply longest: a half-watched episode
 * nobody had opened in a week outranked the film watched last night.
 */
private fun featuredOf(works: List<Work>): Work = works.maxByOrNull { it.watchedAtMs } ?: works.first()

/** Facts about the thing that is about to play, which is a part, under a work's name. */
private fun heroFacts(year: Int?, part: Part?): List<String> = listOfNotNull(
    year?.toString(),
    part?.durationMs?.let(::arcRuntime)?.takeIf { it.isNotEmpty() },
    part?.height?.takeIf { it > 0 }?.let { "${it}p" },
    part?.sizeBytes?.let(::arcSize)?.takeIf { it.isNotEmpty() },
)

/**
 * The last chip is the one that matters: a track this panel cannot decode is worth saying out loud before
 * the viewer has pressed Play rather than after they have heard nothing.
 */
private fun heroChips(work: Work, part: Part?): List<Pair<String, Boolean>> =
    work.genres.take(3).map { it to false } + listOfNotNull(
        part?.audioCodec?.uppercase()?.let { it to false },
        if (part != null && part.needsRemux) "AUDIO UNSUPPORTED" to true else null,
    )

private fun cardFactsOf(work: Work): String = when {
    work.isSeries ->
        if (work.seasonCount > 1) plural(work.seasonCount, "season", "seasons")
        else plural(work.partCount, "episode", "episodes")
    // A film's parts are its copies, and `partCount` counts the work rather than the files: two uploads
    // of one film is still one part.
    work.parts.size > 1 -> plural(work.parts.size, "copy", "copies")
    else -> work.parts.firstOrNull()?.height?.takeIf { it > 0 }?.let { "${it}p" }.orEmpty()
}

/** The brand and the phone's name, pinned over the shelf rather than scrolled with it. */
@Composable
private fun TopBar(session: ArcSession, pillFocus: FocusRequester, onPill: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    /*
     * `.status-pill` says which half of the focus state may glide: the white arrives with the state,
     * because painting it re-rasters, while only the scale travels.
     */
    val raised by animateFloatAsState(
        targetValue = if (focused) 1f else 0f,
        animationSpec = tween(ArcMotion.fastMs, easing = ArriveEase),
        label = "status-pill",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, start = 42.dp, end = 42.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        ArcBrand()
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(if (focused) Color.White else Color(0x0DFFFFFF))
                .border(0.5.dp, if (focused) Color.White else Color(0x14FFFFFF), CircleShape)
                .scale(1f + 0.03f * raised)
                .focusRequester(pillFocus)
                .arcSelect(onPill, onFocused = { focused = it })
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(4.5.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF4ADE80)),
            )
            Text(
                text = session.deviceName.ifEmpty { session.host },
                style = ArcType.deviceAddress,
                color = if (focused) Color(0xFF07080D) else Muted,
                modifier = Modifier.padding(start = 6.dp),
            )
            Text(
                text = "⌄",
                style = ArcType.deviceAddress,
                color = if (focused) Color(0xFF4C5164) else Faint,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}

/**
 * The phone's name is the only way in and out of this pairing, so it is a control rather than a label.
 *
 * Both actions land on the device list; only "forget" also drops the token. The panel slides down out of
 * the pill it came from, which is what makes the two read as belonging to the phone rather than the shelf.
 */
@Composable
private fun DeviceSheet(
    modifier: Modifier = Modifier,
    session: ArcSession,
    onDismiss: () -> Unit,
    onSwitchPhone: () -> Unit,
    onForgetPhone: () -> Unit,
) {
    BackHandler(onBack = onDismiss)
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    val lift by animateFloatAsState(if (entered) 0f else -7f, tween(ArcMotion.stdMs))
    val fade by animateFloatAsState(if (entered) 1f else 0f, tween(ArcMotion.stdMs))

    Column(
        modifier = modifier
            .padding(top = 52.dp, end = 42.dp)
            .width(310.dp)
            .graphicsLayer { translationY = lift; alpha = fade }
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF0A0C12))
            .padding(horizontal = 14.dp, vertical = 13.dp),
    ) {
        Column(Modifier.arcArrive(0)) {
            Text(session.deviceName.ifEmpty { session.host }, style = ArcType.button, color = Color.White)
            Text(
                text = "Back closes",
                style = ArcType.deviceAddress,
                color = Muted,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
        Spacer(Modifier.height(9.dp))
        SheetOption("Switch phone", "Find another phone on this Wi-Fi", index = 1, onSelect = onSwitchPhone)
        SheetOption("Forget this phone", session.host, index = 2, onSelect = onForgetPhone)
    }
}

@Composable
private fun SheetOption(label: String, meta: String, index: Int, onSelect: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    // `.device-option.focused` slides the row 8 CSS pixels right rather than growing it: the sheet is
    // already 310dp wide, so a scale would push its own text off the edge it is hanging under.
    val raised by animateFloatAsState(
        targetValue = if (focused) 1f else 0f,
        animationSpec = tween(ArcMotion.fastMs, easing = ArriveEase),
        label = "device-option",
    )
    Row(
        modifier = Modifier
            .arcArrive(index)
            .fillMaxWidth()
            .height(34.dp)
            .padding(bottom = 5.dp)
            .graphicsLayer { translationX = raised * 4.dp.toPx() }
            .clip(RoundedCornerShape(8.dp))
            .background(if (focused) Color.White else Color(0x0DFFFFFF))
            .border(0.5.dp, if (focused) Color.White else Color(0x14FFFFFF), RoundedCornerShape(8.dp))
            .arcSelect(onSelect, onFocused = { focused = it })
            .padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = ArcType.deviceAddress, color = if (focused) Color(0xFF07080D) else Color(0xFFDFE2EC))
        Text(
            text = meta,
            style = ArcType.deviceAddress,
            color = if (focused) Color(0xFF4C5164) else Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

/** The field the hero's artwork sits on, which is also what a card shows before the phone has answered. */
private fun Modifier.arcHeroField(): Modifier = this.drawBehind {
    drawRect(
        brush = Brush.radialGradient(
            0f to Color(0xFF262631),
            0.52f to Color(0xFF111117),
            1f to ArcBlack,
            center = Offset(size.width * 0.78f, size.height * 0.24f),
            radius = size.width * 0.57f,
        ),
    )
}

@Composable
private fun ShelfHero(
    work: Work,
    session: ArcSession,
    onPlay: (Work) -> Unit,
    onMore: (Work) -> Unit,
    playFocus: FocusRequester,
) {
    val part = work.playPart
    val resumable = work.playResumeMs > 0
    val naming = part?.let(work::partLabel)
    val kicker = when {
        resumable -> "Continue watching"
        part != null && part.fromTelegram -> "Streams from Telegram"
        else -> "Downloaded on your phone"
    } + (naming?.let { " · $it" } ?: "")

    val backdrop = session.phone.absolute(work.backdropPath ?: work.posterPath)
    val portrait = work.backdropPath == null

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(360.dp)
            .arcHeroField(),
    ) {
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                // `.hero-bg` is `center 24%`, and `.hero-bg.portrait` is `center 20%`; a CSS position
                // percentage p is a Compose bias of 2p − 1.
                alignment = if (portrait) BiasAlignment(0f, -0.6f) else BiasAlignment(0f, -0.52f),
                // A show has no wide artwork, only its poster: the web shell pushes that to the right so the
                // words have a dark half of the screen to sit on rather than a face.
                modifier = if (portrait) {
                    Modifier
                        .align(Alignment.CenterEnd)
                        .fillMaxHeight()
                        .fillMaxWidth(0.58f)
                } else {
                    Modifier.fillMaxSize()
                },
            )
        }
        // `.hero-lift` — four percent of black over the whole screenful, which is the shell's way of
        // keeping a bright backdrop from shouting through the veil's lighter half.
        Box(Modifier.fillMaxSize().background(Color(0x0A000000)))
        // The veils the CSS stacks, in its order: the horizontal one is listed first, so it paints on top
        // and a poster never fights the title. The two vertical washes are merged into one ramp, with each
        // stop where the sum of the two puts it.
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color(0x9408080A),
                        0.24f to Color(0x0008080A),
                        0.42f to Color(0x0008080A),
                        0.58f to Color(0x4208080A),
                        0.76f to Color(0xB308080A),
                        0.9f to Color(0xF008080A),
                        1f to ArcBlack,
                    ),
                )
                .background(
                    Brush.horizontalGradient(
                        0f to Color(0xFA08080A),
                        0.28f to Color(0xE608080A),
                        0.6f to Color(0x6B08080A),
                        1f to Color(0x1408080A),
                    ),
                ),
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 42.dp, bottom = 67.dp)
                .width(500.dp),
        ) {
            Text(
                text = kicker.uppercase(),
                style = ArcType.heroKicker,
                color = HeroKickerInk,
                modifier = Modifier.arcArrive(0).padding(bottom = 9.dp),
            )
            Text(
                text = work.title,
                style = ArcType.heroTitle,
                color = Ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.arcArrive(1).padding(bottom = 10.dp),
            )
            ArcFacts(
                facts = heroFacts(work.year, part),
                color = HeroMetaInk,
                modifier = Modifier.arcArrive(2).padding(bottom = 11.dp),
            )
            if (work.overview.isNotBlank()) {
                Text(
                    text = work.overview,
                    style = ArcType.heroOverview,
                    color = HeroOverviewInk,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.arcArrive(3).width(410.dp).padding(bottom = 13.dp),
                )
            }
            val chips = heroChips(work, part)
            if (chips.isNotEmpty()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.arcArrive(4).padding(bottom = 15.dp),
                ) {
                    chips.forEach { (text, alert) -> ArcChip(text, alert = alert) }
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.arcArrive(5),
            ) {
                ArcButton(
                    text = if (resumable) "Resume" else "Play",
                    primary = true,
                    onSelect = { onPlay(work) },
                    focusRequester = playFocus,
                )
                ArcButton(text = "More info", onSelect = { onMore(work) })
            }
        }
    }
}

@Composable
private fun RailRow(
    rail: Rail,
    session: ArcSession,
    restoreFor: FocusRequester?,
    focusWorkKey: String?,
    onOpen: (Work) -> Unit,
) {
    Column(Modifier.padding(top = 6.dp)) {
        Row(
            modifier = Modifier.padding(start = 42.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Text(rail.title, style = ArcType.railTitle, color = Ink)
            Text(rail.count, style = ArcType.railCount, color = Faint)
        }
        LazyRow(
            // `.rails` puts its posters at 84 CSS pixels so a card's left edge lines up with the hero's
            // text, and the track's own negative margin is only there to stop the focus ring being cut at
            // the screen edge — in Compose the row clips at its own bounds, which start at zero. The far
            // end keeps `.card:last-child { margin-right: 84px }` plus the track's 26px, so the last
            // poster can be walked fully onto the screen without sitting flush against the panel's edge.
            contentPadding = PaddingValues(start = 42.dp, end = 55.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 11.dp),
        ) {
            itemsIndexed(rail.items, key = { _, work -> work.key }) { index, work ->
                ShelfCard(
                    work = work,
                    session = session,
                    index = index,
                    focusRequester = if (work.key == focusWorkKey) restoreFor else null,
                    onOpen = onOpen,
                )
            }
        }
    }
}

@Composable
private fun ShelfCard(
    work: Work,
    session: ArcSession,
    index: Int,
    focusRequester: FocusRequester?,
    onOpen: (Work) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    // `.card { transition: transform … }` — the lift glides, the ring that arrives with it does not.
    val raised by animateFloatAsState(
        targetValue = if (focused) 1f else 0f,
        animationSpec = tween(ArcMotion.fastMs, easing = ArriveEase),
        label = "card",
    )
    val part = work.playPart
    Column(
        modifier = Modifier
            .arcArrive(index)
            .width(92.dp)
            .padding(top = 8.dp, bottom = 8.dp)
            // `.card.focused { z-index: 3 }`: a grown poster is painted over its neighbours, or the card to
            // its right cuts the ring the viewer is being shown.
            .zIndex(if (focused) 1f else 0f)
            .scale(1f + 0.055f * raised)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .arcSelect({ onOpen(work) }, onFocused = { focused = it }),
    ) {
        Box(
            modifier = Modifier
                .size(width = 92.dp, height = 138.dp)
                .arcFocusRing(focused),
        ) {
            ArcArtwork(
                url = session.phone.absolute(work.posterPath),
                title = work.title,
                modifier = Modifier.fillMaxSize(),
            )
            // `.card-shade`: the bottom fifth of every poster is darkened, whatever is on it, so the
            // progress line and a caption's shadow always have something to sit on.
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(55.dp)
                    .background(
                        Brush.verticalGradient(0f to Color(0x00000000), 1f to Color(0x8C000000))
                    ),
            )
            // The warning is about the bytes Play opens, not about the best copy in the group.
            if (part != null && part.needsRemux) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .clip(CircleShape)
                        .background(Warning)
                        .padding(horizontal = 6.dp, vertical = 2.5.dp),
                ) {
                    Text(
                        text = (part.audioCodec ?: "DTS").uppercase(),
                        style = ArcType.pill,
                        color = Color(0xFF1A1300),
                    )
                }
            }
            if (work.resumeMs > 0 && work.resumeLengthMs > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(2.5.dp)
                        .background(Color(0x33FFFFFF)),
                ) {
                    Box(
                        Modifier
                            .fillMaxHeight()
                            .fillMaxWidth((work.resumeMs.toFloat() / work.resumeLengthMs.toFloat()).coerceIn(0f, 1f))
                            .background(Color.White),
                    )
                }
            }
        }
        // Both captions hold their own height: a lazy row is as tall as the tallest item it has composed,
        // so a two-line title arriving later would shift every rail under this one.
        Text(
            text = work.title,
            style = ArcType.cardTitle,
            color = if (focused) Color.White else ShelfInk,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp).height(30.dp),
        )
        Text(
            text = cardFactsOf(work),
            style = ArcType.cardMeta,
            color = ShelfFaint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 2.dp).height(16.dp),
        )
    }
}

/**
 * A hero and a rail of cards, greyed and shimmering.
 *
 * The wait has the shape of the shelf that is coming rather than being a line of text, because a viewer who
 * can see where the posters will land is a viewer who does not press OK again.
 */
@Composable
private fun LoadingShelf() {
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().height(360.dp).arcShimmer())
        Row(Modifier.padding(start = 42.dp, top = 17.dp)) {
            Box(Modifier.width(95.dp).height(10.dp).arcShimmer())
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(start = 42.dp, top = 11.dp),
        ) {
            repeat(SKELETON_CARDS) {
                Column {
                    Box(
                        Modifier
                            .size(width = 92.dp, height = 138.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .arcShimmer(),
                    )
                    Spacer(Modifier.height(12.dp))
                    Box(Modifier.width(64.dp).height(8.dp).arcShimmer())
                }
            }
        }
    }
}

/** A phone that is asleep, off the Wi-Fi, or simply gone. The shelf cannot tell which, so it says none. */
@Composable
private fun ShelfError(onRetry: () -> Unit, onChoosePhone: () -> Unit) {
    val retryFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        withFrameNanos { }
        runCatching { retryFocus.requestFocus() }
    }
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Cannot reach your phone",
            style = ArcType.screenTitle,
            color = Ink,
            textAlign = TextAlign.Center,
            modifier = Modifier.arcArrive(0),
        )
        Text(
            text = "Make sure Arc Player is open, on the same Wi-Fi.",
            style = ArcType.screenSubtitle,
            color = Muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.arcArrive(1).padding(top = 8.dp),
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(9.dp),
            modifier = Modifier.arcArrive(2).padding(top = 26.dp),
        ) {
            ArcButton("Try again", primary = true, onSelect = onRetry, focusRequester = retryFocus)
            ArcButton("Choose another phone", onSelect = onChoosePhone)
        }
    }
}
