//
//  MessagesViewController.swift
//  The Spread MessagesExtension
//

import UIKit
import SwiftUI
import Messages

class MessagesViewController: MSMessagesAppViewController {

    private let model = ExtensionModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        model.controller = self
        let hosting = UIHostingController(rootView: ExtensionRootView(model: model))
        addChild(hosting)
        view.addSubview(hosting.view)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        hosting.didMove(toParent: self)
    }

    // MARK: - Conversation Handling

    override func willBecomeActive(with conversation: MSConversation) {
        model.style = presentationStyle
        model.becameActive(selected: conversation.selectedMessage)
    }

    override func didReceive(_ message: MSMessage, conversation: MSConversation) {
        // A new bubble arrived while the drawer is open — the board may have moved.
        model.refreshSoon()
    }

    override func willTransition(to presentationStyle: MSMessagesAppPresentationStyle) {
        model.style = presentationStyle
    }

    override func didTransition(to presentationStyle: MSMessagesAppPresentationStyle) {
        model.style = presentationStyle
        if presentationStyle == .expanded { model.refreshSoon() }
    }

    override func didStartSending(_ message: MSMessage, conversation: MSConversation) {
        // User hit send on the staged bubble. Nothing to do — the pick is
        // already server-side; the bubble is just the group's status line.
    }

    override func didCancelSending(_ message: MSMessage, conversation: MSConversation) {
        // User deleted the staged bubble. Also fine — the pick still stands
        // server-side; the bubble is presentation only.
    }
}
