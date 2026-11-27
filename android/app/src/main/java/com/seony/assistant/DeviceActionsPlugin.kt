package com.seony.assistant

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.MediaStore
import android.speech.RecognizerIntent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "DeviceActions",
    permissions = [Permission(
        strings = [Manifest.permission.READ_CONTACTS],
        alias = DeviceActionsPlugin.CONTACTS_PERMISSION
    )]
)
class DeviceActionsPlugin : Plugin() {
    override fun load() {
        deliverSharedText(activity.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        deliverSharedText(intent)
    }

    private fun deliverSharedText(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
        // 최근 앱 목록에서 다시 열 때 지난 공유를 또 받지 않는다.
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim()
        intent.removeExtra(Intent.EXTRA_TEXT)
        if (text.isNullOrEmpty()) return
        // 화면이 아직 준비되지 않았으면 준비될 때까지 보관한다.
        notifyListeners("sharedText", JSObject().put("text", text.take(MAX_SHARED_TEXT)), true)
    }

    @PluginMethod
    fun shareToKakao(call: PluginCall) {
        val message = call.getString("message")?.trim()
        if (message.isNullOrEmpty()) {
            call.reject("보낼 내용이 필요합니다.")
            return
        }
        val intent = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .setPackage(KAKAO_PACKAGE)
            .putExtra(Intent.EXTRA_TEXT, message)
        launch(intent, call, "카카오톡 앱을 찾지 못했습니다.")
    }

    /** 시스템 음성 입력 창을 띄운다. 마이크는 그 앱이 쓰므로 권한을 받지 않는다. */
    @PluginMethod
    fun listen(call: PluginCall) {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            .putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt"))
        try {
            startActivityForResult(call, intent, "listenResult")
        } catch (_: ActivityNotFoundException) {
            call.reject("음성 입력 앱을 찾지 못했습니다.")
        }
    }

    @ActivityCallback
    private fun listenResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        // 말없이 닫으면 빈 글을 돌려준다.
        val text = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim()
        call.resolve(JSObject().put("text", text.orEmpty()))
    }

    @PluginMethod
    fun openCamera(call: PluginCall) {
        launch(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA), call, "카메라 앱을 찾지 못했습니다.")
    }

    @PluginMethod
    fun composeMessage(call: PluginCall) {
        withRecipient(call) { phoneNumber ->
            val intent = Intent(Intent.ACTION_SENDTO, Uri.fromParts("smsto", phoneNumber, null))
            call.getString("message")?.takeIf { it.isNotBlank() }?.let {
                intent.putExtra("sms_body", it)
            }
            launch(intent, call, "메시지 앱을 찾지 못했습니다.")
        }
    }

    @PluginMethod
    fun dial(call: PluginCall) {
        withRecipient(call) { phoneNumber ->
            launch(
                Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", phoneNumber, null)),
                call,
                "전화 앱을 찾지 못했습니다."
            )
        }
    }

    private fun withRecipient(call: PluginCall, action: (String) -> Unit) {
        val recipient = call.getString("recipient")?.trim()
        if (recipient.isNullOrEmpty()) {
            call.reject("연락처 이름이나 전화번호가 필요합니다.")
            return
        }

        if (PHONE_NUMBER_PATTERN.matches(recipient)) {
            action(recipient)
            return
        }

        if (getPermissionState(CONTACTS_PERMISSION) != PermissionState.GRANTED) {
            requestPermissionForAlias(CONTACTS_PERMISSION, call, "contactsPermissionCallback")
            return
        }

        resolveContact(recipient, call)?.let(action)
    }

    @PermissionCallback
    private fun contactsPermissionCallback(call: PluginCall) {
        if (getPermissionState(CONTACTS_PERMISSION) != PermissionState.GRANTED) {
            call.reject("이름으로 찾으려면 연락처 권한이 필요합니다.")
            return
        }

        when (call.methodName) {
            "composeMessage" -> composeMessage(call)
            "dial" -> dial(call)
            else -> call.reject("지원하지 않는 연락처 작업입니다.")
        }
    }

    private fun resolveContact(name: String, call: PluginCall): String? {
        val phoneNumbers = linkedSetOf<String>()
        val projection = arrayOf(Phone.NUMBER)
        val selection = "${Phone.DISPLAY_NAME_PRIMARY} = ? COLLATE NOCASE"

        context.contentResolver.query(
            Phone.CONTENT_URI,
            projection,
            selection,
            arrayOf(name),
            null
        )?.use { cursor ->
            val numberIndex = cursor.getColumnIndexOrThrow(Phone.NUMBER)
            while (cursor.moveToNext()) {
                cursor.getString(numberIndex)?.takeIf { it.isNotBlank() }?.let(phoneNumbers::add)
            }
        }

        return when (phoneNumbers.size) {
            0 -> {
                call.reject("연락처에서 '$name'을(를) 찾지 못했습니다.")
                null
            }
            1 -> phoneNumbers.first()
            else -> {
                call.reject("'$name' 연락처에 번호가 여러 개 있습니다. 전화번호를 직접 입력해 주세요.")
                null
            }
        }
    }

    private fun launch(intent: Intent, call: PluginCall, unavailableMessage: String) {
        try {
            activity.startActivity(intent)
            call.resolve()
        } catch (_: ActivityNotFoundException) {
            call.reject(unavailableMessage)
        }
    }

    companion object {
        const val CONTACTS_PERMISSION = "contacts"
        private const val KAKAO_PACKAGE = "com.kakao.talk"
        private const val MAX_SHARED_TEXT = 2000
        private val PHONE_NUMBER_PATTERN = Regex("^[+0-9][0-9 ()-]{2,}$")
    }
}