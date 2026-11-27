package com.seony.assistant

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * 버튼이 달린 알림. 알림 플러그인의 버튼은 앱을 열어야 해서, 앱을 열지 않고 처리하도록 직접 띄운다.
 * 끝낸 할 일은 할 일 위젯처럼 모아 두었다가 앱이 열릴 때 넘긴다.
 */
@CapacitorPlugin(name = "QuickReminders")
class QuickRemindersPlugin : Plugin() {
    /** 예약을 통째로 바꾼다. [{id, at, title, body, action: "done" | "later", todoId?}] */
    @PluginMethod
    fun schedule(call: PluginCall) {
        val items = call.getArray("items") ?: JSArray()
        QuickReminders.schedule(context, items)
        call.resolve()
    }
}

class QuickReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> QuickReminders.restore(context)
            QuickReminders.ACTION_SHOW, QuickReminders.ACTION_SHOW_AGAIN ->
                QuickReminders.show(context, QuickReminders.itemOf(intent))
            QuickReminders.ACTION_DONE -> {
                val item = QuickReminders.itemOf(intent)
                NotificationManagerCompat.from(context).cancel(item.getInt("id"))
                item.optString("todoId").takeIf { it.isNotEmpty() }?.let { TodoWidget.markDone(context, it) }
            }
            QuickReminders.ACTION_LATER -> {
                val item = QuickReminders.itemOf(intent)
                NotificationManagerCompat.from(context).cancel(item.getInt("id"))
                val again = item.put("at", System.currentTimeMillis() + QuickReminders.SNOOZE)
                QuickReminders.alarm(context, again, QuickReminders.ACTION_SHOW_AGAIN)
            }
        }
    }
}

object QuickReminders {
    const val ACTION_SHOW = "com.seony.assistant.SHOW_REMINDER"
    /** 미룬 알림. 앱이 예약을 새로 하면서 지우지 않도록 원래 알림과 따로 건다. */
    const val ACTION_SHOW_AGAIN = "com.seony.assistant.SHOW_REMINDER_AGAIN"
    const val ACTION_DONE = "com.seony.assistant.REMINDER_DONE"
    const val ACTION_LATER = "com.seony.assistant.REMINDER_LATER"
    const val SNOOZE = 10 * 60_000L
    private const val EXTRA_ITEM = "item"
    private const val PREFERENCES = "quick_reminders"
    private const val KEY_ITEMS = "items"
    /** 알림 플러그인과 같은 채널을 써서 알림 설정이 한곳에 있게 한다. */
    private const val CHANNEL = "default"

    fun schedule(context: Context, items: JSONArray) {
        val saved = preferences(context)
        // 지난 예약을 지우고 새로 건다.
        for (old in list(saved.getString(KEY_ITEMS, null))) {
            alarmManager(context).cancel(pending(context, ACTION_SHOW, old))
        }
        saved.edit().putString(KEY_ITEMS, items.toString()).apply()
        restore(context)
    }

    /** 다시 켠 뒤에도 알림이 울리도록 남은 예약을 건다. */
    fun restore(context: Context) {
        val now = System.currentTimeMillis()
        for (item in list(preferences(context).getString(KEY_ITEMS, null))) {
            if (item.optLong("at") > now) alarm(context, item)
        }
    }

    fun alarm(context: Context, item: JSONObject, action: String = ACTION_SHOW) {
        val manager = alarmManager(context)
        val intent = pending(context, action, item)
        val at = item.optLong("at")
        if (manager.canScheduleExactAlarms()) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
        } else {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
        }
    }

    fun show(context: Context, item: JSONObject) {
        val notifications = NotificationManagerCompat.from(context)
        if (!notifications.areNotificationsEnabled()) return
        ensureChannel(context)
        val done = item.optString("action") == "done"
        val open = PendingIntent.getActivity(
            context,
            item.getInt("id"),
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(item.optString("title"))
            .setContentText(item.optString("body"))
            .setStyle(NotificationCompat.BigTextStyle().bigText(item.optString("body")))
            .setAutoCancel(true)
            .setContentIntent(open)
            .addAction(
                0,
                context.getString(if (done) R.string.reminder_done else R.string.reminder_later),
                pending(context, if (done) ACTION_DONE else ACTION_LATER, item)
            )
            .build()
        try {
            notifications.notify(item.getInt("id"), notification)
        } catch (_: SecurityException) {
            // 알림 권한을 거둔 사이라면 띄우지 않는다.
        }
    }

    fun itemOf(intent: Intent): JSONObject = try {
        JSONObject(intent.getStringExtra(EXTRA_ITEM) ?: "{}")
    } catch (_: JSONException) {
        JSONObject()
    }

    private fun pending(context: Context, action: String, item: JSONObject): PendingIntent {
        val intent = Intent(context, QuickReminderReceiver::class.java)
            .setAction(action)
            .putExtra(EXTRA_ITEM, item.toString())
        // 같은 알림이라도 띄우기와 버튼은 따로 둔다.
        val code = item.optInt("id") * 31 + action.hashCode()
        return PendingIntent.getBroadcast(
            context,
            code,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Default", NotificationManager.IMPORTANCE_DEFAULT)
        )
    }

    private fun list(saved: String?): List<JSONObject> = try {
        val items = JSONArray(saved ?: "[]")
        List(items.length()) { items.getJSONObject(it) }
    } catch (_: JSONException) {
        emptyList()
    }

    private fun alarmManager(context: Context) = context.getSystemService(AlarmManager::class.java)

    private fun preferences(context: Context) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
