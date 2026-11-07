import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/*
 * Release signing: a git-ignored signing.properties next to settings.gradle.kts for this desk, or the
 * same four names as environment variables for CI, which has no file to keep — only repo secrets. No
 * key anywhere means the release build stays unsigned rather than failing, exactly like the phone app.
 */
val signingProps = Properties().apply {
    val f = rootProject.file("signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun signingValue(name: String): String =
    signingProps.getProperty(name)?.takeIf { it.isNotBlank() }
        ?: providers.environmentVariable(name).orNull?.takeIf { it.isNotBlank() }
        ?: ""

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
        // Android 12 is API 31 — the same floor the phone already ships, so both halves of the pair
        // can share a helper class.
        minSdk = 31
        targetSdk = 35
        versionCode = versionComponent(0) * 10_000 + versionComponent(1) * 100 + versionComponent(2)
        versionName = widgetVersion
    }

    signingConfigs {
        val storePath = signingValue("RELEASE_STORE_FILE")
        val storeFile = if (storePath.isNotBlank()) rootProject.file(storePath) else null
        if (storeFile != null && storeFile.exists()) {
            create("release") {
                this.storeFile = storeFile
                storePassword = signingValue("RELEASE_STORE_PASSWORD")
                keyAlias = signingValue("RELEASE_KEY_ALIAS")
                keyPassword = signingValue("RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
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
