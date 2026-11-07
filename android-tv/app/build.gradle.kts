plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/*
 * The version comes from tizen/config.xml, the same file webos/package.cjs reads when it stamps an
 * `.ipk`. A viewer installs one of three packages and cannot tell them apart by name, so nothing may
 * claim a number the other two do not — and a bump that has to be made in three places eventually is
 * made in two.
 *
 * The widget tag specifically: the XML declaration above it carries a `version=` too, and reading that
 * one would ship every build as 1.0 forever, silently.
 */
val widgetVersion = Regex("<\\s*widget[^>]*\\sversion=\"([^\"]+)\"")
    .find(rootProject.file("../tizen/config.xml").readText())
    ?.groupValues?.get(1)
    ?: error("tizen/config.xml carries no version to build from.")
/*
 * Android needs an integer that only ever grows, and `0.3.0` is the only number this repository keeps.
 * Reading it as 300 rather than inventing a fourth place to bump: a viewer who installs 0.4.0 over
 * 0.3.0 gets an upgrade, and nobody has to remember to move two files at once.
 */
fun versionComponent(index: Int): Int = widgetVersion.split('.').getOrElse(index) { "0" }.toIntOrNull() ?: 0

android {
    namespace = "com.aeswox.arcplayer.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.aeswox.arcplayer.tv"
        // Android TV 12 is API 32 and a 2020-era Shield is on 30; 31 splits the difference at the
        // same floor the phone already ships, so both halves of the pair can share a helper class.
        minSdk = 31
        targetSdk = 35
        versionCode = versionComponent(0) * 10_000 + versionComponent(1) * 100 + versionComponent(2)
        versionName = widgetVersion
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")

    implementation("io.coil-kt:coil-compose:2.7.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
