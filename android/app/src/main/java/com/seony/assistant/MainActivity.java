package com.seony.assistant;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;

import java.io.File;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(AppUpdatePlugin.class);
		registerPlugin(LocalLlmPlugin.class);
		registerPlugin(DeviceActionsPlugin.class);
		registerPlugin(RoomWidgetPlugin.class);
		registerPlugin(QuickRemindersPlugin.class);
		File bundle = BundleStore.INSTANCE.launch(this);
		if (bundle != null) {
			bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.BASE_PATH, bundle.getAbsolutePath()));
		}
		super.onCreate(savedInstanceState);
	}
}
