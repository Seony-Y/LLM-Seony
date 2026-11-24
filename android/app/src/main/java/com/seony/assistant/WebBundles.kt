package com.seony.assistant

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import java.util.zip.ZipInputStream

/** 서버가 알려주는 화면 묶음. 서명은 아래 값 전체를 덮는다. */
data class BundleManifest(
    val version: Long,
    val requires: Int,
    val sha256: String,
    val size: Long
) {
    fun signedText() = "$version\n$requires\n$sha256\n$size"
}

object WebBundles {
    const val MAX_ZIP = 20L * 1024 * 1024
    private const val MAX_UNPACKED = 60L * 1024 * 1024

    /** 서명 키는 배포하는 PC에만 있다. */
    const val PUBLIC_KEY = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVCKHYWziY4gLH1qVEzMuXyTG4Liz/Zo6BXrijHCeqq6fqd+d9R0op8ADHhfDlrE/0JCZ7clzNN8X0DDQmCsopQ=="

    fun isSigned(manifest: BundleManifest, signature: String, publicKey: String = PUBLIC_KEY): Boolean = try {
        val key = KeyFactory.getInstance("EC")
            .generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(publicKey)))
        Signature.getInstance("SHA256withECDSA").run {
            initVerify(key)
            update(manifest.signedText().toByteArray())
            verify(Base64.getDecoder().decode(signature))
        }
    } catch (_: Exception) {
        false
    }

    /** 크기와 해시가 맞을 때만 파일을 남긴다. */
    fun save(input: InputStream, manifest: BundleManifest, target: File) {
        if (manifest.size !in 1..MAX_ZIP) throw IOException("묶음 크기가 잘못됐습니다.")
        val digest = MessageDigest.getInstance("SHA-256")
        var total = 0L
        target.outputStream().use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > manifest.size) throw IOException("묶음이 알려진 크기보다 큽니다.")
                digest.update(buffer, 0, read)
                output.write(buffer, 0, read)
            }
        }
        val hash = digest.digest().joinToString("") { "%02x".format(it) }
        if (total != manifest.size || hash != manifest.sha256) throw IOException("묶음이 손상됐습니다.")
    }

    fun unpack(zip: File, target: File) {
        val root = target.canonicalFile
        var total = 0L
        ZipInputStream(zip.inputStream().buffered()).use { input ->
            while (true) {
                val entry = input.nextEntry ?: break
                val file = File(root, entry.name).canonicalFile
                if (!file.toPath().startsWith(root.toPath())) throw IOException("묶음 경로가 잘못됐습니다.")
                if (entry.isDirectory) {
                    file.mkdirs()
                    continue
                }
                file.parentFile?.mkdirs()
                file.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > MAX_UNPACKED) throw IOException("묶음이 너무 큽니다.")
                        output.write(buffer, 0, read)
                    }
                }
            }
        }
        if (!File(root, "index.html").isFile) throw IOException("묶음에 화면이 없습니다.")
    }
}

/** 어느 묶음으로 열지 정하는 규칙. 0은 앱에 들어 있는 화면이다. */
data class BundleState(
    val good: Long = 0,
    val pending: Long = 0,
    val attempts: Int = 0,
    val bad: Long = 0
) {
    fun accepts(version: Long, builtin: Long) = version > maxOf(builtin, good, pending) && version != bad

    fun downloaded(version: Long) = copy(pending = version, attempts = 0)

    /** 새 묶음이 두 번 연속 준비되지 못하면 버리고 이전 화면으로 돌아간다. */
    fun launch(builtin: Long, exists: (Long) -> Boolean): BundleState {
        var next = this
        if (next.good <= builtin || !exists(next.good)) next = next.copy(good = 0)
        if (next.pending == 0L) return next
        if (next.pending <= builtin || !exists(next.pending)) return next.copy(pending = 0, attempts = 0)
        if (next.attempts >= MAX_ATTEMPTS) return next.copy(pending = 0, attempts = 0, bad = next.pending)
        return next.copy(attempts = next.attempts + 1)
    }

    fun active() = if (pending != 0L) pending else good

    fun ready(version: Long) =
        if (version != 0L && version == pending) copy(good = pending, pending = 0, attempts = 0) else this

    companion object {
        const val MAX_ATTEMPTS = 2
    }
}
