import UIKit

/// Draws the message-bubble image for MSMessageTemplateLayout.
/// Modest size on purpose: extensions live under a tight memory ceiling.
enum BubbleRenderer {
    static func render(weekNumber: Int, submitted: Int, total: Int, lockAt: Date?) -> UIImage {
        let size = CGSize(width: 300, height: 130)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let renderer = UIGraphicsImageRenderer(size: size, format: format)

        return renderer.image { ctx in
            // Background: deep green felt gradient.
            let colors = [UIColor(red: 0.05, green: 0.25, blue: 0.12, alpha: 1).cgColor,
                          UIColor(red: 0.02, green: 0.12, blue: 0.06, alpha: 1).cgColor]
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                      colors: colors as CFArray, locations: [0, 1])!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero,
                                             end: CGPoint(x: 0, y: size.height), options: [])

            // Yard line accent.
            ctx.cgContext.setStrokeColor(UIColor.white.withAlphaComponent(0.12).cgColor)
            ctx.cgContext.setLineWidth(2)
            for x in stride(from: 30, to: Int(size.width), by: 60) {
                ctx.cgContext.move(to: CGPoint(x: CGFloat(x), y: 0))
                ctx.cgContext.addLine(to: CGPoint(x: CGFloat(x), y: size.height))
            }
            ctx.cgContext.strokePath()

            let title = "🏈 THE SPREAD"
            title.draw(at: CGPoint(x: 16, y: 14), withAttributes: [
                .font: UIFont.systemFont(ofSize: 20, weight: .heavy),
                .foregroundColor: UIColor.white,
            ])
            let weekText = "WEEK \(weekNumber)"
            weekText.draw(at: CGPoint(x: 16, y: 44), withAttributes: [
                .font: UIFont.systemFont(ofSize: 30, weight: .black),
                .foregroundColor: UIColor(red: 1, green: 0.84, blue: 0.3, alpha: 1),
            ])

            let locked = lockAt.map { $0 <= Date() } ?? false
            let status: String
            if locked {
                status = "🔒 Locked — open to see the board"
            } else {
                status = "\(submitted) of \(total) in · \(SpreadFormat.lockLine(lockAt))"
            }
            status.draw(at: CGPoint(x: 16, y: 92), withAttributes: [
                .font: UIFont.systemFont(ofSize: 14, weight: .semibold),
                .foregroundColor: UIColor.white.withAlphaComponent(0.9),
            ])
        }
    }
}
