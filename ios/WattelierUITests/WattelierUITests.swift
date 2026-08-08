import XCTest

final class WattelierUITests: XCTestCase {
    func testDemoNavigation() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitesting-demo"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Aujourd’hui"].waitForExistence(timeout: 8))
        app.tabBars.buttons["Direct"].tap()
        XCTAssertTrue(app.navigationBars["Temps réel"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Appareils"].tap()
        XCTAssertTrue(app.navigationBars["Appareils"].waitForExistence(timeout: 5))
    }
}
