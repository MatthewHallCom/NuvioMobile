import Foundation
import UIKit

#if targetEnvironment(macCatalyst)
@objc(CatalystWindowManager)
class CatalystWindowManager: NSObject {

  private var savedToolbar: NSObject? = nil

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  @objc func setFullScreen(_ fullScreen: Bool) {
    DispatchQueue.main.async {
      guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let titlebar = scene.titlebar else { return }

      if fullScreen {
        self.savedToolbar = titlebar.toolbar
        titlebar.titleVisibility = .hidden
        titlebar.toolbar = nil
        titlebar.autoHidesToolbarInFullScreen = true
      } else {
        titlebar.titleVisibility = .visible
        if let toolbar = self.savedToolbar as? NSToolbar {
          titlebar.toolbar = toolbar
        }
      }
    }
  }
}
#else
// No-op on non-Catalyst
@objc(CatalystWindowManager)
class CatalystWindowManager: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { return true }
  @objc func setFullScreen(_ fullScreen: Bool) {}
}
#endif
