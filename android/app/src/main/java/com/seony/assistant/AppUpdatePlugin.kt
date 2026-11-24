package com.seony.assistant

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

@CapacitorPlugin(name = "AppUpdate")
class AppUpdatePlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()

    /** 화면이 정상으로 열렸다고 알린다. 이 호출이 없으면 새 묶음은 되돌려진다. */
    @PluginMethod
    fun ready(call: PluginCall) {
        BundleStore.markReady(context)
        call.resolve(JSObject().put("version", BundleStore.running).put("nativeApi", NATIVE_API))
    }

    @PluginMethod
    fun check(call: PluginCall) {
        val server = call.getString("server").orEmpty()
        if (!server.startsWith("https://")) {
            call.reject("업데이트 서버 주소가 없습니다.")
            return
        }
        executor.execute {
            try {
                call.resolve(JSObject().put("status", download(server)))
            } catch (error: Exception) {
                call.reject(error.message ?: "업데이트를 확인하지 못했습니다.", error)
            }
        }
    }

    /** 내려받은 화면을 지금 적용한다. */
    @PluginMethod
    fun apply(call: PluginCall) {
        call.resolve()
        activity.runOnUiThread { activity.recreate() }
    }

    private fun download(server: String): String {
        val json = JSONObject(open("$server/app-update/manifest.json").use { it.reader().readText() })
        val manifest = BundleManifest(
            json.getLong("version"),
            json.getInt("requires"),
            json.getString("sha256"),
            json.getLong("size")
        )
        if (!WebBundles.isSigned(manifest, json.getString("signature"))) error("업데이트 서명이 맞지 않습니다.")
        if (BundleStore.state(context).pending == manifest.version) return "downloaded"
        if (!BundleStore.accepts(context, manifest.version)) return "latest"
        if (manifest.requires > NATIVE_API) return "installNeeded"

        val zip = File(context.cacheDir, "update.zip")
        val unpacked = File(context.cacheDir, "update")
        try {
            unpacked.deleteRecursively()
            open("$server/app-update/bundle-${manifest.version}.zip").use { WebBundles.save(it, manifest, zip) }
            WebBundles.unpack(zip, unpacked)
            BundleStore.install(context, manifest.version, unpacked)
        } finally {
            zip.delete()
            unpacked.deleteRecursively()
        }
        return "downloaded"
    }

    private fun open(address: String) = (URL(address).openConnection() as HttpURLConnection).run {
        connectTimeout = TIMEOUT
        readTimeout = TIMEOUT
        useCaches = false
        if (responseCode != HttpURLConnection.HTTP_OK) error("업데이트 서버 응답 $responseCode")
        inputStream
    }

    override fun handleOnDestroy() {
        executor.shutdown()
        super.handleOnDestroy()
    }

    companion object {
        /** 네이티브 기능이 늘어 새 화면이 옛 앱에서 돌 수 없게 될 때 올린다. scripts/release.mjs와 맞춘다. */
        const val NATIVE_API = 1
        private const val TIMEOUT = 20_000
    }
}

/** 내려받은 화면 묶음의 저장과 선택. */
object BundleStore {
    private const val PREFERENCES = "web_bundles"
    private const val BUILTIN_VERSION = "public/version.json"

    @Volatile
    var running = 0L
        private set

    /** 열 묶음의 폴더. 앱에 들어 있는 화면을 쓸 때는 null이다. */
    @Synchronized
    fun launch(context: Context): File? {
        val builtin = builtinVersion(context)
        val next = state(context).launch(builtin) { folder(context, it).resolve("index.html").isFile }
        write(context, next)
        running = next.active()
        val keep = setOf(next.good, next.pending).map { it.toString() }
        root(context).listFiles()?.filter { it.name !in keep }?.forEach { it.deleteRecursively() }
        return if (running == 0L) null else folder(context, running)
    }

    @Synchronized
    fun markReady(context: Context) = write(context, state(context).ready(running))

    @Synchronized
    fun accepts(context: Context, version: Long) = state(context).accepts(version, builtinVersion(context))

    @Synchronized
    fun install(context: Context, version: Long, unpacked: File) {
        val target = folder(context, version)
        target.deleteRecursively()
        target.parentFile?.mkdirs()
        if (!unpacked.renameTo(target)) error("업데이트를 저장하지 못했습니다.")
        write(context, state(context).downloaded(version))
    }

    fun state(context: Context) = with(preferences(context)) {
        BundleState(getLong("good", 0), getLong("pending", 0), getInt("attempts", 0), getLong("bad", 0))
    }

    private fun write(context: Context, state: BundleState) {
        // 곧바로 죽더라도 시도 횟수가 남아야 되돌릴 수 있다.
        preferences(context).edit()
            .putLong("good", state.good)
            .putLong("pending", state.pending)
            .putInt("attempts", state.attempts)
            .putLong("bad", state.bad)
            .commit()
    }

    private fun builtinVersion(context: Context) = try {
        JSONObject(context.assets.open(BUILTIN_VERSION).use { it.reader().readText() }).getLong("version")
    } catch (_: Exception) {
        0L
    }

    private fun preferences(context: Context) =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    private fun root(context: Context) = File(context.filesDir, "web")

    private fun folder(context: Context, version: Long) = File(root(context), version.toString())
}
