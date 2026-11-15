package uk.co.emptyhands.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Prints the app's page with Android's print screen, which can also save it as a PDF. The page's
// print styles apply, so it prints exactly what Print does on the website (e.g. the licence).
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {
    @PluginMethod
    public void printPage(PluginCall call) {
        String name = call.getString("name", "EmptyHands");
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                printManager.print(name, webView.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Couldn't open the print screen", e);
            }
        });
    }
}
