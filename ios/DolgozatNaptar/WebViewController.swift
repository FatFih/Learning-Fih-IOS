import UIKit
import WebKit

// Shows the app's pages (the web/ folder, bundled with the app) in a WKWebView.
// Same idea as MainActivity on Android: the pages are served from a fake origin
// (app://local/...) so localStorage and relative links work like on a real website.
final class WebViewController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView!
    private var bridge: NativeBridge!

    // The page's theme (dark / light), set through the bridge by theme.js
    var lightTheme = false {
        didSet {
            view.backgroundColor = lightTheme ? Self.lightBackground : Self.darkBackground
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    private static let darkBackground = UIColor(red: 5 / 255, green: 5 / 255, blue: 5 / 255, alpha: 1)
    private static let lightBackground = UIColor(red: 191 / 255, green: 227 / 255, blue: 250 / 255, alpha: 1)

    override var preferredStatusBarStyle: UIStatusBarStyle {
        lightTheme ? .darkContent : .lightContent
    }

    // The pages are written for portrait phones
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.darkBackground

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: AppSchemeHandler.scheme)

        // window.Android: the pages call the app through this object, exactly like on Android.
        // Every call becomes a message to NativeBridge; answers come back through
        // window.onNativeResult(callId, result), also like on Android.
        let shim = """
            window.Android = new Proxy({}, {
                get: (_, method) => (...args) =>
                    window.webkit.messageHandlers.native.postMessage({ method: String(method), args: args })
            });
            """
        configuration.userContentController.addUserScript(
            WKUserScript(source: shim, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Sideways swipes open / close the app's own menu, so no browser back swipe
        webView.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) {
            webView.isInspectable = true // Safari → Develop menu, on a Mac
        }

        bridge = NativeBridge(controller: self, webView: webView)
        webView.configuration.userContentController.add(bridge, name: "native")

        // The pages stay inside the safe area (below the notch / Dynamic Island, above the home bar)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        webView.load(URLRequest(url: URL(string: "\(AppSchemeHandler.scheme)://local/login-page/login.html")!))
    }

    // Our pages stay in the app; any other link opens in Safari
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        if url.scheme == AppSchemeHandler.scheme || url.scheme == "about" {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }
}

// Serves the files of the bundled web/ folder for app://local/<path>
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"

    private let root = Bundle.main.resourceURL!.appendingPathComponent("web").standardizedFileURL

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        // "/login-page/login.html" -> web/login-page/login.html
        let relativePath = url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
        let file = root.appendingPathComponent(relativePath).standardizedFileURL

        // Only files inside web/
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": Self.contentType(file.pathExtension), "Content-Length": "\(data.count)"]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private static func contentType(_ fileExtension: String) -> String {
        switch fileExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
        }
    }
}
