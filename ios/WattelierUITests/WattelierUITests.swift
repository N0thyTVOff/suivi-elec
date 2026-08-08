import XCTest

final class WattelierUITests: XCTestCase {
    func testFirstLaunchWelcomeCardsLeadToConnection() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitesting-welcome"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Bienvenue dans Wattelier"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Des mesures qui restent justes"].exists)
        XCTAssertTrue(app.staticTexts["Le direct et les commandes"].exists)
        XCTAssertTrue(app.staticTexts["Vos données restent chez vous"].exists)
        app.buttons["Continuer"].tap()
        XCTAssertTrue(app.staticTexts["Accéder à mon serveur"].waitForExistence(timeout: 5))
    }

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
