package com.aeswox.arcplayer.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.aeswox.arcplayer.tv.arc.DeviceStore
import com.aeswox.arcplayer.tv.ui.ArcApp

/*
 * One activity, because a television has one sofa and the whole app is the screen in front of it.
 *
 * The system bars go away for good rather than only over a playing frame: the web shell runs on a panel
 * that has no bars at all, and a notification shelf sliding over the top of a rail would move the artwork
 * the viewer is trying to line up with the focus ring.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        setContent { ArcApp(DeviceStore(this)) }
    }
}
