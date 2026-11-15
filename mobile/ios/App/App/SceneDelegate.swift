import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// The app's screen: Capacitor's web view, plus the app's own plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PrintPlugin())
    }
}

// Prints the app's page with the iOS print screen (which can also save or share it as a PDF).
// The page's print styles apply, so it prints exactly what Print does on the website.
@objc(PrintPlugin)
public class PrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrintPlugin"
    public let jsName = "Print"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPage", returnType: CAPPluginReturnPromise)
    ]

    @objc func printPage(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else { call.reject("No web view"); return }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = call.getString("name") ?? "EmptyHands"
            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            let done: UIPrintInteractionController.CompletionHandler = { _, _, _ in call.resolve() }
            if UIDevice.current.userInterfaceIdiom == .pad, let view = self.bridge?.viewController?.view {
                controller.present(from: CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1), in: view, animated: true, completionHandler: done)
            } else {
                controller.present(animated: true, completionHandler: done)
            }
        }
    }
}
