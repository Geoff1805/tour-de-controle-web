import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val versionPropsFile = rootProject.file("version.properties")
val versionProps = Properties().apply {
    if (versionPropsFile.exists()) {
        load(versionPropsFile.inputStream())
    }
}

val appVersionCode: Int = project.findProperty("appVersionCode")?.toString()?.toIntOrNull()
    ?: versionProps.getProperty("versionCode", "1").toInt()

val appVersionName: String = project.findProperty("appVersionName")?.toString()
    ?: versionProps.getProperty("versionName", "1.0.0")

android {
    namespace = "fr.antigravity.controller"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.antigravity.controller"
        minSdk = 24
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            // Cl? de signature PARTAG?E (identique en local et en CI) :
            //  - CI    : env RELEASE_KEYSTORE_FILE / RELEASE_STORE_PASSWORD / RELEASE_KEY_ALIAS / RELEASE_KEY_PASSWORD (secrets GitHub)
            //  - Local : m?mes cl?s dans ~/.gradle/gradle.properties (hors d?p?t)
            fun cfg(name: String): String? = System.getenv(name) ?: (findProperty(name) as String?)
            val sharedStore = cfg("RELEASE_KEYSTORE_FILE")?.let { file(it) }
            if (sharedStore != null && sharedStore.exists()) {
                storeFile = sharedStore
                storePassword = cfg("RELEASE_STORE_PASSWORD")
                keyAlias = cfg("RELEASE_KEY_ALIAS")
                keyPassword = cfg("RELEASE_KEY_PASSWORD")
            } else {
                logger.warn("WARNING: cl? de release partag?e absente, signature avec la cl? debug (non interchangeable)")
            }
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName(if (signingConfigs.getByName("release").storeFile != null) "release" else "debug")
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// Tâche automatique de copie des assets Web dans l'APK avant la compilation
val copyWebAssets = tasks.register<Copy>("copyWebAssets") {
    val webDir = rootProject.file("..")
    val targetDir = layout.projectDirectory.dir("src/main/assets/www")

    from(webDir) {
        include("index.html")
        include("favicon.svg")
        include("favicon.ico")
        include("apple-touch-icon.png")
        include("manifest.json")
        include("sw.js")
        include("css/**")
        include("js/**")
        include("icons/**")
    }
    into(targetDir)
}

tasks.named("preBuild") {
    dependsOn(copyWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.12.1")

    testImplementation("junit:junit:4.13.2")
}
