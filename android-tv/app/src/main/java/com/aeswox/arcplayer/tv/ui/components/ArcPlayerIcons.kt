package com.aeswox.arcplayer.tv.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp

/*
 * The phone's own glyphs, path for path.
 *
 * These are the same HugeIcons outlines the web shell inlines as SVG, so a viewer who owns both apps sees
 * one product answer. A television has no cursor and no image assets here, so a control's meaning has to
 * be carried by the drawing itself — which is why the aspect-cycle button swaps its glyph rather than
 * adding a word next to it.
 */

@Immutable
data class ArcOutline(
    val pathData: String,
    val width: Float = 2f,
    val filled: Boolean = false,
    val cap: StrokeCap = StrokeCap.Butt,
    val join: StrokeJoin = StrokeJoin.Miter,
)

@Immutable
data class ArcGlyph(val outlines: List<ArcOutline>)

object ArcGlyphs {
    val Back = ArcGlyph(
        listOf(
            ArcOutline(
                "M14 5L7 12L14 19M7 12H21",
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    )

    val Previous = ArcGlyph(
        listOf(
            ArcOutline(
                "M8.06492 12.6258C8.31931 13.8374 9.67295 14.7077 12.3802 16.4481C15.3247 18.3411 " +
                    "16.797 19.2876 17.9895 18.9229C18.3934 18.7994 18.7654 18.5823 19.0777 18.2876C20 " +
                    "17.4178 20 15.6118 20 12C20 8.38816 20 6.58224 19.0777 5.71235C18.7654 5.41773 " +
                    "18.3934 5.20057 17.9895 5.07707C16.797 4.71243 15.3247 5.6589 12.3802 7.55186C9.67295 " +
                    "9.29233 8.31931 10.1626 8.06492 11.3742C7.97836 11.7865 7.97836 12.2135 8.06492 12.6258Z",
                filled = true,
                join = StrokeJoin.Round,
            ),
            ArcOutline("M4 4V20", cap = StrokeCap.Round),
        )
    )

    val Next = ArcGlyph(
        listOf(
            ArcOutline(
                "M15.9351 12.6258C15.6807 13.8374 14.327 14.7077 11.6198 16.4481C8.67528 18.3411 " +
                    "7.20303 19.2876 6.01052 18.9229C5.60662 18.7994 5.23463 18.5823 4.92227 18.2876C4 " +
                    "17.4178 4 15.6118 4 12C4 8.38816 4 6.58224 4.92227 5.71235C5.23463 5.41773 5.60662 " +
                    "5.20057 6.01052 5.07707C7.20304 4.71243 8.67528 5.6589 11.6198 7.55186C14.327 9.29233 " +
                    "15.6807 10.1626 15.9351 11.3742C16.0216 11.7865 16.0216 12.2135 15.9351 12.6258Z",
                filled = true,
                join = StrokeJoin.Round,
            ),
            ArcOutline("M20 5V19", cap = StrokeCap.Round),
        )
    )

    val Fit = ArcGlyph(
        listOf(
            ArcOutline(
                "M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 " +
                    "2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 " +
                    "18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 " +
                    "3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z",
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
            ArcOutline(
                "M12.9833 11.0167C12.4085 10.4419 12.5041 8 12.5041 8M12.9833 11.0167C13.5581 11.5915 16 " +
                    "11.4958 16 11.4958M12.9833 11.0167L17 7M11.0131 12.9868C10.4383 12.412 7.99641 " +
                    "12.5077 7.99641 12.5077M11.0131 12.9868C11.5879 13.5616 11.4922 16.0035 11.4922 " +
                    "16.0035M11.0131 12.9868L7 16.9999",
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    )

    val Stretch = ArcGlyph(
        listOf(
            ArcOutline(
                "M16.5148 16.5149C17.0896 15.9401 16.9941 13.4982 16.9941 13.4982M16.5148 16.5149C15.94 " +
                    "17.0897 13.4981 16.994 13.4981 16.994M16.5148 16.5149L13 13M7.48506 7.48512C8.05987 " +
                    "6.91031 10.5018 7.00596 10.5018 7.00596M7.48506 7.48512C6.91025 8.05993 7.00598 10.5018 " +
                    "7.00598 10.5018M7.48506 7.48512L11 11",
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
            ArcOutline(
                "M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 " +
                    "2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 " +
                    "18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 " +
                    "3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z",
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    )

    val Crop = ArcGlyph(
        listOf(
            ArcOutline(
                "M10.4922 3.00391C7.22965 3.02207 5.46278 3.16674 4.31021 4.31932C2.99219 5.63734 2.99219 " +
                    "7.75866 2.99219 12.0013C2.99219 16.2439 2.99219 18.3653 4.31021 19.6833C5.62823 21.0013 " +
                    "7.74955 21.0013 11.9922 21.0013C16.2348 21.0013 18.3561 21.0013 19.6742 19.6833C20.8267 " +
                    "18.5307 20.9714 16.7638 20.9896 13.5013",
                cap = StrokeCap.Round,
            ),
            ArcOutline(
                "M10.9922 13.0002L20.3421 3.64962M20.8861 9.00098L20.5795 3.41364L14.9922 3.10712",
                width = 1.5f,
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    )

    val Subtitles = ArcGlyph(
        listOf(
            ArcOutline(
                "M14.1706 20.8905C18.3536 20.6125 21.6856 17.2332 21.9598 12.9909C22.0134 12.1607 22.0134 " +
                    "11.3009 21.9598 10.4707C21.6856 6.22838 18.3536 2.84913 14.1706 2.57107C12.7435 2.47621 " +
                    "11.2536 2.47641 9.8294 2.57107C5.64639 2.84913 2.31441 6.22838 2.04024 10.4707C1.98659 " +
                    "11.3009 1.98659 12.1607 2.04024 12.9909C2.1401 14.536 2.82343 15.9666 3.62791 17.1746C4.09501 " +
                    "18.0203 3.78674 19.0758 3.30021 19.9978C2.94941 20.6626 2.77401 20.995 2.91484 21.2351C3.05568 " +
                    "21.4752 3.37026 21.4829 3.99943 21.4982C5.24367 21.5285 6.08268 21.1757 6.74868 20.6846C7.1264 " +
                    "20.4061 7.31527 20.2668 7.44544 20.2508C7.5756 20.2348 7.83177 20.3403 8.34401 20.5513C8.8044 " +
                    "20.7409 9.33896 20.8579 9.8294 20.8905",
                join = StrokeJoin.Round,
            ),
            ArcOutline("M15 16H17M7 16H12", cap = StrokeCap.Round),
            ArcOutline("M16 13H17M11 13H13M7 13H8", cap = StrokeCap.Round),
        )
    )

    val Audio = ArcGlyph(
        listOf(
            ArcOutline(
                "M20.5 13.5V10.5C20.5 6.74142 20.5 4.86213 19.4472 3.60746C19.2788 3.40678 19.0932 3.22119 " +
                    "18.8925 3.0528C17.6379 2 15.7586 2 12 2C8.24142 2 6.36213 2 5.10746 3.0528C4.90678 3.22119 " +
                    "4.72119 3.40678 4.5528 3.60746C3.5 4.86213 3.5 6.74142 3.5 10.5V13.5C3.5 17.2586 3.5 19.1379 " +
                    "4.5528 20.3925C4.72119 20.5932 4.90678 20.7788 5.10746 20.9472C6.36213 22 8.24142 22 12 " +
                    "22C15.7586 22 17.6379 22 18.8925 20.9472C19.0932 20.7788 19.2788 20.5932 19.4472 20.3925C20.5 " +
                    "19.1379 20.5 17.2586 20.5 13.5Z",
                cap = StrokeCap.Round,
            ),
            ArcOutline(
                "M15.5 15C15.5 16.933 13.933 18.5 12 18.5C10.067 18.5 8.5 16.933 8.5 15C8.5 13.067 10.067 11.5 " +
                    "12 11.5C13.933 11.5 15.5 13.067 15.5 15Z"
            ),
            ArcOutline("M13.5 7C13.5 7.82843 12.8284 8.5 12 8.5C11.1716 8.5 10.5 7.82843 10.5 7C10.5 6.17157 11.1716 5.5 12 5.5C12.8284 5.5 13.5 6.17157 13.5 7Z"),
        )
    )
}

/**
 * One glyph, drawn rather than decoded.
 *
 * The outlines are authored in a 24-unit box exactly as the SVG viewBox is, and the whole drawing is
 * scaled to the size asked for — which is what an `<svg>` does, stroke width included. Parsing happens
 * once per glyph, not per frame: a control row repaints whenever the chrome blinks, and re-tessellating
 * eight paths for a repaint on a television is work the picture needs more.
 */
@Composable
fun ArcIcon(glyph: ArcGlyph, size: Dp, modifier: Modifier = Modifier, tint: Color) {
    val outlines = remember(glyph) {
        glyph.outlines.map { outline ->
            val path = Path()
            PathParser().parsePathString(outline.pathData).toPath(path)
            Pair(path, outline)
        }
    }
    Canvas(modifier = modifier.size(size)) {
        val factor = this.size.width / 24f
        scale(scaleX = factor, scaleY = factor, pivot = Offset.Zero) {
            for ((path, outline) in outlines) {
                if (outline.filled) drawPath(path, tint)
                drawPath(
                    path = path,
                    color = tint,
                    style = Stroke(
                        width = outline.width,
                        cap = outline.cap,
                        join = outline.join,
                    ),
                )
            }
        }
    }
}
