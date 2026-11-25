// Daily Companion — a single glass widget that lives on the Mac desktop.
// Hosts the HTML UI in app/web inside a borderless, blurred panel and stores
// everything locally in ~/Library/Application Support/DailyCompanion/data.json.
import AppKit
import WebKit
import ServiceManagement
@preconcurrency import UserNotifications

let widgetSize = NSSize(width: 400, height: 700)
let cornerRadius: CGFloat = 36
let moodIDs = ["happy", "calm", "focused", "grateful", "energised", "tired", "anxious", "sad", "hopeful"]

final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class WidgetWebView: WKWebView {
    var lastMouseDown: NSEvent?
    override func mouseDown(with event: NSEvent) {
        lastMouseDown = event
        super.mouseDown(with: event)
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, NSWindowDelegate, UNUserNotificationCenterDelegate {
    var window: WidgetPanel!
    var web: WidgetWebView!
    var pendingReflection: String?
    var loaded = false
    var keepOnTop = false
    var statusItem: NSStatusItem!
    var onTopMenuItem: NSMenuItem!
    var refreshTimer: Timer?

    let supportDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("DailyCompanion", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir.appendingPathComponent("Memoji", isDirectory: true),
                                                 withIntermediateDirectories: true)
        return dir
    }()
    var dataURL: URL { supportDir.appendingPathComponent("data.json") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        backupOncePerLaunch()

        window = WidgetPanel(contentRect: initialFrame(),
                             styleMask: [.borderless, .nonactivatingPanel],
                             backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovableByWindowBackground = false
        window.hidesOnDeactivate = false
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        window.delegate = self
        setOnTop(false)

        let effect = NSVisualEffectView(frame: NSRect(origin: .zero, size: widgetSize))
        effect.material = .hudWindow
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.appearance = NSAppearance(named: .vibrantDark)
        effect.maskImage = roundedMask(radius: cornerRadius)
        effect.autoresizingMask = [.width, .height]
        window.contentView = effect

        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(self, name: "dc")
        controller.addUserScript(WKUserScript(source: bootstrapScript(),
                                              injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = controller

        web = WidgetWebView(frame: effect.bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")
        web.underPageBackgroundColor = .clear
        effect.addSubview(web)

        guard let webDir = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true) else { return }
        web.loadFileURL(webDir.appendingPathComponent("index.html"), allowingReadAccessTo: webDir)

        setupStatusItem()
        showWidget()   // float above everything on launch so it's easy to find

        NotificationCenter.default.addObserver(forName: NSApplication.didResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.setOnTop(self?.keepOnTop ?? false) }  // settle back onto the desktop
        }

        UNUserNotificationCenter.current().delegate = self
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.web.evaluateJavaScript("window.DC && DC.refresh()")
                self?.pushExternal()
            }
        }
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.pushExternal() }
        }
        watchDataFolder()
    }

    // MARK: priorities written by Claude (claude-priorities.json in the data folder)

    var folderWatch: DispatchSourceFileSystemObject?

    func watchDataFolder() {
        let fd = open(supportDir.path, O_EVTONLY)
        guard fd >= 0 else { return }
        let src = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: [.write, .rename, .delete], queue: .main)
        src.setEventHandler { [weak self] in
            MainActor.assumeIsolated {
                // the folder changes whenever the widget saves too; only react to Claude's file
                guard let self else { return }
                let stamp = (try? FileManager.default.attributesOfItem(atPath: self.claudeFileURL.path)[.modificationDate]) as? Date
                if stamp != self.lastClaudeStamp { self.lastClaudeStamp = stamp; self.pushExternal() }
            }
        }
        src.setCancelHandler { close(fd) }
        src.resume()
        folderWatch = src
    }

    var lastClaudeStamp: Date?
    var claudeFileURL: URL { supportDir.appendingPathComponent("claude-priorities.json") }

    /// Today's picks from Claude, or nothing if the file is missing, malformed or from another day.
    func claudePicks() -> [String: Any] {
        guard let raw = try? Data(contentsOf: claudeFileURL),
              let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
              let date = obj["date"] as? String else { return [:] }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        guard date == f.string(from: Date()) else { return [:] }
        let items = (obj["items"] as? [[String: Any]] ?? []).prefix(8).compactMap { item -> [String: Any]? in
            guard let title = item["title"] as? String, !title.isEmpty else { return nil }
            var out: [String: Any] = ["title": String(title.prefix(80))]
            if let why = item["why"] as? String { out["why"] = String(why.prefix(200)) }
            if let time = item["time"] as? String, time.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil { out["time"] = time }
            if let source = item["source"] as? String { out["source"] = String(source.prefix(30)) }
            if let end = item["end"] as? String, end.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil { out["end"] = end }
            return out
        }
        return ["date": date, "items": items, "generatedAt": obj["generatedAt"] as? String ?? ""]
    }

    /// Sends today's priorities (from claude-priorities.json) to the widget.
    func pushExternal() {
        guard loaded else { return }
        let payload: [String: Any] = ["claude": claudePicks()]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.DC && DC.setExternal(\(json))")
    }

    // MARK: data

    func bootstrapScript() -> String {
        var dataJSON = "null"
        if let raw = try? Data(contentsOf: dataURL),
           (try? JSONSerialization.jsonObject(with: raw)) != nil,
           let s = String(data: raw, encoding: .utf8) {
            dataJSON = s
        }
        var memoji: [String: String] = [:]
        for id in moodIDs {
            let url = supportDir.appendingPathComponent("Memoji/\(id).png")
            if let bytes = try? Data(contentsOf: url) {
                memoji[id] = "data:image/png;base64," + bytes.base64EncodedString()
            }
        }
        let memojiJSON = (try? JSONSerialization.data(withJSONObject: memoji))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return "window.__DC_DATA__ = \(dataJSON); window.__DC_MEMOJI__ = \(memojiJSON);"
    }

    func backupOncePerLaunch() {
        let fm = FileManager.default
        guard fm.fileExists(atPath: dataURL.path) else { return }
        let backup = supportDir.appendingPathComponent("data.backup.json")
        try? fm.removeItem(at: backup)
        try? fm.copyItem(at: dataURL, to: backup)
    }

    func save(_ json: String) {
        guard let bytes = json.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: bytes)) != nil else { return }
        try? bytes.write(to: dataURL, options: .atomic)
    }

    // MARK: bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "save":
            if let json = body["data"] as? String { save(json) }
        case "drag":
            if let event = web.lastMouseDown { window.performDrag(with: event) }
        case "level":
            keepOnTop = body["onTop"] as? Bool ?? false
            setOnTop(keepOnTop)
        case "login":
            setLaunchAtLogin(body["on"] as? Bool ?? false)
        case "folder":
            NSWorkspace.shared.open(supportDir)
        case "export":
            if let json = body["data"] as? String { exportReflections(json) }
        case "quit":
            NSApp.terminate(nil)
        case "ready":
            loaded = true
            if let s = body["settings"] as? [String: Any] {
                keepOnTop = s["onTop"] as? Bool ?? false
                onTopMenuItem?.state = keepOnTop ? .on : .off
                if keepOnTop || !NSApp.isActive { setOnTop(keepOnTop) }
                scheduleReminders(s)
            }
            if let kind = pendingReflection {
                pendingReflection = nil
                openReflection(kind)
            }
            pushExternal()
            snapshotIfRequested()
        case "external":
            pushExternal()
        case "schedule":
            if let s = body["settings"] as? [String: Any] { scheduleReminders(s) }
        default:
            break
        }
    }

    func setOnTop(_ onTop: Bool) {
        window.level = onTop
            ? .floating
            : NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
        onTopMenuItem?.state = keepOnTop ? .on : .off
    }

    // Debug aid: if `snapshot.request` exists in the data folder, save what the widget
    // draws to `snapshot.png` (web content only; the desktop blur behind it isn't included).
    func snapshotIfRequested() {
        let request = supportDir.appendingPathComponent("snapshot.request")
        guard FileManager.default.fileExists(atPath: request.path) else { return }
        try? FileManager.default.removeItem(at: request)
        let out = supportDir.appendingPathComponent("snapshot.png")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self else { return }
            self.web.takeSnapshot(with: nil) { image, _ in
                guard let image, let tiff = image.tiffRepresentation,
                      let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { return }
                try? png.write(to: out)
            }
        }
    }

    // MARK: menu bar

    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Daily Companion")
            button.image?.isTemplate = true
        }
        let menu = NSMenu()
        menu.addItem(withTitle: "Show Widget", action: #selector(menuShow), keyEquivalent: "").target = self
        menu.addItem(withTitle: "Start of Day Reflection", action: #selector(menuMorning), keyEquivalent: "").target = self
        menu.addItem(withTitle: "End of Day Reflection", action: #selector(menuEvening), keyEquivalent: "").target = self
        menu.addItem(.separator())
        onTopMenuItem = menu.addItem(withTitle: "Keep Above Other Windows", action: #selector(menuToggleTop), keyEquivalent: "")
        onTopMenuItem.target = self
        menu.addItem(withTitle: "Move to Top-Right Corner", action: #selector(menuResetPosition), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Daily Companion", action: #selector(menuQuit), keyEquivalent: "q").target = self
        statusItem.menu = menu
    }

    func showWidget() {
        window.level = .floating
        window.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
        window.makeKey()
    }

    @objc func menuShow() { showWidget() }
    @objc func menuMorning() { showWidget(); openReflection("morning") }
    @objc func menuEvening() { showWidget(); openReflection("evening") }
    @objc func menuQuit() { NSApp.terminate(nil) }
    @objc func menuResetPosition() {
        UserDefaults.standard.removeObject(forKey: "widgetOrigin")
        window.setFrameOrigin(initialFrame().origin)
        showWidget()
    }
    @objc func menuToggleTop() {
        keepOnTop.toggle()
        setOnTop(keepOnTop)
        web.evaluateJavaScript("window.DC && DC.setOnTop(\(keepOnTop))")
    }

    func setLaunchAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("Daily Companion: launch-at-login change failed: \(error.localizedDescription)")
        }
    }

    func exportReflections(_ json: String) {
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Daily Companion reflections.json"
        panel.allowedContentTypes = [.json]
        panel.level = .modalPanel
        if panel.runModal() == .OK, let url = panel.url {
            try? json.data(using: .utf8)?.write(to: url, options: .atomic)
        }
    }

    // MARK: reminders (start and end of day only)

    func scheduleReminders(_ settings: [String: Any]) {
        let center = UNUserNotificationCenter.current()
        let morning = settings["morning"] as? String ?? "08:00"
        let evening = settings["evening"] as? String ?? "21:30"
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: ["dc.morning", "dc.evening"])
            let items: [(String, String, String, String)] = [
                ("dc.morning", morning, "Start of the day", "How are you today? Take three minutes to set your direction."),
                ("dc.evening", evening, "End of day", "Close the day: what went well, and one note for tomorrow.")
            ]
            for (id, time, title, text) in items {
                let parts = time.split(separator: ":").compactMap { Int($0) }
                guard parts.count == 2 else { continue }
                var when = DateComponents()
                when.hour = parts[0]; when.minute = parts[1]
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = text
                content.userInfo = ["kind": id == "dc.morning" ? "morning" : "evening"]
                center.add(UNNotificationRequest(identifier: id, content: content,
                                                 trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: true)))
            }
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let kind = response.notification.request.content.userInfo["kind"] as? String ?? "morning"
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                if self.loaded { self.openReflection(kind) } else { self.pendingReflection = kind }
            }
        }
        completionHandler()
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    func openReflection(_ kind: String) {
        window.makeKeyAndOrderFront(nil)
        web.evaluateJavaScript("window.DC && DC.openReflection('\(kind == "evening" ? "evening" : "morning")')")
    }

    // MARK: window placement

    func initialFrame() -> NSRect {
        if let saved = UserDefaults.standard.string(forKey: "widgetOrigin") {
            let p = NSPointFromString(saved)
            let rect = NSRect(origin: p, size: widgetSize)
            if NSScreen.screens.contains(where: { $0.visibleFrame.intersects(rect) }) { return rect }
        }
        let vf = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
        return NSRect(x: vf.maxX - widgetSize.width - 32, y: vf.maxY - widgetSize.height - 24,
                      width: widgetSize.width, height: widgetSize.height)
    }

    func windowDidMove(_ notification: Notification) {
        UserDefaults.standard.set(NSStringFromPoint(window.frame.origin), forKey: "widgetOrigin")
    }

    func roundedMask(radius: CGFloat) -> NSImage {
        let edge = radius * 2 + 1
        let image = NSImage(size: NSSize(width: edge, height: edge), flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        image.resizingMode = .stretch
        return image
    }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)
    app.run()
}
