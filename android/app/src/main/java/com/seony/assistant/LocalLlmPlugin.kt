package com.seony.assistant

import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.withContext
import java.io.File

@CapacitorPlugin(name = "LocalLlm")
class LocalLlmPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var engine: InferenceEngine

    private val ready by lazy {
        scope.async {
            engine = AiChat.getInferenceEngine(context)
            when (val state = engine.state.first {
                it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error
            }) {
                is InferenceEngine.State.Error -> throw state.exception
                else -> Unit
            }

            val modelFile = ensureModelFile()
            engine.loadModel(modelFile.absolutePath)
            engine.setSystemPrompt("You are a concise personal assistant. Reply in the user's language.")
        }
    }

    @PluginMethod
    fun chat(call: PluginCall) {
        val prompt = call.getString("prompt")?.trim()
        if (prompt.isNullOrEmpty()) {
            call.reject("A prompt is required")
            return
        }

        scope.async {
            try {
                ready.await()
                val text = engine.sendUserPrompt(prompt, 512).toList().joinToString("").trim()
                if (text.isEmpty()) error("The local model returned no text")
                call.resolve(JSObject().put("text", text))
            } catch (error: Exception) {
                call.reject(error.message ?: "Local inference failed", error)
            }
        }
    }

    private suspend fun ensureModelFile() = withContext(Dispatchers.IO) {
        val modelsDir = File(context.filesDir, "models").apply { mkdirs() }
        val modelFile = File(modelsDir, MODEL_FILE)
        if (!modelFile.exists() || modelFile.length() == 0L) {
            val temporaryFile = File(modelsDir, "$MODEL_FILE.tmp")
            context.assets.open("models/$MODEL_FILE").use { input ->
                temporaryFile.outputStream().buffered(1024 * 1024).use(input::copyTo)
            }
            if (!temporaryFile.renameTo(modelFile)) error("Failed to prepare the local model")
        }
        modelFile
    }

    override fun handleOnDestroy() {
        if (::engine.isInitialized) engine.destroy()
        scope.cancel()
        super.handleOnDestroy()
    }

    companion object {
        private const val MODEL_FILE = "qwen3-1.7b-q4.gguf"
    }
}