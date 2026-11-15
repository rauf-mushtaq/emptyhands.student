package uk.co.emptyhands.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (installed ones are added by Capacitor).
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
