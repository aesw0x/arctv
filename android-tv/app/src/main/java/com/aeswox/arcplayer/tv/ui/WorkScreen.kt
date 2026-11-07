package com.aeswox.arcplayer.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.aeswox.arcplayer.tv.arc.Episode
import com.aeswox.arcplayer.tv.arc.Part
import com.aeswox.arcplayer.tv.arc.Work
import com.aeswox.arcplayer.tv.ui.components.ArcBrand
import com.aeswox.arcplayer.tv.ui.components.ArcButton
import com.aeswox.arcplayer.tv.ui.components.ArcChip
import com.aeswox.arcplayer.tv.ui.components.ArcFacts
import com.aeswox.arcplayer.tv.ui.components.ArcWarningBar
import com.aeswox.arcplayer.tv.ui.components.arcArrive
import com.aeswox.arcplayer.tv.ui.components.arcClock
import com.aeswox.arcplayer.tv.ui.components.arcFocusRing
import com.aeswox.arcplayer.tv.ui.components.arcSelect
import com.aeswox.arcplayer.tv.ui.components.arcSize
import com.aeswox.arcplayer.tv.ui.theme.ArcBlack
import com.aeswox.arcplayer.tv.ui.theme.ArcMotion
import com.aeswox.arcplayer.tv.ui.theme.ArcType
import com.aeswox.arcplayer.tv.ui.theme.CopyBase
import com.aeswox.arcplayer.tv.ui.theme.CopyLine
import com.aeswox.arcplayer.tv.ui.theme.DetailAccent
import com.aeswox.arcplayer.tv.ui.theme.DetailDim
import com.aeswox.arcplayer.tv.ui.theme.DetailInk
import com.aeswox.arcplayer.tv.ui.theme.DetailNumber
import com.aeswox.arcplayer.tv.ui.theme.DetailResumeInk
import com.aeswox.arcplayer.tv.ui.theme.DetailState
import com.aeswox.arcplayer.tv.ui.theme.Faint
import com.aeswox.arcplayer.tv.ui.theme.HeroOverviewInk
import com.aeswox.arcplayer.tv.ui.theme.Ink
import com.aeswox.arcplayer.tv.ui.theme.Muted
import com.aeswox.arcplayer.tv.ui.theme.PosterInk
import com.aeswox.arcplayer.tv.ui.theme.RowBase
import com.aeswox.arcplayer.tv.ui.theme.RowFocused
import com.aeswox.arcplayer.tv.ui.theme.RowLine
import com.aeswox.arcplayer.tv.ui.theme.Scrim
import com.aeswox.arcplayer.tv.ui.theme.SurfaceRisen
import com.aeswox.arcplayer.tv.ui.theme.TabSelected

/**
 * Only this many episode rows are ever mounted.
 *
 * A show can hold two hundred files and the phone will happily name all of them, so the page walks the
 * season twelve at a time rather than building a list the panel has to scroll through for a minute.
 */
private const val PAGE_SIZE = 12

/** The copies sheet: which files are on offer, the place to resume into, and where focus goes after. */
private data class Copies(val ids: List<Long>, val resumeMs: Long, val restore: FocusRequester)

/**
 * One film or one show, in full.
 *
 * A film is a screen: artwork behind, its own poster beside the words, and Play. A show is a page — the
 * same top block, shorter and pushed down, with the season's episodes underneath it and the whole thing
 * scrolling. Both are the web shell's detail page, and the two structures are deliberately not merged into
 * one, because a show's episode rows are the reason it scrolls at all.
 */
@Composable
fun WorkScreen(
    session: ArcSession,
    work: Work,
    onPlayWork: (Part) -> Unit,
    onPlayPart: (Part, Long) -> Unit,
) {
    val part = work.playPart
    val aimed = part?.let(work::episodeOf)
    val seasons = work.episodes.map { it.season }.distinct().sorted()

    var season by remember(work.key) { mutableStateOf(aimed?.season ?: seasons.firstOrNull() ?: 0) }
    var page by remember(work.key) {
        mutableStateOf(
            aimed?.let { target ->
                work.episodes.filter { it.season == target.season }
                    .indexOfFirst { it.episode == target.episode } / PAGE_SIZE
            }?.coerceAtLeast(0) ?: 0,
        )
    }
    var copies by remember(work.key) { mutableStateOf<Copies?>(null) }
    var restore by remember(work.key) { mutableStateOf<FocusRequester?>(null) }
    val playFocus = remember { FocusRequester() }

    val open = work.episodes.filter { it.season == season }
    val lastPage = ((open.size + PAGE_SIZE - 1) / PAGE_SIZE - 1).coerceAtLeast(0)
    val shownPage = page.coerceIn(0, lastPage)

    LaunchedEffect(work.key) {
        withFrameNanos { }
        runCatching { playFocus.requestFocus() }
    }

    // The sheet is gone by the time this runs, so the control that opened it is asked for a frame later
    // than the dismissal rather than in the same pass that removes the dialog.
    LaunchedEffect(restore) {
        val target = restore ?: return@LaunchedEffect
        withFrameNanos { }
        runCatching { target.requestFocus() }
        restore = null
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ArcBlack),
    ) {
        if (work.isSeries) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
            ) {
                Box(Modifier.fillMaxWidth()) {
                    Field(session, work, Modifier.fillMaxWidth().height(400.dp))
                    Info(session, work, part, series = true, playFocus, onPlayWork, onPlayPart) { ids, ms, requester ->
                        copies = Copies(ids, ms, requester)
                    }
                    TopHint(Modifier.align(Alignment.TopStart))
                }
                Episodes(
                    work = work,
                    seasons = seasons,
                    season = season,
                    page = shownPage,
                    open = open,
                    onSeason = { season = it },
                    onPage = { page = it },
                    onPlay = onPlayPart,
                    onCopies = { ids, ms, requester -> copies = Copies(ids, ms, requester) },
                )
            }
        } else {
            Field(session, work, Modifier.fillMaxSize())
            Info(session, work, part, series = false, playFocus, onPlayWork, onPlayPart) { ids, ms, requester ->
                copies = Copies(ids, ms, requester)
            }
            TopHint(Modifier.align(Alignment.TopStart))
        }

        copies?.let { current ->
            CopiesSheet(
                work = work,
                copies = current,
                onDismiss = {
                    copies = null
                    restore = current.restore
                },
                onPick = { file ->
                    copies = null
                    onPlayPart(file, current.resumeMs)
                },
            )
        }
    }
}

/**
 * The artwork, and the three washes the web shell stacks over it.
 *
 * The dim is folded into the veil rather than set on the picture: the panel used to re-raster the whole
 * resampled backdrop on every entry when the image itself carried the opacity, which cost a second and a
 * half of blocked main thread.
 */
@Composable
private fun Field(session: ArcSession, work: Work, modifier: Modifier) {
    val backdrop = session.phone.absolute(work.backdropPath ?: work.posterPath)
    Box(modifier) {
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                // CSS `center 34%` — the picture's own third is what sits behind the words.
                alignment = BiasAlignment(0f, -0.32f),
                modifier = Modifier.matchParentSize(),
            )
        }
        Box(Modifier.matchParentSize().background(Color(0x0FFFFFFF)))
        Box(
            Modifier
                .matchParentSize()
                .background(Color(0x6108080A))
                .background(
                    Brush.verticalGradient(
                        0f to Color(0x0008080A),
                        0.45f to Color(0x0008080A),
                        1f to Color(0xE608080A),
                    ),
                )
                .background(
                    Brush.horizontalGradient(
                        0f to Color(0xF708080A),
                        0.42f to Color(0xE008080A),
                        1f to Color(0xB808080A),
                    ),
                ),
        )
    }
}

/** The brand and the one sentence that says how to leave. */
@Composable
private fun TopHint(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        ArcBrand()
        Text("BACK returns to the library", style = ArcType.backHint, color = Faint)
    }
}

/**
 * Poster, words, buttons.
 *
 * The part Play is about to open has its facts stand in for the work's, because a show has no single
 * length, resolution or bitrate — the phone already chose which file answers, and the page quotes it.
 */
@Composable
private fun Info(
    session: ArcSession,
    work: Work,
    part: Part?,
    series: Boolean,
    playFocus: FocusRequester,
    onPlayWork: (Part) -> Unit,
    onPlayPart: (Part, Long) -> Unit,
    onCopies: (List<Long>, Long, FocusRequester) -> Unit,
) {
    val body = if (series) {
        Modifier
            .fillMaxWidth()
            .padding(start = 70.dp, end = 70.dp, top = 75.dp, bottom = 35.dp)
            .defaultMinSize(minHeight = 220.dp)
    } else {
        Modifier
            .fillMaxSize()
            .padding(horizontal = 70.dp)
    }
    Row(modifier = body, verticalAlignment = Alignment.CenterVertically) {
        Poster(session.phone.absolute(work.posterPath), work.title, series)
        Column(
            modifier = Modifier
                .weight(1f)
                .widthIn(max = 490.dp)
                .padding(start = 37.dp, top = 5.dp),
        ) {
            // The page arrives from the top down: poster first, then each line beside it in the order it
            // is read. A counter rather than fixed numbers, because a work with no synopsis has one fewer
            // line above its buttons and the queue has to shift with it.
            var line = 1
            Text(
                text = work.title,
                style = ArcType.detailTitle,
                color = Ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.arcArrive(line++).padding(bottom = 11.dp),
            )
            ArcFacts(
                facts = factsOf(work, part, part?.let(work::partLabel)),
                style = ArcType.detailMeta,
                color = Muted,
                modifier = Modifier.arcArrive(line++).padding(bottom = 11.dp),
            )
            val chips = detailChips(work, part)
            if (chips.isNotEmpty()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.arcArrive(line++).padding(bottom = 13.dp),
                ) {
                    chips.forEach { ArcChip(it) }
                }
            }
            if (work.overview.isNotBlank()) {
                Text(
                    text = work.overview,
                    style = ArcType.detailOverview,
                    color = HeroOverviewInk,
                    maxLines = 3,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.arcArrive(line++).widthIn(max = 450.dp).padding(bottom = 13.dp),
                )
            }
            val length = part?.durationMs ?: 0
            if (work.playResumeMs > 0 && length > 0) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.arcArrive(line++).padding(bottom = 15.dp),
                ) {
                    Box(
                        Modifier
                            .width(110.dp)
                            .height(2.5.dp)
                            .clip(RoundedCornerShape(1.5.dp))
                            .background(Color(0x2EFFFFFF)),
                    ) {
                        Box(
                            Modifier
                                .fillMaxHeight()
                                .fillMaxWidth((work.playResumeMs.toFloat() / length).coerceIn(0f, 1f))
                                .background(Color.White),
                        )
                    }
                    Text(
                        text = "Resume at ${arcClock(work.playResumeMs)}",
                        style = ArcType.detailBody,
                        color = DetailResumeInk,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            if (part != null && part.needsRemux) {
                ArcWarningBar(
                    text = "This film carries ${(part.audioCodec ?: "DTS").uppercase()} audio, which this " +
                        "TV cannot decode. The picture always plays, but you may hear nothing unless the " +
                        "file also holds an AC-3 or AAC track. Re-encode the audio to AAC on a computer to " +
                        "fix it.",
                    modifier = Modifier.arcArrive(line++).padding(bottom = 15.dp),
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(9.dp),
                modifier = Modifier.arcArrive(line),
            ) {
                if (part != null) {
                    ArcButton(
                        text = if (work.playResumeMs > 0) "Resume" else "Play",
                        primary = true,
                        onSelect = { onPlayWork(part) },
                        focusRequester = playFocus,
                    )
                    if (work.playResumeMs > 0) {
                        ArcButton("Start over", onSelect = { onPlayPart(part, 0) })
                    }
                    if (!work.isSeries && work.parts.size > 1) {
                        val requester = remember { FocusRequester() }
                        ArcButton(
                            text = "Copies",
                            onSelect = { onCopies(work.parts.map { it.id }, work.playResumeMs, requester) },
                            modifier = Modifier.focusRequester(requester),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Poster(url: String?, title: String, series: Boolean) {
    var failed by remember(url) { mutableStateOf(false) }
    val shape = RoundedCornerShape(7.dp)
    Box(
        modifier = Modifier
            .width(if (series) 130.dp else 170.dp)
            .height(if (series) 195.dp else 255.dp)
            .clip(shape)
            .background(Color(0xFF14141A))
            .border(0.5.dp, Color(0x12FFFFFF), shape),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null && !failed) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                onError = { failed = true },
                modifier = Modifier.matchParentSize(),
            )
        }
        if (url == null || failed) {
            Text(
                text = title,
                style = ArcType.posterFallback,
                color = PosterInk,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(15.dp),
            )
        }
    }
}

/**
 * The season's rows, one page of them.
 *
 * Every row is one focusable thing rather than a number, a title and a length you can each stop on: a
 * viewer walking a season with a remote wants to press OK on the episode, not on the minute it runs to.
 * The copies button is the row's only separate control, because choosing a file is a different decision
 * from choosing an hour.
 */
@Composable
private fun Episodes(
    work: Work,
    seasons: List<Int>,
    season: Int,
    page: Int,
    open: List<Episode>,
    onSeason: (Int) -> Unit,
    onPage: (Int) -> Unit,
    onPlay: (Part, Long) -> Unit,
    onCopies: (List<Long>, Long, FocusRequester) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 70.dp, end = 70.dp, bottom = 40.dp),
    ) {
        Text("Episodes", style = ArcType.sectionTitle, color = Ink, modifier = Modifier.padding(bottom = 12.dp))
        if (seasons.isNotEmpty()) {
            // The padding is the ring room the row's focus outline needs; the scroll container would
            // otherwise cut it off at the edge of the viewport.
            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                seasons.forEach { value ->
                    SeasonTab(
                        text = if (value == 0) "Specials" else "Season $value",
                        selected = value == season,
                        onSelect = { onSeason(value) },
                    )
                }
            }
        }
        val watched = open.count { it.watched }
        Text(
            text = "${open.size} episodes available · $watched watched",
            style = ArcType.detailBody,
            color = DetailDim,
            modifier = Modifier.padding(top = 14.dp, bottom = 10.dp),
        )
        if (open.isEmpty()) {
            Text(
                text = "No episodes available on this phone.",
                style = ArcType.detailBody,
                color = DetailDim,
                modifier = Modifier.padding(bottom = 10.dp),
            )
        }

        val from = page * PAGE_SIZE
        open.slice(from until minOf(from + PAGE_SIZE, open.size)).forEach { episode ->
            val file = work.parts.firstOrNull { it.id == episode.playId }
            if (file != null) EpisodeRow(work, episode, file, onPlay, onCopies)
        }

        if (open.size > PAGE_SIZE) {
            val pages = (open.size + PAGE_SIZE - 1) / PAGE_SIZE
            Row(
                modifier = Modifier.padding(top = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                if (page > 0) ArcButton("Previous page", onSelect = { onPage(page - 1) })
                Text("${page + 1} / $pages", style = ArcType.detailBody, color = DetailDim)
                if ((page + 1) * PAGE_SIZE < open.size) ArcButton("More episodes", onSelect = { onPage(page + 1) })
            }
        }
    }
}

@Composable
private fun EpisodeRow(
    work: Work,
    episode: Episode,
    file: Part,
    onPlay: (Part, Long) -> Unit,
    onCopies: (List<Long>, Long, FocusRequester) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(8.dp)
    val requester = remember { FocusRequester() }
    val resumable = episode.resumeMs > 0
    val status = (if (work.playId?.let { episode.copyIds.contains(it) } == true) "Up next · " else "") +
        when {
            resumable -> "Resume ${arcClock(episode.resumeMs)}"
            episode.watched -> "Watched"
            else -> "Play"
        }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(shape)
                .background(if (focused) RowFocused else RowBase, shape)
                .border(1.dp, if (focused) Color.White else RowLine, shape)
                // A row is most of the screen wide, so this state does not animate: scaling it blurs the
                // title into the panel's integer raster, and a background this size re-rasters on every
                // interpolated frame — which is a fill that arrives half a second after its outline.
                .arcFocusRing(focused, corner = 8.dp, rim = 0.dp, gap = 1.dp, halo = 1.dp, haloColor = Color.White)
                .arcSelect({ onPlay(file, episode.resumeMs) }, onFocused = { focused = it })
                .focusRequester(requester)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = episode.episode.toString(),
                style = ArcType.episodeNumber,
                color = DetailNumber,
                maxLines = 1,
                modifier = Modifier.width(36.dp),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 14.dp),
            ) {
                Text("Episode ${episode.episode}", style = ArcType.episodeTitle, color = DetailInk)
                Text(
                    text = copyFacts(file),
                    style = ArcType.episodeMeta,
                    color = DetailDim,
                    modifier = Modifier.padding(top = 4.dp),
                )
                if (resumable && episode.durationMs > 0) {
                    Box(
                        modifier = Modifier
                            .padding(top = 7.dp)
                            .width(120.dp)
                            .height(2.dp)
                            .background(Color(0xFF454553)),
                    ) {
                        Box(
                            Modifier
                                .fillMaxHeight()
                                .fillMaxWidth((episode.resumeMs.toFloat() / episode.durationMs).coerceIn(0f, 1f))
                                .background(DetailAccent),
                        )
                    }
                }
            }
            Column(
                modifier = Modifier.padding(start = 14.dp),
                horizontalAlignment = Alignment.End,
            ) {
                Text(status, style = ArcType.episodeState, color = DetailState, textAlign = TextAlign.End)
                if (episode.durationMs > 0) {
                    Text(
                        text = arcClock(episode.durationMs),
                        style = ArcType.episodeMeta,
                        color = DetailDim,
                        textAlign = TextAlign.End,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        if (episode.copyIds.size > 1) {
            ArcButton(
                text = "${episode.copyIds.size} copies",
                onSelect = { onCopies(episode.copyIds, episode.resumeMs, requester) },
                modifier = Modifier.padding(start = 9.dp),
            )
        }
    }
}

@Composable
private fun SeasonTab(text: String, selected: Boolean, onSelect: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier = Modifier
            .scale(if (focused) 1.04f else 1f)
            .then(if (focused) Modifier.border(2.dp, Color(0x4DFFFFFF), shape).padding(2.dp) else Modifier)
            .clip(shape)
            .background(
                when {
                    focused -> Color.White
                    selected -> TabSelected
                    else -> SurfaceRisen
                },
                shape,
            )
            .arcSelect(onSelect, onFocused = { focused = it }),
    ) {
        Text(
            text = text,
            style = ArcType.button,
            color = if (focused) ArcBlack else Ink,
            modifier = Modifier.padding(horizontal = 27.dp, vertical = 10.dp),
        )
    }
}

/**
 * Which file of this one title, and where it would resume.
 *
 * The web shell says what the sheet is for in its own subtitle: same title, different file. Nothing here
 * ranks them — the phone already picked one for Play, and this is the list for a viewer who wants the
 * other. Back closes it and hands focus to the button that opened it, so the page does not reset to the
 * top of the list.
 */
@Composable
private fun CopiesSheet(work: Work, copies: Copies, onDismiss: () -> Unit, onPick: (Part) -> Unit) {
    BackHandler(onBack = onDismiss)
    var shown by remember { mutableStateOf(false) }
    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        withFrameNanos { }
        shown = true
        runCatching { firstFocus.requestFocus() }
    }

    val lift = with(LocalDensity.current) { 5.dp.toPx() }
    val scrim by animateFloatAsState(if (shown) 1f else 0f, tween(ArcMotion.fastMs))
    val settle by animateFloatAsState(if (shown) 1f else 0f, tween(ArcMotion.stdMs))

    Box(Modifier.fillMaxSize()) {
        // A whole screen of one flat colour is the cheapest thing this panel can fade, which is why the
        // backdrop fades on its own while the sheet itself settles.
        Box(Modifier.matchParentSize().background(Scrim).alpha(scrim))
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .width(580.dp)
                .heightIn(max = 390.dp)
                .graphicsLayer {
                    alpha = settle
                    translationY = lift * (1f - settle)
                    scaleX = 0.98f + 0.02f * settle
                    scaleY = 0.98f + 0.02f * settle
                }
                .clip(RoundedCornerShape(12.dp))
                .background(RowBase)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
        ) {
            Text("Choose a copy", style = ArcType.sheetTitle, color = Ink, modifier = Modifier.padding(bottom = 6.dp))
            Text(
                text = "Same title, different file · Back closes",
                style = ArcType.detailBody,
                color = DetailDim,
                modifier = Modifier.padding(bottom = 13.dp),
            )
            copies.ids.forEachIndexed { index, id ->
                val file = work.parts.firstOrNull { it.id == id } ?: return@forEachIndexed
                CopyOption(
                    file = file,
                    focusRequester = if (index == 0) firstFocus else null,
                    onSelect = { onPick(file) },
                )
            }
        }
    }
}

@Composable
private fun CopyOption(file: Part, focusRequester: FocusRequester?, onSelect: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(7.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp)
            .clip(shape)
            .background(if (focused) RowFocused else CopyBase, shape)
            .border(1.dp, if (focused) Color.White else CopyLine, shape)
            .arcFocusRing(focused, corner = 7.dp, rim = 0.dp, gap = 1.dp, halo = 1.dp, haloColor = Color.White)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .arcSelect(onSelect, onFocused = { focused = it })
            .padding(12.dp),
    ) {
        Text(file.fileName, style = ArcType.copyName, color = DetailInk)
        Text(
            text = copyFacts(file),
            style = ArcType.episodeMeta,
            color = DetailDim,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

private fun factsOf(work: Work, part: Part?, label: String?): List<String> = listOfNotNull(
    label,
    work.year?.toString(),
    part?.durationMs?.takeIf { it > 0 }?.let(::arcClock),
    part?.height?.takeIf { it > 0 }?.let { "${it}p" },
    part?.bitrateMbps?.takeIf { it > 0 }?.let { String.format("%.1f Mbps", it) },
    arcSize(part?.sizeBytes ?: 0L).takeIf { it.isNotEmpty() },
)

private fun detailChips(work: Work, part: Part?): List<String> {
    val out = work.genres.take(3).toMutableList()
    if (work.isSeries) {
        // The phone counts the work, not its files, and a show's "parts" are its episodes.
        out.add(if (work.seasonCount > 1) "${work.seasonCount} seasons" else "${work.partCount} episodes")
    } else if (work.parts.size > 1) {
        out.add("${work.parts.size} copies")
    }
    part?.audioCodec?.let { out.add(it.uppercase()) }
    if (part != null && part.height >= 2160) out.add("4K")
    if (part != null && part.fromTelegram) out.add("TELEGRAM")
    return out
}

/**
 * What one file actually is, in one line.
 *
 * The last two entries are the ones a viewer acts on: where the bytes are coming from, and whether the
 * audio in it may be a track this panel cannot open.
 */
private fun copyFacts(part: Part): String = listOfNotNull(
    part.height.takeIf { it > 0 }?.let { "${it}p" },
    part.audioCodec?.uppercase(),
    arcSize(part.sizeBytes).takeIf { it.isNotEmpty() },
    if (part.fromTelegram) "Telegram" else "On phone",
    if (part.needsRemux) "Audio may not play" else null,
).joinToString(" · ")
