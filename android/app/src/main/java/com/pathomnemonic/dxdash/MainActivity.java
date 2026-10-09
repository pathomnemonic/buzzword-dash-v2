package com.pathomnemonic.dxdash;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A study session or a run should not be interrupted by the screen turning off
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Phones (under 600 dp wide) stay upright, which is what the layout is made for. Tablets, foldables when open and
        // Chromebooks turn freely: Google Play expects large screens not to be locked to one orientation.
        if (getResources().getConfiguration().smallestScreenWidthDp < 600) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
    }
}
