package com.seony.assistant

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * 오늘 할 일을 체크하는 위젯. 기록은 앱 화면 안에 있어 여기서 바꾸지 못하므로,
 * 체크한 것은 바로 보여주고 모아 두었다가 앱이 열릴 때 넘긴다.
 */
class TodoWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        refresh(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != ACTION_CHECK) return
        val id = intent.getStringExtra(EXTRA_ID) ?: return
        check(context, id, intent.getBooleanExtra(RemoteViews.EXTRA_CHECKED, false))
    }

    companion object {
        private const val ACTION_CHECK = "com.seony.assistant.CHECK_TODO"
        private const val EXTRA_ID = "todoId"
        private const val PREFERENCES = "todo_widget"
        private const val KEY_TODOS = "todos"
        private const val KEY_CHANGES = "changes"

        /** 앱이 보낸 오늘 할 일. [{id, title, done}] */
        fun save(context: Context, todos: String) {
            preferences(context).edit().putString(KEY_TODOS, todos).apply()
            refresh(context)
        }

        /** 위젯에서 바꾼 것을 넘기고 비운다. {id: done} */
        fun takeChanges(context: Context): JSONObject {
            val saved = preferences(context)
            val changes = readObject(saved.getString(KEY_CHANGES, null))
            saved.edit().remove(KEY_CHANGES).apply()
            return changes
        }

        private fun check(context: Context, id: String, done: Boolean) {
            val saved = preferences(context)
            val todos = readArray(saved.getString(KEY_TODOS, null))
            for (index in 0 until todos.length()) {
                val todo = todos.getJSONObject(index)
                if (todo.optString("id") == id) todo.put("done", done)
            }
            val changes = readObject(saved.getString(KEY_CHANGES, null)).put(id, done)
            saved.edit()
                .putString(KEY_TODOS, todos.toString())
                .putString(KEY_CHANGES, changes.toString())
                .apply()
            refresh(context)
        }

        private fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, TodoWidget::class.java))
            if (ids.isEmpty()) return

            val todos = readArray(preferences(context).getString(KEY_TODOS, null))
            val ink = context.getColor(R.color.widget_ink_morning)
            val soft = context.getColor(R.color.widget_soft_morning)
            val items = RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1)
            var left = 0
            for (index in 0 until todos.length()) {
                val todo = todos.getJSONObject(index)
                val id = todo.optString("id")
                val done = todo.optBoolean("done")
                if (!done) left += 1
                val item = RemoteViews(context.packageName, R.layout.todo_widget_item)
                item.setTextViewText(R.id.todo_check, todo.optString("title"))
                item.setCompoundButtonChecked(R.id.todo_check, done)
                // 끝낸 일은 흐리게 둔다.
                item.setTextColor(R.id.todo_check, if (done) soft else ink)
                item.setOnCheckedChangeResponse(
                    R.id.todo_check,
                    RemoteViews.RemoteResponse.fromFillInIntent(Intent().putExtra(EXTRA_ID, id))
                )
                items.addItem(id.hashCode().toLong(), item)
            }

            val views = RemoteViews(context.packageName, R.layout.todo_widget)
            views.setTextViewText(
                R.id.todo_count,
                if (left > 0) context.getString(R.string.todo_widget_count, left) else ""
            )
            views.setRemoteAdapter(R.id.todo_list, items.build())
            views.setEmptyView(R.id.todo_list, R.id.todo_empty)
            // 체크박스의 바뀐 값을 받으려면 고칠 수 있는 PendingIntent여야 한다.
            views.setPendingIntentTemplate(
                R.id.todo_list,
                PendingIntent.getBroadcast(
                    context,
                    0,
                    Intent(context, TodoWidget::class.java).setAction(ACTION_CHECK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
            )
            views.setOnClickPendingIntent(
                R.id.todo_header,
                PendingIntent.getActivity(
                    context,
                    ACTION_CHECK.hashCode(),
                    Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            manager.updateAppWidget(ids, views)
        }

        private fun preferences(context: Context): SharedPreferences =
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

        private fun readArray(saved: String?) = try {
            JSONArray(saved ?: "[]")
        } catch (_: JSONException) {
            JSONArray()
        }

        private fun readObject(saved: String?) = try {
            JSONObject(saved ?: "{}")
        } catch (_: JSONException) {
            JSONObject()
        }
    }
}
