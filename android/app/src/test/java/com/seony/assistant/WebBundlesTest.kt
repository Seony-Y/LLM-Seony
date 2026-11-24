package com.seony.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.util.Base64
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class WebBundlesTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val keys = KeyPairGenerator.getInstance("EC").apply { initialize(256) }.generateKeyPair()
    private val publicKey = Base64.getEncoder().encodeToString(keys.public.encoded)

    private fun sign(manifest: BundleManifest) = Signature.getInstance("SHA256withECDSA").run {
        initSign(keys.private)
        update(manifest.signedText().toByteArray())
        Base64.getEncoder().encodeToString(sign())
    }

    private fun zip(vararg names: String): File = folder.newFile().apply {
        ZipOutputStream(outputStream()).use { output ->
            names.forEach {
                output.putNextEntry(ZipEntry(it))
                output.write("x".toByteArray())
                output.closeEntry()
            }
        }
    }

    private fun manifestOf(file: File) = BundleManifest(
        5,
        1,
        MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) },
        file.length()
    )

    @Test
    fun acceptsOnlyUntouchedSignedManifest() {
        val manifest = BundleManifest(5, 1, "abc", 10)
        val signature = sign(manifest)
        assertTrue(WebBundles.isSigned(manifest, signature, publicKey))
        assertFalse(WebBundles.isSigned(manifest.copy(sha256 = "abd"), signature, publicKey))
        assertFalse(WebBundles.isSigned(manifest.copy(version = 6), signature, publicKey))
        assertFalse(WebBundles.isSigned(manifest, signature))
        assertFalse(WebBundles.isSigned(manifest, "", publicKey))
    }

    @Test
    fun verifiesReleaseScriptOutput() {
        // scripts/release.mjs가 만든 실제 결과. 없으면 건너뛴다.
        val file = File("../../deploy/app-update/manifest.json")
        if (!file.isFile) return
        val text = file.readText()
        fun value(name: String) = Regex("\"$name\":\\s*\"?([^\",}]+)").find(text)!!.groupValues[1]
        val manifest =
            BundleManifest(value("version").toLong(), value("requires").toInt(), value("sha256"), value("size").toLong())
        assertTrue(WebBundles.isSigned(manifest, value("signature")))
        val bundle = File("../../deploy/app-update/bundle-${manifest.version}.zip")
        val saved = folder.newFile()
        bundle.inputStream().use { WebBundles.save(it, manifest, saved) }
        val target = folder.newFolder()
        WebBundles.unpack(saved, target)
        assertTrue(File(target, "version.json").readText().contains(manifest.version.toString()))
        assertTrue(manifest.requires <= AppUpdatePlugin.NATIVE_API)
    }

    @Test
    fun rejectsDamagedDownload() {
        val file = zip("index.html")
        val manifest = manifestOf(file)
        val target = folder.newFile()
        file.inputStream().use { WebBundles.save(it, manifest, target) }
        assertThrows(IOException::class.java) {
            file.inputStream().use { WebBundles.save(it, manifest.copy(sha256 = "0"), target) }
        }
        assertThrows(IOException::class.java) {
            file.inputStream().use { WebBundles.save(it, manifest.copy(size = manifest.size - 1), target) }
        }
    }

    @Test
    fun rejectsPathsOutsideTarget() {
        assertThrows(IOException::class.java) {
            WebBundles.unpack(zip("index.html", "../evil.txt"), folder.newFolder())
        }
        assertFalse(File(folder.root, "evil.txt").exists())
        assertThrows(IOException::class.java) { WebBundles.unpack(zip("other.txt"), folder.newFolder()) }
    }

    @Test
    fun keepsNewBundleOnlyAfterItReportsReady() {
        val first = BundleState().downloaded(5).launch(1) { true }
        assertEquals(5, first.active())
        val confirmed = first.ready(5)
        assertEquals(5, confirmed.good)
        assertEquals(5, confirmed.launch(1) { true }.active())
    }

    @Test
    fun rollsBackAfterTwoFailedLaunchesAndDoesNotRetry() {
        var state = BundleState(good = 4).downloaded(5)
        state = state.launch(1) { true }
        state = state.launch(1) { true }
        assertEquals(5, state.active())
        state = state.launch(1) { true }
        assertEquals(4, state.active())
        assertFalse(state.accepts(5, 1))
        assertTrue(state.accepts(6, 1))
    }

    @Test
    fun newerInstalledAppWinsOverOldBundle() {
        val state = BundleState(good = 5, pending = 6).launch(7) { true }
        assertEquals(0, state.active())
        assertFalse(state.accepts(7, 7))
    }

    @Test
    fun missingFilesFallBackToBuiltin() {
        assertEquals(0, BundleState(good = 5, pending = 6).launch(1) { false }.active())
    }
}
