package com.seony.assistant

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "RoomWidget")
class RoomWidgetPlugin : Plugin() {
    override fun load() {
        deliverPrompt(activity.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        deliverPrompt(intent)
    }

    @PluginMethod
    fun update(call: PluginCall) {
        val timeline = call.getString("timeline")
        if (timeline == null) {
            call.reject("위젯에 보여줄 내용이 필요합니다.")
            return
        }
        RoomWidget.save(context, timeline)
        call.resolve()
    }

    @PluginMethod
    fun requestPin(call: PluginCall) {
        val manager = AppWidgetManager.getInstance(context)
        val requested = manager.isRequestPinAppWidgetSupported &&
            manager.requestPinAppWidget(ComponentName(context, RoomWidget::class.java), null, null)
        if (requested) call.resolve() else call.reject("홈 화면을 길게 눌러 위젯에서 또리를 추가해 주세요.")
    }

    private fun deliverPrompt(intent: Intent?) {
        if (intent?.action != RoomWidget.ACTION_PROMPT) return
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return
        notifyListeners("prompt", JSObject(), true)
    }
}
