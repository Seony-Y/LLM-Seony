package com.seony.assistant

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

class RoomWidget : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> refresh(context)
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        refresh(context)
    }

    override fun onDisabled(context: Context) {
        context.getSystemService(AlarmManager::class.java).cancel(refreshIntent(context))
    }

    companion object {
        const val ACTION_PROMPT = "com.seony.assistant.PROMPT"
        const val ACTION_VOICE = "com.seony.assistant.VOICE"
        private const val ACTION_REFRESH = "com.seony.assistant.REFRESH_WIDGET"
        private const val PREFERENCES = "room_widget"
        private const val KEY_TIMELINE = "timeline"
        private val SMALL = SizeF(110f, 100f)
        private val WIDE = SizeF(230f, 100f)

        fun save(context: Context, timeline: String) {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit().putString(KEY_TIMELINE, timeline).apply()
            refresh(context)
        }

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, RoomWidget::class.java))
            if (ids.isEmpty()) return

            val entries = load(context)
            val now = System.currentTimeMillis()
            val current = entries.lastOrNull { it.optLong("at") <= now } ?: entries.firstOrNull()
            val views = RemoteViews(
                mapOf(
                    SMALL to render(context, R.layout.room_widget_small, current),
                    WIDE to render(context, R.layout.room_widget_wide, current)
                )
            )
            manager.updateAppWidget(ids, views)

            // 화면을 켜지 않는 부정확한 알람이라 별도 권한이 필요 없다.
            val next = entries.firstOrNull { it.optLong("at") > now }?.optLong("at") ?: return
            context.getSystemService(AlarmManager::class.java)
                .set(AlarmManager.RTC, next + 1000, refreshIntent(context))
        }

        private fun load(context: Context): List<JSONObject> {
            val saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getString(KEY_TIMELINE, null) ?: return emptyList()
            return try {
                val entries = JSONArray(saved)
                List(entries.length()) { entries.getJSONObject(it) }
            } catch (_: JSONException) {
                emptyList()
            }
        }

        private fun render(context: Context, layout: Int, entry: JSONObject?): RemoteViews {
            val views = RemoteViews(context.packageName, layout)
            val scene = Scene.of(entry?.optString("scene"))
            val ink = context.getColor(scene.ink)
            val soft = context.getColor(scene.soft)
            views.setInt(R.id.widget_root, "setBackgroundResource", scene.background)
            views.setImageViewResource(R.id.widget_room, scene.image)
            views.setTextViewText(
                R.id.widget_title,
                entry?.optString("title") ?: context.getString(R.string.widget_empty)
            )
            views.setTextColor(R.id.widget_title, ink)
            views.setOnClickPendingIntent(R.id.widget_root, open(context, Intent.ACTION_MAIN))
            if (layout != R.layout.room_widget_wide) return views

            val events = entry?.optJSONArray("events") ?: JSONArray()
            val todos = entry?.optInt("todos") ?: 0
            // 일정이 있으면 말 대신 일정을 보여준다.
            val lines = if (events.length() > 0) {
                List(events.length()) { events.getString(it) }
            } else {
                listOf(entry?.optString("body") ?: context.getString(R.string.widget_empty_body))
            }
            for ((index, id) in listOf(R.id.widget_line1, R.id.widget_line2).withIndex()) {
                views.setTextViewText(id, lines.getOrNull(index).orEmpty())
                views.setTextColor(id, soft)
                views.setViewVisibility(id, if (index < lines.size) View.VISIBLE else View.GONE)
            }
            views.setInt(R.id.widget_line1, "setMaxLines", if (lines.size > 1) 1 else 2)
            views.setTextViewText(
                R.id.widget_todos,
                if (todos > 0) context.getString(R.string.widget_todos, todos) else ""
            )
            views.setTextColor(R.id.widget_todos, soft)
            views.setTextColor(R.id.widget_prompt, context.getColor(scene.onAction))
            views.setInt(R.id.widget_prompt, "setBackgroundResource", scene.action)
            views.setOnClickPendingIntent(R.id.widget_prompt, open(context, ACTION_PROMPT))
            views.setInt(R.id.widget_voice, "setBackgroundResource", scene.action)
            views.setInt(R.id.widget_voice, "setColorFilter", context.getColor(scene.onAction))
            views.setOnClickPendingIntent(R.id.widget_voice, open(context, ACTION_VOICE))
            return views
        }

        private fun open(context: Context, action: String): PendingIntent {
            val intent = Intent(context, MainActivity::class.java)
                .setAction(action)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return PendingIntent.getActivity(context, action.hashCode(), intent, PENDING_FLAGS)
        }

        private fun refreshIntent(context: Context) = PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, RoomWidget::class.java).setAction(ACTION_REFRESH),
            PENDING_FLAGS
        )

        private const val PENDING_FLAGS =
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    }

    private enum class Scene(
        val background: Int,
        val image: Int,
        val ink: Int,
        val soft: Int,
        val action: Int,
        val onAction: Int
    ) {
        MORNING(
            R.drawable.widget_background_morning, R.drawable.widget_room_morning,
            R.color.widget_ink_morning, R.color.widget_soft_morning,
            R.drawable.widget_action_morning, R.color.widget_on_action
        ),
        RAIN(
            R.drawable.widget_background_rain, R.drawable.widget_room_rain,
            R.color.widget_ink_rain, R.color.widget_soft_rain,
            R.drawable.widget_action_rain, R.color.widget_on_action
        ),
        BUSY(
            R.drawable.widget_background_busy, R.drawable.widget_room_busy,
            R.color.widget_ink_busy, R.color.widget_soft_busy,
            R.drawable.widget_action_busy, R.color.widget_on_action
        ),
        NIGHT(
            R.drawable.widget_background_night, R.drawable.widget_room_night,
            R.color.widget_ink_night, R.color.widget_soft_night,
            R.drawable.widget_action_night, R.color.widget_on_action_night
        );

        companion object {
            fun of(name: String?) = entries.firstOrNull { it.name.equals(name, ignoreCase = true) } ?: MORNING
        }
    }
}
